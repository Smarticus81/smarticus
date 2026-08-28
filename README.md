# Atticus Tutor

A private, voice-first tutoring application built with React, Express, PostgreSQL/Prisma, and the OpenAI Realtime API.

## Local development

Requirements: Node.js 22 or newer and PostgreSQL.

```bash
cp .env.example .env
npm ci
npm run db:setup
npm run dev
```

The browser app runs at `http://localhost:5173`; Vite proxies API requests to port 3000. Set `OPENAI_API_KEY` to enable live voice sessions. Local development bypasses the access-password screen when `APP_ACCESS_PASSWORD` is empty. `db:setup` creates the configured database when needed, applies the checked-in migrations, and seeds the curriculum; it also works on Windows ARM64 where Prisma's native schema engine is unavailable.

Before committing, run the same verification used by CI:

```bash
npm run check
npm audit --omit=dev --audit-level=high
```

## Production deployment

Set all values in `.env.example` through the deployment platform's secret manager. Production startup intentionally fails unless these are safe and explicit:

- `OPENAI_API_KEY`
- `DATABASE_URL` using non-default credentials
- `SESSION_SECRET`, unique and at least 32 characters
- `APP_ACCESS_PASSWORD`, unique and at least 12 characters

Run `npm run db:migrate` as a release step before starting the new version. Then run `npm start`. The application stores authenticated sessions in PostgreSQL, so restarts and multiple application instances share session state.

Serve the application behind HTTPS. Set `TRUST_PROXY=true` only when the server is behind a trusted reverse proxy that overwrites forwarded headers. Secure session cookies will not work over plain HTTP in production.

- `GET /health` is a liveness check and does not touch dependencies.
- `GET /ready` checks PostgreSQL and returns 503 when it is unavailable.
- SIGTERM and SIGINT trigger graceful HTTP and database shutdown.

Build the production container with:

```bash
docker build -t atticus-tutor .
docker run --rm -p 3000:3000 --env-file .env atticus-tutor
```

Apply migrations from CI/CD (with the full development dependencies installed) before rolling out that image. Back up PostgreSQL and treat transcripts, student records, and logs as sensitive educational data. Keep `/health` and `/ready` reachable by the platform, but do not expose the service itself without TLS.
