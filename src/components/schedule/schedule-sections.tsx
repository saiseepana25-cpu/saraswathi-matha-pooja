"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptySchedule,
  mergeScheduleSnapshots,
  publicEntries,
  resolveEntry,
  saveScheduleSchema,
  scheduleDates,
  type ScheduleEntry,
  type ScheduleKey,
  type ScheduleSnapshot,
  type SectionData,
} from "@/lib/schedule";
import { publicCopy, type Language } from "@/lib/i18n/public-copy";
import { csrfCookie, useOrganiserAuth } from "@/components/auth/organiser-auth";
import { Icon } from "@/components/public/icon";
import pageStyles from "@/components/public/public-page.module.css";
import { scheduleCopy } from "./copy";
import styles from "./schedule-sections.module.css";

function timeLabel(time: string | null, pending: string) {
  if (!time) return pending;
  const hour = Number(time.slice(0, 2));
  return (hour % 12 || 12) + time.slice(2) + (hour < 12 ? " AM" : " PM");
}

function Entries({
  data,
  programme,
  date,
  language,
}: {
  data: SectionData;
  programme: SectionData;
  date: string;
  language: Language;
}) {
  const text = scheduleCopy[language];
  const entries = publicEntries(
    data.days.find((day) => day.date === date)?.entries ?? [],
    date,
    programme,
  );
  return (
    <ul className={styles.entries}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className={styles.entryTime}>
            {timeLabel(entry.time, text.pendingTime)}
          </span>
          <div>
            <h4>{entry.title?.[language] ?? text.pendingTime}</h4>
            {entry.programmeEventId && (
              <span className={styles.linkTag}>{text.linked}</span>
            )}
            {entry.notes && <p>{entry.notes[language]}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

type Draft = { data: SectionData; baseline: SectionData; revision: number };
type Props = {
  section: ScheduleKey;
  language: Language;
  date: string;
  onDate: (day: number) => void;
  snapshot: ScheduleSnapshot;
  onPublished: (snapshot: ScheduleSnapshot) => void;
  state: "loading" | "ready" | "error";
};

function EditableSection({
  section,
  language,
  date,
  onDate,
  snapshot,
  onPublished,
  state,
}: Props) {
  const auth = useOrganiserAuth();
  const registerDraft = auth.registerDraft;
  const text = scheduleCopy[language];
  const copy = publicCopy[language];
  const published = snapshot.data[section];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [conflict, setConflict] = useState<ScheduleSnapshot | null>(null);
  const attempt = useRef<{ body: string; operationId: string } | null>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dayIndex = scheduleDates.indexOf(date as (typeof scheduleDates)[number]);
  const dirty = !!draft && JSON.stringify(draft.data) !== JSON.stringify(draft.baseline);
  const discard = useCallback(() => {
    setDraft(null);
    setError("");
    setConflict(null);
    attempt.current = null;
  }, []);

  useEffect(
    () => registerDraft(section, { dirty, busy: saving, discard }),
    [registerDraft, section, dirty, saving, discard],
  );
  const notesLabel =
    section === "programme"
      ? text.notesProgramme
      : section === "puja"
        ? text.notesPuja
        : text.notesPrasadam;
  const pending =
    section === "programme"
      ? copy.programmePending
      : section === "puja"
        ? copy.pujaPending
        : copy.prasadamPending;
  const pendingDescription =
    section === "programme"
      ? copy.programmePendingDescription
      : section === "puja"
        ? copy.pujaDescription
        : copy.prasadamDescription;
  const entries = draft?.data.days[dayIndex].entries ?? [];

  function changeEntry(index: number, patch: Partial<ScheduleEntry>) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            data: {
              days: previous.data.days.map((day, dayPosition) =>
                dayPosition === dayIndex
                  ? {
                      ...day,
                      entries: day.entries.map((entry, entryPosition) =>
                        entryPosition === index ? { ...entry, ...patch } : entry,
                      ),
                    }
                  : day,
              ),
            },
          }
        : null,
    );
    setSuccess(false);
    setError("");
  }
  function changeEntries(next: ScheduleEntry[]) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            data: {
              days: previous.data.days.map((day, index) =>
                index === dayIndex ? { ...day, entries: next } : day,
              ),
            },
          }
        : null,
    );
    setError("");
    setSuccess(false);
  }
  function cancel() {
    if (dirty) discardDialog.current?.showModal();
    else discard();
  }
  async function save() {
    if (!draft || saving || !auth.user || conflict) return;
    const validation = saveScheduleSchema.safeParse({
      section,
      data: draft.data,
      expectedRevision: draft.revision,
      operationId: attempt.current?.operationId ?? crypto.randomUUID(),
    });
    setInvalid(true);
    setError("");
    setSuccess(false);
    if (!validation.success) {
      setError("validation");
      const issue = validation.error.issues.find(
        (item) => item.path[0] === "data" && item.path[1] === "days",
      );
      if (issue && typeof issue.path[2] === "number")
        onDate(Number(scheduleDates[issue.path[2]].slice(-2)));
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    const { operationId: ignored, ...payload } = validation.data;
    void ignored;
    const body = JSON.stringify(payload);
    if (attempt.current?.body !== body)
      attempt.current = { body, operationId: crypto.randomUUID() };
    setSaving(true);
    try {
      const response = await fetch("/api/schedule", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfCookie() },
        body: JSON.stringify({ ...payload, operationId: attempt.current.operationId }),
      });
      const result = (await response.json()) as {
        snapshot?: ScheduleSnapshot;
        error?: string;
      };
      if (response.status === 401) {
        setError("expired");
        await auth.refresh();
        return;
      }
      if (response.status === 409 && result.snapshot) {
        setError(result.error ?? "conflict");
        if (result.error !== "linked") setConflict(result.snapshot);
        onPublished(result.snapshot);
        return;
      }
      if (!response.ok || !result.snapshot) {
        setError(
          response.status === 403
            ? "forbidden"
            : result.error === "tooLarge"
              ? "tooLarge"
              : response.status === 422
                ? "validation"
                : "failure",
        );
        return;
      }
      onPublished(result.snapshot);
      setDraft(null);
      setConflict(null);
      setError("");
      setSuccess(true);
      attempt.current = null;
      requestAnimationFrame(() => editButton.current?.focus());
    } catch {
      setError("failure");
    } finally {
      setSaving(false);
    }
  }

  const errorMessage =
    error === "tooLarge"
      ? language === "en"
        ? "The schedule is too large. Shorten descriptions before saving."
        : "వివరాలు చాలా పెద్దవి. వివరణలను తగ్గించి సేవ్ చేయండి."
      : error === "validation"
        ? text.invalid
        : error === "linked"
          ? text.linkedError
          : error === "conflict" || error === "operation"
            ? text.conflict
            : error === "expired"
              ? text.expired
              : error === "forbidden"
                ? text.forbidden
                : text.failure;
  const hasEntries = published.days[dayIndex].entries.length > 0;

  return (
    <div className={styles.sectionBody} data-editing={draft ? "true" : undefined}>
      <div className={styles.sectionActions}>
        {section === "programme" && <h4>{text.programme}</h4>}
        {auth.user && !draft && (
          <button
            ref={editButton}
            type="button"
            className={styles.edit}
            disabled={state !== "ready"}
            onClick={() => {
              setDraft({
                data: structuredClone(published),
                baseline: structuredClone(published),
                revision: snapshot.revisions[section],
              });
              setSuccess(false);
              setError("");
              setInvalid(false);
            }}
          >
            {text.edit} {text[section]}
          </button>
        )}
      </div>
      {success && (
        <p role="status" className={styles.success}>
          {text.saved}
        </p>
      )}
      {!draft ? (
        state !== "ready" ? (
          <p role="status">{state === "loading" ? text.loading : text.unavailable}</p>
        ) : hasEntries ? (
          <Entries
            data={published}
            programme={snapshot.data.programme}
            date={date}
            language={language}
          />
        ) : (
          <div className={styles.empty}>
            <Icon
              name={
                section === "programme"
                  ? "calendar"
                  : section === "puja"
                    ? "sparkles"
                    : "bowl"
              }
            />
            {section === "programme" ? <h3>{pending}</h3> : <h4>{pending}</h4>}
            <p>{pendingDescription}</p>
          </div>
        )
      ) : (
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          noValidate
          aria-label={text.edit + " " + text[section]}
          aria-busy={saving}
        >
          <div className={styles.draftNotice}>
            <strong>{text.draft}</strong>
            <p>{text.retained}</p>
          </div>
          <div className={styles.editorDates} aria-label={copy.datesLabel}>
            {scheduleDates.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === date}
                disabled={saving}
                onClick={() => onDate(Number(value.slice(-2)))}
              >
                {Number(value.slice(-2))} {copy.octoberShort}
              </button>
            ))}
          </div>
          <fieldset
            disabled={saving || !auth.user || !!conflict}
            className={styles.fields}
          >
            <legend className={styles.srOnly}>{text[section]}</legend>
            {entries.map((entry, index) => {
              const prefix = section + "-" + entry.id;
              const linked = section === "puja" && entry.programmeEventId !== null;
              const inherited = resolveEntry(entry, date, snapshot.data.programme);
              const linkedElsewhere =
                section === "programme" &&
                snapshot.data.puja.days.some((day) =>
                  day.entries.some((puja) => puja.programmeEventId === entry.id),
                );
              return (
                <div key={entry.id} className={styles.editorEntry}>
                  <div className={styles.entryHeader}>
                    <strong>
                      {text.entry} {index + 1}
                    </strong>
                    <div>
                      <button
                        type="button"
                        aria-label={text.up + " " + (index + 1)}
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...entries];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          changeEntries(next);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={text.down + " " + (index + 1)}
                        disabled={index === entries.length - 1}
                        onClick={() => {
                          const next = [...entries];
                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                          changeEntries(next);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={linkedElsewhere}
                        title={linkedElsewhere ? text.linkedRemove : undefined}
                        onClick={() =>
                          changeEntries(entries.filter((item) => item.id !== entry.id))
                        }
                      >
                        {text.remove}
                      </button>
                    </div>
                  </div>
                  {linkedElsewhere && <p className={styles.hint}>{text.linkedRemove}</p>}
                  {section === "puja" && (
                    <div className={styles.linkControl}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={linked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              const eventId =
                                snapshot.data.programme.days[dayIndex].entries[0]?.id ??
                                "";
                              changeEntry(index, {
                                programmeEventId: eventId,
                                title: null,
                                time: null,
                              });
                            } else
                              changeEntry(index, {
                                programmeEventId: null,
                                title: inherited.title ?? { en: "", te: "" },
                                time: inherited.time,
                              });
                          }}
                        />
                        {text.link}
                      </label>
                      {linked && (
                        <>
                          <label htmlFor={prefix + "-link"}>{text.select}</label>
                          <select
                            id={prefix + "-link"}
                            value={entry.programmeEventId ?? ""}
                            aria-invalid={invalid && !entry.programmeEventId}
                            onChange={(event) =>
                              changeEntry(index, {
                                programmeEventId: event.target.value,
                                title: null,
                                time: null,
                              })
                            }
                          >
                            <option value="">{text.select}</option>
                            {snapshot.data.programme.days[dayIndex].entries.map(
                              (event) => (
                                <option key={event.id} value={event.id}>
                                  {event.title?.[language]} —{" "}
                                  {timeLabel(event.time, text.pendingTime)}
                                </option>
                              ),
                            )}
                          </select>
                          <p className={styles.hint}>{text.inherited}</p>
                        </>
                      )}
                    </div>
                  )}
                  <div className={styles.bilingual}>
                    {(["en", "te"] as const).map((lang) => {
                      const value =
                        (linked ? inherited.title : entry.title)?.[lang] ?? "";
                      const bad = invalid && !value.trim();
                      return (
                        <div key={lang}>
                          <label htmlFor={prefix + "-name-" + lang}>
                            {text.name} ({lang === "en" ? text.english : text.telugu}) *
                          </label>
                          <input
                            id={prefix + "-name-" + lang}
                            value={value}
                            readOnly={linked}
                            maxLength={400}
                            aria-invalid={bad}
                            aria-describedby={
                              bad ? prefix + "-name-error-" + lang : undefined
                            }
                            onChange={(event) =>
                              changeEntry(index, {
                                title: {
                                  ...(entry.title ?? { en: "", te: "" }),
                                  [lang]: event.target.value,
                                },
                              })
                            }
                          />
                          {bad && (
                            <p
                              id={prefix + "-name-error-" + lang}
                              className={styles.fieldError}
                            >
                              {text.required}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.timeControl}>
                    <label htmlFor={prefix + "-time"}>{text.time}</label>
                    <input
                      id={prefix + "-time"}
                      type="time"
                      value={(linked ? inherited.time : entry.time) ?? ""}
                      disabled={linked || entry.time === null}
                      aria-invalid={invalid && !linked && entry.time === ""}
                      onChange={(event) =>
                        changeEntry(index, { time: event.target.value })
                      }
                    />
                    {!linked && (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={entry.time === null}
                          onChange={(event) =>
                            changeEntry(index, { time: event.target.checked ? null : "" })
                          }
                        />
                        {text.unconfirmed}
                      </label>
                    )}
                    {invalid && !linked && entry.time === "" && (
                      <p className={styles.fieldError}>{text.invalidTime}</p>
                    )}
                  </div>
                  <div className={styles.bilingual}>
                    {(["en", "te"] as const).map((lang) => {
                      const other = lang === "en" ? "te" : "en";
                      const bad =
                        invalid &&
                        !!entry.notes?.[other].trim() &&
                        !entry.notes?.[lang].trim();
                      return (
                        <div key={lang}>
                          <label htmlFor={prefix + "-notes-" + lang}>
                            {notesLabel} ({lang === "en" ? text.english : text.telugu},{" "}
                            {text.optional})
                          </label>
                          <textarea
                            id={prefix + "-notes-" + lang}
                            rows={3}
                            maxLength={4000}
                            value={entry.notes?.[lang] ?? ""}
                            aria-invalid={bad}
                            onChange={(event) => {
                              const notes = {
                                ...(entry.notes ?? { en: "", te: "" }),
                                [lang]: event.target.value,
                              };
                              changeEntry(index, {
                                notes:
                                  !notes.en.trim() && !notes.te.trim() ? null : notes,
                              });
                            }}
                          />
                          {bad && <p className={styles.fieldError}>{text.both}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className={styles.add}
              disabled={entries.length >= 100}
              onClick={() =>
                changeEntries([
                  ...entries,
                  {
                    id: crypto.randomUUID(),
                    title: { en: "", te: "" },
                    time: null,
                    notes: null,
                    programmeEventId: null,
                  },
                ])
              }
            >
              + {text.add}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className={styles.error}>
              {errorMessage}
            </p>
          )}
          {conflict && (
            <div className={styles.conflict}>
              <h4>{text.latest}</h4>
              {conflict.data[section].days.map((day) => (
                <div key={day.date}>
                  <strong>
                    {Number(day.date.slice(-2))} {copy.octoberShort}
                  </strong>
                  <Entries
                    data={conflict.data[section]}
                    programme={conflict.data.programme}
                    date={day.date}
                    language={language}
                  />
                </div>
              ))}
              <button type="button" onClick={discard}>
                {text.useLatest}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          revision: conflict.revisions[section],
                          baseline: structuredClone(conflict.data[section]),
                        }
                      : null,
                  );
                  attempt.current = null;
                  setConflict(null);
                  setError("");
                }}
              >
                {text.keepDraft}
              </button>
            </div>
          )}
          <div className={styles.saveActions}>
            <button
              type="submit"
              className={styles.save}
              disabled={saving || !auth.user || !!conflict}
            >
              {saving
                ? text.saving
                : (error === "failure" ? text.retry + " " : "") +
                  text.save +
                  " " +
                  text[section]}
            </button>
            <button
              type="button"
              className={styles.cancel}
              disabled={saving}
              onClick={cancel}
            >
              {text.cancel}
            </button>
          </div>
          <p className={styles.hint}>{text.helper}</p>
        </form>
      )}
      {!draft && state === "ready" && snapshot.updatedAt[section] && (
        <p className={styles.updated}>
          {text.updated}:{" "}
          {new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }).format(new Date(snapshot.updatedAt[section]!))}
        </p>
      )}
      <dialog
        ref={discardDialog}
        className={styles.dialog}
        aria-labelledby={section + "-discard-title"}
      >
        <h3 id={section + "-discard-title"}>{text.discardTitle}</h3>
        <p>{text.discardBody}</p>
        <button type="button" onClick={() => discardDialog.current?.close()}>
          {text.keep}
        </button>
        <button
          type="button"
          onClick={() => {
            discardDialog.current?.close();
            discard();
          }}
        >
          {text.discard}
        </button>
      </dialog>
    </div>
  );
}

export function ScheduleSections({
  language,
  selectedDay,
  onDate,
}: {
  language: Language;
  selectedDay: number;
  onDate: (day: number) => void;
}) {
  const copy = publicCopy[language];
  const text = scheduleCopy[language];
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot>(emptySchedule);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const loading = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const version = generation.current;
    try {
      const response = await fetch("/api/schedule", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { snapshot: ScheduleSnapshot };
      if (version === generation.current) {
        setSnapshot((previous) => mergeScheduleSnapshots(previous, result.snapshot));
        setState("ready");
      }
    } catch {
      if (version === generation.current) setState("error");
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(onFocus, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [load]);
  const publish = (value: ScheduleSnapshot) => {
    generation.current++;
    setSnapshot((previous) => mergeScheduleSnapshots(previous, value));
    setState("ready");
  };
  const date = "2026-10-" + selectedDay;
  const selectedDate = selectedDay + " " + copy.october + " 2026";
  const specialDay =
    selectedDay === 16 ? copy.mainDay : selectedDay === 18 ? copy.nimajjanamDay : "";
  const suffix = specialDay ? " · " + specialDay : "";
  const props = { language, date, onDate, snapshot, onPublished: publish, state };
  return (
    <>
      {state === "error" && (
        <div role="alert" className={styles.error}>
          {text.unavailable}{" "}
          <button type="button" onClick={() => void load()}>
            {text.retry}
          </button>
        </div>
      )}
      <div
        id="programme-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={"day-tab-" + selectedDay}
        className={pageStyles.programmePanel}
      >
        <div className={pageStyles.selectedDate}>
          <span className={pageStyles.squareIcon}>
            <Icon name="calendar" />
          </span>
          <div aria-live="polite">
            <h3>{selectedDate}</h3>
            <p>{specialDay || copy.day + " " + (selectedDay - 15)}</p>
          </div>
        </div>
        <EditableSection section="programme" {...props} />
      </div>
      <div
        id="puja-prasadam"
        data-page-section
        className={pageStyles.devotionalGrid + " " + styles.devotionalGrid}
        role="group"
        aria-label={copy.pujaPrasadam + " · " + selectedDate}
      >
        {(["puja", "prasadam"] as const).map((section) => (
          <article key={section} className={pageStyles.devotionalCard}>
            <div className={pageStyles.cardTitle}>
              <span className={pageStyles.squareIcon}>
                <Icon name={section === "puja" ? "sparkles" : "bowl"} />
              </span>
              <div>
                <h3>{text[section]}</h3>
                <p>
                  {selectedDate}
                  {suffix}
                </p>
              </div>
            </div>
            <EditableSection section={section} {...props} />
          </article>
        ))}
      </div>
    </>
  );
}
