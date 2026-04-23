import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type { ForeignIdentityProfile } from './foreign-identity-profile.interface';

interface CacheEntry {
  profile: ForeignIdentityProfile;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 300_000;
const MAX_CACHE_ENTRIES = 1000;

@Injectable()
export class ForeignIdentityClient {
  private readonly client: AxiosInstance;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.getOrThrow<string>(
      'FOREIGN_IDENTITY_SERVICE_URL',
    );
    const token = this.config.getOrThrow<string>(
      'FOREIGN_IDENTITY_SERVICE_TOKEN',
    );

    this.ttlMs =
      this.config.get<number>('FOREIGN_IDENTITY_CACHE_TTL_MS') ??
      DEFAULT_CACHE_TTL_MS;

    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getByFin(fin: string): Promise<ForeignIdentityProfile> {
    const cached = this.getCached(fin);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.get<ForeignIdentityProfile>(
        `/foreign-identities/${fin}`,
      );
      this.store(fin, response.data);
      return response.data;
    } catch (error) {
      this.handleError(fin, error);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearFin(fin: string): void {
    this.cache.delete(fin);
  }

  private getCached(fin: string): ForeignIdentityProfile | null {
    const entry = this.cache.get(fin);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(fin);
      return null;
    }

    return entry.profile;
  }

  private store(fin: string, profile: ForeignIdentityProfile): void {
    if (!this.cache.has(fin) && this.cache.size >= MAX_CACHE_ENTRIES) {
      this.evictOldest();
    }

    this.cache.set(fin, {
      profile,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  private evictOldest(): void {
    const iterator = this.cache.keys().next();
    if (!iterator.done) {
      this.cache.delete(iterator.value);
    }
  }

  private handleError(fin: string, error: unknown): never {
    if (!axios.isAxiosError(error)) {
      throw new ServiceUnavailableException(
        'Foreign identity service is unavailable.',
      );
    }

    const status = error.response?.status;
    if (status === 404) {
      throw new NotFoundException(`No foreign identity found with FIN ${fin}.`);
    }

    if (status === 401 || status === 403) {
      throw new UnauthorizedException(
        'Foreign identity service authentication failed.',
      );
    }

    if (!status || status >= 500) {
      throw new ServiceUnavailableException(
        'Foreign identity service is unavailable.',
      );
    }

    throw new ServiceUnavailableException(
      'Unexpected foreign identity service error.',
    );
  }
}
