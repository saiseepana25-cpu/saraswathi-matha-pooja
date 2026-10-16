# Chandas implementation

## Approved product rules

Chandas is a bilingual public household list with organiser-only whole-section
editing. It renders 30 matching households per page; 130 records form pages of
30, 30, 30, 30 and 10. Search checks both name spellings across the full list.
Original order is the default; name ascending/descending sorting uses the selected
language. Search, sort and contribution filter compose and return to page 1.
Browsing never changes a household's original-order serial number.

Each household has a stable UUID, English/Telugu name fields with at least one nonblank name and
exactly one contribution: Pending, Money or Vigraham. Money uses positive whole
rupees; no paise, zero or negatives. Vigraham has no monetary value and replaces the
amount. Corrections replace the current cumulative amount. Pending means only that
the contribution has not yet been recorded on the website.

Filters: All, Pending, 50–99, 100–199, 200–299, 300–399, 400–499, 500–999,
1,000–1,999, 2,000+ and Vigraham. Values remain exact: 101, 501 and 1,100 are neither
rounded nor replaced by bucket labels. Any positive amount below 50 remains visible
in All; there is no invented minimum contribution. A public, read-only total now
adds the exact saved Money amounts across all households. Pending, Vigraham and
separate QR/cash donations are excluded. Search, sorting, filters and pagination
do not change the total. Draft changes, Cancel and failed saves do not change it;
a successful Save publishes the new total with the saved list. There is no manual
or projected draft total. Loading and unavailable states never fabricate zero.
Whole-rupee summation uses BigInt so the 1,000-household maximum cannot lose precision.
The total is derived from the complete published snapshot; no aggregate field or
database migration is needed. This supersedes the previous no-total product rule.

## Ordered editing and drafts

Sign in with the existing organiser account, then select Edit Chandas. The whole
list becomes one in-memory draft with one Save and Cancel. Both names and the
contribution can be edited inline; mobile fields stack. Names wrap completely and
non-money badges move below the names on narrow screens.

Add / Insert household starts with blank names, Pending and At the end selected.
An organiser can choose an original-list position and review the displaced
household. Inserting at position 2 shifts existing position 2 to 3 without changing
its UUID or contribution. Adding returns the view to original order and the inserted
household's page. A newly added household can also receive an explicitly selected
Money or Vigraham contribution before being staged. Amount fields start blank.

Duplicate normalized names produce warnings, not a unique-name restriction. Stable
IDs distinguish separate families. Remove and contribution-type changes require
confirmation. Cancel confirms before restoring the saved baseline, including
inserted/removed records and order.

Drafts survive pages, browsing controls, language changes and session expiry. While
typing, filter/sort membership is held stable; Apply filters to current draft or an
explicit browse change refreshes membership/order. This prevents an edited amount
or name from making its row disappear mid-entry. Show changed households lists
modified/new rows; the unsaved count also includes removed records.

The existing authentication draft guard handles sign-out confirmation, blocks
sign-out during Save, and warns on unload. Drafts are in memory, not localStorage.
Accepted reload/tab closure discards them. Reauthentication never auto-saves.
Conflicts display the latest full list. The organiser must explicitly discard the
draft or retain their entire draft after reviewing the overwrite consequences;
a subsequent explicit Save is still required. There is no silent merge.

## Database and API

The implementation follows the approved aggregate boundary: chandas collection,
fixed _id current. Only an authenticated Save creates or replaces that record.
GET /api/chandas returns public households, revision and updatedAt with private,
no-store response headers. No private receipt, account or session fields are exposed.
Missing content returns an empty snapshot without a write or sample seeding.
Failed reads show an error/retry state. Public reads refresh on focus/every minute.
Older responses cannot replace a newer published revision.

PUT /api/chandas validates Origin, CSRF and an enabled unexpired organiser session
before processing content. Strict Zod validation requires unique UUIDs, at least one nonblank English or Telugu name, with each name limited to
120 Unicode code points, mutually exclusive contribution shapes, safe positive
integer amounts and at most 1,000 households. Request bodies and stored aggregate
BSON are capped at 2,000,000 bytes. Majority acknowledgement is required.

The whole ordered list is saved with an expected content revision. An internal
writeVersion serializes all writes, including no-op retry-receipt updates.
Actual changes advance revision/update time; no-op saves do not. A stable operation
UUID and normalized request hash permit exact retries and reject changed-payload
reuse. Up to 64 technical receipts are retained, pruned after 24 hours on writes;
they contain no prior household values. Ambiguous write failures never claim success.

The user's final rules amend the V1 documents: contributions now include Vigraham,
amounts are whole rupees stored as amountRupees, and totalPaise/aggregate monetary
totals are omitted. Pending/Vigraham have no amount field. There is no migration
from a legacy paise-based Chandas document in this increment. Other collections and
saved sections are untouched. No public row-level mutation endpoints are added.

## Acceptance and remaining content

Automated tests use mocked API routes and in-memory stores; they must never insert
fictional households, contributions or sessions into the shared Atlas database.
The 130-household fixture is test-only. The live list remains honestly empty until
real reviewed household names are supplied or entered by the organiser.

Manual acceptance:

1. Sign in, open Chandas and select Edit Chandas.
2. Add real household names in English, Telugu or both, initially Pending, then Save.
3. Enter a verified amount or Vigraham; confirm and Save.
4. Verify public search, filters, sorting, numbering and last-updated information.
5. Insert a real missing household in the middle and verify the following UUID-bound
   records retain their contributions.
6. Test on the organiser's phone in both languages and review desktop layout.

Local and deployed environments use the same user-selected saraswathi_puja database,
so real local Saves affect shared data. No automatic initial-list import is included.
No commit, push or deployment occurs until the user completes their review workflow.

V1 name update: either language is sufficient; both blank is rejected. Display and name sorting fall back to the available name. Search checks both fields. No automatic translation or data migration is performed.
