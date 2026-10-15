# Rittapadu Saraswathi Puja project status

Last updated: 15 October 2026.

## Current milestone

Public page implementation from the approved Stitch design. Application path:
`C:\Users\HP\OneDrive\Desktop\saraswathi devi pooja\saraswathi-matha-pooja`.

Workflow for each increment: design, design review, implementation, user code review,
testing and fixes, status update, commit and push, deployment and deployment verification.

The public page uses explicit local pending content for this first increment. It does
not read or write MongoDB or represent the contribution list as an empty database result.
Real content and protected publishing will be connected in later increments.

## Milestones

| Increment                                | Design   | Implementation | Review              | Verification                             | Deployment   |
| ---------------------------------------- | -------- | -------------- | ------------------- | ---------------------------------------- | ------------ |
| Public page and pending content          | Approved | Complete       | User review pending | Passed: build, 8 unit + 12 browser tests | Not deployed |
| Organiser sign-in and sessions           | Pending  | Not started    | Not started         | Not started                              | Not deployed |
| Shared inline section editing            | Pending  | Not started    | Not started         | Not started                              | Not deployed |
| Chandas management and persistence       | Pending  | Not started    | Not started         | Not started                              | Not deployed |
| Remaining content management             | Pending  | Not started    | Not started         | Not started                              | Not deployed |
| Image processing and gallery publication | Pending  | Not started    | Not started         | Not started                              | Not deployed |

## Public page scope

- Responsive ivory, burgundy and gold design, prominent Rittapadu identity and arched Devi placeholder.
- English and Telugu copy, accessible language controls and optional browser language preference.
- Same-page navigation and mobile More navigation.
- Annadanam announcement with Pause/Resume and reduced-motion handling.
- Three programme dates (16–18 October 2026; main programme 16 October) and synchronized puja/prasadam date labels.
- Truthful household, total, timestamp, payment, committee, venue and gallery pending states.
- Household search input retains its text across language changes; actual filtering awaits real records.
- Organiser entry explains that authentication is pending; it does not collect credentials or grant access.
- Local font packages; visitors do not request fonts from Google.

## Design reference

Stitch project: `11542657923323938000`.

- Desktop: `d35935a07c824c61a776c99ee3b7d75e`.
- Mobile English: `28fd5980d1314f28a7550dca1a45c0e7`.
- Mobile Telugu: `1bf75da5f08348eca78949ed841dc146`.

Preserve the approved visual direction while using plain pending copy rather than
unconfirmed ritual details, locations, photographs, household records or amounts.
The village name stays Rittapadu in both languages until its Telugu spelling is reviewed.

## Confirmed date correction

The organiser confirmed a three-day celebration: 16–18 October 2026. The main programme remains on 16 October. This decision supersedes the five-day duration in the original V1 documents and Stitch references. The original Word files have not been rewritten.

## Verification record

The 16–18 October date correction was reverified: formatting, lint, TypeScript, production build, all 8 unit tests and all 12 desktop/mobile browser checks passed. The running preview shows exactly three programme dates and the corrected footer and metadata.

Completed on 15 October 2026:

- `npm run check`: formatting, ESLint, TypeScript and all 8 existing unit tests passed.
- `npm run build`: optimized production build passed; the public route prerenders successfully.
- `npm run test:e2e`: all 12 checks passed across desktop and mobile Chromium.
- Browser checks covered pending states, language preference, date/search preservation,
  keyboard date selection, synchronized puja/prasadam dates, announcement pause/resume,
  reduced motion, organiser disclosure and focus restoration, and mobile More navigation.
- Both languages fit a 360px viewport without page-wide horizontal overflow.
- Visual inspection completed at 1440px desktop and 360px Telugu mobile.
- No browser console errors or warnings were reported in the inspected local preview.

Local preview: `http://localhost:3000`. It uses the existing development server in
this application checkout. No production deployment has been performed.

User code/design review and release acceptance remain pending. Automated Chromium
coverage does not replace checking real phones or Safari before release.

Browser tests are in `tests/e2e/public-page.spec.ts`; they do not contact Atlas.

## Pending content

- Approved Devi image and final welcome text.
- Reviewed English and Telugu household names.
- Verified payment QR and linked mobile number; cash instructions.
- Programme timings, puja details and prasadam information.
- Committee members and roles.
- Confirmed venue, bilingual address and Google Maps link.
- Gallery photos when available. An empty gallery and pending Annadanam are valid launch states.

## Release state

No commit, push or deployment is part of this implementation turn. User code review
and the agreed testing stage precede those actions. Production launch checks include
real-content review, database isolation and backup validation when persistence is connected.

## Donation information increment — 15 October 2026

Implemented the approved donation design using the organiser-supplied original PhonePe QR image.
Recipient: PINNINTI DINESH. Public UPI-linked mobile: 88974 98853, supplied by the user.
The same original image is shown in the section, enlarged modal and download link;
it is not cropped, regenerated, recoloured or recompressed by the application.
Payment details are user-supplied; bank-side ownership and real UPI scanning are not independently verified.

Completed:

- Responsive English/Telugu donation section with recipient details and telephone link.
- Enlarge QR native modal with Escape, explicit Close controls and focus restoration.
- Original-image download and same-phone gallery-scanning instructions.
- Image-load failure message and manual contribution-recording explanation.
- No automatic Chandas update, website receipt or payment processing.

Verification:

