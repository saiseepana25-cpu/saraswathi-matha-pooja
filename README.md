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

| Environment             | APP_ENV     | MONGODB_DB      |
| ----------------------- | ----------- | --------------- |
| Local development       | development | saraswathi_puja |
| Tests or Vercel preview | test        | saraswathi_puja |
| Vercel production       | production  | saraswathi_puja |

Set `APP_ORIGIN` to the exact website origin, without a path. Production requires
HTTPS. Preview deployments cannot select the production environment. Configure
a database-scoped Atlas user. Local development and deployed environments share the same database by user choice; saved local changes affect shared data. Automated tests must not write to Atlas.

After supplying your connection details and Atlas network permissions, run:

```powershell
npm run db:check
```

This pings the selected database without creating collections or changing records.
The server connection helper reuses a pool of at most five connections per warm
process and validates the selected database before connecting.

Collection creation, indexes and business APIs belong
to implementation. Do not put an administrator password in `.env.local` or React
code; the approved design stores a salted scrypt hash in a private database record.

## Organiser account setup

Run this once in an interactive VS Code, PowerShell or Command Prompt terminal
from the application folder:

```powershell
npm run organizer:setup
```

The command loads the private .env.local database configuration, checks for an
existing organiser, then asks for a username, password and password confirmation.
Use a username of 3–32 ASCII letters, numbers, dots, underscores or hyphens,
starting with a letter or number. Usernames are trimmed and lowercased.
Passwords must contain 8–15 characters and are not trimmed. Special characters such as @, #, ! and % are accepted directly; do not URL-encode the organiser password. Password typing
is completely hidden; no stars appear. Use a unique password different from
the Atlas/database password and store it privately. Ctrl+C cancels.

Credentials cannot be supplied through command arguments or piped input.
Do not put the organiser password in environment files or chat.
The script writes only the organisers collection: singleton _id primary,
schemaVersion 1, usernameNormalized, enabled, server timestamps, and a salted
scrypt password object. Parameters follow the design: N=131072, r=8, p=1,
16 random salt bytes, 64 derived bytes and 256 MiB maximum memory.
No readable password is stored or logged. Password verification uses a
constant-time byte comparison.

Existing accounts, including disabled accounts, are never overwritten or
supplemented. Concurrent first runs compete for the same unique MongoDB _id;
only one can succeed. Setup is a private local operation, not a website route
or deployment/startup task. There is no public registration.

The user-selected organisers collection and username login supersede the
original document's admin_accounts collection and email login. The existing
Atlas database user puja_app remains separate from this website account.

After setup, use the website organiser sign-in. Programme, Daily Puja and Prasadam editors are available after sign-in. A deliberate password-reset procedure remains pending.
Do not delete the account or repeatedly run setup to reset its password.
If an interrupted write has an uncertain outcome, rerun setup: an existing
account will be detected without changing it.

Use `npm run organizer:setup -- --help` for usage without opening a connection.
Unit tests use in-memory fakes and disposable credentials, never the shared Atlas database.

## Organiser login

The header and mobile More menu open the reviewed bilingual sign-in dialog.
Use the username/password created by organizer:setup, not Atlas credentials.
Sign-in verifies the account's scrypt hash and issues independent random session
and CSRF tokens. Only SHA-256 token digests are stored in admin_sessions.
Production uses Secure, SameSite=Strict, host-only cookies; only the session
cookie is HttpOnly. Local HTTP development uses unprefixed cookie names.

Sessions expire exactly three hours after sign-in and are never extended by
activity. Every protected operation must call requireOrganiser and validate
same-origin plus CSRF for writes. Session reads also check the account is enabled.
TTL indexes remove expired sessions and login-attempt buckets eventually; expiry
checks are enforced by the server even before cleanup. Signing out deletes only
the current browser session. Reauthentication rotates the current session and
returns to the same page without saving content.

Login is limited to five attempts per client IP per 15-minute bucket and ten
attempts globally per minute. Attempts count even if successful, to bound work.
On Vercel the platform forwarded IP is used; local development shares one bucket.
Requests are capped at 4096 bytes. Credential errors do not distinguish accounts.
Password/session/hash values are never logged or returned as public account data.

APP_ORIGIN must exactly match the browser origin, including development port.
Local use: http://localhost:3000. Production requires APP_ENV=production,
APP_ORIGIN=https://saraswathi-matha-pooja.vercel.app and the existing shared
MongoDB connection in Vercel's Production environment. Redeploy after configuration.
Do not expose database settings through NEXT_PUBLIC variables.

The user confirmed account creation in their terminal. Real sign-in is a private
manual acceptance check. Automated tests use mocked authentication and in-memory
stores rather than inserting accounts or sessions into the shared Atlas database.
The three schedule editors and draft-aware sign-out confirmation are implemented.
Password reset remains pending. Visitors see only published content.

## Organiser schedule editors

After signing in, open Programme and choose Edit for Programme details, Daily puja
or Prasadam. Each editor includes all three dates (16–18 October 2026), bilingual
names and optional bilingual instructions/details, confirmed or unconfirmed timing,
and add/remove/reorder controls. Each section has its own Save and Cancel.
Changing dates preserves the in-memory draft; Save publishes that section's three
dates together. Visitors see the published content without editing controls.

Puja can link to a saved programme event for the same day and inherit its name and
time. Unlink or remove linked puja entries before removing their programme event.
An expired session retains drafts for reauthentication. Signing in never publishes
a draft automatically. Sign-out and Cancel ask before discarding unsaved changes.
Network errors retain drafts for Retry Save; concurrent changes require explicit
review of the latest published content before proceeding.

The server stores the schedule in content_sections, _id schedule. A combined
schedule document with independent section revisions replaces the original separate
programme/puja document layout so linked-event validation and updates are atomic.
Only a successful authenticated Save changes shared schedule data; public reads do
not create records or seed sample content. See docs/SCHEDULE_IMPLEMENTATION.md for
storage, validation, conflict handling and manual acceptance checks.

## Chandas household contributions

Chandas now reads saved household names/contributions from MongoDB. Visitors can
search both English/Telugu names, sort by original order or name and filter by
Pending, rupee ranges or Vigraham. Lists render 30 results per page. One public
Total amount collected card sums all saved Chandas Money amounts, excluding Pending,
Vigraham and separate donations. Filters and unsaved edits do not alter the total.

After organiser sign-in, Edit Chandas provides one draft across all pages. Edit
both names, record a positive whole-rupee cumulative amount, select Vigraham or
Pending, add/insert households and confirm removal. New households start Pending.
A position preview explains how subsequent serial numbers shift; stable UUIDs keep
contributions attached to the correct household. One Save publishes the full list;
Cancel restores it. Drafts survive browsing and reauthentication, with explicit
retry/conflict review. No example households are seeded into the shared database.
See docs/CHANDAS_IMPLEMENTATION.md for rules, persistence and acceptance checks.

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

Vitest runs the database-environment configuration checks without calling Atlas.
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

## Celebration gallery

The organiser can add/remove up to 60 photos with one Save/Cancel. Visitors see 12 photos at a time and can enlarge them. JPEG, PNG and WebP originals up to 7 MB are supported; larger-than-3 MB images are optimised before upload. Main/preview bytes persist privately in MongoDB until gallery publication. See docs/GALLERY_IMPLEMENTATION.md for the routes, recovery rules, storage budgets and private gallery:cleanup command. No sample photos are seeded.
