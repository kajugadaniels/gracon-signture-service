import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KeysService } from '../keys/keys.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { buildPersonalX509 } from './helpers/x509.helper';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
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
    });

    if (!citizenIdentity) {
      throw new BadRequestException(
        'Verified identity data not found. ' +
          'Your account must complete ID verification before a certificate can be issued.',
      );
    }

    // Decrypt private key momentarily for signing — discard immediately after
    let privateKeyPem: string | null =
      await this.keys.decryptActivePrivateKey(userId);

    const result = buildPersonalX509(
      {
        firstName: citizenIdentity.postNames.split(' ')[0],
        lastName: citizenIdentity.surName,
        userId,
      },
      keyPair.publicKey,
      privateKeyPem,
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
        subjectC: 'RW',
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
}
