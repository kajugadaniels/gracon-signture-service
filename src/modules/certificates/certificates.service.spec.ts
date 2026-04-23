import {
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityType } from '@prisma/client';
import { CertificatesService } from './certificates.service';
import { ForeignIdentityClient } from '../foreign-identity/foreign-identity.client';
import { KeysService } from '../keys/keys.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPersonalX509 } from './helpers/x509.helper';
import { decryptIdentityValue } from './helpers/identity-crypto.helper';

jest.mock('./helpers/x509.helper', () => ({
  buildPersonalX509: jest.fn(),
}));

jest.mock('./helpers/identity-crypto.helper', () => ({
  decryptIdentityValue: jest.fn(),
}));

interface CitizenIdentityRecord {
  identityType: IdentityType;
  nidEncrypted: string | null;
  finEncrypted: string | null;
  surName: string;
  postNames: string;
}

interface KeyPairRecord {
  id: string;
  publicKey: string;
  isActive: boolean;
}

interface ExistingCertificateRecord {
  notAfter: Date;
}

interface CreatedCertificateRecord {
  id: string;
  serialNumber: string;
  subjectCN: string;
  notBefore: Date;
  notAfter: Date;
  certificatePem: string;
  isRevoked: boolean;
}

type FindFirstMock<T> = jest.Mock<Promise<T | null>, [unknown?]>;
type FindUniqueMock<T> = jest.Mock<Promise<T | null>, [unknown?]>;
type CreateMock<T> = jest.Mock<Promise<T>, [unknown]>;
type DecryptMock = jest.Mock<Promise<string>, [string]>;
type ConfigGetOrThrowMock = jest.Mock<string, [string]>;
type ForeignLookupMock = jest.Mock<Promise<unknown>, [string]>;

type BuildPersonalX509Mock = jest.MockedFunction<typeof buildPersonalX509>;
type DecryptIdentityValueMock = jest.MockedFunction<
  typeof decryptIdentityValue
>;

const mockBuildPersonalX509 = buildPersonalX509 as BuildPersonalX509Mock;
const mockDecryptIdentityValue =
  decryptIdentityValue as DecryptIdentityValueMock;

const BUILD_RESULT = {
  certificatePem: 'certificate-pem',
  serialNumber: 'SERIAL123',
  notBefore: new Date('2026-04-24T10:00:00.000Z'),
  notAfter: new Date('2028-04-24T10:00:00.000Z'),
  subjectCN: 'Ishimwe Patrick',
};

function createService() {
  const personalKeyPairFindFirst = jest.fn<
    ReturnType<FindFirstMock<KeyPairRecord>>,
    Parameters<FindFirstMock<KeyPairRecord>>
  >();
  const personalCertificateFindFirst = jest.fn<
    ReturnType<FindFirstMock<ExistingCertificateRecord>>,
    Parameters<FindFirstMock<ExistingCertificateRecord>>
  >();
  const personalCertificateCreate = jest.fn<
    ReturnType<CreateMock<CreatedCertificateRecord>>,
    Parameters<CreateMock<CreatedCertificateRecord>>
  >();
  const citizenIdentityFindUnique = jest.fn<
    ReturnType<FindUniqueMock<CitizenIdentityRecord>>,
    Parameters<FindUniqueMock<CitizenIdentityRecord>>
  >();
  const decryptActivePrivateKey = jest.fn<
    ReturnType<DecryptMock>,
    Parameters<DecryptMock>
  >();
  const configGetOrThrow: ConfigGetOrThrowMock = jest.fn((key: string) => {
    if (key === 'ENCRYPTION_SECRET') {
      return 'shared-encryption-secret';
    }

    throw new Error(`Unexpected config key ${key}`);
  });
  const getByFin = jest.fn<
    ReturnType<ForeignLookupMock>,
    Parameters<ForeignLookupMock>
  >();

  const prismaMock = {
    personalKeyPair: {
      findFirst: personalKeyPairFindFirst,
    },
    personalCertificate: {
      findFirst: personalCertificateFindFirst,
      create: personalCertificateCreate,
      update: jest.fn(),
    },
    citizenIdentity: {
      findUnique: citizenIdentityFindUnique,
    },
  };

  const keysMock = {
    decryptActivePrivateKey,
  };

  const configMock = {
    getOrThrow: configGetOrThrow,
  };

  const foreignIdentityClientMock = {
    getByFin,
  };

  const service = new CertificatesService(
    prismaMock as unknown as PrismaService,
    keysMock as unknown as KeysService,
    configMock as unknown as ConfigService,
    foreignIdentityClientMock as unknown as ForeignIdentityClient,
  );

  return {
    service,
    personalKeyPairFindFirst,
    personalCertificateFindFirst,
    personalCertificateCreate,
    citizenIdentityFindUnique,
    decryptActivePrivateKey,
    getByFin,
  };
}

function mockSuccessfulIssuanceState(
  personalKeyPairFindFirst: FindFirstMock<KeyPairRecord>,
  personalCertificateFindFirst: FindFirstMock<ExistingCertificateRecord>,
  personalCertificateCreate: CreateMock<CreatedCertificateRecord>,
  decryptActivePrivateKey: DecryptMock,
): void {
  personalKeyPairFindFirst.mockResolvedValue({
    id: 'key-1',
    publicKey: 'public-key',
    isActive: true,
  });
  personalCertificateFindFirst.mockResolvedValue(null);
  personalCertificateCreate.mockResolvedValue({
    id: 'cert-1',
    serialNumber: BUILD_RESULT.serialNumber,
    subjectCN: BUILD_RESULT.subjectCN,
    notBefore: BUILD_RESULT.notBefore,
    notAfter: BUILD_RESULT.notAfter,
    certificatePem: BUILD_RESULT.certificatePem,
    isRevoked: false,
  });
  decryptActivePrivateKey.mockResolvedValue('private-key');
}

