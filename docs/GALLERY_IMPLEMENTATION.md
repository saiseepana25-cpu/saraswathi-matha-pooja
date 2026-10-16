# Celebration gallery implementation

The gallery is implemented in the Desktop Git project and is ready for user review.
No real photographs are seeded and no gallery content is published by startup,
tests or a public read.

## Approved V1 scope

- Up to 60 published photographs; no captions, categories, archives or visitor uploads.
- JPEG, PNG and WebP original selections up to 7,000,000 bytes each.
- Both portrait and landscape photographs retain their proportions.
- Compatible originals at or below 3,000,000 bytes keep their main bytes unchanged.
- Larger originals are prepared in the browser as WebP, with proportionate resizing
  and quality adjustments until the main is at most 3,000,000 bytes.
  This can reduce detail; original-quality archival storage is not promised.
- A separate proportionate preview is at most 200,000 bytes.
- Browser preparation and server decoding reject dimensions above 60 million pixels.
- Original upload size is enforced in the browser; the server independently enforces
  actual transmitted bytes, supported decoded types, dimensions and decode success.
- Neither the repository nor Vercel's temporary filesystem stores organiser uploads.

This explicitly supersedes the original DOCX limits of 30 photos and 5 MB originals.
The user also removed captions and restricted supported originals to JPEG/PNG/WebP;
HEIC conversion is outside this approved increment. No other section limits change.

## Public experience

The grid shows 12 lightweight previews and Load more reveals 12 more.
Native image proportions are preserved. The responsive grid has three desktop
columns and two mobile columns. There is no photograph text beyond accessible
image labels. The gallery has distinct loading, empty, failed-read and image-retry states.

The modal viewer covers the viewport with a dark background. It requests only the
selected full-size photograph, preserves the complete image and offers Close,
Previous, Next, a photo counter, Escape and arrow-key navigation.
Underlying content is inert while the modal is open. Closing restores focus to
the originating thumbnail. No autoplay or additional account flow is introduced.

Gallery reads refresh on window focus and every 60 seconds. An open draft is not
replaced by these reads. English/Telugu controls change without discarding edits.

## Organiser workflow

1. Sign in with the existing organiser account and choose Edit gallery.
2. Select multiple photographs from the device photo picker.
3. Review local New previews. Removing a new selection discards that local file.
4. Mark existing photos for removal; Undo reverses that draft action.
5. Save gallery confirms removals, prepares files, transfers them sequentially
   into private staging, and publishes the complete intended gallery in one save.
6. Only after confirmed publication does the editor close.

The count includes retained photographs and new selections, excluding pending
removals. A selection exceeding remaining slots is rejected as a whole rather
than silently dropping excess files. Invalid original files have per-file errors;
valid selections remain in the draft. Maximum capacity is also enforced server-side.

Cancel asks before discarding unsaved changes, and may abandon an uncommitted
private batch. It does not remove published photos. The existing global draft guard
handles navigation warnings, sign-out confirmation and saving protection.
Drafts live in memory only; closing/reloading the page may lose them.

## Storage and publication

- gallery/current: authoritative ordered published references, revision, updatedAt,
  internal writeVersion and bounded recentCommits.
- media_batches/UUID: primary ownership, gallery scope, base revision, open/abandoned
  state and a fixed 24-hour expiry.
- media/UUID: immutable main/thumbnail BSON Binary bytes, byte lengths, MIME types,
  decoded dimensions and server-computed SHA-256 hashes, plus batch and selection IDs.

All gallery staging, publication, abandonment and cleanup operations serialize on
gallery/current in MongoDB snapshot transactions with majority acknowledgement.
The transaction runner requires a replica set, which MongoDB Atlas provides.
The reference-list publication and its operation receipt commit atomically.
A batch can stage at most 60 files. At most two unexpired open batches are allowed.
Private/unreferenced gallery media are limited to 100 MB, including previews.
Thus a large collection of near-3 MB originals may need smaller save batches.
Staging quotas are conservative application safeguards, not available Atlas capacity.

