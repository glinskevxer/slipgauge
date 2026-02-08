import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';

import { ConflictError, NotFoundError } from '../common/errors';
import { Clock } from '../config/clock';
import { Discipline } from '../instrument/instrument.enums';
import { StorageLocation } from '../instrument/storage-location.entity';
import { StorageLocationService } from '../instrument/storage-location.service';
import type {
  AssessExcursionDto,
  EnvironmentLimitView,
  ExcursionView,
  RoomTrace,
  SetEnvironmentLimitDto,
  UploadReadingsDto,
  UploadResult,
} from './dto/environment.dto';
import {
  EnvironmentExcursion,
  EnvironmentLimitRecord,
  EnvironmentReading,
} from './environment.entities';
import { Excursion, Reading, breachOf, findDrift, findExcursions } from './excursion';

/** How far back a fresh upload re-reads, so a run that spans two uploads joins. */
const LOOKBACK_HOURS = 24;

/**
 * The room log.
 *
 * <p>Uploads are the only way readings arrive and the only place excursions are
 * worked out, which is deliberate: an excursion is a reading of a stream, and a
 * stream that can be added to from two directions ends up with two answers. The
 * detection re-reads a day either side of what was uploaded so a run that
 * straddles two uploads is one excursion rather than two halves.
 */
@Injectable()
export class EnvironmentService {
  private readonly log = new Logger(EnvironmentService.name);

  constructor(
    @InjectRepository(EnvironmentLimitRecord)
    private readonly limits: Repository<EnvironmentLimitRecord>,
    @InjectRepository(EnvironmentReading)
    private readonly readings: Repository<EnvironmentReading>,
    @InjectRepository(EnvironmentExcursion)
    private readonly excursions: Repository<EnvironmentExcursion>,
    private readonly places: StorageLocationService,
    private readonly clock: Clock,
  ) {}

  async setLimit(request: SetEnvironmentLimitDto): Promise<EnvironmentLimitView> {
    const location = await this.places.byCode(request.locationCode);
    const discipline = request.discipline ?? null;

    const existing = await this.limits.findOne({
      where: {
        location: { id: location.id },
        discipline: discipline === null ? IsNull() : discipline,
      },
      relations: { location: true },
    });

    const record = existing ?? new EnvironmentLimitRecord();

    record.location = location;
    record.discipline = discipline;
    record
      .band(request.temperatureMin, request.temperatureMax)
      .humidity(request.humidityMin ?? null, request.humidityMax ?? null);
    record.driftPerHour = request.driftPerHour ?? null;
    record.soakHours = request.soakHours ?? 0;
    record.methodReference = request.methodReference ?? null;

    const saved = await this.limits.save(record);
    this.log.log(`${location.code} held to ${saved.describe()}`);
    return toLimitView(saved);
  }

  async limitsFor(locationCode?: string): Promise<EnvironmentLimitView[]> {
    const rows = await this.limits.find({
      relations: { location: true },
      order: { id: 'ASC' },
    });

    return rows
      .filter((row) => !locationCode || row.location.code === locationCode.toUpperCase())
      .map(toLimitView);
  }

  /**
   * Takes a logger upload, drops what is already there, and re-reads the
   * window it touched.
   *
   * <p>Duplicates are dropped rather than refused. A logger that is emptied
   * twice is the normal case, not an error, and refusing the whole upload
   * because six samples overlapped means the other four thousand never arrive.
   */
  async upload(request: UploadReadingsDto): Promise<UploadResult> {
    const location = await this.places.byCode(request.locationCode);
    const loggerRef = request.loggerRef ?? null;

    const sorted = [...request.readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    const existing = await this.readings.find({
      where: {
        location: { id: location.id },
        takenAt: Between(new Date(sorted[0].takenAt), new Date(sorted[sorted.length - 1].takenAt)),
      },
    });
    const seen = new Set(existing.map((row) => `${row.takenAt.toISOString()}|${row.loggerRef ?? ''}`));

    let accepted = 0;
    let duplicates = 0;

    for (const sample of sorted) {
      const key = `${new Date(sample.takenAt).toISOString()}|${loggerRef ?? ''}`;

      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);

      const row = new EnvironmentReading();

      row.location = location;
      row.takenAt = new Date(sample.takenAt);
      row.temperature = sample.temperature;
      row.humidity = sample.humidity ?? null;
      row.loggerRef = loggerRef;
      row.source = request.source ?? 'LOGGER';
      await this.readings.save(row);
      accepted += 1;
    }

    const swept = await this.sweep(
      location,
      new Date(Date.parse(sorted[0].takenAt) - LOOKBACK_HOURS * 3_600_000),
      new Date(Date.parse(sorted[sorted.length - 1].takenAt) + LOOKBACK_HOURS * 3_600_000),
    );

    this.log.log(
      `${location.code}: ${accepted} reading(s) accepted, ${duplicates} already held, ` +
        `${swept.opened} excursion(s) opened`,
    );
    return {
      accepted,
      duplicates,
      excursionsOpened: swept.opened,
      excursionsClosed: swept.closed,
    };
  }

