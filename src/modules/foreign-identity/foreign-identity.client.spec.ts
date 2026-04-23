import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ForeignIdentityClient } from './foreign-identity.client';
import type { ForeignIdentityProfile } from './foreign-identity-profile.interface';

type MockAxiosClient = {
  get: jest.Mock<Promise<{ data: ForeignIdentityProfile }>, [string]>;
};

type MockedAxiosModule = {
  create: jest.Mock<MockAxiosClient, [unknown?]>;
  isAxiosError: jest.Mock<boolean, [unknown]>;
};

jest.mock('axios', () => {
  const mockedAxios: MockedAxiosModule = {
    create: jest.fn<MockAxiosClient, [unknown?]>(),
    isAxiosError: jest.fn<boolean, [unknown]>((error: unknown) => {
      return Boolean(
        error &&
        typeof error === 'object' &&
        'isAxiosError' in error &&
        (error as { isAxiosError?: boolean }).isAxiosError,
      );
    }),
  };

  return {
    __esModule: true,
    default: mockedAxios,
    ...mockedAxios,
  };
});

const mockedAxios = axios as unknown as MockedAxiosModule;

const PROFILE: ForeignIdentityProfile = {
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
};

function createAxiosError(status?: number) {
  return {
    isAxiosError: true,
    response: status ? { status } : undefined,
    request: status ? undefined : {},
  };
}

function createService(ttlMs = 300000) {
  const get = jest.fn<
    ReturnType<MockAxiosClient['get']>,
    Parameters<MockAxiosClient['get']>
  >();
  const mockClient: MockAxiosClient = { get };
  const config = {
    getOrThrow: jest.fn((key: string): string => {
      if (key === 'FOREIGN_IDENTITY_SERVICE_URL') {
        return 'http://localhost:3006/api/v1';
      }

      if (key === 'FOREIGN_IDENTITY_SERVICE_USERNAME') {
        return 'service-user';
      }

      if (key === 'FOREIGN_IDENTITY_SERVICE_PASSWORD') {
        return 'service-password';
      }

      throw new Error(`Unexpected config key: ${key}`);
    }),
    get: jest.fn((key: string): number | undefined => {
      if (key === 'FOREIGN_IDENTITY_CACHE_TTL_MS') {
        return ttlMs;
      }

      return undefined;
    }),
  };

  mockedAxios.create.mockReturnValue(mockClient);

  return {
    service: new ForeignIdentityClient(config as unknown as ConfigService),
    mockClient,
  };
}

describe('ForeignIdentityClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns the profile on 200 response', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockResolvedValue({ data: PROFILE });

    await expect(service.getByFin(PROFILE.fin)).resolves.toEqual(PROFILE);
    const createCall = mockedAxios.create.mock.calls[0];
    const requestConfig = createCall?.[0] as {
      baseURL: string;
      headers: {
        Authorization: string;
      };
    };

    expect(requestConfig.baseURL).toBe('http://localhost:3006/api/v1');
    expect(requestConfig.headers.Authorization).toBe(
      `Basic ${Buffer.from('service-user:service-password').toString('base64')}`,
    );
  });

  it('throws NotFoundException on 404', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockRejectedValue(createAxiosError(404));

    await expect(service.getByFin(PROFILE.fin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws UnauthorizedException on 401', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockRejectedValue(createAxiosError(401));

    await expect(service.getByFin(PROFILE.fin)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException on 403', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockRejectedValue(createAxiosError(403));

    await expect(service.getByFin(PROFILE.fin)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws ServiceUnavailableException on 500', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockRejectedValue(createAxiosError(500));

    await expect(service.getByFin(PROFILE.fin)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException on network errors', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockRejectedValue(createAxiosError());

    await expect(service.getByFin(PROFILE.fin)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('caches successful responses inside the ttl window', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockResolvedValue({ data: PROFILE });

    await service.getByFin(PROFILE.fin);
    await service.getByFin(PROFILE.fin);

    expect(mockClient.get).toHaveBeenCalledTimes(1);
  });

  it('expires cache entries after the ttl', async () => {
    jest.useFakeTimers();
    const { service, mockClient } = createService(1000);
    mockClient.get.mockResolvedValue({ data: PROFILE });

    await service.getByFin(PROFILE.fin);
    jest.advanceTimersByTime(1001);
    await service.getByFin(PROFILE.fin);

    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });

  it('clearCache empties all cached entries', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockResolvedValue({ data: PROFILE });

    await service.getByFin(PROFILE.fin);
    service.clearCache();
    await service.getByFin(PROFILE.fin);

    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });

  it('clearFin removes a specific cached entry', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockResolvedValue({ data: PROFILE });

    await service.getByFin(PROFILE.fin);
    service.clearFin(PROFILE.fin);
    await service.getByFin(PROFILE.fin);

    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest cache entry when the size limit is exceeded', async () => {
    const { service, mockClient } = createService();
    mockClient.get.mockImplementation((url: string) => {
      const fin = url.split('/').pop() ?? PROFILE.fin;
      return Promise.resolve({ data: { ...PROFILE, fin } });
    });

    for (let index = 0; index <= 1000; index += 1) {
      await service.getByFin(`2${String(index).padStart(15, '0')}`);
    }

    await service.getByFin(`2${String(0).padStart(15, '0')}`);

    expect(mockClient.get).toHaveBeenCalledTimes(1002);
  });
});
