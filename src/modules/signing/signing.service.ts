import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KeysService } from '../keys/keys.service';
import { SignDocumentDto } from './dto/sign-document.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
  ) {}

  async sign(userId: string, dto: SignDocumentDto, ipAddress?: string) {
    // Must have an active, non-expired, non-revoked certificate
    const certificate = await this.getActiveCertificate(userId);

    // Fetch key pair for algorithm info — decryptActivePrivateKey also throws
    // if none exists, so reaching this point guarantees an active key pair
    const keyPair = await this.prisma.personalKeyPair.findFirst({
      where: { userId, isActive: true },
    });

    if (!keyPair) {
      throw new NotFoundException('No active key pair found.');
    }

    // Decrypt private key — used only inside this scope
    let privateKeyPem: string | null =
      await this.keys.decryptActivePrivateKey(userId);

    let signatureBytes: string;

    try {
      const hashBuffer = Buffer.from(dto.documentHash, 'hex');
      const algorithm = keyPair.algorithm === 'ED25519' ? undefined : 'SHA256';

      const sigBuffer = algorithm
        ? crypto.sign(algorithm, hashBuffer, privateKeyPem)
        : crypto.sign(null, hashBuffer, privateKeyPem);

      signatureBytes = sigBuffer.toString('base64');
    } finally {
      // CRITICAL: always discard — even if an error occurs
      privateKeyPem = null;
    }

    // Write immutable audit record
    const record = await this.prisma.personalSignedDocument.create({
      data: {
        userId,
        certificateId: certificate.id,
        documentName: dto.documentName,
        documentHash: dto.documentHash,
        signatureBytes,
      },
    });

    return {
      signatureId: record.id,
      signatureBytes: record.signatureBytes,
      certificateId: record.certificateId,
      documentHash: record.documentHash,
      documentName: record.documentName,
      signedAt: record.signedAt,
    };
  }

  async verify(dto: VerifySignatureDto, ipAddress?: string) {
    const certificate = await this.prisma.personalCertificate.findFirst({
      where: { userId: dto.userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });

    let result = false;
    let failReason: string | undefined;
    let signer:
      | {
          subjectCN: string;
          certificateId: string;
          notBefore: Date;
          notAfter: Date;
        }
      | undefined;

    if (!certificate) {
      result = false;
      failReason = 'No active certificate found for this user.';
    } else if (certificate.notAfter < new Date()) {
      result = false;
      failReason = 'Certificate has expired.';
    } else {
      try {
        const hashBuffer = Buffer.from(dto.documentHash, 'hex');
        const sigBuffer = Buffer.from(dto.signatureBytes, 'base64');

        result = crypto.verify(
          'SHA256',
          hashBuffer,
          certificate.certificatePem,
          sigBuffer,
        );

        if (result) {
          // Certificate is non-null inside this else block — TypeScript knows this
          signer = {
            subjectCN: certificate.subjectCN,
            certificateId: certificate.id,
            notBefore: certificate.notBefore,
            notAfter: certificate.notAfter,
          };
        } else {
          failReason = 'Signature does not match document hash.';
        }
      } catch {
        result = false;
        failReason = 'Signature verification failed — invalid format.';
      }
    }

    // Log every verification — including failed ones
    await this.prisma.personalSignatureVerification.create({
      data: {
        certificateId: certificate?.id ?? 'unknown',
        documentHash: dto.documentHash,
        result,
        failReason,
        ipAddress,
      },
    });

    return {
      valid: result,
      ...(result ? { signer } : { reason: failReason }),
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const total = await this.prisma.personalSignedDocument.count({
      where: { userId },
    });
    const items = await this.prisma.personalSignedDocument.findMany({
      where: { userId },
      orderBy: { signedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        documentName: true,
        documentHash: true,
        certificateId: true,
        signedAt: true,
      },
    });

    return { total, page, limit, items };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async getActiveCertificate(userId: string) {
    const cert = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
    });

    if (!cert) {
      throw new BadRequestException(
        'No active certificate. Issue one at POST /signature/certificates/issue.',
      );
    }

    if (cert.notAfter < new Date()) {
      throw new BadRequestException(
        'Your certificate has expired. Please rotate your keys and issue a new certificate.',
      );
    }

    return cert;
  }
}
