# API Signature

Personal digital-signature backend for the Gracon platform.

This service manages user key pairs, personal certificates, signature-image assets, and the act of signing documents. It is the cryptographic user-signing backend consumed by the main app and the documents workspace.

## Overview

- Runtime: NestJS + TypeScript
- Default port: `3002`
- Database: shared Neon/Postgres via Prisma
- Storage: AWS S3 for signature-image assets
- Primary consumers: `app/app`, proxied calls from `app/documents`

## What This Service Owns

- Personal key-pair generation
- Certificate issuance and current-certificate lookup
- Signature-image upload/update
- Signing operations and signing proof persistence

## Core Skills Needed

- PKI concepts and key-management hygiene
- NestJS service-layer authorization
- Private-key encryption and lifecycle rotation
- S3 asset handling
- Signature workflow integration with the documents service

## Techniques Used

- Shared JWT validation from auth-issued tokens
- Encrypted private-key storage derived from `SIGNATURE_ENCRYPTION_SECRET`
- Single active certificate model per user
- Signature-image asset separation from key material
- Signing endpoints designed for proxy-based frontend usage

## Main Modules

```text
src/
  common/
    decorators/
    prisma/
    s3/
  modules/
    auth/
    certificates/
    keys/
    signature-image/
    signing/
```

## Folder Structure

```text
api/signature/
  prisma/
  src/
    common/
    modules/
  test/
  package.json
  nest-cli.json
```

## Local Commands

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run lint
npx prisma generate
```

## Environment Notes

Key variables:

```env
APP_PORT=3002
DATABASE_URL=
JWT_SECRET=
SIGNATURE_ENCRYPTION_SECRET=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=
```

## Integration Boundaries

- Trusts auth-issued user JWTs for identity
- Serves certificate/key status to `app/app`
- Receives signing requests for documents through server-side proxy routes in `app/documents`

## Important Rules

- Never expose decrypted private keys
- Keep key lifecycle separate from signature-image management
- Preserve one-active-certificate semantics unless the whole platform is updated

## Contribution Checklist

- Confirm whether a change affects current certificate assumptions
- Keep signing APIs safe for proxied frontend usage
- Validate any storage or encryption change against existing key material

