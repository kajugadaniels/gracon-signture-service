import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CertificateRequestStatus,
  IdentityType,
  type PersonalCertificateRequest,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KeysService } from '../keys/keys.service';
import { ForeignIdentityClient } from '../foreign-identity/foreign-identity.client';
import type { ForeignIdentityProfile } from '../foreign-identity/foreign-identity-profile.interface';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { decryptIdentityValue } from './helpers/identity-crypto.helper';
import { buildPersonalX509 } from './helpers/x509.helper';

type StoredIdentityRecord = {
  identityType: IdentityType;
  nidEncrypted: string | null;
  finEncrypted: string | null;
  surName: string;
  postNames: string;
};

type CertificateRequestRecord = Pick<
  PersonalCertificateRequest,
  | 'id'
  | 'status'
  | 'requestedValidityYears'
  | 'reviewReason'
  | 'cancellationReason'
  | 'reviewedByAdminId'
  | 'reviewedAt'
  | 'cancelledAt'
  | 'issuedCertificateId'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
    private readonly config: ConfigService,
    private readonly foreignIdentityClient: ForeignIdentityClient,
  ) {}

  async issue(userId: string, dto: IssueCertificateDto) {
    const keyPair = await this.requireActiveKeyPair(userId);
    await this.ensureNoActiveCertificate(userId);
    await this.ensureVerifiedIdentity(userId);
    await this.ensureNoPendingRequest(userId);

    const request = await this.prisma.personalCertificateRequest.create({
      data: {
        userId,
        keyPairId: keyPair.id,
        requestedValidityYears: dto.validityYears ?? 2,
        status: CertificateRequestStatus.PENDING,
      },
      select: this.requestSelect(),
    });

    return {
      ...this.formatRequest(request),
      message:
        'Certificate request submitted successfully. An administrator must approve it before you can sign documents.',
    };
  }

  async getCurrent(userId: string) {
    const certificate = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!certificate) {
      const pendingRequest = await this.findPendingRequest(userId);
      if (pendingRequest) {
        throw new NotFoundException(
          'No active certificate found. Your certificate request is pending admin approval.',
        );
      }

      throw new NotFoundException(
        'No active certificate found. Submit a certificate request at POST /signature/certificates/issue.',
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

  async getCurrentRequest(userId: string) {
    const request = await this.prisma.personalCertificateRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: this.requestSelect(),
    });

    if (!request) {
      throw new NotFoundException('No certificate request found.');
    }

    return this.formatRequest(request);
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

  async approveRequest(
    requestId: string,
    reviewedByAdminId: string,
    reviewReason?: string,
  ) {
    const request = await this.findRequestOrThrow(requestId);

    if (request.status !== CertificateRequestStatus.PENDING) {
      throw new ConflictException(
        'Only pending certificate requests can be approved.',
      );
    }

    if (!request.keyPair.isActive) {
      throw new ConflictException(
        'This certificate request can no longer be approved because its key pair is inactive. Ask the user to submit a new request.',
      );
    }

    await this.ensureNoActiveCertificate(request.userId);
    const citizenIdentity = await this.ensureVerifiedIdentity(request.userId);
    const subjectIdentity = await this.resolveSubjectIdentity(citizenIdentity);

    let privateKeyPem: string | null =
      await this.keys.decryptActivePrivateKey(request.userId);

    const result = buildPersonalX509(
      {
        firstName: citizenIdentity.postNames.split(' ')[0],
        lastName: citizenIdentity.surName,
        userId: request.userId,
        subjectInstId: subjectIdentity.identifier,
      },
      request.keyPair.publicKey,
      privateKeyPem,
      subjectIdentity.subjectCountry,
      request.requestedValidityYears,
    );

    privateKeyPem = null;
    const reviewedAt = new Date();
    const normalizedReason = this.normalizeOptionalReason(reviewReason);

    const certificate = await this.prisma.$transaction(async (tx) => {
      const createdCertificate = await tx.personalCertificate.create({
        data: {
          userId: request.userId,
          keyPairId: request.keyPairId,
          serialNumber: result.serialNumber,
          subjectCN: result.subjectCN,
          subjectO: 'ID Verification Platform',
          subjectC: subjectIdentity.subjectCountry,
          subjectUserId: request.userId,
          notBefore: result.notBefore,
          notAfter: result.notAfter,
          certificatePem: result.certificatePem,
          isRevoked: false,
        },
      });

      await tx.personalCertificateRequest.update({
        where: { id: request.id },
        data: {
          status: CertificateRequestStatus.APPROVED,
          reviewedByAdminId,
          reviewedAt,
          reviewReason: normalizedReason,
          issuedCertificateId: createdCertificate.id,
          cancellationReason: null,
          cancelledAt: null,
        },
      });

      return createdCertificate;
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

  async rejectRequest(
    requestId: string,
    reviewedByAdminId: string,
    reviewReason: string,
  ) {
    const request = await this.findRequestOrThrow(requestId);

    if (request.status !== CertificateRequestStatus.PENDING) {
      throw new ConflictException(
        'Only pending certificate requests can be rejected.',
      );
    }

    const normalizedReason = this.requireReason(
      reviewReason,
      'A rejection reason is required.',
    );

    const updatedRequest = await this.prisma.personalCertificateRequest.update({
      where: { id: request.id },
      data: {
        status: CertificateRequestStatus.REJECTED,
        reviewedByAdminId,
        reviewedAt: new Date(),
        reviewReason: normalizedReason,
        cancellationReason: null,
        cancelledAt: null,
      },
      select: this.requestSelect(),
    });

    return this.formatRequest(updatedRequest);
  }

  async cancelPendingRequestsForUser(userId: string, reason: string) {
    const normalizedReason = this.requireReason(
      reason,
      'A cancellation reason is required.',
    );

    await this.prisma.personalCertificateRequest.updateMany({
      where: {
        userId,
        status: CertificateRequestStatus.PENDING,
      },
      data: {
        status: CertificateRequestStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: normalizedReason,
      },
    });
  }

  private async requireActiveKeyPair(userId: string) {
    const keyPair = await this.prisma.personalKeyPair.findFirst({
      where: { userId, isActive: true },
      select: {
        id: true,
        publicKey: true,
      },
    });

    if (!keyPair) {
      throw new BadRequestException(
        'You need an active key pair before requesting a certificate. Call POST /signature/keys/generate first.',
      );
    }

    return keyPair;
  }

  private async ensureNoActiveCertificate(userId: string) {
    const existing = await this.prisma.personalCertificate.findFirst({
      where: { userId, isRevoked: false },
      select: {
        notAfter: true,
      },
    });

    if (existing && existing.notAfter > new Date()) {
      throw new ConflictException(
        'You already have an active certificate. Revoke it first or rotate your keys to replace it.',
      );
    }
  }

  private async ensureVerifiedIdentity(userId: string) {
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
        'Verified identity data not found. Your account must complete ID verification before a certificate request can be submitted.',
      );
    }

    return citizenIdentity;
  }

  private async ensureNoPendingRequest(userId: string) {
    const pendingRequest = await this.findPendingRequest(userId);

    if (pendingRequest) {
      throw new ConflictException(
        'You already have a certificate request pending admin approval.',
      );
    }
  }

  private async findPendingRequest(userId: string) {
    return this.prisma.personalCertificateRequest.findFirst({
      where: {
        userId,
        status: CertificateRequestStatus.PENDING,
      },
      select: { id: true },
    });
  }

  private async findRequestOrThrow(requestId: string) {
    const request = await this.prisma.personalCertificateRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        keyPairId: true,
        status: true,
        requestedValidityYears: true,
        keyPair: {
          select: {
            isActive: true,
            publicKey: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Certificate request not found.');
    }

    return request;
  }

  private requestSelect() {
    return {
      id: true,
      status: true,
      requestedValidityYears: true,
      reviewReason: true,
      cancellationReason: true,
      reviewedByAdminId: true,
      reviewedAt: true,
      cancelledAt: true,
      issuedCertificateId: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private formatRequest(request: CertificateRequestRecord) {
    return {
      requestId: request.id,
      status: request.status,
      requestedValidityYears: request.requestedValidityYears,
      reviewReason: request.reviewReason,
      cancellationReason: request.cancellationReason,
      reviewedByAdminId: request.reviewedByAdminId,
      reviewedAt: request.reviewedAt,
      cancelledAt: request.cancelledAt,
      issuedCertificateId: request.issuedCertificateId,
      requestedAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private async resolveSubjectIdentity(citizenIdentity: StoredIdentityRecord) {
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

  private requireReason(reason: string, message: string) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException(message);
    }

    return normalizedReason;
  }

  private normalizeOptionalReason(reason?: string) {
    if (!reason) {
      return null;
    }

    const normalizedReason = reason.trim();
    return normalizedReason || null;
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
