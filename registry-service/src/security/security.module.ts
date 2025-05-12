import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppUser } from './app-user.entity';
import { AuditEvent } from './audit-event.entity';
import { AccountsController, AuditController } from './accounts.controller';
import { AuditTrail } from './audit-trail.service';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';

/**
 * The guard is registered globally on purpose, so a new controller is closed
 * until somebody decides otherwise. Opening one takes the Public decorator,
 * which is greppable; closing one takes nothing, which is not.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppUser, AuditEvent]), JwtModule.register({})],
  controllers: [AuthenticationController, AccountsController, AuditController],
  providers: [
    AuthenticationService,
    TokenService,
    AuditTrail,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TypeOrmModule, AuthenticationService, TokenService, AuditTrail],
})
export class SecurityModule {}
