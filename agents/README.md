# api/signature Agent Guide

This directory contains project-local execution rules for AI agents working in `api/signature`.

## Reading Order

1. Read `../../AGENTS.md`.
2. Read `../README.md`.
3. Read this file.
4. Read the topic file that matches the task.
5. Inspect the source code before editing.

## Topic Files

- [folder-structure.md](./folder-structure.md) — where signature modules, DTOs, helpers, and tests belong.
- [file-structure.md](./file-structure.md) — naming, comments, TypeScript style, and exported API rules.
- [security.md](./security.md) — private keys, certificates, signatures, and S3 asset rules.
- [api-contracts.md](./api-contracts.md) — controller, DTO, Swagger, validation, and response rules.
- [database-prisma.md](./database-prisma.md) — shared-schema and Prisma generation rules.
- [signature-pki.md](./signature-pki.md) — key pair, certificate, request, sanction, and signing workflow rules.
- [testing.md](./testing.md) — test expectations and validation commands.
- [git.md](./git.md) — copy-paste commit command format for this project.
- [documentation.md](./documentation.md) — README, `.env.example`, Swagger, and root-guide update rules.

## Scope

These rules apply only inside `api/signature`. Admin certificate review also involves `api/admin`; stamping compatibility also involves `api/stamp`.

## Conflict Rule

If a local rule conflicts with `../../AGENTS.md`, the root guide wins.