describe('CertificatesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildPersonalX509.mockReturnValue(BUILD_RESULT);
  });

  it('uses RW and decrypted NID for NID users without calling foreign identity client', async () => {
    const {
      service,
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      citizenIdentityFindUnique,
      decryptActivePrivateKey,
      getByFin,
    } = createService();

    mockSuccessfulIssuanceState(
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      decryptActivePrivateKey,
    );
    citizenIdentityFindUnique.mockResolvedValue({
      identityType: IdentityType.NID,
      nidEncrypted: 'nid-cipher',
      finEncrypted: null,
      surName: 'Patrick',
      postNames: 'Ishimwe',
    });
    mockDecryptIdentityValue.mockReturnValue('1199912345678901');

    await service.issue('user-1', { validityYears: 2 });

    expect(getByFin).not.toHaveBeenCalled();
    expect(mockBuildPersonalX509).toHaveBeenCalledWith(
      {
        firstName: 'Ishimwe',
        lastName: 'Patrick',
        userId: 'user-1',
        subjectInstId: '1199912345678901',
      },
      'public-key',
      'private-key',
      'RW',
      2,
    );
  });

  it('uses foreign identity country and decrypted FIN for FIN users', async () => {
    const {
      service,
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      citizenIdentityFindUnique,
      decryptActivePrivateKey,
      getByFin,
    } = createService();

    mockSuccessfulIssuanceState(
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      decryptActivePrivateKey,
    );
    citizenIdentityFindUnique.mockResolvedValue({
      identityType: IdentityType.FIN,
      nidEncrypted: null,
      finEncrypted: 'fin-cipher',
      surName: 'Patrick',
      postNames: 'Ishimwe',
    });
    mockDecryptIdentityValue.mockReturnValue('2199180000001234');
    getByFin.mockResolvedValue({
      fin: '2199180000001234',
      firstName: 'Ishimwe',
      lastName: 'Patrick',
      gender: 'MALE',
      dateOfBirth: '1991-04-15',
      countryOfOrigin: 'KE',
      nationality: 'Kenyan',
      maritalStatus: 'SINGLE',
      issuanceVersion: 0,
      isActive: true,
    });

    await service.issue('user-1', { validityYears: 2 });

    expect(getByFin).toHaveBeenCalledWith('2199180000001234');
    expect(mockBuildPersonalX509).toHaveBeenCalledWith(
      {
        firstName: 'Ishimwe',
        lastName: 'Patrick',
        userId: 'user-1',
        subjectInstId: '2199180000001234',
      },
      'public-key',
      'private-key',
      'KE',
      2,
    );
  });

  it('throws ServiceUnavailableException when the foreign identity service is unreachable', async () => {
    const {
      service,
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      citizenIdentityFindUnique,
      decryptActivePrivateKey,
      getByFin,
    } = createService();

    mockSuccessfulIssuanceState(
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      decryptActivePrivateKey,
    );
    citizenIdentityFindUnique.mockResolvedValue({
      identityType: IdentityType.FIN,
      nidEncrypted: null,
      finEncrypted: 'fin-cipher',
      surName: 'Patrick',
      postNames: 'Ishimwe',
    });
    mockDecryptIdentityValue.mockReturnValue('2199180000001234');
    getByFin.mockRejectedValue(new ServiceUnavailableException('down'));

    await expect(service.issue('user-1', { validityYears: 2 })).rejects.toThrow(
      new ServiceUnavailableException(
        'Foreign identity service is currently unavailable. Please try again in a few minutes.',
      ),
    );
  });

  it('throws InternalServerErrorException when the FIN is missing in the registry', async () => {
    const {
      service,
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      citizenIdentityFindUnique,
      decryptActivePrivateKey,
      getByFin,
    } = createService();

    mockSuccessfulIssuanceState(
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      decryptActivePrivateKey,
    );
    citizenIdentityFindUnique.mockResolvedValue({
      identityType: IdentityType.FIN,
      nidEncrypted: null,
      finEncrypted: 'fin-cipher',
      surName: 'Patrick',
      postNames: 'Ishimwe',
    });
    mockDecryptIdentityValue.mockReturnValue('2199180000001234');
    getByFin.mockRejectedValue(new NotFoundException());

    await expect(service.issue('user-1', { validityYears: 2 })).rejects.toThrow(
      new InternalServerErrorException(
        'Certificate issuance failed: associated foreign identity record not found. Contact platform administrators.',
      ),
    );
  });

  it('maps foreign identity auth failures to ServiceUnavailableException', async () => {
    const {
      service,
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      citizenIdentityFindUnique,
      decryptActivePrivateKey,
      getByFin,
    } = createService();

    mockSuccessfulIssuanceState(
      personalKeyPairFindFirst,
      personalCertificateFindFirst,
      personalCertificateCreate,
      decryptActivePrivateKey,
    );
    citizenIdentityFindUnique.mockResolvedValue({
      identityType: IdentityType.FIN,
      nidEncrypted: null,
      finEncrypted: 'fin-cipher',
      surName: 'Patrick',
      postNames: 'Ishimwe',
    });
    mockDecryptIdentityValue.mockReturnValue('2199180000001234');
    getByFin.mockRejectedValue(
      new UnauthorizedException('invalid service token'),
    );

    await expect(
      service.issue('user-1', { validityYears: 2 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