A repeated batch ID preserves its original revision and expiry.
A repeated file selection ID in the same batch returns its original media ID only
when both computed variant hashes match. Root-document serialization prevents
concurrent duplicate file insertions without relying on client behaviour.
A different file under the same selection ID is rejected.

New published photos appear first in their selection order; retained photographs
keep their existing relative order and server publication timestamps.
No-op saves preserve the public revision/time.
Old/removed file IDs cannot be added by guessing them: retained ID pairs must
match the current gallery, and additions must belong to the supplied active batch.

Save operation IDs and canonical payload hashes support exact retries before
revision/batch checks, with at most 64 receipts retained for 24 hours on later writes.
An unknown final-save outcome locks draft editing/Cancel until Retry Save resolves
the original request. It does not re-upload already staged files.
Session expiry retains the draft, opens the existing sign-in flow and requires
an explicit Save afterward. It does not extend batch expiry.
A revision conflict retains the draft and displays the latest published gallery;
discard/reload is explicit. No automatic merge or overwrite is performed.

## Routes

- GET /api/gallery: published metadata only; no staging ownership, receipts or bytes.
- PUT /api/gallery: full intended references plus confirmed removals, revision and operation ID.
- POST /api/gallery/batches: idempotent private batch creation.
- GET /api/gallery/batches/:batchId: authenticated batch metadata, no image bytes.
- DELETE /api/gallery/batches/:batchId: protected abandonment only.
- PUT /api/gallery/batches/:batchId/files/:fileId: two binary multipart parts, main and thumbnail.
- GET /api/gallery/media/:mediaId?variant=main|thumbnail: reference-checked public bytes.

Routes follow the app's existing /api pattern rather than introducing a separate
/api/v1 prefix. Gallery Save uses the existing project's JSON operationId/revision
convention. Multipart transfer contains only the two variants; identity is in the path.
Metadata requests are bounded at 100 KB; complete multipart requests at 3.4 MB.
Every mutation checks exact Origin, active organiser session, session-bound CSRF,
maintenance state and absolute session expiry before persistence.
Real MIME/decode validation is authoritative; a claimed upload Content-Type is not proof.

Media origin reads and conditional 304 reads first check current gallery membership.
Private staged media and removed references return 404. Only one variant is returned.
Browser caching is limited to five minutes; previously downloaded copies cannot be revoked.
No Base64 image storage, separate cloud image service or persistent draft history is used.

## Storage capacity and private maintenance

Sixty maximum-size main images use 180 MB, before previews, other assets and staging.
The existing Atlas cluster shares its allowance across all databases.
Check actual Atlas storage/transfer headroom before uploading a large collection.
The implementation does not guarantee that the account has unused free capacity.

No TTL is applied to media: referenced photos survive batch expiry and deployments.
Unused media are reclaimed through the private maintenance command.

1. Pause gallery writes in EVERY running deployment using
   GALLERY_WRITES_PAUSED=true and wait for in-flight saves to finish.
2. Take a private database backup.
3. Preview eligible unreferenced files:
   npm.cmd run gallery:cleanup
4. Set the same pause flag in the local command environment; after reviewing the
   preview, explicitly apply:
   npm.cmd run gallery:cleanup -- --apply
5. Restore normal gallery writes after verification.

The command uses a transaction and the same gallery lock, rechecks current
references, and deletes only unreferenced gallery files from expired/abandoned
batches. Batch metadata is removed only when no files remain. Published photos,
other collections and other databases are preserved. Cleanup has not been run
against the live database as part of implementation.

## Acceptance review

- Inspect desktop, 360px mobile, English and Telugu layouts.
- Use real organiser sign-in and choose Edit gallery.
- Add a portrait and landscape original, including one above 3 MB but at/below 7 MB.
- Review image quality before publication; Cancel should preserve the existing gallery.
- Save one reviewed real photo only when ready to publish it to the shared database.
- Confirm the full-size viewer shows the entire image and works on the organiser's phone.
- Check real storage headroom, then complete code review, commit/push and Vercel deployment.
