# Saraswathi Puja

Rittapadu public-page implementation and foundation for the approved Saraswathi Puja V1 documents. React and Next.js
App Router form one TypeScript application with Node.js server modules and CSS
Modules. MongoDB Atlas stores content and binary photos. There is no separate Express
application.

## Start locally

Node.js 22 and npm are required. Dependencies are pinned in `package.json` and
`package-lock.json`.

```powershell
npm ci
npm run dev
```

Open <http://localhost:3000>. The current screen implements the approved Rittapadu public-page design with bilingual navigation and pending content. It does
not publish sample events, contribution amounts, administrator operations or photos.

## Database configuration

Copy `.env.example` to `.env.local` if it is absent. Add your database-scoped Atlas
connection string locally. Do not paste credentials into chat or commit the file.
The starter page and production build work without a live database connection.

| Environment             | APP_ENV     | MONGODB_DB           |
| ----------------------- | ----------- | -------------------- |
| Local development       | development | saraswathi_puja_test |
| Tests or Vercel preview | test        | saraswathi_puja_test |
| Vercel production       | production  | saraswathi_puja      |

Set `APP_ORIGIN` to the exact website origin, without a path. Production requires
HTTPS. Preview deployments cannot select the production environment. Configure
separate database-scoped Atlas users for test and production.

After supplying your connection details and Atlas network permissions, run:

```powershell
npm run db:check
```

This pings the selected database without creating collections or changing records.
The server connection helper reuses a pool of at most five connections per warm
process and validates the selected database before connecting.

Administrator provisioning, collection creation, indexes and business APIs belong
to implementation. Do not put an administrator password in `.env.local` or React
code; the approved design stores a salted scrypt hash in a private database record.

## Development commands

| Command              | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Local Next.js server                        |
| `npm run check`      | Formatting, lint, TypeScript and unit tests |
| `npm run build`      | Production build                            |
| `npm start`          | Run the production build                    |
| `npm run format`     | Format source and configuration             |
| `npm run test:watch` | Unit tests in watch mode                    |
| `npm run test:e2e`   | Browser tests, once feature tests are added |
| `npm run db:check`   | Read-only Atlas connectivity check          |

Vitest runs the database-isolation configuration checks without calling Atlas.
Playwright is configured for desktop and mobile Chromium against a production
build on port 3100. Before running future browser tests, run `npm run build`.
Public interaction browser tests are in tests/e2e/public-page.spec.ts. See PROJECT_STATUS.md and docs/PUBLIC_PAGE_IMPLEMENTATION.md for the implementation scope. On a new computer,
install the browser with `npx playwright install chromium`.

## Folder responsibilities

```text
src/app/                 Next.js page, layout and future same-origin API routes
src/components/sections/ Public page section components
src/components/editing/  Shared section-level Edit, Save and Cancel controls
src/config/              Environment rules and approved shared limits
src/server/auth/         Future account, session and CSRF services
src/server/db/           Server-only MongoDB connection
src/server/domain/       Future contribution and publication rules
src/server/repositories/ Future typed database access
src/server/media/        Future validated upload and image delivery
src/lib/i18n/            Future English and Telugu labels
scripts/                 Operational checks
tests/unit/              Isolated unit tests
tests/e2e/               Future browser integration tests
public/                  Static assets only; not administrator uploads
```

Runtime dependencies include the official MongoDB driver, Zod validation, Sharp
for server image decoding and thumbnails, and `heic-to` for dynamically loaded
browser conversion. Use Node's built-in `crypto.scrypt` for password hashing; no
separate hashing service is required. Load HEIC conversion only in browser code,
using the package's CSP-compatible entry where needed.

## Design authority

The four approved Word documents are in the `docs/` folder:

1. Product requirement document.
2. Product design architecture V1.
3. Database design V1.
4. API design V1.

Follow the latest confirmed rules: one Edit, Save and Cancel per entire section;
store only the household's current cumulative amount; newest photos first;
three-hour absolute sessions; 5 MB original selection and at most 3 MB uploaded
main images. API routes must not be added as unprotected placeholder mutations.

## Vercel

Import this repository as a Next.js project, use Node.js 22 and configure the
environment variables separately for Preview and Production. Standard Next.js
build settings are sufficient. No Vercel project has been created or deployed by
this scaffold. Keep backups outside this repository. The production database still needs your actual Atlas account configuration.

## Dependency audit

The current Next.js lint configuration depends indirectly on `braces` 3.0.3.
Its unpatched stack-exhaustion advisory is reported as five linked development
dependency entries by npm. Production dependencies have no reported vulnerabilities
at scaffold verification. Do not use `npm audit fix --force`, which currently
suggests downgrading the Next.js lint configuration to an incompatible older major.
Recheck for an upstream fix during dependency updates.

ESLint is pinned to 9.39.5 because the React, accessibility and import plugins in
the current Next.js configuration declare compatibility through ESLint 9. ESLint
marks that major deprecated; upgrading it independently to 10 creates invalid
peer dependencies. Upgrade the complete lint toolchain together when supported.

Reference: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
