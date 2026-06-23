# api/signature Security Rules

## Private-Key Rules

- Decrypted private keys never leave the server.
- Never log private keys, encrypted key blobs, derivation secrets, or signing payload secrets.
- `SIGNATURE_ENCRYPTION_SECRET` must remain server-only.
- Do not add new consumers of `SIGNATURE_ENCRYPTION_SECRET`; services that need
  signing proof should use an audited internal signing boundary instead.

## Certificate Rules

- Pending certificate requests are not usable for signing.
- User-level certificate access bans must block new requests and signing.
- Revocation and bans are separate concepts.

## Asset Rules

- Signature images are decorative and not cryptographic proof.
- Signature images belong in private S3 storage with controlled access.

## Signing Rules

- Signing must require valid user identity, active certificate, and allowed certificate policy.
- Signing proof must preserve verification evidence without exposing private material.

## Environment Rules

- Use only runtime `DATABASE_URL` credentials here; `DATABASE_MIGRATION_URL` belongs only in `api/database`.
