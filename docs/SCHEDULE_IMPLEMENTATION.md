# Organiser-editable schedule implementation

## Scope

Programme details, Daily puja and Prasadam now load published data from MongoDB.
Signed-in organisers can edit each section independently across 16, 17 and
18 October 2026. The public design, date tabs and bilingual presentation remain.
Each section has one Edit, Save and Cancel; Save publishes all three dates of that
section together. There is no public registration or automatic sample seeding.

Entries contain bilingual English/Telugu names, an optional time or explicitly
unconfirmed timing, and optional paired English/Telugu notes. Programme notes are
event details, puja notes are instructions, and prasadam notes are distribution
information. Names are required in both languages; optional notes must be supplied
in both languages when present. Names allow 200 Unicode code points and notes 2000.
Each date allows at most 100 entries. Entries can be added, removed and reordered.
Published entries sort by confirmed time, then untimed entries in saved order.
Times are festival-local Asia/Kolkata wall times.

## Persistence amendment

The original separate programme and puja/prasadam document layout is replaced for
this implementation by one private content_sections document, _id schedule,
schemaVersion 1. It holds three independently revisioned section datasets, update
timestamps, a global compare-and-swap revision and bounded retry receipts. This
keeps a programme change and validation of linked puja references atomic without
requiring a multi-document transaction. Other content_sections documents are not
modified. There is no migration of existing schedule records from another schema.

A puja can reference a published programme event on the same date. Its name and
time resolve from that event and are not duplicated in storage. Independent puja
entries keep their own bilingual name and timing. Programme events with saved
puja links cannot be removed until those links are removed. Both client controls
and the server enforce this rule, including concurrent edits.

The server checks the section revision, validates the complete merged schedule,
and replaces the aggregate only if its global revision still matches. Concurrent
changes to different sections preserve each other; stale changes to the same
section return a conflict. Saves require majority acknowledgement. An ambiguous
write failure is reported as a failure, with the draft retained for retry. A UUID
operation identifier plus request digest makes exact retries idempotent while
rejecting a reused identifier with changed content. Receipts are limited to 64
recent operations and pruned after 24 hours on subsequent saves. Receipts do not
store prior content versions. Unchanged content does not advance its section's
revision or published timestamp.

## API and authentication

GET /api/schedule returns only published data, section revisions and update times.
It uses no-store responses. Missing data returns empty pending sections without a
database insert; unavailable data shows a loading/error state rather than silently
pretending it is an empty confirmed schedule. Public data refreshes on focus and
every 60 seconds. Per-section monotonic revision merging prevents a delayed Save
response from replacing a newer public snapshot.

PUT /api/schedule requires the configured same origin, matching CSRF cookie/header,
and an enabled organiser with an unexpired three-hour session before accessing
the schedule store. Strict Zod validation rejects unsupported dates, malformed or
duplicate IDs, invalid times, incomplete bilingual fields and invalid links.
Request bodies and the combined stored BSON document are capped at 2,000,000 bytes.
Failures do not reveal credentials or database details. Reads do not expose retry
receipts or private account/session records.

## Draft lifecycle and responsive UI

Drafts stay in component memory across date and language changes and session
expiry. Reauthentication returns to the existing draft without automatically
saving it. Network errors retain the draft and operation identifier for unchanged
retries. A conflict displays the latest published three-date content; the organiser
must explicitly discard or retain the draft after reviewing that content. Retaining
a draft updates its base revision but still requires a subsequent explicit Save.

Cancel confirms before discarding dirty drafts. Sign-out confirms before discarding
unsaved drafts and does not discard them if logout fails. Sign-out is blocked while
a Save is in progress. Browser unload warns when drafts or saves are pending.
Drafts do not survive an accepted reload or closed tab and are not stored locally.

Mobile forms stack fields, provide touch-sized controls, keep the timing checkbox
on its own row and expand the Puja/Prasadam grid while editing. The mobile Devi
frame now hugs the complete portrait with approximately 16px on each side including
the border, a shallower arch and wrapping caption. Image height remains capped at
320px/45svh; desktop image rules are unchanged. The supplied photo is not cropped.

## Verification and acceptance

Unit tests use in-memory stores and browser tests intercept schedule/auth requests.
They do not seed events or create sessions in the shared Atlas database. Coverage
includes validation, all-date saves, CSRF/expiry denial before writes, retry replay,
conflicts, concurrent sections, linked-event races, failed writes, draft retention,
reauthentication, sign-out, English/Telugu layout and mobile portrait dimensions.

Manual acceptance on the running local application:

1. Sign in privately using the account created through organizer:setup.
2. Open Programme and Edit the programme section. Enter real English/Telugu
   details for a date; switch dates and back to confirm draft retention.
3. Save and refresh another public browser to confirm published content.
4. Edit Daily puja, optionally linking a saved programme event; save separately.
5. Edit Prasadam with its name, distribution timing and optional details; save.
6. Repeat from the organiser's mobile device and review both languages.

Local and production share saraswathi_puja by the user's choice, so manual saves
publish real shared data. Real-device acceptance and the real credential sign-in
remain user checks. Password reset, Chandas management, gallery uploads and the
remaining content editors are subsequent increments. No commit, push or deployment
is included in this implementation step.
