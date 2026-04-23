import * as crypto from 'crypto';
import * as forge from 'node-forge';
import { ConfigService } from '@nestjs/config';
import { IdentityType } from '@prisma/client';
import { CertificatesService } from './certificates.service';
import { ForeignIdentityClient } from '../foreign-identity/foreign-identity.client';
import { KeysService } from '../keys/keys.service';
import { PrismaService } from '../../common/prisma/prisma.service';

interface CreatedCertificateData {
  serialNumber: string;
  subjectCN: string;
  notBefore: Date;
  notAfter: Date;
  certificatePem: string;
  isRevoked: boolean;
}

interface CertificateRecord extends CreatedCertificateData {
  id: string;
}

function encryptIdentityValue(value: string, secret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(secret).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function generatePemKeyPair() {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    publicKeyPem: pair.publicKey,
    privateKeyPem: pair.privateKey,
  };
}

function readSubjectField(
  cert: forge.pki.Certificate,
  fieldName: string,
): string | undefined {
  return cert.subject.attributes.find((attribute) => {
    return attribute.shortName === fieldName || attribute.name === fieldName;
  })?.value;
}

function readSubjectIdentifier(
  cert: forge.pki.Certificate,
): string | undefined {
  return cert.subject.attributes.find((attribute) => {
    return (
      attribute.name === 'serialNumber' ||
      attribute.shortName === 'serialNumber' ||
      attribute.type === '2.5.4.5'
    );
  })?.value;
}

describe('CertificatesService integration', () => {
  it('issues a FIN-backed certificate with C=KE and the FIN in the subject identifier', async () => {
    const secret = 'shared-auth-encryption-secret';
    const fin = '2199180000001234';
    const { publicKeyPem, privateKeyPem } = generatePemKeyPair();

    const createCertificate = jest.fn(
      ({ data }: { data: CreatedCertificateData }): CertificateRecord => ({
        id: 'cert-1',
        serialNumber: data.serialNumber,
        subjectCN: data.subjectCN,
        notBefore: data.notBefore,
        notAfter: data.notAfter,
        certificatePem: data.certificatePem,
        isRevoked: data.isRevoked,
      }),
    );

    const prismaMock = {
      personalKeyPair: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'key-1',
          publicKey: publicKeyPem,
          isActive: true,
        }),
      },
      personalCertificate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createCertificate,
      },
      citizenIdentity: {
        findUnique: jest.fn().mockResolvedValue({
          identityType: IdentityType.FIN,
          nidEncrypted: null,
          finEncrypted: encryptIdentityValue(fin, secret),
          surName: 'Patrick',
          postNames: 'Ishimwe',
        }),
      },
    };

    const keysMock = {
      decryptActivePrivateKey: jest.fn().mockResolvedValue(privateKeyPem),
    };

    const configMock = {
      getOrThrow: jest.fn((key: string): string => {
        if (key === 'ENCRYPTION_SECRET') {
          return secret;
        }

        throw new Error(`Unexpected config key ${key}`);
      }),
    };

    const foreignIdentityClientMock = {
      getByFin: jest.fn().mockResolvedValue({
        fin,
        firstName: 'Ishimwe',
        lastName: 'Patrick',
        gender: 'MALE' as const,
        dateOfBirth: '1991-04-15',
        countryOfOrigin: 'KE',
        nationality: 'Kenyan',
        maritalStatus: 'SINGLE',
        issuanceVersion: 0,
        isActive: true,
      }),
    };

    const service = new CertificatesService(
      prismaMock as unknown as PrismaService,
      keysMock as unknown as KeysService,
      configMock as unknown as ConfigService,
      foreignIdentityClientMock as unknown as ForeignIdentityClient,
    );

    const result = await service.issue('user-1', { validityYears: 2 });
    const cert = forge.pki.certificateFromPem(result.certificatePem);

    expect(readSubjectField(cert, 'C')).toBe('KE');
    expect(readSubjectIdentifier(cert)).toBe(fin);
    expect(readSubjectField(cert, 'CN')).toBe('Ishimwe Patrick');
  });
});
