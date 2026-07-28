<div align="center">

# Gracon Signature Service

### Personal key management, certificate governance, document signing, signature verification, and signature-image storage

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Amazon S3](https://img.shields.io/badge/Amazon_S3-Private_Assets-569A31?logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![OpenAPI](https://img.shields.io/badge/API-OpenAPI_3-85EA2D?logo=swagger&logoColor=black)](#api-documentation)
[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)](#license)

**Gracon Signature Service** is the personal digital-signature backend for the Gracon identity and digital-trust platform. It generates and protects user key pairs, manages administrator-reviewed certificate requests, issues personal X.509 certificates for NID and FIN identities, signs exact document hashes, verifies signatures, stores signing-proof history, and manages visual signature-image assets.

[Overview](#overview) ·
[Architecture](#architecture) ·
[Cryptography](#cryptographic-profile) ·
[Certificates](#certificate-lifecycle) ·
[API](#api-reference) ·
[Setup](#local-development) ·
[Security](#security-model) ·
[Operations](#operations)

</div>

---

> [!NOTE]
> The GitHub repository slug is currently spelled `gracon-signture-service`. This README uses the product name **Gracon Signature Service** while preserving the existing clone URL.

> [!IMPORTANT]
> The current X.509 certificates are **self-signed with the user’s private key**. Administrator approval governs issuance in Gracon’s database, but the certificate is not chained to a platform or public certificate authority. Treat the current design as application-level trust, not as a publicly trusted PKI.

> [!CAUTION]
> The implementation presently embeds the decrypted NID or FIN in the certificate subject’s `serialNumber` attribute. Anyone who receives the PEM certificate can inspect that identifier. Review this privacy decision before production issuance.

---

## Table of contents

- [Overview](#overview)
- [Service responsibilities](#service-responsibilities)
- [Key capabilities](#key-capabilities)
- [Architecture](#architecture)
- [Trust boundaries](#trust-boundaries)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Authentication and authorization](#authentication-and-authorization)
- [Cryptographic profile](#cryptographic-profile)
- [Key-pair lifecycle](#key-pair-lifecycle)
- [Certificate lifecycle](#certificate-lifecycle)
- [NID and FIN certificate subjects](#nid-and-fin-certificate-subjects)
- [Administrator review bridge](#administrator-review-bridge)
- [Document signing](#document-signing)
- [Public signature verification](#public-signature-verification)
- [Signature-image storage](#signature-image-storage)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Request examples](#request-examples)
- [Configuration](#configuration)
- [Database ownership](#database-ownership)
- [AWS S3 configuration](#aws-s3-configuration)
- [Foreign Identity integration](#foreign-identity-integration)
- [Local development](#local-development)
- [API documentation](#api-documentation)
- [Testing and quality](#testing-and-quality)
- [Deployment](#deployment)
- [Operations](#operations)
- [Security model](#security-model)
- [Known implementation notes](#known-implementation-notes)
- [Production-hardening roadmap](#production-hardening-roadmap)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The Signature Service provides Gracon’s user-specific signing capabilities. It separates four concerns that are often incorrectly combined:

| Concern | Service behavior |
|---|---|
| Cryptographic identity | Generates a personal asymmetric key pair and stores only an encrypted private key |
| Certificate governance | Requires an administrator-reviewed request before a certificate becomes usable |
| Document signing | Signs a caller-supplied SHA-256 document hash and persists the proof |
| Visual signature | Stores a PNG or SVG image independently from cryptographic keys and certificates |

The service is designed to be consumed by Gracon’s main application and document workflows. Protected user routes accept only full-session JWTs issued by the User Auth Service. Internal certificate-review routes use separate service credentials and are intended for the Admin Service.

### Current trust model

The current implementation provides a **Gracon-managed application trust model**:

1. Gracon verifies the user’s identity.
2. The user receives an encrypted personal key pair.
3. The user requests a certificate.
4. A Gracon administrator approves or rejects the request.
5. Approval creates a self-signed X.509 certificate using the user’s private key.
6. Gracon allows signing only while the certificate is unrevoked, unexpired, and permitted by policy.
7. Gracon stores signing proofs and public verification attempts.

This is useful inside a closed platform, but it is not equivalent to a certificate issued by a recognized CA with chain validation, revocation distribution, OCSP, certificate policies, and hardware-protected issuer keys.

---

## Service responsibilities

The service owns:

- RSA-2048 and Ed25519 key-pair generation interfaces;
- per-user private-key encryption;
- public-key fingerprints;
- active-key lookup and rotation;
- certificate-request submission;
- administrator approval and rejection;
- certificate-access policy enforcement;
- NID and FIN identity resolution during issuance;
- personal X.509 certificate creation;
- current-certificate and request-status lookup;
- certificate revocation;
- exact-hash document signing;
- persisted signing-proof history;
- public signature-verification attempts;
- signature-image upload, retrieval, and soft deletion;
- private S3 storage for signature images;
- foreign-identity profile lookup and short-lived caching.

The service does **not** own:

- user registration or login;
- JWT issuance or refresh;
- biometric identity verification;
- the canonical Prisma schema or migrations;
- administrator authentication;
- document content or canonical document hashing;
- a platform certificate authority;
- HSM/KMS-backed signing;
- public CRL or OCSP infrastructure;
- long-term legal interpretation of electronic signatures;
- the user interface.

---

## Key capabilities

### Key management

- Generate RSA-2048 or Ed25519 key pairs
- Return only the public key and fingerprint
- Encode public keys as SPKI PEM
- Encode private keys as PKCS#8 PEM before encryption
- Derive a per-user encryption key from a master secret
- Store encrypted private-key material in PostgreSQL
- Maintain one active key pair per user at the service layer
- Rotate keys and revoke certificates associated with the old key
- Cancel pending certificate requests during manual rotation

### Certificate governance

- Submit a certificate request for one to five years
- Default requested validity of two years
- Require a verified NID or FIN identity
- Require an active key pair
- Block requests and signing through an administrator-managed access policy
- Expose lifecycle-specific request status
- Approve or reject requests through an internal Admin Service bridge
- Automatically rotate a key pair when an old key has already been certified
- Revoke the current certificate permanently
- Return current certificate PEM and validity metadata

### Signing and verification

- Accept a 64-character hexadecimal SHA-256 document hash
- Require an active, unrevoked, unexpired certificate
- Require certificate access to be allowed
- Decrypt the private key only for the signing operation
- Return a Base64 signature
- Persist the document name, hash, certificate, signature, and server timestamp
- Expose signing history
- Offer a public verification endpoint
- Persist verification attempts with result and caller IP metadata

### Signature images

- Upload PNG or SVG visual signatures
- Enforce a two-megabyte service-level maximum
- Store files in a private S3 bucket
- Apply AES-256 S3 server-side encryption
- Return one-hour presigned URLs
- Maintain one active image at the service layer
- Soft-delete image metadata independently of cryptographic keys

---

## Architecture

```mermaid
flowchart LR
    App["Gracon User Application"]
    Documents["Gracon Documentify Service"]
    Admin["Gracon Admin Service"]
    Edge["Reverse Proxy / API Gateway"]
    Signature["Gracon Signature Service<br/>NestJS · :3002"]
    DBPackage["@gracon/database<br/>Generated Prisma Client"]
    DB[("PostgreSQL / Neon")]
    S3[("Private Amazon S3 Bucket")]
    Auth["Gracon User Auth Service"]
    Foreign["Gracon Foreign Identity Service"]

    App -->|"Full-session JWT"| Edge
    Documents -->|"Proxied signing workflow"| Edge
    Edge --> Signature

    Admin -->|"Internal Basic Auth<br/>approve / reject"| Signature
    Signature --> DBPackage
    DBPackage --> DB
    Signature -->|"Encrypted signature images"| S3
    Signature -->|"Internal Basic Auth<br/>FIN profile lookup"| Foreign

    Auth -->|"Users, JWTs,<br/>NID/FIN identity records"| DB
    Documents -->|"Document hash and metadata"| Signature

    style Signature stroke-width:3px
```

### Logical trust flow

```mermaid
flowchart TB
    Identity["Verified Gracon identity"]
    Key["Encrypted personal key pair"]
    Request["Pending certificate request"]
    Review["Administrator review"]
    Certificate["Self-signed personal certificate"]
    Sign["Exact-hash signature"]
    Proof["Stored signing proof"]
    Verify["Verification attempt"]

    Identity --> Key
    Key --> Request
    Request --> Review
    Review -->|Approve| Certificate
    Review -->|Reject| Rejected["Rejected request"]
    Certificate --> Sign
    Sign --> Proof
    Proof -. "Hash + signature + signer" .-> Verify
```

---

## Trust boundaries

| Boundary | Enforcement |
|---|---|
| Anonymous vs. protected user APIs | Global `VerifiedUserGuard`; public routes require an explicit bypass |
| Limited vs. full session | JWT strategy requires `tokenType: "full"` |
| Active vs. deactivated user | User record loaded for every protected request |
| Unverified vs. verified user | `isIdVerified === true` |
| User routes vs. admin review | Separate internal controller protected with service Basic Auth |
| Public vs. private key | Private key is encrypted and never included in normal API responses |
| Signature image vs. cryptographic signature | Stored in separate models and S3 paths |
| Certificate request vs. usable certificate | Pending request cannot sign; administrator approval creates the certificate |
| Allowed vs. sanctioned certificate use | User-level access policy blocks request, approval, and signing |
| Document metadata vs. signing proof | Service signs a supplied hash and does not fetch the canonical document |
| Service vs. schema ownership | Shared `@gracon/database`; migrations remain in the database repository |
| Browser vs. S3 | Browser receives a temporary presigned URL, not AWS credentials |

---

## Technology stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Framework | NestJS 11 |
| Language | TypeScript 5.7 |
| Database | PostgreSQL / Neon |
| ORM | Prisma through `@gracon/database` |
| Cryptography | Node.js `crypto`, `node-forge` |
| Object storage | Amazon S3 through AWS SDK v2 |
| Authentication | Passport JWT |
| Internal service authentication | HTTP Basic Authentication with timing-safe comparison |
| Validation | `class-validator` + `class-transformer` |
| Rate limiting | `@nestjs/throttler` |
| Security headers | Helmet |
| API documentation | OpenAPI / Swagger |
| Upload handling | Multer |
| Tests | Jest + Supertest |
| CI | GitHub Actions |

---

## Project structure

```text
gracon-signture-service/
├── .github/
│   └── workflows/
│       └── api-security.yml
├── agents/
├── docs/
│   └── database-setup.md
├── src/
│   ├── common/
│   │   ├── config/                 # Typed environment validation
│   │   ├── decorators/             # Public and current-user decorators
│   │   ├── filters/                # HTTP/throttling exception handling
│   │   ├── prisma/                 # Shared Prisma client wrapper
│   │   ├── s3/                     # Private signature-image storage
│   │   └── security/               # Security utilities
│   ├── modules/
│   │   ├── auth/                   # Full-session user guard and service auth
│   │   ├── certificates/           # Request, review, issue, status, revoke
│   │   ├── foreign-identity/       # FIN profile client and cache
│   │   ├── keys/                   # Key generation, encryption, rotation
│   │   ├── signature-image/        # Visual signature assets
│   │   └── signing/                # Sign, verify, and history
│   ├── app.module.ts
│   └── main.ts
├── test/
│   └── app.e2e-spec.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Authentication and authorization

### Protected user routes

`VerifiedUserGuard` is registered globally. A protected request must satisfy:

1. valid bearer-token syntax;
2. valid signature using `JWT_SECRET`;
3. `tokenType === "full"`;
4. existing user;
5. active user;
6. completed identity verification.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Guard as VerifiedUserGuard
    participant JWT as UserJwtStrategy
    participant DB as PostgreSQL
    participant Handler

    Client->>Guard: Bearer access token
    Guard->>JWT: Validate token
    JWT->>JWT: Require tokenType = full
    JWT->>DB: Load user
    DB-->>JWT: Account and verification state
    JWT->>JWT: Require active + ID verified
    JWT-->>Guard: Trusted user context
    Guard->>Handler: Continue
```

Expected token claims are equivalent to:

```json
{
  "sub": "user-uuid",
  "email": "person@example.com",
  "tokenType": "full",
  "iat": 1720000000,
  "exp": 1720000900
}
```

The service does not issue JWTs.

### Public route

The signature-verification endpoint is public. It remains subject to the global general throttling profile.

### Internal administrator routes

Certificate approval and rejection are marked public only to bypass user JWT authentication. They enforce a separate Basic Authentication boundary using:

- `SIGNATURE_SERVICE_USERNAME`
- `SIGNATURE_SERVICE_PASSWORD`

Keep these endpoints behind private networking or a trusted service gateway.

---

## Cryptographic profile

### Key formats

| Algorithm | Public format | Private format | Intended signing call |
|---|---|---|---|
| `RSA_2048` | SPKI PEM | PKCS#8 PEM | Node `crypto.sign("SHA256", hashBytes, key)` |
| `ED25519` | SPKI PEM | PKCS#8 PEM | Node `crypto.sign(null, hashBytes, key)` |

### Private-key encryption

The current storage profile is:

```text
perUserKey = HMAC-SHA256(SIGNATURE_ENCRYPTION_SECRET, userId)
ciphertext = AES-256-CBC(perUserKey, random 16-byte IV, privateKeyPem)
storedValue = ivHex + ":" + ciphertextHex
```

Benefits:

- the plaintext private key is not stored in PostgreSQL;
- each user derives a different encryption key;
- the public API never returns private-key material.

Limitations:

- AES-CBC does not authenticate the ciphertext;
- application memory temporarily contains plaintext PEM;
- JavaScript strings cannot be reliably zeroized;
- compromise of the database plus master secret exposes every software-held key;
- no HSM, KMS asymmetric key, or remote signer is currently used.

For production, migrate to authenticated encryption such as AES-256-GCM or envelope encryption, then move signing into an HSM/KMS/PKCS#11 boundary.

### Public-key fingerprint

The service computes and stores a SHA-256 fingerprint of the public key. Use it for display, investigation, and key-change detection; do not treat a displayed fingerprint as independently trusted unless verified through another channel.

### Document signing profile

The API accepts a precomputed 32-byte SHA-256 digest represented by 64 hexadecimal characters.

For RSA, the implementation then asks Node.js to sign those digest bytes with the `"SHA256"` algorithm. This results in a service-defined profile equivalent to signing:

```text
SHA-256(documentHashBytes)
```

rather than directly signing the original document bytes.

The public verification endpoint performs the matching operation, so Gracon-generated RSA signatures are internally consistent. For broader interoperability, formally define the signature profile and consider one of:

- accept canonical document bytes and hash once inside the service;
- use a standard pre-hashed signature primitive;
- use a CMS, JWS, COSE, or PAdES-compatible envelope;
- bind algorithm, certificate ID, hash algorithm, and canonicalization version into the proof.

---

## Key-pair lifecycle

```mermaid
stateDiagram-v2
    [*] --> Active: Generate
    Active --> Inactive: Rotate
    Active --> Active: Public-key lookup
    Inactive --> [*]

    state RotateEffects {
        [*] --> RevokeCertificates
        RevokeCertificates --> CancelPendingRequests
        CancelPendingRequests --> GenerateReplacement
        GenerateReplacement --> [*]
    }
```

### Generate

`POST /signature/keys/generate`:

1. rejects a user who already has an active key pair;
2. generates RSA-2048 or Ed25519 keys;
3. derives a per-user encryption key;
4. encrypts the private PEM;
5. fingerprints the public PEM;
6. stores the pair;
7. returns public information only.

### Rotate

`POST /signature/keys/rotate` currently performs:

1. mark active keys inactive;
2. revoke every unrevoked certificate with reason `Key rotation`;
3. cancel pending certificate requests;
4. generate a replacement pair.

Rotation is destructive and invalidates the old signing state. It does not change historical `PersonalSignedDocument` rows.

> [!WARNING]
> The rotation steps are currently separate database operations rather than one transaction. A failure while generating or storing the replacement can leave the user without an active key after old keys and certificates have already been invalidated.

---

## Certificate lifecycle

### Request state

```mermaid
stateDiagram-v2
    [*] --> PENDING: User submits request
    PENDING --> APPROVED: Admin approves
    PENDING --> REJECTED: Admin rejects
    PENDING --> CANCELLED: Key rotation or workflow cancellation
    APPROVED --> [*]: Certificate created
    REJECTED --> [*]
    CANCELLED --> [*]
```

### Certificate state

```mermaid
stateDiagram-v2
    [*] --> Valid: Approved request creates certificate
    Valid --> Expired: notAfter elapsed
    Valid --> Revoked: User/admin workflow revokes
    Valid --> Revoked: Key rotation
    Expired --> Replaced: New request rotates certified key
    Revoked --> Replaced: New request rotates certified key
    Revoked --> [*]
    Replaced --> [*]
```

### Submit request

`POST /signature/certificates/issue` returns `202 Accepted`.

Requirements:

- certificate access policy is not `BANNED`;
- an active key pair exists;
- no active unrevoked and unexpired certificate exists;
- a verified identity record exists;
- no pending request exists.

Requested validity:

- minimum: one year;
- maximum: five years;
- default: two years.

If the current active key has already been used by any certificate, the service rotates to a fresh key before creating the new request.

### Administrator approval

Approval:

1. requires a pending request;
2. requires the request’s key to remain active;
3. requires certificate access to remain allowed;
4. requires no active certificate;
5. requires the key not to have been certified previously;
6. resolves NID or FIN identity data;
7. decrypts the active private key;
8. creates and self-signs the X.509 certificate;
9. creates the certificate and marks the request `APPROVED` in one database transaction.

### Rejection

Rejection requires a meaningful review reason and moves only a pending request to `REJECTED`.

### Revocation

`POST /signature/certificates/revoke` permanently marks the current unrevoked certificate as revoked and records the supplied reason.

The implementation has no “unrevoke” endpoint.

### Access policy

The shared data model supports:

- `ALLOWED`
- `BANNED`

A ban can block:

- new certificate requests;
- administrator approval;
- document signing.

Certificate revocation and access bans are intentionally separate concepts:

- revocation affects one certificate;
- a ban affects the user’s ability to request or use certificates.

---

## NID and FIN certificate subjects

### NID identities

For a Rwandan NID holder, approval:

1. decrypts the stored NID using `ENCRYPTION_SECRET`;
2. uses country code `RW`;
3. constructs the subject from the verified identity record.

### FIN identities

For a foreign-identity holder, approval:

1. decrypts the stored FIN using `ENCRYPTION_SECRET`;
2. calls the Foreign Identity Service;
3. uses the returned country-of-origin ISO alpha-2 code;
4. constructs the certificate subject.

### Current X.509 subject

The helper currently generates:

| Attribute | Value |
|---|---|
| Common Name (`CN`) | First and last name |
| Organization (`O`) | `ID Verification Platform` |
| Serial Number subject attribute | Decrypted NID or FIN |
| Country (`C`) | `RW` or foreign country |
| Issuer | Same as subject |
| CA constraint | `false` |
| Key usage | Digital signature, non-repudiation |
| Subject Alternative Name | User UUID encoded as SAN type `2` |

The certificate serial number itself is a random UUID transformed into uppercase hexadecimal.

> [!WARNING]
> SAN type `2` is a DNS name, but the value is a user UUID rather than a DNS hostname. A URI SAN or platform-specific registered identifier would be more standards-aligned.

> [!WARNING]
> Because the certificate is self-signed, administrator approval is not cryptographically represented by a Gracon issuer signature. The approval exists in the database workflow, not in a CA certificate chain.

---

## Administrator review bridge

Internal routes:

```text
POST /api/v1/internal/certificate-requests/{requestId}/approve
POST /api/v1/internal/certificate-requests/{requestId}/reject
```

They are intended for the Gracon Admin Service.

### Authentication

The caller sends:

```http
Authorization: Basic base64(username:password)
```

Credentials are compared with timing-safe equality.

### Approval body

```json
{
  "adminId": "00000000-0000-4000-8000-000000000000",
  "reason": "Identity evidence and request details reviewed and approved."
}
```

### Rejection body

```json
{
  "adminId": "00000000-0000-4000-8000-000000000000",
  "reason": "The submitted identity evidence does not satisfy issuance policy."
}
```

The supplied `adminId` is recorded as review metadata.

### Recommended boundary

Production should add:

- private network routing;
- mTLS or a signed service JWT;
- credential rotation;
- replay resistance;
- caller identity derived from authenticated credentials rather than a body field;
- request correlation and immutable administrative audit export.

---

## Document signing

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API as Signature Service
    participant DB as PostgreSQL
    participant Key as Key Crypto

    Client->>API: POST /signature/signing/sign<br/>documentHash + documentName
    API->>DB: Check certificate-access policy
    API->>DB: Load active unrevoked certificate
    API->>API: Require certificate not expired
    API->>DB: Load active key pair
    API->>Key: Decrypt private key
    Key-->>API: Plaintext PEM in process memory
    API->>API: Sign hash bytes
    API->>API: Discard local PEM reference
    API->>DB: Create signing-proof record
    API-->>Client: Signature, certificate ID,<br/>hash, name, signedAt
```

### Sign contract

```json
{
  "documentName": "Mutual Non-Disclosure Agreement.pdf",
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

The service does not retrieve the document. The caller is responsible for:

- canonicalizing the document;
- computing the correct SHA-256 hash;
- ensuring the name describes the same content;
- preserving the exact signed bytes;
- binding the resulting proof to the document record.

### Signing proof

A stored proof contains:

- user ID;
- certificate ID;
- document name;
- document hash;
- Base64 signature bytes;
- server-generated signing timestamp.

No public delete or update endpoint is exposed for signing proofs.

### Signing history

The history endpoint returns proof metadata without returning the encrypted private key.

---

## Public signature verification

```mermaid
sequenceDiagram
    autonumber
    participant Public
    participant API as Signature Service
    participant DB as PostgreSQL
    participant Crypto

    Public->>API: POST /signature/signing/verify
    API->>DB: Load latest unrevoked certificate for user
    API->>API: Check expiry
    API->>Crypto: Verify signature over hash bytes
    Crypto-->>API: true / false
    API->>DB: Persist verification attempt
    API-->>Public: valid + signer, or failure reason
```

### Verify contract

```json
{
  "userId": "00000000-0000-4000-8000-000000000000",
  "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "signatureBytes": "Base64EncodedSignature"
}
```

### Current verification semantics

The implementation:

- selects the user’s latest unrevoked certificate;
- rejects an expired certificate;
- verifies with SHA-256;
- returns the certificate subject and validity on success;
- records the attempt.

> [!IMPORTANT]
> This endpoint verifies against the user’s **current unrevoked certificate**, not necessarily the certificate recorded when the signature was created. A signature can therefore become unverifiable after rotation or revocation even if it was valid at signing time.

A more durable contract should accept a signature ID or certificate ID, load the certificate used at signing, verify the cryptographic proof, and report current revocation/trust status separately.

---

## Signature-image storage

Visual signature images are independent of cryptographic signatures.

### Upload flow

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant API as Signature Service
    participant S3
    participant DB as PostgreSQL

    User->>API: Multipart PNG or SVG
    API->>API: Validate MIME and size
    API->>S3: Put private AES256-encrypted object
    S3-->>API: Object key
    API->>DB: Deactivate old active metadata
    API->>DB: Create new active image metadata
    API-->>User: Temporary presigned URL
```

### Object path

Conceptually:

```text
signature-images/
  <user-id>/
    <random-uuid>.png
    <random-uuid>.svg
```

Clients must not construct or depend on raw S3 keys.

### Retrieval

`GET /signature/image` returns a one-hour presigned URL for the active image.

### Delete

`DELETE /signature/image` soft-deactivates the active database record.

> [!NOTE]
> The current delete and replacement workflows do not delete the old S3 object. Add retention and orphan cleanup before operating at scale.

> [!CAUTION]
> SVG is active XML content. Validate and sanitize SVG uploads, render them in a safe context, or restrict uploads to raster formats before allowing untrusted users to upload signatures.

---

## Data model

```mermaid
erDiagram
    User ||--o{ PersonalKeyPair : owns
    User ||--o{ PersonalCertificateRequest : requests
    User ||--o{ PersonalCertificate : owns
    User ||--o| PersonalCertificateAccessPolicy : governed_by
    User ||--o{ PersonalSignedDocument : signs
    User ||--o{ PersonalSignatureImage : uploads

    PersonalKeyPair ||--o{ PersonalCertificateRequest : requested_for
    PersonalKeyPair ||--o| PersonalCertificate : certified_by
    PersonalCertificate ||--o{ PersonalSignedDocument : proves
    PersonalCertificate ||--o{ PersonalSignatureVerification : verified_with

    PersonalKeyPair {
        uuid id PK
        uuid userId FK
        enum algorithm
        text publicKey
        text privateKeyEncrypted
        string fingerprint
        boolean isActive
        datetime createdAt
    }

    PersonalCertificateRequest {
        uuid id PK
        uuid userId FK
        uuid keyPairId FK
        enum status
        int requestedValidityYears
        uuid reviewedByAdminId
        string reviewReason
        uuid issuedCertificateId
        datetime reviewedAt
        datetime cancelledAt
    }

    PersonalCertificate {
        uuid id PK
        uuid userId FK
        uuid keyPairId FK
        string serialNumber
        string subjectCN
        string subjectO
        string subjectC
        string subjectUserId
        datetime notBefore
        datetime notAfter
        text certificatePem
        boolean isRevoked
        datetime revokedAt
        string revokedReason
    }

    PersonalSignedDocument {
        uuid id PK
        uuid userId FK
        uuid certificateId FK
        string documentName
        string documentHash
        text signatureBytes
        datetime signedAt
    }

    PersonalSignatureVerification {
        uuid id PK
        uuid certificateId FK
        string documentHash
        boolean result
        string failReason
        string ipAddress
        datetime verifiedAt
    }

    PersonalSignatureImage {
        uuid id PK
        uuid userId FK
        string s3Key
        string mimeType
        int sizeBytes
        boolean isActive
        datetime createdAt
    }
```

---

## API reference

All service routes are mounted beneath:

```text
/api/v1
```

### Key pairs

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/signature/keys/generate` | Verified full-session user | Generate the first active key pair |
| `GET` | `/signature/keys/public` | Verified full-session user | Retrieve active public-key metadata |
| `POST` | `/signature/keys/rotate` | Verified full-session user | Revoke old key-related state and generate a replacement |

Supported algorithm values:

```text
RSA_2048
ED25519
```

> [!WARNING]
> Although `ED25519` generation is exposed, the current X.509 and public-verification implementation is RSA-oriented. Use `RSA_2048` for the complete certificate-and-verification workflow until Ed25519 issuance and verification are implemented and tested end-to-end.

### Certificates

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/signature/certificates/issue` | Verified full-session user | Submit a certificate request |
| `GET` | `/signature/certificates/request/current` | Verified full-session user | Retrieve the latest request |
| `GET` | `/signature/certificates/current` | Verified full-session user | Retrieve current unrevoked certificate |
| `GET` | `/signature/certificates/status` | Verified full-session user | Retrieve policy, request, current cert, and latest revocation |
| `POST` | `/signature/certificates/revoke` | Verified full-session user | Permanently revoke current certificate |

### Internal certificate review

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/internal/certificate-requests/:requestId/approve` | Internal Basic Auth | Approve and issue |
| `POST` | `/internal/certificate-requests/:requestId/reject` | Internal Basic Auth | Reject with reason |

These endpoints are excluded from Swagger.

### Signing

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/signature/signing/sign` | Verified full-session user | Sign a SHA-256 document hash |
| `POST` | `/signature/signing/verify` | Public | Verify a hash/signature/user combination |
| `GET` | `/signature/signing/history` | Verified full-session user | List the current user’s signing proofs |

### Signature image

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/signature/image/upload` | Verified full-session user | Upload or replace a visual signature |
| `GET` | `/signature/image` | Verified full-session user | Get active image metadata and temporary URL |
| `DELETE` | `/signature/image` | Verified full-session user | Soft-delete the active image |

---

## Request examples

Set the API base and token:

```bash
export SIGNATURE_API_URL="http://localhost:3002/api/v1"
export ACCESS_TOKEN="<full-session-gracon-access-token>"
```

### Generate an RSA key pair

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/keys/generate" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "algorithm": "RSA_2048"
  }'
```

### Get the public key

```bash
curl --request GET \
  --url "$SIGNATURE_API_URL/signature/keys/public" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

### Request a two-year certificate

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/certificates/issue" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "validityYears": 2
  }'
```

### Check certificate lifecycle status

```bash
curl --request GET \
  --url "$SIGNATURE_API_URL/signature/certificates/status" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

### Approve a request from the Admin Service

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/internal/certificate-requests/<request-id>/approve" \
  --user "$SIGNATURE_SERVICE_USERNAME:$SIGNATURE_SERVICE_PASSWORD" \
  --header "Content-Type: application/json" \
  --data '{
    "adminId": "00000000-0000-4000-8000-000000000000",
    "reason": "Identity evidence and certificate request reviewed and approved."
  }'
```

### Sign a document hash

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/signing/sign" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "documentName": "Service Agreement.pdf",
    "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }'
```

### Verify publicly

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/signing/verify" \
  --header "Content-Type: application/json" \
  --data '{
    "userId": "00000000-0000-4000-8000-000000000000",
    "documentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "signatureBytes": "<base64-signature>"
  }'
```

### List signing history

```bash
curl --request GET \
  --url "$SIGNATURE_API_URL/signature/signing/history?page=1&limit=20" \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

### Upload a visual signature

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/image/upload" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --form "file=@./signature.png"
```

### Revoke a certificate

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/certificates/revoke" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "reason": "The user believes the signing key may have been exposed."
  }'
```

### Rotate the key pair

```bash
curl --request POST \
  --url "$SIGNATURE_API_URL/signature/keys/rotate" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "algorithm": "RSA_2048"
  }'
```

Rotation revokes the old certificate and cancels pending requests.

---

## Configuration

Copy the environment template:

```bash
cp .env.example .env
```

### Environment variables

| Variable | Required | Example/default | Description |
|---|:---:|---|---|
| `APP_PORT` | ✓ | `3002` | Service HTTP port |
| `APP_ENV` | ✓ | `development` | `development`, `production`, or `test` |
| `DATABASE_URL` | ✓ | PostgreSQL URL | Dedicated Signature Service runtime role |
| `JWT_SECRET` | ✓ | — | Must match User Auth Service; minimum 32 characters |
| `ENCRYPTION_SECRET` | ✓ | — | Must match identity-data encryption used by User Auth Service |
| `SIGNATURE_ENCRYPTION_SECRET` | ✓ | — | Master secret for per-user private-key encryption |
| `FOREIGN_IDENTITY_SERVICE_URL` | ✓ | `http://localhost:3006/api/v1` | Foreign Identity Service base |
| `FOREIGN_IDENTITY_SERVICE_USERNAME` | ✓ | — | Internal service username |
| `FOREIGN_IDENTITY_SERVICE_PASSWORD` | ✓ | — | Internal service password |
| `FOREIGN_IDENTITY_CACHE_TTL_MS` | ✓ | `300000` | In-process FIN-profile cache lifetime |
| `SIGNATURE_SERVICE_USERNAME` | ✓ | — | Admin review-bridge username |
| `SIGNATURE_SERVICE_PASSWORD` | ✓ | — | Admin review-bridge password |
| `AWS_REGION` | ✓ | — | Signature-image bucket region |
| `AWS_ACCESS_KEY_ID` | ✓ | — | S3 credential |
| `AWS_SECRET_ACCESS_KEY` | ✓ | — | S3 credential |
| `AWS_S3_BUCKET_NAME` | ✓ | — | Private signature-image bucket |
| `FRONTEND_URL` | ✓ | `http://localhost:4000` | Primary allowed browser origin |
| `FRONTEND_URLS` | — | — | Additional comma-separated origins |

### Example `.env`

```dotenv
APP_PORT=3002
APP_ENV=development

DATABASE_URL=postgresql://gracon_signature_app:replace-me@localhost:5432/gracon

JWT_SECRET=replace-with-the-user-auth-service-jwt-secret
ENCRYPTION_SECRET=replace-with-the-user-auth-service-encryption-secret
SIGNATURE_ENCRYPTION_SECRET=replace-with-an-independent-strong-secret

FOREIGN_IDENTITY_SERVICE_URL=http://localhost:3006/api/v1
FOREIGN_IDENTITY_SERVICE_USERNAME=service.foreign-identity@example.com
FOREIGN_IDENTITY_SERVICE_PASSWORD=replace-with-a-long-random-password
FOREIGN_IDENTITY_CACHE_TTL_MS=300000

SIGNATURE_SERVICE_USERNAME=service.signature-admin@example.com
SIGNATURE_SERVICE_PASSWORD=replace-with-a-long-random-password

AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=replace-me
AWS_SECRET_ACCESS_KEY=replace-me
AWS_S3_BUCKET_NAME=gracon-signatures-development

FRONTEND_URL=http://localhost:4000
FRONTEND_URLS=http://localhost:4001,http://localhost:4002
```

Never commit production secrets.

### Secret relationships

| Secret | Relationship |
|---|---|
| `JWT_SECRET` | Must match the User Auth Service |
| `ENCRYPTION_SECRET` | Must match the service that encrypted NID/FIN data |
| `SIGNATURE_ENCRYPTION_SECRET` | Should be unique to the Signature Service |
| Foreign Identity credentials | Must match the Foreign Identity Service |
| Signature Service credentials | Must match the Admin Service review client |
| AWS credentials | Must be scoped to signature-image objects only |

---

## Database ownership

This repository consumes:

```json
"@gracon/database": "file:../database"
```

The Gracon database repository owns:

- the canonical Prisma schema;
- migrations;
- generated client code;
- seeds;
- database roles and grants;
- consumer-boundary validation.

Recommended local workspace:

```text
gracon/
├── database/
└── signature/
```

Although the GitHub repository is named `gracon-signture-service`, cloning it into a local directory named `signature` keeps the package relationship readable:

```bash
git clone https://github.com/kajugadaniels/gracon-signture-service.git signature
```

Use a dedicated least-privilege runtime role such as:

```text
gracon_signature_app
```

Do not add a service-local Prisma schema or execute migrations from this repository.

---

## AWS S3 configuration

### Bucket posture

Use a private bucket with:

- Block Public Access enabled;
- default encryption;
- no public object ACLs;
- CloudTrail data events or equivalent access logging;
- lifecycle rules for inactive/orphaned images;
- separate development and production buckets.

The service also requests `AES256` server-side encryption on upload.

### Least-privilege IAM example

Replace the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageSignatureImages",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::gracon-signatures-production/signature-images/*"
    }
  ]
}
```

The current image workflow uses upload and signed read. The shared S3 helper also exposes deletion.

### Workload identity

The typed environment currently requires an access-key ID and secret, and the S3 client is created with explicit credentials. To support IAM roles, ECS task roles, EKS identities, or another default credential chain:

1. make static credentials optional in validation;
2. omit the explicit credential object when variables are absent;
3. prefer short-lived workload credentials in production.

---

## Foreign Identity integration

FIN certificate issuance calls:

```text
GET {FOREIGN_IDENTITY_SERVICE_URL}/foreign-identities/{fin}
```

with HTTP Basic Authentication.

### Behavior

- five-second request timeout;
- process-local cache;
- default five-minute TTL;
- maximum 1,000 cached entries;
- HTTP error translation for not found, unauthorized, and unavailable cases.

### Privacy and scaling notes

- FIN appears in the URL path and may be visible in reverse-proxy or provider logs.
- Cached identity profiles remain in application memory until expiry/eviction.
- Cache state is not shared across replicas.
- There is no distributed invalidation.
- Logging should redact request paths that contain identifiers.
- Consider a POST lookup contract using encrypted transport and structured body data.

---

## Local development

### Prerequisites

- Node.js 22
- npm
- PostgreSQL or Neon
- Gracon database repository as a sibling checkout
- User Auth-compatible JWT and encryption secrets
- Foreign Identity Service for FIN issuance
- Admin Service-compatible review credentials
- Private S3 bucket and credentials

### 1. Clone the workspace

```bash
mkdir gracon
cd gracon

git clone https://github.com/kajugadaniels/gracon-database-service.git database
git clone https://github.com/kajugadaniels/gracon-signture-service.git signature
```

### 2. Prepare the shared database package

```bash
cd database
npm ci
npm run prisma:generate
npm run build
```

Apply migrations and seeds through the database repository.

### 3. Install the Signature Service

```bash
cd ../signature
npm ci
```

### 4. Configure environment

```bash
cp .env.example .env
```

Populate all required values.

### 5. Start development mode

```bash
npm run start:dev
```

Default locations:

```text
API:     http://localhost:3002/api/v1
Swagger: http://localhost:3002/api/docs
```

### Production build

```bash
npm run build
npm run start:prod
```

---

## API documentation

Swagger is mounted outside production at:

```text
/api/docs
```

It is disabled when `APP_ENV=production`.

The internal certificate-review controller is excluded from Swagger. Document its contract through an internal service catalog or generated private specification.

---

## Runtime protections

### Validation

The global validation pipe uses:

- `whitelist: true`;
- `forbidNonWhitelisted: true`;
- automatic transformation.

Unexpected DTO properties are rejected.

### CORS

Allowed origins are assembled from:

- `FRONTEND_URL`;
- optional `FRONTEND_URLS`.

No-origin requests are allowed for server-to-server and command-line clients. Browser origins must match exactly.

### Security headers

Helmet is enabled globally.

### Rate limits

| Profile | Limit |
|---|---:|
| General | 60 requests per minute |
| Authentication-sensitive | 5 requests per minute |
| Strict | 10 requests per 10 minutes |

Key generation, rotation, signing, and other sensitive operations may apply stricter named limits.

> [!NOTE]
> Nest throttling uses in-process storage by default. In a multi-replica deployment, enforce a shared rate-limit store or equivalent gateway policy.

---

## Testing and quality

### Commands

```bash
# Build / type-check
npm run build

# Unit/default tests
npm test

# Watch
npm run test:watch

# Coverage
npm run test:cov

# End-to-end
npm run test:e2e

# Lint and auto-fix
npm run lint
```

### CI pipeline

The GitHub Actions workflow:

1. checks out the service and configured database repository into sibling paths;
2. uses Node.js 22;
3. installs the database package;
4. generates Prisma;
5. builds the database package;
6. runs the `signature` consumer-boundary check;
7. runs the shared security-hardening baseline;
8. audits database dependencies at high severity;
9. installs and builds the Signature Service;
10. runs Jest serially;
11. audits service dependencies at high severity.

### Current test posture

The repository contains focused unit/integration tests around selected key, certificate, X.509, and signing behavior. The standalone e2e scaffold still expects Nest’s generated `GET /` “Hello World!” response and should be replaced with real prefixed service tests.

### High-value test scenarios

Prioritize:

- full vs. limited JWT behavior;
- inactive and unverified users;
- one-active-key behavior under concurrency;
- transactional key rotation;
- certificate request conflict races;
- NID and FIN certificate issuance;
- privacy-safe X.509 subject rules;
- RSA and Ed25519 end-to-end compatibility;
- certificate ban enforcement;
- expired and revoked certificate signing;
- historical verification after rotation;
- no-certificate verification logging;
- malformed Base64 signatures;
- history pagination bounds;
- missing upload file;
- oversized multipart upload before buffering;
- malicious SVG payloads;
- S3 success followed by database failure;
- internal review credential and replay tests.

---

## Deployment

The repository currently has no Dockerfile. Add a reviewed multi-stage image or use the hosting platform’s Node.js build system.

### Recommended topology

```mermaid
flowchart TB
    Users["Verified Gracon Users"]
    Docs["Documentify Service"]
    Admin["Admin Service"]
    Edge["WAF / TLS / API Gateway"]
    API1["Signature Service A"]
    API2["Signature Service B"]
    DB[("Managed PostgreSQL")]
    S3[("Private S3")]
    Foreign["Foreign Identity Service"]
    KMS["Future KMS / HSM"]

    Users --> Edge
    Docs --> Edge
    Admin --> Edge
    Edge --> API1
    Edge --> API2

    API1 --> DB
    API2 --> DB
    API1 --> S3
    API2 --> S3
    API1 --> Foreign
    API2 --> Foreign

    API1 -. "Future remote signing" .-> KMS
    API2 -. "Future remote signing" .-> KMS
```

### Deployment checklist

- [ ] Use Node.js 22.
- [ ] Build the sibling database package.
- [ ] Generate the shared Prisma client.
- [ ] Apply migrations from the database repository only.
- [ ] Use a least-privilege database role.
- [ ] Match JWT and identity-encryption secrets to their owners.
- [ ] Keep `SIGNATURE_ENCRYPTION_SECRET` independent.
- [ ] Store secrets in a managed secret store.
- [ ] Use a private S3 bucket.
- [ ] Prefer workload AWS credentials.
- [ ] Restrict internal review routes to private networking.
- [ ] Add mTLS or signed service authentication.
- [ ] Restrict CORS to exact production origins.
- [ ] Add dependency-aware health/readiness endpoints.
- [ ] Add structured logs and request correlation.
- [ ] Configure trusted-proxy handling.
- [ ] Add a distributed rate-limit store.
- [ ] Fix the critical verification and algorithm issues below.
- [ ] Define certificate and signing-proof retention.
- [ ] Complete a cryptographic design and privacy review.

---

## Operations

### Recommended metrics

Collect:

- request rate, latency, and errors by endpoint;
- key generation and rotation success/failure;
- active-key count anomalies;
- certificate request creation and review latency;
- approval/rejection counts;
- certificate expiry and revocation;
- certificate-access bans encountered;
- signing success/failure by algorithm;
- private-key decrypt failures;
- verification success/failure;
- verification-log write failures;
- signature-image upload size and failure;
- S3 latency and orphan counts;
- Foreign Identity latency, failures, and cache hit rate;
- database pool usage and query latency;
- throttled requests.

### Recommended alerts

Alert on:

- repeated key-generation or private-key decryption failure;
- rotation leaving no active key;
- unusual certificate approval volume;
- signing attempts by banned users;
- signatures generated with expired or mismatched state;
- verification failures caused by database logging;
- spike in public verification traffic;
- internal review authentication failures;
- Foreign Identity authentication failures;
- S3 upload/database consistency failures;
- oversized or suspicious SVG uploads;
- elevated `401`, `403`, `409`, `429`, or `5xx`;
- database connection exhaustion.

### Key and certificate recovery

Private signing keys are application-encrypted database values. A recovery plan must preserve:

- PostgreSQL data;
- `SIGNATURE_ENCRYPTION_SECRET` versions;
- encryption-format version;
- key-derivation behavior;
- certificate and request history;
- signed-document proofs.

Losing the encryption secret makes encrypted private keys unusable. Rotating the secret without a migration makes existing keys undecryptable.

Implement:

- secret versioning;
- audited re-encryption;
- backup restoration tests;
- a key-loss response procedure;
- forced key rotation when recovery is impossible.

### S3 recovery

Signature images are non-cryptographic assets but may be part of signed-document presentation. Back up or replicate them according to product policy, and reconcile database rows against S3 objects.

---

## Security model

### Implemented controls

- Full-session JWT validation
- Active and ID-verified user requirement
- Global default authentication
- Separate Basic Auth for internal review
- Timing-safe internal credential comparison
- Per-user derived private-key encryption
- Private key omitted from API responses
- One-active-key service checks
- Certificate request approval workflow
- Certificate access policy
- Expiry and revocation checks before signing
- Exact 64-character hexadecimal hash validation
- Persisted signing proofs
- Public verification attempt records
- Private S3 bucket usage
- S3 server-side encryption
- Temporary presigned image URLs
- Strict DTO validation
- Helmet
- Explicit CORS allowlist
- Global and strict throttling profiles
- Database consumer-boundary checks in CI

### Secret separation

| Secret | Purpose |
|---|---|
| `JWT_SECRET` | Verify user access tokens |
| `ENCRYPTION_SECRET` | Decrypt NID/FIN identity values |
| `SIGNATURE_ENCRYPTION_SECRET` | Encrypt personal private keys |
| `SIGNATURE_SERVICE_PASSWORD` | Authenticate Admin Service review calls |
| `FOREIGN_IDENTITY_SERVICE_PASSWORD` | Authenticate FIN profile lookup |
| AWS secret | Access private signature-image storage |
| Database password | Access the Signature Service’s permitted tables |

Do not reuse one value for unrelated boundaries.

### Data classification

Treat the following as highly sensitive:

- plaintext private keys;
- encrypted private keys;
- master encryption secrets;
- NID and FIN values;
- certificate subjects containing identifiers;
- signature images;
- signed document hashes and names;
- signature bytes;
- admin review credentials;
- verification IP addresses.

### Never log

- plaintext or encrypted private keys;
- JWTs;
- service Basic credentials;
- NID/FIN values;
- complete certificate request bodies when they contain sensitive data;
- raw AWS credentials;
- full presigned S3 URLs;
- uploaded SVG or image bodies;
- signature bytes unless explicitly required by a protected forensic workflow.

---

## Known implementation notes

These findings distinguish the current source from a production-complete PKI and signing system.

### 1. Ed25519 is exposed but not supported end-to-end

Key generation supports `ED25519`, and signing uses the correct `null` algorithm for an Ed25519 private key. However:

- X.509 generation uses `node-forge` RSA-oriented PEM parsing and SHA-256 certificate signing;
- public verification always calls `crypto.verify("SHA256", ...)`;
- the X.509 tests cover RSA.

**Recommended action:** temporarily allow only `RSA_2048`, or implement and test a complete Ed25519 certificate and verification profile.

### 2. No-certificate verification can fail while writing its audit row

When no certificate exists, the verifier sets:

```text
certificateId = "unknown"
```

The shared schema defines `certificateId` as a required foreign key to `PersonalCertificate`. A failed verification can therefore raise a database error instead of returning the intended `{ valid: false }`.

**Recommended action:** make the relationship optional for no-certificate attempts, introduce a separate nullable lookup field, or skip the foreign-key value while recording the failure safely.

### 3. Historical signatures are verified with the latest active certificate

Verification takes `userId`, not `certificateId` or `signatureId`, and loads the latest unrevoked certificate. After rotation or revocation, a valid historical signature may fail.

**Recommended action:** verify against the certificate recorded on `PersonalSignedDocument`, then report certificate status at signing time and current revocation status separately.

### 4. Certificates are self-signed

The user’s private key signs the certificate, and issuer equals subject. Admin approval is a database governance event, not a cryptographic issuer attestation.

**Recommended action:** establish a real issuing CA, protect the issuer key in HSM/KMS, publish certificate policies, and implement chain/revocation validation.

### 5. Identity numbers are embedded in certificates

The subject’s serial-number attribute contains plaintext NID or FIN. Certificates commonly travel with signatures, so this can disclose a durable government identifier.

**Recommended action:** use a pseudonymous platform identifier or consented policy-specific subject, with data-protection review.

### 6. User UUID is encoded as a DNS SAN

SAN type `2` denotes `dNSName`, but the value is a user UUID.

**Recommended action:** use a URI SAN such as a stable Gracon identity URI or an appropriate registered identifier.

### 7. Private-key ciphertext is not authenticated

AES-256-CBC provides confidentiality but no integrity/authenticity. Tampering is not detected before decryption.

**Recommended action:** migrate to AES-256-GCM or authenticated envelope encryption with a versioned ciphertext format.

### 8. Plaintext keys exist in Node.js process memory

The service sets the local variable to `null`, but JavaScript garbage collection does not guarantee immediate erasure or zeroization.

**Recommended action:** move signing and certificate operations to KMS/HSM or a remote signer that never releases private-key bytes.

### 9. Rotation is not transactional

Old keys are disabled, certificates revoked, and requests cancelled before the new key is generated. Failure can leave the user without an active key.

**Recommended action:** generate first, then perform a transactional state swap, or use an explicit rotation state machine and compensation.

### 10. Certificate-request auto-rotation is also multi-step

A new request may rotate a previously certified key before creating the request. A later failure can leave the user rotated without a pending request.

### 11. RSA signing uses a service-specific double-hash profile

The caller supplies a SHA-256 digest and Node’s RSA signing operation applies SHA-256 to those digest bytes again.

**Recommended action:** define and version the signing profile or move to a standard interoperable envelope.

### 12. Verification does not check `notBefore`

The current verifier checks `notAfter` but does not reject a certificate before its validity start.

### 13. Signing history pagination is not strongly validated

The controller accepts raw `page` and `limit` query parameters without a dedicated DTO, integer transformation, minimums, or maximum cap.

### 14. Signature-image upload is buffered before service-level size validation

The controller uses in-memory multipart handling without a Multer file-size limit. The service checks two megabytes only after the upload is already buffered.

**Recommended action:** enforce `limits.fileSize`, MIME filtering, magic-byte inspection, and missing-file validation in the interceptor.

### 15. SVG uploads require active-content controls

MIME validation alone does not sanitize scripts, external references, or malicious XML behavior.

**Recommended action:** sanitize SVG robustly, rasterize it, or accept PNG only.

### 16. Replaced and deleted image objects remain in S3

Database metadata is soft-deactivated, while prior objects are not removed. Storage can accumulate orphaned personal data.

### 17. S3 upload and database replacement are not atomic

An S3 success followed by a database failure can create an orphan. Database changes across old/new image rows also need transaction review.

### 18. Static AWS credentials are required

Startup validation requires an access-key ID and secret, preventing clean use of the default workload credential chain.

### 19. Internal review relies on static Basic Auth

The internal controller bypasses user JWT auth and trusts static credentials plus a caller-supplied `adminId`.

**Recommended action:** use private networking, mTLS or signed service identities, and derive administrator context from a trusted assertion.

### 20. Foreign identity data is cached per process

The cache is memory-local, contains sensitive profile data, and is not coherent across replicas.

### 21. FIN appears in the downstream URL path

Reverse proxies and tracing systems may record identifiers in URLs.

### 22. Public verify is user-centric rather than proof-centric

The verifier does not load the persisted signing record. It cannot confirm that the supplied signature is the platform-stored proof for the supplied document name or certificate.

### 23. Signing has no idempotency key

Retrying the same request creates another signing-proof record.

### 24. Document name and hash trust the caller

The service cannot prove that `documentName` corresponds to the bytes whose digest was supplied. Integrating services must provide canonicalization and binding.

### 25. No dedicated key/certificate audit stream

Lifecycle state is persisted, but there is no comprehensive append-only security-event model for key generation, rotation, image changes, certificate submission/review, and revocation.

### 26. Throttling is process-local

Limits multiply with replica count unless a shared store or gateway rule is used.

### 27. No dependency-aware health endpoint

The service has no liveness/readiness contract for PostgreSQL, S3, Foreign Identity, or cryptographic initialization.

### 28. Production Swagger is disabled

Publish a protected OpenAPI artifact if internal consumers need production contract discovery.

### 29. E2E scaffolding is stale

The current e2e test expects `GET /` to return `Hello World!`, which does not represent the actual prefixed API.

### 30. No repository Dockerfile

Production packaging is not reproducible from the repository alone.

---

## Production-hardening roadmap

### Priority 0 — correctness and cryptographic safety

- [ ] Restrict production key generation to a verified algorithm profile.
- [ ] Fix no-certificate verification logging.
- [ ] Make verification proof-centric and certificate-specific.
- [ ] Check both `notBefore` and `notAfter`.
- [ ] Make key rotation recoverable and transactional.
- [ ] Make auto-rotation/request creation recoverable.
- [ ] Define a standard, versioned signing profile.
- [ ] Add strict history pagination validation.
- [ ] Add multipart pre-buffer limits and missing-file checks.
- [ ] Remove or sanitize SVG support.

### Priority 1 — PKI and privacy

- [ ] Replace self-signed certificates with a platform issuing CA.
- [ ] Protect CA and user signing keys with HSM/KMS.
- [ ] Remove raw NID/FIN from certificate subjects.
- [ ] Replace the DNS SAN misuse.
- [ ] Define certificate policies and key usages.
- [ ] Implement chain validation.
- [ ] Implement revocation distribution and status checks.
- [ ] Define certificate renewal and archival behavior.
- [ ] Conduct formal privacy and cryptographic review.

### Priority 2 — resilience and service boundaries

- [ ] Replace Basic Auth with mTLS or signed service identity.
- [ ] Add idempotency to signing and review commands.
- [ ] Add durable audit events and outbox processing.
- [ ] Add S3/database reconciliation and orphan cleanup.
- [ ] Support workload AWS credentials.
- [ ] Add dependency timeouts, retries, and circuit breakers.
- [ ] Add shared rate limiting.
- [ ] Add health and readiness endpoints.
- [ ] Add graceful shutdown.

### Priority 3 — operational maturity

- [ ] Add a reviewed multi-stage Dockerfile.
- [ ] Add structured JSON logs and correlation IDs.
- [ ] Add OpenTelemetry traces and metrics.
- [ ] Add disposable-database integration tests.
- [ ] Add LocalStack/S3 contract tests.
- [ ] Add Foreign Identity and Admin Service contract tests.
- [ ] Add SAST, secret scanning, and dependency updates.
- [ ] Define retention and deletion policies.
- [ ] Perform threat modeling and penetration testing.

---

## Troubleshooting

### `Cannot find module '@gracon/database'`

Confirm sibling layout:

```text
gracon/
├── database/
└── signature/
```

Then rebuild:

```bash
cd ../database
npm ci
npm run prisma:generate
npm run build

cd ../signature
npm ci
```

### Protected route returns `401`

Check:

- bearer token syntax;
- token expiry;
- `JWT_SECRET`;
- account existence;
- active-account status.

### Protected route returns identity-verification `403`

The service requires:

```text
tokenType = full
isIdVerified = true
```

Complete identity verification and obtain a full-session token.

### “No active key pair found”

Generate a key:

```text
POST /api/v1/signature/keys/generate
```

Use `RSA_2048` for the currently complete workflow.

### Certificate request remains pending

An Admin Service reviewer must approve it through the internal endpoint. Check certificate status:

```text
GET /api/v1/signature/certificates/status
```

### FIN certificate approval fails

Verify:

- `ENCRYPTION_SECRET` compatibility;
- Foreign Identity URL;
- Basic credentials;
- the FIN record exists;
- country code is ISO alpha-2;
- outbound connectivity.

### Signing says certificate is unavailable

Inspect status for:

- no request;
- pending request;
- rejected request;
- cancelled request;
- approved request without active certificate;
- expired certificate;
- revoked certificate;
- certificate-access ban.

### Public verify returns `500` for a user without a certificate

This can be caused by the verification-attempt row using `"unknown"` for a required certificate foreign key. Apply the schema/service fix documented above.

### Historical signature fails after rotation

The current verifier selects the latest unrevoked certificate. Use the original proof’s certificate for durable verification.

### Ed25519 certificate issuance or verification fails

The complete certificate and verifier path is currently RSA-oriented. Restrict to `RSA_2048` until Ed25519 is fully implemented.

### Image upload fails

Check:

- multipart field name is `file`;
- MIME is `image/png` or `image/svg+xml`;
- file is no larger than two megabytes;
- S3 credentials and bucket;
- object-policy permissions.

### S3 contains inactive images

The current soft-delete/replacement workflow does not remove old objects. Run a reviewed reconciliation/cleanup process rather than deleting objects blindly.

### CORS rejects the frontend

Add the exact origin, including protocol and port, to `FRONTEND_URL` or `FRONTEND_URLS`. Do not include a path.

### Swagger is missing in production

Swagger is intentionally disabled when `APP_ENV=production`.

---

## Contributing

1. Create a focused branch.
2. Keep schema and migration changes in the database repository.
3. Preserve the user-auth, Admin Service, Foreign Identity, and S3 boundaries.
4. Do not expose private-key material.
5. Add strict DTO and cryptographic format validation.
6. Add security-event coverage for sensitive lifecycle changes.
7. Add failure and concurrency tests.
8. Run:

```bash
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e
npm audit --audit-level=high
```

9. Update Swagger and this README when contracts change.
10. Document cryptographic, privacy, database, storage, rollout, and rollback impact.

### Pull-request checklist

- [ ] Full-session and ID-verification boundary preserved
- [ ] Private key never returned or logged
- [ ] Algorithm behavior tested end-to-end
- [ ] Certificate lifecycle transition is valid
- [ ] Certificate subject contains approved data only
- [ ] Signing proof is bound to the correct certificate
- [ ] Verification uses the intended historical certificate
- [ ] Internal service identity is authenticated
- [ ] S3 failure and orphan behavior is covered
- [ ] Shared database package is used
- [ ] No service-local migration is added
- [ ] Documentation is current

---

## License

`package.json` marks the project as:

```text
UNLICENSED
```

The package is also private. No open-source license grant is provided by this README. Obtain explicit authorization from the project owner before copying, redistributing, or using the software outside its intended environment.

---

<div align="center">

Built as part of the **Gracon** identity and digital-trust platform.

</div>