- Formatting, lint, TypeScript, all 8 unit tests and production build passed.
- 12 existing browser checks passed.
- Both new donation browser checks passed after correcting the test to accept a browser-resolved absolute image URL (14 checks total across desktop/mobile).
- Verified image loading, recipient/mobile rendering, original-asset URL, download link, English/Telugu modal opening, Escape/Close and restored focus.
- Local desktop and mobile visual inspection completed; no application commit, push or deployment performed.

Pending:

- User review/manual testing, including real-device UPI scanning and recipient confirmation before payment.
- Venue and Committee Stitch designs and approved content.
- Organiser authentication and future editable content.

The donation QR and linked mobile listed under earlier pending content are now supplied.
Cash contribution instructions remain pending and are not invented.

## Celebration Venue increment — 15 October 2026

Implemented the approved Venue layout with organiser-confirmed content:

- Venue: Rittapadu Village.
- Nearby landmark: Venkateswar Swamy Temple.
- Address: Rittapadu village, Vajrapu Kotturu (Mandal), Srikakulam (Dist).
- Directions: https://maps.app.goo.gl/njCcUCf3BXxkN2Xt7.

The full-width section has a two-column photo/details layout on desktop and stacked
content on mobile. The photo remains an honest coming-soon placeholder. Labels,
welcome text and directions guidance switch between English and Telugu; the
supplied place names and address retain their English spelling. No unconfirmed
parking, entrance information or embedded map is added.

Verification:

- Formatting, ESLint, TypeScript, 8 unit tests and production build passed.
- All 16 desktop/mobile browser checks passed, including venue content, original
  Maps URL, safe new-tab attributes, both languages, mobile overflow, donation and
  existing navigation regressions.
- Local mobile visual inspection completed.
- External Google Maps destination could not be independently inspected: web access
  was unavailable and browser navigation timed out. The exact organiser URL is
  preserved; manual map-pin confirmation remains pending.

User review and venue photograph remain pending. Committee implementation is
deferred until the Venue is accepted, as requested. The latest Committee scope is
four members with photo, name and phone only; no roles. No commit, push or deployment
was performed.

This update supersedes the earlier pending request for venue name/address/map link:
those details are now supplied.

## Venue map pin correction — 15 October 2026

The organiser supplied a screenshot and full Google Maps place URL identifying
the venue pin at latitude 18.7379444, longitude 84.4416667
(18°44'16.6"N 84°26'30.0"E). This pin supersedes the earlier short link.
The coordinates following @ in the long URL describe the map camera; the venue
destination uses the selected pin coordinates from the place details.

Get Directions now uses Google's documented cross-platform Maps URL format:
https://www.google.com/maps/dir/?api=1&destination=18.7379444%2C84.4416667

No origin or travel mode is forced. Google Maps lets the visitor select a starting
point and route. The browser regression expectation uses this exact destination.
The change avoids the earlier short-link redirect; it does not establish why the
original link failed or guarantee availability of Google's service.
Validation for the map correction: TypeScript, production build and both desktop/mobile Venue browser tests passed. Google Maps live loading remains unverified because the review tool could not access Maps.

## Organising Committee increment — 15 October 2026

Implemented the four approved member cards in the supplied order:

1. Marpu Kiran — 81796 31437 — attachment 1.
2. Pinniti Dinesh — 88974 98853 — attachment 2.
3. Katchi Akhil — 90300 81998 — attachment 3.
4. Megavaram Vamsi — 88976 75809 — attachment 4.

Each card contains only a supplied photograph, name and tap-to-call phone number.
There are four columns on desktop, two on tablet, and one stacked card per row on
mobile with the number below the name. Names retain the user's English spelling
in both languages; call accessibility labels follow the selected language.
No roles, responsibilities or separate enquiry contacts are added.

The uploaded files are copied into public/committee. Portrait framing uses CSS
only; original image files are preserved. Wider photographs are zoomed within
portrait frames so faces remain visible. Pinniti Dinesh is the user-supplied
Committee spelling; the Donation recipient remains PINNINTI DINESH as printed
on the payment QR.

Verification:

- Full formatting, lint, TypeScript, 8 unit tests and production build passed.
- All 18 desktop/mobile browser checks passed for the initial implementation.
- After the final portrait-framing adjustment, code checks, 8 unit tests and
  production build passed again; all 4 focused Committee/mobile overflow browser
  checks passed.
- Checks cover exactly four members in order, each photo loading with the expected
  asset, exact phone destinations and both languages.
- Local English/Telugu mobile visual inspection completed.

User review/manual phone testing remains pending. No commit, push or deployment
was performed. Earlier Committee pending-content notes are superseded by this
increment; organiser authentication and content editing remain future work.

## Repository recovery — 15 October 2026

The initial dev commit contained only the four design documents and a status file
because this chat was attached to the Documents checkout. The implemented application
was located separately at the Desktop application path recorded above.

The application source, public assets, tests, configuration, lockfile, implementation
documentation and original detailed status have now been copied into this checkout
for publication on dev. Git history from the initial commit is preserved. Local
credentials, dependencies, build output and test artifacts are excluded by the
application's Git ignore rules. The original design documents remain at the root
and are also included under docs as supplied by the application checkout.

The earlier review covered only the four Word documents. It did not review the
application code; application code review and release acceptance remain pending.
Prior verification records above describe checks run in the original application
checkout. Formatting was checked again successfully in this recovered checkout.
No deployment was performed during recovery.
