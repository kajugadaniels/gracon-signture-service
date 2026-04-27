import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { UserJwtStrategy } from './strategies/user-jwt.strategy';
import { VerifiedUserGuard } from './guards/verified-user.guard';
import { ServiceBasicAuthService } from './service-basic-auth.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'user-jwt' })],
  providers: [
    UserJwtStrategy,
    ServiceBasicAuthService,
    Reflector,
    // Apply VerifiedUserGuard globally — every route protected by default
    { provide: APP_GUARD, useClass: VerifiedUserGuard },
  ],
  exports: [UserJwtStrategy, PassportModule, ServiceBasicAuthService],
})
export class AuthModule {}
