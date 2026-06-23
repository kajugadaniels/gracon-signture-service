# api/signature Database and Prisma Rules

`api/signature` uses a shared schema and does not own migrations.

## Rules

- Do not run migrations here.
- Shared schema changes start in `api/database`.
- Regenerate the shared Prisma client in `api/database` after shared schema changes.
- Use `select` for response queries.
- Preserve one-active-certificate assumptions unless the full platform changes.
- Keep certificate request statuses and access policy statuses aligned with `api/admin`.
