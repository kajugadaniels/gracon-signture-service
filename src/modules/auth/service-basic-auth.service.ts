import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ServiceBasicAuthService {
  private readonly expectedUsername: string;
  private readonly expectedPassword: string;

  constructor(private readonly config: ConfigService) {
    this.expectedUsername = this.requireConfig('SIGNATURE_SERVICE_USERNAME');
    this.expectedPassword = this.requireConfig('SIGNATURE_SERVICE_PASSWORD');
  }

  authenticate(authorizationHeader?: string): void {
    const credentials = this.parseAuthorizationHeader(authorizationHeader);

    if (
      !this.constantTimeEquals(credentials.username, this.expectedUsername) ||
      !this.constantTimeEquals(credentials.password, this.expectedPassword)
    ) {
      throw new UnauthorizedException('Invalid internal service credentials.');
    }
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`${key} must be set`);
    }

    return value;
  }

  private parseAuthorizationHeader(authorizationHeader?: string) {
    if (!authorizationHeader?.startsWith('Basic ')) {
      throw new UnauthorizedException(
        'Basic authentication credentials are required.',
      );
    }

    const decoded = this.decodeCredentials(authorizationHeader);
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex <= 0) {
      throw new UnauthorizedException('Malformed basic auth credentials.');
    }

    return {
      username: decoded.slice(0, separatorIndex).trim(),
      password: decoded.slice(separatorIndex + 1),
    };
  }

  private decodeCredentials(authorizationHeader: string): string {
    try {
      return Buffer.from(
        authorizationHeader.slice('Basic '.length),
        'base64',
      ).toString('utf8');
    } catch {
      throw new UnauthorizedException('Malformed basic auth credentials.');
    }
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
