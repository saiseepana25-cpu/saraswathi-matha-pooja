# Public page implementation

This first increment implements the approved public design in the existing Next.js
App Router application with CSS Modules. Visitors see published content and
honest pending content until organiser-supplied information is available.

## Main files

- `src/app/page.tsx`: server page boundary.
- `src/components/public/public-page.tsx`: public sections and interaction state.
- `src/components/public/public-page.module.css`: responsive design and scoped styles.
- `src/components/public/icon.tsx`: small, consistent SVG icon set.
- `src/lib/i18n/public-copy.ts`: typed English and Telugu interface copy.
- `src/app/globals.css`: local font families, global focus and motion rules.
- `tests/e2e/public-page.spec.ts`: public interaction and mobile regression checks.

The browser stores only an optional language preference. Household search, selected
day and announcement pause state remain in React memory. Language changes preserve
search and date selection. Browser refresh does not preserve those two draft controls.

The selected programme date also controls the puja and prasadam labels. Tab keyboard
navigation uses Left/Right and Home/End. Only the selected date is a tab stop.

The organiser entry now opens the approved bilingual login dialog and calls private authentication endpoints. Programme, Daily Puja and Prasadam editing is now implemented for signed-in organisers; see SCHEDULE_IMPLEMENTATION.md.
Escape closes the modal and focus returns to the initiating control.

The three dates are 16–18 October 2026, with the main programme on 16 October. This organiser-confirmed correction supersedes the five-day dates in the original V1 Word documents. There are no fabricated
households, amounts, schedules, photos, QR codes, locations or empty-success API routes.

## Local review

Run `npm run dev` and open the printed localhost URL. Check desktop and 360px mobile
layouts in both languages. This local preview is not a production deployment.

## Checks

Run `npm run check`, then `npm run build`, then `npm run test:e2e`.
Playwright starts its own production server on port 3100. Install its Chromium runtime
with `npx playwright install chromium` if the environment does not already have it.

The source design is a visual reference, not production markup: the implementation
does not include the Stitch Tailwind CDN, fake authentication, duplicate panels,
generated image tiles or unconfirmed editorial claims.

## Donation information

The donation increment uses the user-supplied original QR image at
`public/donations/pinninti-dinesh-qr.jpg`. The public recipient and linked mobile
are in `src/config/donation.ts`. English/Telugu display copy and the native
enlargement modal are in `src/components/public/donation-information.tsx`.

The original image is served locally with image optimization disabled to preserve
the uploaded asset. The section and modal preserve its full aspect ratio. Visitors
can download the original for a supported UPI gallery scanner on the same phone.
No payment URI is fabricated from the mobile number. The phone link makes a call;
it does not initiate a payment.

Payment is handled in the visitor's UPI application. The website does not detect
payment success, update Chandas, or issue receipts. Recipient ownership and real
UPI scanning still require the user's manual confirmation before release.

The added browser checks exercise image loading, telephone/download targets,
English/Telugu modal behaviour, Escape/Close, and focus restoration.

## Celebration Venue

Confirmed public content is stored in src/config/venue.ts. The component and CSS
are in src/components/public/celebration-venue.tsx and its CSS Module. The component
uses the existing language selection, displays the provided English place names
under bilingual labels and links to the organiser-confirmed pin using Google's direct directions URL
using a new tab with noopener noreferrer.

The Venue now occupies a full row so its internal desktop photo/details columns
match the approved design. Mobile stacks the photograph placeholder and address
details. Only the photograph is pending. There is no fake map, made-up arrival
guidance or public design-preview toggle. Committee content is still deferred.

The browser suite verifies the confirmed address, landmark, Maps destination
attribute, both languages and preservation of Donation/Committee sections. It
does not verify Google's external pin destination or real-device map-app handoff.

## Organising Committee

The four supplied members and public phone numbers are stored in
src/config/committee.ts in the organiser's attachment order. The UI is in
src/components/public/organising-committee.tsx and its CSS Module. It replaces
the old Committee pending state with four photo/name/phone cards and native tel
links. Headings and call accessibility labels follow the existing language toggle;
member names retain their supplied spelling.

Original photographs are local assets under public/committee. Next Image provides
responsive serving, while CSS frames the portraits without changing source files.
The component has no role fields, member administration, mutation routes or database
access. Browser tests verify image/name/telephone pairings in both languages.
