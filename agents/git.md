# api/signature Git Rules

Codex must never run git commands automatically.

Use paths relative to `api/signature`.

```bash
git add "src/modules/signing/signing.service.ts"
git commit -m "feat(signature): enforce certificate access policy"
```

Rules:

- One file per `git add`.
- Never use `git add .` or `git add -A`.
- Never include `cd api/signature`.
- Never run `git push`.
- Use Conventional Commits.
