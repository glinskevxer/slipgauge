import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { Page } from '../common/page';
import { AuditTrail } from './audit-trail.service';
import type { AuditSweepResult } from './audit-trail.service';
import { AuthenticationService } from './authentication.service';
import type { AuditEvent } from './audit-event.entity';
import { CurrentUser } from './current-user.decorator';
import type { AccountView, SessionView } from './dto/sign-in.dto';
import { CreateUserDto, UpdateRolesDto } from './dto/sign-in.dto';
import { Role } from './role';
import { RequireRoles } from './roles.decorator';
import type { Principal } from './token.service';

/**
 * Account administration. Everything here is an administrator job, and every
 * call writes a line to the audit trail, because "who gave them that role" is
 * the first question asked after anything goes wrong.
 */
@RequireRoles(Role.ADMIN)
@ApiTags('accounts')
@ApiBearerAuth('registry-token')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly auth: AuthenticationService,
    private readonly audit: AuditTrail,
  ) {}

  @Get()
  list(): Promise<AccountView[]> {
    return this.auth.list();
  }

  @Post()
  create(
    @CurrentUser() principal: Principal,
    @Body() request: CreateUserDto,
  ): Promise<AccountView> {
    return this.auth.createUser(principal.username, request);
  }

  @Post(':id/roles')
  setRoles(
    @CurrentUser() principal: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() request: UpdateRolesDto,
  ): Promise<AccountView> {
    return this.auth.setRoles(principal.username, id, request);
  }

  /** Every sign in one person has had, live and dead. */
  @Get(':username/sessions')
  sessions(@Param('username') username: string): Promise<SessionView[]> {
    return this.auth.sessionsFor(username);
  }

  /**
   * Ends every session one person holds. What an administrator reaches for
   * when a laptop goes missing, and the only thing that takes a live refresh
   * token away before it expires.
   */
  @Post(':username/session-revocation')
  async revokeSessions(
    @Param('username') username: string,
    @Query('reason') reason: string,
    @CurrentUser() actor: Principal,
  ): Promise<{ revoked: number }> {
    return { revoked: await this.auth.revokeSessionsFor(username, actor.username, reason) };
  }

  /**
   * Trims the trail to what the retention rules allow, and says what went.
   * Run by hand rather than on a schedule: it is a records decision and the
   * quality manager wants to see the numbers before it happens again.
   */
  @Post('audit/sweep')
  async sweepAudit(@CurrentUser() actor: Principal): Promise<AuditSweepResult> {
    const result = await this.audit.sweep();

    await this.audit.allowed(actor.username, 'audit.sweep', 'audit', String(result.total));
    return result;
  }

  @Post(':id/enablement')
  enable(
    @CurrentUser() principal: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Query('enabled') enabled: string,
  ): Promise<AccountView> {
    return this.auth.setEnabled(principal.username, id, enabled !== 'false');
  }
}

/**
 * The trail itself is read only and open to auditors as well as
 * administrators, because reading it is the whole job of an auditor.
 */
@RequireRoles(Role.AUDITOR, Role.ADMIN)
@ApiTags('accounts')
@ApiBearerAuth('registry-token')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditTrail) {}

  @Get()
  search(
    @Query('actor') actor?: string,
    @Query('subject') subject?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page = 0,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size = 50,
    @Query('sort') sort?: string,
  ): Promise<Page<AuditEvent>> {
    return this.audit.search(actor, subject, page, size, sort);
  }
}
