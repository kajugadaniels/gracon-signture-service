import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KeysService } from '../keys/keys.service';
import { ForeignIdentityClient } from '../foreign-identity/foreign-identity.client';
import type { ForeignIdentityProfile } from '../foreign-identity/foreign-identity-profile.interface';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { decryptIdentityValue } from './helpers/identity-crypto.helper';
import { buildPersonalX509 } from './helpers/x509.helper';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
    private readonly config: ConfigService,
    private readonly foreignIdentityClient: ForeignIdentityClient,
  ) {}

  async issue(userId: string, dto: IssueCertificateDto) {
    // Must have an active key pair
    const keyPair = await this.prisma.personalKeyPair.findFirst({
      where: { userId, isActive: true },
    });

    if (!keyPair) {
      throw new BadRequestException(
        'You need an active key pair before issuing a certificate. ' +
          'Call POST /signature/keys/generate first.',
      );
    }

    // Only one active certificate allowed at a time
    const existing = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
    });

    if (existing) {
      const now = new Date();
      if (existing.notAfter > now) {
        throw new ConflictException(
          'You already have an active certificate. ' +
            'Revoke it first or rotate your keys to replace it.',
        );
      }
    }

    // Fetch verified identity — required for certificate subject fields
    const citizenIdentity = await this.prisma.citizenIdentity.findUnique({
      where: { userId },
      select: {
        identityType: true,
        nidEncrypted: true,
        finEncrypted: true,
        surName: true,
        postNames: true,
      },
    });

    if (!citizenIdentity) {
      throw new BadRequestException(
        'Verified identity data not found. ' +
          'Your account must complete ID verification before a certificate can be issued.',
      );
    }

    const subjectIdentity = await this.resolveSubjectIdentity(citizenIdentity);

    // Decrypt private key momentarily for signing — discard immediately after
    let privateKeyPem: string | null =
      await this.keys.decryptActivePrivateKey(userId);

    const result = buildPersonalX509(
      {
        firstName: citizenIdentity.postNames.split(' ')[0],
        lastName: citizenIdentity.surName,
        userId,
        subjectInstId: subjectIdentity.identifier,
      },
      keyPair.publicKey,
      privateKeyPem,
      subjectIdentity.subjectCountry,
      dto.validityYears ?? 2,
    );

    // CRITICAL: discard the decrypted private key immediately after use
    privateKeyPem = null;

    const certificate = await this.prisma.personalCertificate.create({
      data: {
        userId,
        keyPairId: keyPair.id,
        serialNumber: result.serialNumber,
        subjectCN: result.subjectCN,
        subjectO: 'ID Verification Platform',
        subjectC: subjectIdentity.subjectCountry,
        subjectUserId: userId,
        notBefore: result.notBefore,
        notAfter: result.notAfter,
        certificatePem: result.certificatePem,
        isRevoked: false,
      },
    });

    return {
      id: certificate.id,
      serialNumber: certificate.serialNumber,
      subjectCN: certificate.subjectCN,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      certificatePem: certificate.certificatePem,
      isRevoked: certificate.isRevoked,
    };
  }

  async getCurrent(userId: string) {
    const certificate = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!certificate) {
      throw new NotFoundException(
        'No active certificate found. Issue one at POST /signature/certificates/issue.',
      );
    }

    const now = new Date();
    const expired = certificate.notAfter < now;

    return {
      id: certificate.id,
      serialNumber: certificate.serialNumber,
      subjectCN: certificate.subjectCN,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      certificatePem: certificate.certificatePem,
      isRevoked: certificate.isRevoked,
      isExpired: expired,
      daysRemaining: expired
        ? 0
        : Math.floor(
            (certificate.notAfter.getTime() - now.getTime()) / 86_400_000,
          ),
    };
  }

  async revoke(userId: string, dto: RevokeCertificateDto) {
    const certificate = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
    });

    if (!certificate) {
      throw new NotFoundException('No active certificate to revoke.');
    }

    await this.prisma.personalCertificate.update({
      where: { id: certificate.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: dto.reason,
      },
    });

    return {
      message: 'Certificate revoked successfully. This action is permanent.',
      serialNumber: certificate.serialNumber,
      revokedAt: new Date(),
    };
  }

  private async resolveSubjectIdentity(citizenIdentity: {
    identityType: IdentityType;
    nidEncrypted: string | null;
    finEncrypted: string | null;
  }) {
    if (citizenIdentity.identityType === IdentityType.FIN) {
      return this.resolveForeignIdentitySubject(citizenIdentity.finEncrypted);
    }

    const nid = this.decryptStoredIdentity(
      citizenIdentity.nidEncrypted,
      'National ID',
    );

    return {
      identifier: nid,
      subjectCountry: 'RW',
    };
  }

  private async resolveForeignIdentitySubject(finEncrypted: string | null) {
    const fin = this.decryptStoredIdentity(
      finEncrypted,
      'Foreign Identity Number',
    );

    try {
      const profile = await this.foreignIdentityClient.getByFin(fin);
      return this.buildForeignIdentitySubject(fin, profile);
    } catch (error) {
      this.handleForeignIdentityLookupError(error);
    }
  }

  private buildForeignIdentitySubject(
    fin: string,
    profile: ForeignIdentityProfile,
  ) {
    return {
      identifier: fin,
      subjectCountry: profile.countryOfOrigin,
    };
  }

  private decryptStoredIdentity(
    encryptedValue: string | null,
    label: string,
  ): string {
    if (!encryptedValue) {
      throw new InternalServerErrorException(
        `Certificate issuance failed: ${label} is missing from the stored identity record.`,
      );
    }

    try {
      const secret = this.config.getOrThrow<string>('ENCRYPTION_SECRET');
      return decryptIdentityValue(encryptedValue, secret);
    } catch {
      throw new InternalServerErrorException(
        `Certificate issuance failed: unable to decrypt stored ${label.toLowerCase()}.`,
      );
    }
  }

  private handleForeignIdentityLookupError(error: unknown): never {
    if (error instanceof NotFoundException) {
      throw new InternalServerErrorException(
        'Certificate issuance failed: associated foreign identity record not found. Contact platform administrators.',
      );
    }

    if (
      error instanceof ServiceUnavailableException ||
      error instanceof UnauthorizedException
    ) {
      throw new ServiceUnavailableException(
        'Foreign identity service is currently unavailable. Please try again in a few minutes.',
      );
    }

    throw new InternalServerErrorException(
      'Certificate issuance failed due to an unexpected foreign identity lookup error.',
    );
  }
}
