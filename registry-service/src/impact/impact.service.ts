import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { failing } from '../calibration/conformity';
import { NotFoundError } from '../common/errors';
import { Clock } from '../config/clock';
import type { CloseAssessmentDto, DisposeItemDto } from './dto/dispose-item.dto';
import type { ImpactItemView, ImpactView } from './dto/impact.views';
import { ImpactAnalyser } from './impact.analyser';
import { ImpactAssessment } from './impact-assessment.entity';
import { ImpactItem } from './impact-item.entity';
import { ImpactStatus, needsCustomerContact } from './impact-severity';

const ASSESSMENT_RELATIONS = { instrument: true, items: true } as const;

/**
 * Raises and keeps the impact assessments.
 *
 * <p>Raising is automatic and happens the moment a failing certificate is
 * filed. Everything after that is a person's job, because deciding whether an
 * error mattered to a customer's part is not something the register can work
 * out on its own.
 */
@Injectable()
export class ImpactService {
  private readonly log = new Logger(ImpactService.name);

  constructor(
    @InjectRepository(ImpactAssessment)
    private readonly assessments: Repository<ImpactAssessment>,
    @InjectRepository(ImpactItem) private readonly items: Repository<ImpactItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly analyser: ImpactAnalyser,
    private readonly clock: Clock,
  ) {}

  /**
   * Raises an assessment for a certificate that came back out of tolerance.
   * Certificates that passed raise nothing, and a certificate that already has
   * an assessment is left alone rather than assessed twice.
   */
  async raiseIfFailing(
    certificate: CalibrationCertificate,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ImpactAssessment | null> {
    if (!failing(certificate.asFoundVerdict)) {
      return null;
    }

    const existing = await manager.getRepository(ImpactAssessment).findOne({
      where: { trigger: { id: certificate.id } },
    });

    if (existing) {
      return existing;
    }

    const assessment = await this.analyser.analyse(certificate, manager);
    const saved = await manager.getRepository(ImpactAssessment).save(assessment);

    this.log.warn(
      `assessment ${saved.id} raised from ${certificate.certificateNumber}, ` +
        `severity ${saved.severity}`,
    );
    return saved;
  }

  async get(id: number): Promise<ImpactView> {
    return this.toView(await this.load(id));
  }

  /** Everything still open, worst first, so the queue reads top down. */
  async open(): Promise<ImpactView[]> {
    const found = await this.assessments.find({
      where: { status: Not(ImpactStatus.CLOSED) },
      relations: ASSESSMENT_RELATIONS,
      order: { raisedAt: 'DESC' },
    });

    return found
      .map((assessment) => this.toView(assessment))
      .sort((left, right) => SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]);
  }

  async forInstrument(instrumentId: number): Promise<ImpactView[]> {
    const found = await this.assessments.find({
      where: { instrument: { id: instrumentId } },
      relations: ASSESSMENT_RELATIONS,
      order: { raisedAt: 'DESC' },
    });

    return found.map((assessment) => this.toView(assessment));
  }

  async disposeItem(
    assessmentId: number,
    itemId: number,
    request: DisposeItemDto,
  ): Promise<ImpactView> {
    const assessment = await this.load(assessmentId);
    const item = (assessment.items ?? []).find((each) => each.id === itemId);

    if (!item) {
      throw new NotFoundError('impact item', itemId);
    }

    item.dispose(request.disposition, request.note ?? null);
    await this.items.save(item);
    return this.get(assessmentId);
  }

  async close(id: number, request: CloseAssessmentDto): Promise<ImpactView> {
    const assessment = await this.load(id);

    assessment.close(request.closedBy, request.conclusion, this.clock.now());
    await this.assessments.save(assessment);
    this.log.log(`assessment ${id} closed by ${request.closedBy}`);
    return this.get(id);
  }

  private async load(id: number): Promise<ImpactAssessment> {
    const assessment = await this.assessments.findOne({
      where: { id },
      relations: ASSESSMENT_RELATIONS,
    });

    if (!assessment) {
      throw new NotFoundError('impact assessment', id);
    }
    return assessment;
  }

  private toView(assessment: ImpactAssessment): ImpactView {
    return {
      id: assessment.id,
      triggerCertificateId: assessment.triggerId,
      instrumentId: assessment.instrument.id,
      assetTag: assessment.instrument.assetTag,
      raisedAt: assessment.raisedAt.toISOString(),
      windowFrom: assessment.windowFrom,
      windowTo: assessment.windowTo,
      status: assessment.status,
      severity: assessment.severity,
      maxDepth: assessment.maxDepth,
      itemCount: assessment.itemCount,
      pendingCount: assessment.pendingCount(),
      needsCustomerContact: needsCustomerContact(assessment.severity),
      closedAt: assessment.closedAt ? assessment.closedAt.toISOString() : null,
      closedBy: assessment.closedBy,
      conclusion: assessment.conclusion,
      items: assessment.orderedItems().map((item) => this.toItemView(item)),
    };
  }

  private toItemView(item: ImpactItem): ImpactItemView {
    return {
      id: item.id,
      kind: item.kind,
      referenceId: item.referenceId,
      assetTag: item.assetTag,
      label: item.label,
      occurredOn: item.occurredOn,
      depth: item.depth,
      disposition: item.disposition,
      note: item.note,
      settled: item.settled(),
    };
  }
}

/** Worst first, which is not the alphabetical order the enum happens to have. */
const SEVERITY_ORDER: Record<string, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
