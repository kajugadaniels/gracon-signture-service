# api/signature API Contract Rules

- Every controller must use `@ApiTags`.
- Every endpoint must use `@ApiOperation`.
- Every endpoint must document success and important failure cases with `@ApiResponse`.
- Every DTO property must have Swagger metadata and validation decorators.
- Protected endpoints must validate auth-issued user JWTs.
- Internal admin review endpoints must use the internal Basic Auth bridge, not user JWTs.
- Do not expose private keys, encrypted fields, S3 keys, or internal review credentials.
