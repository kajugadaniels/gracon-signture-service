import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtPayload, RequestUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, 'user-jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Shares JWT_SECRET with api/auth/ — validates tokens issued there
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Only full tokens allowed — limited tokens are for verification flow only
    if (payload.tokenType !== 'full') {
      throw new ForbiddenException(
        'Identity verification required before using signature features.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        isIdVerified: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated.');
    }

    // Hard gate — isIdVerified must be true
    // This is the core access control for the entire signature service
    if (!user.isIdVerified) {
      throw new ForbiddenException(
        'You must complete identity verification before using signature features.',
      );
    }

    return {
      userId: user.id,
      email: user.email,
      tokenType: payload.tokenType,
      isIdVerified: user.isIdVerified,
    };
  }
}
