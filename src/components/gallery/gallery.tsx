"use client";
/* Gallery media are served by the reference-checked binary route; no Next image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfCookie, useOrganiserAuth } from "@/components/auth/organiser-auth";
import {
  emptyGallery,
  GALLERY_LIMIT,
  GALLERY_PAGE_SIZE,
  ORIGINAL_LIMIT,
  imageTypes,
  mediaUrl,
  type GallerySnapshot,
  type GallerySave,
  type GalleryItem,
} from "@/lib/gallery";
import type { Language } from "@/lib/i18n/public-copy";
import { galleryCopy } from "./copy";
import { preparePhoto, type PreparedPhoto } from "./prepare-photo";
import styles from "./gallery.module.css";
type Selection = { id: string; file: File; url: string };
type Draft = { base: GallerySnapshot; removed: string[]; additions: Selection[] };
type Job = {
  batchId: string;
  prepared: Map<string, PreparedPhoto>;
  uploaded: Map<string, { mediaId: string; width: number; height: number }>;
  final?: GallerySave;
  batchReady: boolean;
  batchAttempted: boolean;
};
class RequestError extends Error {
  constructor(
    public code: string,
    public snapshot?: GallerySnapshot,
  ) {
    super(code);
  }
}
function Photo({
  src,
  alt,
  text,
  onOpen,
  width,
  height,
}: {
  src: string;
  alt: string;
  text: typeof galleryCopy.en | typeof galleryCopy.te;
  onOpen?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  if (failed)
    return (
      <div className={styles.failed}>
        <span>{text.imageFailure}</span>
        <button
          type="button"
          onClick={() => {
            setRetry((value) => value + 1);
            setFailed(false);
          }}
        >
          {text.retry}
        </button>
      </div>
    );
  const image = (
    <img
      className={styles.photo}
      src={src + (retry ? (src.includes("?") ? "&" : "?") + "retry=" + retry : "")}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
  return onOpen ? (
    <button
      type="button"
      className={styles.photoButton}
      aria-label={alt.replace(text.photo, text.open)}
      onClick={onOpen}
    >
      {image}
    </button>
  ) : (
    image
  );
}
export function CelebrationGallery({ language }: { language: Language }) {
  const text = galleryCopy[language];
  const auth = useOrganiserAuth();
  const registerDraft = auth.registerDraft;
  const [snapshot, setSnapshot] = useState<GallerySnapshot>(emptyGallery);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [visible, setVisible] = useState(GALLERY_PAGE_SIZE);
  const [error, setError] = useState("");
  const [fileErrors, setFileErrors] = useState<{ name: string; code: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [progress, setProgress] = useState<{
    stage: "preparing" | "uploading" | "saving";
    current: number;
    total: number;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState<GallerySnapshot | null>(null);
  const [viewer, setViewer] = useState<{ items: GalleryItem[]; index: number } | null>(
    null,
  );
  const [viewerError, setViewerError] = useState(false);
  const [viewerRetry, setViewerRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const job = useRef<Job | null>(null);
  const urls = useRef(new Set<string>());
  const revision = useRef(0);
  const requestGeneration = useRef(0);
  const dirty = !!draft && (draft.additions.length > 0 || draft.removed.length > 0);
  const locked = busy || uncertain;
  const canEdit = !!auth.user && !locked && !conflict;
  const activeCount = draft
    ? draft.base.items.length - draft.removed.length + draft.additions.length
    : snapshot.items.length;
  const errorMessage = (code: string) => text[code as keyof typeof text] ?? text.failure;
  const release = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);
  useEffect(() => () => release(), [release]);
  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    try {
      const response = await fetch("/api/gallery", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { snapshot: GallerySnapshot };
      if (
        generation === requestGeneration.current &&
        result.snapshot.revision >= revision.current
      ) {
        revision.current = result.snapshot.revision;
        setSnapshot(result.snapshot);
        setLoadState("ready");
      }
    } catch {
      if (generation === requestGeneration.current) setLoadState("error");
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60_000);
    return () => {
      window.removeEventListener("focus", focus);
      window.clearInterval(timer);
      window.clearTimeout(initial);
      // Numeric generation invalidates late requests after unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestGeneration.current++;
    };
  }, [load]);
  const abandon = useCallback(async (id: string) => {
    try {
      await fetch("/api/gallery/batches/" + id, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfCookie() },
      });
    } catch {
      /* Private staging expires for later safe maintenance. */
    }
  }, []);
  const discard = useCallback(() => {
    if (job.current?.batchAttempted) void abandon(job.current.batchId);
    release();
    job.current = null;
    setDraft(null);
    setError("");
    setFileErrors([]);
    setConflict(null);
    setUncertain(false);
  }, [abandon, release]);
  useEffect(
    () => registerDraft("gallery", { dirty, busy: busy || uncertain, discard }),
    [registerDraft, dirty, busy, uncertain, discard],
  );
  useEffect(() => {
    if (!viewer) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [viewer]);
  function closeViewer() {
    dialog.current?.close();
    setViewer(null);
    setViewerError(false);
    setViewerRetry(0);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function step(amount: number) {
    setViewer((value) =>
      value
        ? {
            ...value,
            index: (value.index + amount + value.items.length) % value.items.length,
          }
        : null,
    );
    setViewerError(false);
    setViewerRetry(0);
  }
  function addFiles(files: FileList | null) {
    if (!draft || !files || !canEdit) return;
    const selected = Array.from(files);
    if (selected.length > GALLERY_LIMIT - activeCount) {
      setError("capacity");
      return;
    }
    const accepted: Selection[] = [],
      rejected: { name: string; code: string }[] = [];
    for (const file of selected) {
      const code =
        !file.size || file.size > ORIGINAL_LIMIT
          ? "originalSize"
          : !imageTypes.includes(file.type as (typeof imageTypes)[number])
            ? "imageType"
            : "";
      if (code) {
        rejected.push({ name: file.name, code });
        continue;
      }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      accepted.push({ id: crypto.randomUUID(), file, url });
    }
    setDraft({ ...draft, additions: [...draft.additions, ...accepted] });
    setFileErrors(rejected);
    setError("");
    setSaved(false);
  }
  async function send(url: string, method: string, body: unknown, multipart = false) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          "X-CSRF-Token": csrfCookie(),
          ...(!multipart ? { "Content-Type": "application/json" } : {}),
        },
        body: multipart ? (body as FormData) : JSON.stringify(body),
      });
    } catch {
      throw new RequestError("failure");
    }
    let result: Record<string, unknown>;
    try {
      result = await response.json();
    } catch {
      throw new RequestError("failure");
    }
    if (!response.ok)
      throw new RequestError(
        String(result.error ?? "failure"),
        result.snapshot as GallerySnapshot | undefined,
      );
    return result;
  }
  async function save() {
    if (!draft || !auth.user || busyRef.current || conflict || !dirty) return;
    if (
      !job.current?.final &&
      draft.removed.length &&
      !window.confirm(text.confirmRemoval + " (" + draft.removed.length + ")")
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setSaved(false);
    setError("");
    setFileErrors([]);
    const currentJob: Job = job.current
      ? { ...job.current }
      : {
          batchId: crypto.randomUUID(),
          prepared: new Map(),
          uploaded: new Map(),
          batchReady: false,
          batchAttempted: false,
        };
    job.current = currentJob;
    try {
      if (!currentJob.final) {
        setProgress({ stage: "preparing", current: 0, total: draft.additions.length });
        for (let index = 0; index < draft.additions.length; index++) {
          const selected = draft.additions[index];
          if (!currentJob.prepared.has(selected.id)) {
            try {
              currentJob.prepared.set(selected.id, await preparePhoto(selected.file));
            } catch (failure) {
              setFileErrors([
                {
                  name: selected.file.name,
                  code: failure instanceof Error ? failure.message : "prepareFailed",
                },
              ]);
              throw new RequestError("prepareFailed");
            }
          }
          setProgress({
            stage: "preparing",
            current: index + 1,
            total: draft.additions.length,
          });
        }
        if (draft.additions.length && !currentJob.batchReady) {
          // The batch may exist even when its creation response never reaches us.
          currentJob.batchAttempted = true;
          await send("/api/gallery/batches", "POST", {
            clientBatchId: currentJob.batchId,
            expectedRevision: draft.base.revision,
          });
          currentJob.batchReady = true;
        }
        for (let index = 0; index < draft.additions.length; index++) {
          const selected = draft.additions[index];
          setProgress({
            stage: "uploading",
            current: index + 1,
            total: draft.additions.length,
          });
          if (currentJob.uploaded.has(selected.id)) continue;
          const photo = currentJob.prepared.get(selected.id)!;
          const form = new FormData();
          form.append("main", photo.main, "photo");
          form.append("thumbnail", photo.thumbnail, "thumbnail");
          const result = await send(
            "/api/gallery/batches/" + currentJob.batchId + "/files/" + selected.id,
            "PUT",
            form,
            true,
          );
          currentJob.uploaded.set(
            selected.id,
            result as { mediaId: string; width: number; height: number },
          );
        }
        currentJob.final = {
          operationId: crypto.randomUUID(),
          expectedRevision: draft.base.revision,
          mediaBatchId: draft.additions.length ? currentJob.batchId : null,
          confirmedRemovalIds: [...draft.removed],
          items: [
            ...draft.additions.map((selected, index) => ({
              id: selected.id,
              mediaId: currentJob.uploaded.get(selected.id)!.mediaId,
              selectionIndex: index,
            })),
            ...draft.base.items
              .filter((item) => !draft.removed.includes(item.id))
              .map((item) => ({
                id: item.id,
                mediaId: item.mediaId,
                selectionIndex: null,
              })),
          ],
        };
      }
      setProgress({ stage: "saving", current: 1, total: 1 });
      setUncertain(true);
      const result = await send("/api/gallery", "PUT", currentJob.final);
      const next = result.snapshot as GallerySnapshot;
      requestGeneration.current++;
      revision.current = next.revision;
      setSnapshot(next);
      setLoadState("ready");
      release();
      job.current = null;
      setDraft(null);
      setConflict(null);
      setUncertain(false);
      setSaved(true);
      setVisible(GALLERY_PAGE_SIZE);
      requestAnimationFrame(() => editButton.current?.focus());
    } catch (failure) {
      const issue =
        failure instanceof RequestError ? failure : new RequestError("failure");
      setError(issue.code);
      if (issue.snapshot) {
        setConflict(issue.snapshot);
        setUncertain(false);
        delete currentJob.final;
      } else if (issue.code === "batchUnavailable") {
        if (currentJob.batchAttempted) void abandon(currentJob.batchId);
        job.current = null;
        setUncertain(false);
      } else if (
        [
          "validation",
          "invalidReference",
          "removalConfirmation",
          "imageSize",
          "invalidImage",
          "imageType",
          "tooLarge",
          "maintenance",
        ].includes(issue.code)
      ) {
        delete currentJob.final;
        setUncertain(false);
      }
      if (issue.code === "expired") {
        await auth.refresh();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  }
  const rendered = draft ? draft.base.items : snapshot.items;
  const galleryGrid = (items: GalleryItem[], limit: number, editing: boolean) => (
    <div className={styles.grid}>
      {items.slice(0, limit).map((item, index) => (
        <article
          key={item.id}
          className={
            styles.tile +
            (editing && draft?.removed.includes(item.id) ? " " + styles.marked : "")
          }
        >
          <Photo
            src={mediaUrl(item.mediaId, "thumbnail")}
            alt={text.photo + " " + (index + 1)}
            text={text}
            width={item.width}
            height={item.height}
            onOpen={
              editing
                ? undefined
                : (event) => {
                    opener.current = event.currentTarget;
                    setViewer({ items, index });
                    setViewerError(false);
                  }
            }
          />
          {editing && (
            <div className={styles.tileMeta}>
              {draft?.removed.includes(item.id) && <span>{text.marked}</span>}
              <button
                type="button"
                disabled={!canEdit}
                aria-label={
                  (draft?.removed.includes(item.id) ? text.undo : text.remove) +
                  " " +
                  (index + 1)
                }
                onClick={() =>
                  setDraft((value) =>
                    value
                      ? {
                          ...value,
                          removed: value.removed.includes(item.id)
                            ? value.removed.filter((id) => id !== item.id)
                            : [...value.removed, item.id],
                        }
                      : null,
                  )
                }
              >
                {draft?.removed.includes(item.id) ? text.undo : text.remove}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
  return (
    <section
      id="gallery"
      data-page-section
      aria-labelledby="gallery-heading"
      className={styles.section}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{text.eyebrow}</p>
            <h2 id="gallery-heading">{draft ? text.editTitle : text.title}</h2>
            <p>{text.subtitle}</p>
          </div>
          {auth.user && !draft && (
            <button
              ref={editButton}
              type="button"
              className={styles.primary}
              disabled={loadState !== "ready"}
              onClick={() => {
                setDraft({ base: structuredClone(snapshot), removed: [], additions: [] });
                setVisible(GALLERY_PAGE_SIZE);
                setSaved(false);
                setError("");
              }}
            >
              {text.edit}
            </button>
          )}
        </header>
        {loadState === "loading" && <p role="status">{text.loading}</p>}
        {loadState === "error" && (
          <div role="alert" className={styles.status}>
            {text.loadFailure}{" "}
            <button type="button" onClick={() => void load()}>
              {text.retry}
            </button>
          </div>
        )}
        {saved && (
          <p role="status" className={styles.status}>
            {text.saved}
          </p>
        )}
        {draft && (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <strong>
                {activeCount} / {GALLERY_LIMIT} {text.photos}
              </strong>
              <span className={styles.hint}>{text.newest}</span>
            </div>
            <p className={styles.hint}>
              {text.limits}
              <br />
              {text.optimise}
              <br />
              {text.retained}
            </p>
            <button
              type="button"
              className={styles.primary}
              disabled={!canEdit || activeCount >= GALLERY_LIMIT}
              onClick={() => picker.current?.click()}
            >
              {text.add}
            </button>
            <input
              ref={picker}
              className={styles.file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
              aria-label={text.add}
            />
            {activeCount >= GALLERY_LIMIT && <p className={styles.hint}>{text.full}</p>}
          </div>
        )}
        {error && (
          <div role="alert" className={styles.status + " " + styles.error}>
            <p>{errorMessage(error)}</p>
            {["expired", "forbidden"].includes(error) && (
              <button type="button" onClick={auth.openLogin}>
                {text.signIn}
              </button>
            )}
          </div>
        )}
        {!!fileErrors.length && (
          <ul role="alert" className={styles.fileErrors}>
            {fileErrors.map((failure, index) => (
              <li key={index}>
                {failure.name}: {errorMessage(failure.code)}
              </li>
            ))}
          </ul>
        )}
        {progress && (
          <div
            role="status"
            aria-live="polite"
            className={styles.panel + " " + styles.progress}
          >
            <strong>
              {progress.stage === "uploading"
                ? text.uploading + " " + progress.current + " / " + progress.total
                : text[progress.stage]}
            </strong>
            <progress
              aria-label={text.saving}
              max={Math.max(progress.total, 1)}
              value={progress.current}
            />
            <span>{text.busy}</span>
          </div>
        )}
        {draft && !!draft.additions.length && (
          <div className={styles.grid}>
            {draft.additions.map((selected, index) => (
              <article className={styles.tile} key={selected.id}>
                <img
                  className={styles.photo}
                  src={selected.url}
                  alt={text.new + " " + (index + 1)}
                />
                <span className={styles.newBadge}>{text.new}</span>
                <div className={styles.tileMeta}>
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-label={text.remove + " " + text.new + " " + (index + 1)}
                    onClick={() => {
                      URL.revokeObjectURL(selected.url);
                      urls.current.delete(selected.url);
                      setDraft({
                        ...draft,
                        additions: draft.additions.filter(
                          (item) => item.id !== selected.id,
                        ),
                      });
                    }}
                  >
                    {text.remove}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {rendered.length ? (
          galleryGrid(rendered, draft ? rendered.length : visible, !!draft)
        ) : loadState === "ready" && !draft?.additions.length ? (
          <div className={styles.empty}>{text.empty}</div>
        ) : null}
        {!draft && snapshot.items.length > 0 && (
          <div className={styles.footer}>
            <p className={styles.hint}>
              {text.showing} {Math.min(visible, snapshot.items.length)} {text.of}{" "}
              {snapshot.items.length} {text.photos}
            </p>
            {visible < snapshot.items.length && (
              <button
                type="button"
                onClick={() => setVisible((value) => value + GALLERY_PAGE_SIZE)}
              >
                {text.more}
              </button>
            )}
          </div>
        )}
        {conflict && (
          <div className={styles.panel}>
            <h3>{text.latest}</h3>
            {galleryGrid(conflict.items, conflict.items.length, false)}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(text.discard)) {
                  const latest = conflict;
                  discard();
                  revision.current = latest.revision;
                  setSnapshot(latest);
                  setLoadState("ready");
                }
              }}
            >
              {text.reload}
            </button>
          </div>
        )}
        {draft && (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                if (!dirty || window.confirm(text.discard)) discard();
              }}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !dirty || !auth.user || !!conflict}
              onClick={() => void save()}
            >
              {busy ? text.saving : uncertain ? text.retrySave : text.save}
            </button>
          </div>
        )}
      </div>
      <dialog
        ref={dialog}
        className={styles.viewer}
        aria-label={text.title}
        onCancel={(event) => {
          event.preventDefault();
          closeViewer();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            step(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            step(1);
          }
        }}
      >
        {viewer && (
          <div className={styles.viewerInner}>
            <div className={styles.viewerHead}>
              <span>
                {text.photo} {viewer.index + 1} / {viewer.items.length}
              </span>
              <button type="button" aria-label={text.close} onClick={closeViewer}>
                {text.close} ×
              </button>
            </div>
            <div className={styles.viewerStage}>
              <button
                type="button"
                className={styles.previous}
                aria-label={text.previous}
                disabled={viewer.items.length < 2}
                onClick={() => step(-1)}
              >
                ‹
              </button>
              {viewerError ? (
                <div className={styles.failed}>
                  <span>{text.imageFailure}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setViewerRetry((value) => value + 1);
                      setViewerError(false);
                    }}
                  >
                    {text.retry}
                  </button>
                </div>
              ) : (
                <img
                  key={viewer.items[viewer.index].id + "-" + viewerRetry}
                  src={
                    mediaUrl(viewer.items[viewer.index].mediaId, "main") +
                    (viewerRetry ? "&retry=" + viewerRetry : "")
                  }
                  alt={text.photo + " " + (viewer.index + 1)}
                  onError={() => setViewerError(true)}
                />
              )}
              <button
                type="button"
                className={styles.next}
                aria-label={text.next}
                disabled={viewer.items.length < 2}
                onClick={() => step(1)}
              >
                ›
              </button>
            </div>
            <div className={styles.viewerFoot}>
              <button
                type="button"
                aria-label={text.previous}
                disabled={viewer.items.length < 2}
                onClick={() => step(-1)}
              >
                ‹
              </button>
              <span>
                {viewer.index + 1} / {viewer.items.length}
              </span>
              <button
                type="button"
                aria-label={text.next}
                disabled={viewer.items.length < 2}
                onClick={() => step(1)}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
