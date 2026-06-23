# api/signature Database and Prisma Rules

`api/signature` uses a shared schema and does not own migrations.

## Rules

- Do not run migrations here.
- Shared schema changes start in `api/database`.
- Run Prisma generate here after schema mirror updates.
- Use `select` for response queries.
- Preserve one-active-certificate assumptions unless the full platform changes.
- Keep certificate request statuses and access policy statuses aligned with `api/admin`.