  /**
   * Re-reads a window of a room and reconciles the excursions in it.
   *
   * <p>An excursion nobody has assessed is replaced outright. One that has been
   * assessed is left alone, because a finding written against it is a record
   * and a recomputed row would leave that finding pointing at nothing.
   */
  async sweep(
    location: StorageLocation,
    from: Date,
    to: Date,
  ): Promise<{ opened: number; closed: number }> {
    const limit = await this.limitFor(location.id, null);

    if (!limit) {
      return { opened: 0, closed: 0 };
    }

    const rows = await this.readings.find({
      where: { location: { id: location.id }, takenAt: Between(from, to) },
      order: { takenAt: 'ASC' },
    });

    const stream: Reading[] = rows.map((row) => ({
      takenAt: row.takenAt.toISOString(),
      temperature: row.temperature,
      humidity: row.humidity,
    }));

    const found = [
      ...findExcursions(stream, limit.toLimit()),
      ...findDrift(stream, limit.toLimit()),
    ];

    const held = await this.excursions.find({
      where: { location: { id: location.id }, startedAt: Between(from, to) },
    });

    let closed = 0;

    for (const row of held) {
      if (row.isAssessed()) {
        continue;
      }
      await this.excursions.remove(row);
      closed += 1;
    }

    for (const excursion of found) {
      if (held.some((row) => row.isAssessed() && sameWindow(row, excursion))) {
        continue;
      }
      await this.excursions.save(this.toRecord(location, excursion));
    }

    return { opened: found.length, closed };
  }

  /** Excursions in a room, newest first, unassessed ones only when asked. */
  async excursionsFor(
    locationCode: string | undefined,
    unassessedOnly: boolean,
  ): Promise<ExcursionView[]> {
    const rows = await this.excursions.find({
      relations: { location: true },
      order: { startedAt: 'DESC' },
    });

    return rows
      .filter((row) => !locationCode || row.location.code === locationCode.toUpperCase())
      .filter((row) => !unassessedOnly || !row.isAssessed())
      .map(toExcursionView);
  }

  async assess(id: number, by: string, request: AssessExcursionDto): Promise<ExcursionView> {
    const row = await this.excursions.findOne({ where: { id }, relations: { location: true } });

    if (!row) {
      throw new NotFoundError('excursion', id);
    }
    if (row.isAssessed()) {
      throw new ConflictError(`excursion ${id} was already assessed by ${row.assessedBy}`);
    }
    row.assess(by, request.finding, this.clock.now());
    return toExcursionView(await this.excursions.save(row));
  }

  /** What a room was doing over a window, for the chart. */
  async trace(locationCode: string, from: string, to: string): Promise<RoomTrace> {
    const location = await this.places.byCode(locationCode);
    const limit = await this.limitFor(location.id, null);

    const rows = await this.readings.find({
      where: { location: { id: location.id }, takenAt: Between(new Date(from), new Date(to)) },
      order: { takenAt: 'ASC' },
    });

    return {
      locationCode: location.code,
      limit: limit ? toLimitView(limit) : null,
      samples: rows.map((row) => ({
        takenAt: row.takenAt.toISOString(),
        temperature: row.temperature,
        humidity: row.humidity,
        outside: limit
          ? breachOf(
              {
                takenAt: row.takenAt.toISOString(),
                temperature: row.temperature,
                humidity: row.humidity,
              },
              limit.toLimit(),
            ) !== null
          : false,
      })),
    };
  }

  /**
   * The limit that applies. A discipline specific one wins over the room wide
   * one, which is the only reason a room may carry two.
   */
  async limitFor(
    locationId: number,
    discipline: Discipline | null,
  ): Promise<EnvironmentLimitRecord | null> {
    const rows = await this.limits.find({
      where: { location: { id: locationId } },
      relations: { location: true },
    });

    return (
      rows.find((row) => discipline !== null && row.discipline === discipline) ??
      rows.find((row) => row.discipline === null) ??
      null
    );
  }

  private toRecord(location: StorageLocation, excursion: Excursion): EnvironmentExcursion {
    const row = new EnvironmentExcursion();

    row.location = location;
    row.startedAt = new Date(excursion.startedAt);
    row.endedAt = excursion.endedAt ? new Date(excursion.endedAt) : null;
    row.kind = excursion.kind;
    row.severity = excursion.severity;
    row.worstValue = excursion.worstValue;
    row.limitValue = excursion.limitValue;
    row.readings = excursion.readings;
    row.assessedAt = null;
    row.assessedBy = null;
    row.finding = null;
    return row;
  }
}

function sameWindow(row: EnvironmentExcursion, excursion: Excursion): boolean {
  return (
    row.kind === excursion.kind &&
    row.startedAt.toISOString() === excursion.startedAt &&
    (row.endedAt?.toISOString() ?? null) === excursion.endedAt
  );
}

export function toLimitView(record: EnvironmentLimitRecord): EnvironmentLimitView {
  return {
    id: record.id,
    locationCode: record.location.code,
    locationName: record.location.name,
    discipline: record.discipline,
    temperatureMin: record.temperatureMin,
    temperatureMax: record.temperatureMax,
    humidityMin: record.humidityMin,
    humidityMax: record.humidityMax,
    driftPerHour: record.driftPerHour,
    soakHours: record.soakHours,
    methodReference: record.methodReference,
    summary: record.describe(),
  };
}

export function toExcursionView(record: EnvironmentExcursion): ExcursionView {
  return {
    id: record.id,
    locationCode: record.location?.code ?? '',
    locationName: record.location?.name ?? '',
    kind: record.kind,
    severity: record.severity,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    worstValue: record.worstValue,
    limitValue: record.limitValue,
    overshoot: Math.round(record.overshoot() * 100) / 100,
    readings: record.readings,
    open: record.isOpen(),
    assessed: record.isAssessed(),
    assessedBy: record.assessedBy,
    finding: record.finding,
    putsWorkInQuestion: record.putsWorkInQuestion(),
  };
}
