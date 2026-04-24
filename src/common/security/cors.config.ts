/**
 * CORS configuration for the signature service.
 *
 * The signature API is consumed by multiple frontend origins (the user app,
 * the admin app, and the documents app via its proxy routes), so we accept
 * a comma-separated `FRONTEND_URLS` allowlist alongside the primary
 * `FRONTEND_URL`. Wildcards are never used.
 */
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Expands one or more environment strings into a strict frontend origin allowlist.
 * Values may be a single origin or a comma-separated list.
 */
function parseAllowedOrigins(...values: Array<string | undefined>): string[] {
  return values
    .flatMap((value) => (value ?? '').split(','))
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Builds strict CORS config for the signature service.
 * Only explicitly configured frontend origins are allowed.
 *
 * @param frontendUrl - Primary frontend origin (e.g. the user app).
 * @param frontendUrls - Optional comma-separated extra origins (admin, documents, ...).
 * @returns Nest-compatible CorsOptions backed by a strict origin function.
 */
export function buildCorsConfig(
  frontendUrl: string,
  frontendUrls?: string,
): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(frontendUrl, frontendUrls);

  return {
    origin(origin, callback) {
      // Same-origin or non-browser callers (no Origin header) are always allowed.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          `Origin ${origin} is not allowed by signature service CORS policy.`,
        ),
        false,
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Retry-After'],
    credentials: true,
    maxAge: 86_400,
  };
}
