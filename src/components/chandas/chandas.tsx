"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfCookie, useOrganiserAuth } from "@/components/auth/organiser-auth";
import {
  browseHouseholds,
  collectedChandasRupees,
  CHANDAS_PAGE_SIZE,
  contributionFilters,
  duplicateHouseholdIds,
  emptyChandas,
  householdSchema,
  householdDisplayName,
  insertHousehold,
  MAX_HOUSEHOLDS,
  MAX_RUPEES,
  saveChandasSchema,
  type ChandasSnapshot,
  type ChandasSort,
  type ContributionFilter,
  type ContributionType,
  type Household,
} from "@/lib/chandas";
import type { Language } from "@/lib/i18n/public-copy";
import { chandasCopy } from "./copy";
import styles from "./chandas.module.css";

type DraftRow = {
  id: string;
  name: { en: string; te: string };
  type: ContributionType;
  amount: string;
};
type Draft = { rows: DraftRow[]; baseline: Household[]; revision: number };
type Confirm =
  | { kind: "discard" }
  | { kind: "remove"; id: string }
  | { kind: "type"; id: string; type: ContributionType };
const toDraft = (rows: Household[]): DraftRow[] =>
  rows.map((row) => ({
    id: row.id,
    name: { ...row.name },
    type: row.contribution.type,
    amount:
      row.contribution.type === "money" ? String(row.contribution.amountRupees) : "",
  }));
const toHousehold = (row: DraftRow): Household => ({
  id: row.id,
  name: { ...row.name },
  contribution:
    row.type === "money"
      ? {
          type: "money",
          amountRupees:
            /^\d+$/.test(row.amount) && row.amount !== "" ? Number(row.amount) : NaN,
        }
      : { type: row.type },
});
const invalidName = (name: Household["name"], language: Language) =>
  (!name.en.trim() && !name.te.trim()) || Array.from(name[language].trim()).length > 120;
const invalidMoney = (row: DraftRow) =>
  row.type === "money" &&
  (!/^[1-9]\d*$/.test(row.amount) ||
    !Number.isSafeInteger(Number(row.amount)) ||
    Number(row.amount) > MAX_RUPEES);
const newRow = (): DraftRow => ({
  id: crypto.randomUUID(),
  name: { en: "", te: "" },
  type: "pending",
  amount: "",
});

export function Chandas({ language }: { language: Language }) {
  const text = chandasCopy[language];
  const auth = useOrganiserAuth();
  const registerDraft = auth.registerDraft;
  const [snapshot, setSnapshot] = useState<ChandasSnapshot>(emptyChandas);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [basis, setBasis] = useState<DraftRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ChandasSort>("original");
  const [filter, setFilter] = useState<ContributionFilter>("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState<ChandasSnapshot | null>(null);
  const [confirmation, setConfirmation] = useState<Confirm | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [addition, setAddition] = useState<DraftRow | null>(null);
  const [placement, setPlacement] = useState<"end" | "position">("end");
  const [position, setPosition] = useState("");
  const [addInvalid, setAddInvalid] = useState(false);
  const loading = useRef(false);
  const generation = useRef(0);
  const attempt = useRef<{ body: string; operationId: string } | null>(null);
  const canEdit = !!auth.user && !saving && !conflict;
  const dirty =
    !!draft && JSON.stringify(draft.rows) !== JSON.stringify(toDraft(draft.baseline));
  const discard = useCallback(() => {
    setDraft(null);
    setBasis(null);
    setConflict(null);
    setError("");
    setInvalid(false);
    setChangedOnly(false);
    attempt.current = null;
    addRef.current?.close();
    confirmRef.current?.close();
    setAddition(null);
    setConfirmation(null);
  }, []);
  useEffect(
    () => registerDraft("chandas", { dirty, busy: saving, discard }),
    [registerDraft, dirty, saving, discard],
  );

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const version = generation.current;
    try {
      const response = await fetch("/api/chandas", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { snapshot: ChandasSnapshot };
      if (version === generation.current) {
        setSnapshot((previous) =>
          result.snapshot.revision >= previous.revision ? result.snapshot : previous,
        );
        setState("ready");
      }
    } catch {
      if (version === generation.current) setState("error");
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [load]);
  function publish(value: ChandasSnapshot) {
    generation.current++;
    setSnapshot((previous) => (value.revision >= previous.revision ? value : previous));
    setState("ready");
  }
  const draftRows = draft?.rows ?? [];
  const baseline = new Map(draft?.baseline.map((row) => [row.id, row]) ?? []);
  const changedIds = new Set(
    draftRows
      .filter(
        (row) =>
          JSON.stringify(toHousehold(row)) !== JSON.stringify(baseline.get(row.id)),
      )
      .map((row) => row.id),
  );
  const deletedCount = draft
    ? draft.baseline.filter((row) => !draft.rows.some((item) => item.id === row.id))
        .length
    : 0;
  const duplicates = duplicateHouseholdIds(draftRows);
  const displayRows = draft
    ? (basis ?? draft.rows)
        .filter((row) => draft.rows.some((current) => current.id === row.id))
        .map(toHousehold)
    : snapshot.households;
  const matched = browseHouseholds(displayRows, query, filter, sort, language).filter(
    ({ row }) => !draft || !changedOnly || changedIds.has(row.id),
  );
  const pageCount = Math.max(1, Math.ceil(matched.length / CHANDAS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * CHANDAS_PAGE_SIZE;
  const visible = matched.slice(start, start + CHANDAS_PAGE_SIZE);
  const publishedCounts = {
    pending: snapshot.households.filter((row) => row.contribution.type === "pending")
      .length,
    money: snapshot.households.filter((row) => row.contribution.type === "money").length,
    vigraham: snapshot.households.filter((row) => row.contribution.type === "vigraham")
      .length,
  };
  function browseChange() {
    setBasis(draft ? structuredClone(draft.rows) : null);
    setPage(1);
  }
  function resetBrowse() {
    setQuery("");
    setFilter("all");
    setSort("original");
    setChangedOnly(false);
    browseChange();
  }
  function update(id: string, patch: Partial<DraftRow>) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            rows: previous.rows.map((row) =>
              row.id === id ? { ...row, ...patch } : row,
            ),
          }
        : null,
    );
    setError("");
    setSuccess(false);
  }
  function ask(value: Confirm) {
    setConfirmation(value);
  }
  useEffect(() => {
    if (confirmation) confirmRef.current?.showModal();
    else confirmRef.current?.close();
  }, [confirmation]);
  function selectType(row: DraftRow, type: ContributionType) {
    if (row.type === type) return;
    if (row.type === "vigraham" || (row.type === "money" && row.amount !== ""))
      ask({ kind: "type", id: row.id, type });
    else update(row.id, { type, amount: "" });
  }
  function confirmChange() {
    if (!confirmation || savingRef.current) return;
    if (confirmation.kind === "discard") discard();
    else if (confirmation.kind === "type")
      update(confirmation.id, { type: confirmation.type, amount: "" });
    else {
      const rows = draftRows.filter((row) => row.id !== confirmation.id);
      setDraft((previous) => (previous ? { ...previous, rows } : null));
      setBasis(rows);
      setError("");
      setSuccess(false);
    }
    confirmRef.current?.close();
    setConfirmation(null);
  }
  function openAdd() {
    if (!draft || !canEdit) return;
    setAddition(newRow());
    setPlacement("end");
    setPosition(String(draft.rows.length + 1));
    setAddInvalid(false);
    addRef.current?.showModal();
  }
  function addHousehold() {
    if (!addition || !draft || !canEdit) return;
    setAddInvalid(true);
    const nextPosition = placement === "end" ? draft.rows.length + 1 : Number(position);
    if (
      !householdSchema.safeParse(toHousehold(addition)).success ||
      !Number.isInteger(nextPosition) ||
      nextPosition < 1 ||
      nextPosition > draft.rows.length + 1 ||
      draft.rows.length >= MAX_HOUSEHOLDS
    )
      return;
    const canonical = toDraft([householdSchema.parse(toHousehold(addition))])[0];
    const rows = insertHousehold(
      draft.rows.map(toHousehold),
      toHousehold(canonical),
      nextPosition,
    );
    // Preserve any invalid/partially entered values in other household drafts.
    const inserted = rows.map((row) =>
      row.id === canonical.id
        ? canonical
        : draft.rows.find((item) => item.id === row.id)!,
    );
    setDraft({ ...draft, rows: inserted });
    setBasis(structuredClone(inserted));
    setQuery("");
    setFilter("all");
    setSort("original");
    setChangedOnly(false);
    setPage(Math.ceil(nextPosition / CHANDAS_PAGE_SIZE));
    setError("");
    setSuccess(false);
    addRef.current?.close();
    setAddition(null);
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "start" }));
  }
  async function save() {
    if (!draft || !auth.user || conflict || savingRef.current) return;
    setInvalid(true);
    setError("");
    setSuccess(false);
    const parsed = saveChandasSchema.safeParse({
      households: draft.rows.map(toHousehold),
      expectedRevision: draft.revision,
      operationId: attempt.current?.operationId ?? crypto.randomUUID(),
    });
    if (!parsed.success) {
      setError("validation");
      const index = draft.rows.findIndex(
        (row) => !householdSchema.safeParse(toHousehold(row)).success,
      );
      setBasis(structuredClone(draft.rows));
      setQuery("");
      setFilter("all");
      setSort("original");
      setChangedOnly(false);
      setPage(index < 0 ? 1 : Math.floor(index / CHANDAS_PAGE_SIZE) + 1);
      requestAnimationFrame(() =>
        listRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    const { operationId: ignored, ...payload } = parsed.data;
    void ignored;
    const body = JSON.stringify(payload);
    if (attempt.current?.body !== body)
      attempt.current = { body, operationId: crypto.randomUUID() };
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/chandas", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfCookie() },
        body: JSON.stringify({ ...payload, operationId: attempt.current.operationId }),
      });
      const result = (await response.json()) as {
        snapshot?: ChandasSnapshot;
        error?: string;
      };
      if (response.status === 401) {
        setError("expired");
        await auth.refresh();
        return;
      }
      if (response.status === 409 && result.snapshot) {
        publish(result.snapshot);
        setConflict(result.snapshot);
        setError("conflict");
        return;
      }
      if (!response.ok || !result.snapshot) {
        setError(
          response.status === 403
            ? "forbidden"
            : result.error === "tooLarge" || response.status === 413
              ? "tooLarge"
              : response.status === 422
                ? "validation"
                : "failure",
        );
        return;
      }
      publish(result.snapshot);
      discard();
      setSuccess(true);
      requestAnimationFrame(() => editRef.current?.focus());
    } catch {
      setError("failure");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const errorText =
    error === "validation"
      ? text.invalid
      : error === "expired"
        ? text.expired
        : error === "forbidden"
          ? text.forbidden
          : error === "conflict"
            ? text.conflict
            : error === "tooLarge"
              ? text.tooLarge
              : text.failure;
  function contribution(row: Household) {
    return row.contribution.type === "money"
      ? "₹" + row.contribution.amountRupees.toLocaleString("en-IN")
      : row.contribution.type === "vigraham"
        ? text.vigraham
        : text.pending;
  }
  function fields(
    row: DraftRow,
    change: (patch: Partial<DraftRow>) => void,
    showInvalid: boolean,
    prefix: string,
    typeChange?: (type: ContributionType) => void,
  ) {
    return (
      <>
        <div className={styles.names}>
          {(["en", "te"] as const).map((lang) => (
            <label key={lang} htmlFor={prefix + "-" + lang}>
              {lang === "en" ? text.english : text.telugu}
              <input
                id={prefix + "-" + lang}
                aria-label={lang === "en" ? text.english : text.telugu}
                aria-describedby={prefix + "-name-help"}
                lang={lang}
                value={row.name[lang]}
                maxLength={240}
                aria-invalid={showInvalid && invalidName(row.name, lang)}
                onChange={(event) =>
                  change({ name: { ...row.name, [lang]: event.target.value } })
                }
              />
              {showInvalid && invalidName(row.name, lang) && (
                <span className={styles.fieldError}>{text.fieldError}</span>
              )}
            </label>
          ))}
        </div>
        <p id={prefix + "-name-help"}>{text.nameHelp}</p>
        <div className={styles.contributionFields}>
          <label htmlFor={prefix + "-type"}>
            {text.type}
            <select
              id={prefix + "-type"}
              aria-label={text.type}
              value={row.type}
              onChange={(event) =>
                typeChange
                  ? typeChange(event.target.value as ContributionType)
                  : change({ type: event.target.value as ContributionType, amount: "" })
              }
            >
              <option value="pending">{text.pending}</option>
              <option value="money">{text.money}</option>
              <option value="vigraham">{text.vigraham}</option>
            </select>
          </label>
          {row.type === "money" && (
            <label htmlFor={prefix + "-amount"}>
              {text.amount} *
              <input
                id={prefix + "-amount"}
                aria-label={text.amount + " *"}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={row.amount}
                aria-invalid={showInvalid && invalidMoney(row)}
                onChange={(event) => change({ amount: event.target.value })}
              />
              {showInvalid && invalidMoney(row) && (
                <span className={styles.fieldError}>{text.fieldError}</span>
              )}
              <span className={styles.hint}>{text.amountHelp}</span>
            </label>
          )}
        </div>
      </>
    );
  }

  return (
    <section
      id="chandas"
      data-page-section
      aria-labelledby="chandas-heading"
      className={styles.section}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{text.eyebrow}</p>
            <h2 id="chandas-heading">{text.title}</h2>
            <p>{text.subtitle}</p>
          </div>
          {auth.user && !draft && (
            <button
              ref={editRef}
              type="button"
              disabled={state !== "ready"}
              className={styles.primary}
              onClick={() => {
                const rows = toDraft(snapshot.households);
                setDraft({
                  rows,
                  baseline: structuredClone(snapshot.households),
                  revision: snapshot.revision,
                });
                setBasis(structuredClone(rows));
                setError("");
                setSuccess(false);
                setInvalid(false);
                setChangedOnly(false);
              }}
            >
              {text.edit}
            </button>
          )}
        </header>
        <p className={styles.notice}>
          {text.verification}
          <br />
          {text.pendingHelp}
        </p>
        <div className={styles.summary}>
          <div
            className={styles.totalCard}
            role="region"
            aria-labelledby="chandas-total-label"
          >
            <h3 id="chandas-total-label">{text.total}</h3>
            <strong className={styles.totalValue} role="status">
              {state === "ready"
                ? new Intl.NumberFormat(language === "te" ? "te-IN" : "en-IN", {
                    style: "currency",
                    currency: "INR",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(collectedChandasRupees(snapshot.households))
                : state === "loading"
                  ? text.totalLoading
                  : text.totalUnavailable}
            </strong>
            <p>{text.totalHelp}</p>
            {draft && <p className={styles.totalDraftHelp}>{text.totalDraftHelp}</p>}
          </div>
          <div>
            <span>{text.households}</span>
            <strong>{state === "ready" ? snapshot.households.length : "—"}</strong>
            {state === "ready" && (
              <p>
                {publishedCounts.money} {text.moneyCount} · {publishedCounts.pending}{" "}
                {text.pending} · {publishedCounts.vigraham} {text.vigraham}
              </p>
            )}
          </div>
          <div>
            <span>{text.updated}</span>
            <strong>
              {snapshot.updatedAt
                ? new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(snapshot.updatedAt))
                : text.notUpdated}
            </strong>
          </div>
        </div>
        {success && (
          <p role="status" className={styles.success}>
            {text.saved}
          </p>
        )}
        {draft && (
          <div className={styles.draftNotice}>
            <strong>
              {changedIds.size + deletedCount} {text.unsaved}
            </strong>
            <p>{text.draftHelp}</p>
            <p className={styles.hint}>{text.browseHelp}</p>
            <div className={styles.buttons}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={changedOnly}
                  disabled={saving}
                  onChange={(event) => {
                    setChangedOnly(event.target.checked);
                    browseChange();
                  }}
                />
                {text.changed}
              </label>
              <button type="button" disabled={saving} onClick={browseChange}>
                {text.apply}
              </button>
              <button
                type="button"
                disabled={!canEdit || draft.rows.length >= MAX_HOUSEHOLDS}
                onClick={openAdd}
              >
                {text.add}
              </button>
            </div>
            {draft.rows.length >= MAX_HOUSEHOLDS && <p>{text.max}</p>}
          </div>
        )}
        <div className={styles.tools}>
          <div className={styles.search}>
            <label htmlFor="household-search">{text.search}</label>
            <div>
              <input
                id="household-search"
                type="search"
                autoComplete="off"
                value={query}
                disabled={saving}
                onChange={(event) => {
                  setQuery(event.target.value);
                  browseChange();
                }}
              />
              {query && (
                <button
                  type="button"
                  disabled={saving}
                  aria-label={text.clear}
                  onClick={() => {
                    setQuery("");
                    browseChange();
                    document.getElementById("household-search")?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <label htmlFor="chandas-sort">
            {text.sort}
            <select
              id="chandas-sort"
              aria-label={text.sort}
              value={sort}
              disabled={saving}
              onChange={(event) => {
                setSort(event.target.value as ChandasSort);
                browseChange();
              }}
            >
              <option value="original">{text.original}</option>
              <option value="asc">{text.asc}</option>
              <option value="desc">{text.desc}</option>
            </select>
          </label>
          <label htmlFor="chandas-filter">
            {text.filter}
            <select
              id="chandas-filter"
              aria-label={text.filter}
              value={filter}
              disabled={saving}
              onChange={(event) => {
                setFilter(event.target.value as ContributionFilter);
                browseChange();
              }}
            >
              {contributionFilters.map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? text.all
                    : value === "pending"
                      ? text.pending
                      : value === "vigraham"
                        ? text.vigraham
                        : value === "2000+"
                          ? "₹2,000+"
                          : "₹" + value.replace("-", "–")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          ref={listRef}
          className={styles.list}
          aria-busy={saving || state === "loading"}
        >
          <div className={styles.resultHeader}>
            <p role="status">
              {text.range} {matched.length ? start + 1 : 0}–
              {Math.min(start + CHANDAS_PAGE_SIZE, matched.length)} {text.of}{" "}
              {matched.length} {text.households}
            </p>
            {(query || filter !== "all" || sort !== "original" || changedOnly) && (
              <button type="button" disabled={saving} onClick={resetBrowse}>
                {text.reset}
              </button>
            )}
          </div>
          {state === "loading" && !draft ? (
            <p role="status" className={styles.empty}>
              {text.loading}
            </p>
          ) : state === "error" && !draft ? (
            <div role="alert" className={styles.empty}>
              {text.unavailable}{" "}
              <button type="button" onClick={() => void load()}>
                {text.retry}
              </button>
            </div>
          ) : (
            <>
              {!visible.length && (
                <div className={styles.empty}>
                  <h3>{!displayRows.length ? text.empty : text.noMatches}</h3>
                  {!displayRows.length && <p>{text.emptyHelp}</p>}
                </div>
              )}
              {!draft && visible.length > 0 && (
                <div className={styles.tableHeader} aria-hidden="true">
                  <span>{text.serial}</span>
                  <span>{text.name}</span>
                  <span>{text.contribution}</span>
                </div>
              )}
              <ol
                className={draft ? styles.editList : styles.rows}
                aria-label={text.households}
              >
                {visible.map(({ row, serial }) => {
                  const editable = draft?.rows.find((item) => item.id === row.id);
                  return (
                    <li
                      key={row.id}
                      value={serial}
                      className={editable ? styles.editorRow : styles.publicRow}
                      data-household-id={row.id}
                    >
                      <span className={styles.serial}>#{serial}</span>
                      {editable ? (
                        <div className={styles.rowFields}>
                          <fieldset disabled={!canEdit}>
                            <legend className={styles.srOnly}>
                              {text.name} #{serial}
                            </legend>
                            {fields(
                              editable,
                              (patch) => update(row.id, patch),
                              invalid,
                              "household-" + row.id,
                              (type) => selectType(editable, type),
                            )}
                            {duplicates.has(row.id) && (
                              <p className={styles.warning}>{text.duplicates}</p>
                            )}
                            <button
                              type="button"
                              className={styles.remove}
                              onClick={() => ask({ kind: "remove", id: row.id })}
                            >
                              {text.remove} #{serial}
                            </button>
                          </fieldset>
                        </div>
                      ) : (
                        <>
                          <div className={styles.rowNames}>
                            <strong
                              lang={
                                row.name[language].trim()
                                  ? language
                                  : language === "en"
                                    ? "te"
                                    : "en"
                              }
                            >
                              {householdDisplayName(row.name, language)}
                            </strong>
                            {row.name.en.trim() && row.name.te.trim() && (
                              <span lang={language === "en" ? "te" : "en"}>
                                {row.name[language === "en" ? "te" : "en"]}
                              </span>
                            )}
                          </div>
                          <span
                            className={
                              row.contribution.type === "money"
                                ? styles.amount
                                : styles.badge
                            }
                          >
                            {contribution(row)}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
              {matched.length > CHANDAS_PAGE_SIZE && (
                <nav className={styles.pagination} aria-label={text.page}>
                  <div className={styles.pageNumbers}>
                    {Array.from({ length: pageCount }, (_, index) => index + 1)
                      .filter(
                        (number) =>
                          pageCount <= 7 ||
                          number === 1 ||
                          number === pageCount ||
                          Math.abs(number - currentPage) <= 1,
                      )
                      .map((number, index, array) => (
                        <span key={number}>
                          {index > 0 && number - array[index - 1] > 1 && (
                            <span aria-hidden="true">…</span>
                          )}
                          <button
                            type="button"
                            aria-label={text.page + " " + number}
                            aria-current={number === currentPage ? "page" : undefined}
                            disabled={saving}
                            onClick={() => {
                              setPage(number);
                              listRef.current?.scrollIntoView({ block: "start" });
                            }}
                          >
                            {number}
                          </button>
                        </span>
                      ))}
                  </div>
                  <div className={styles.pageActions}>
                    <button
                      type="button"
                      disabled={saving || currentPage <= 1}
                      onClick={() => {
                        setPage(currentPage - 1);
                        listRef.current?.scrollIntoView({ block: "start" });
                      }}
                    >
                      {text.previous}
                    </button>
                    <button
                      type="button"
                      disabled={saving || currentPage >= pageCount}
                      onClick={() => {
                        setPage(currentPage + 1);
                        listRef.current?.scrollIntoView({ block: "start" });
                      }}
                    >
                      {text.next}
                    </button>
                  </div>
                  <p>
                    {text.page} {currentPage} / {pageCount}
                  </p>
                </nav>
              )}
            </>
          )}
        </div>
        {draft && (
          <>
            {error && (
              <p role="alert" className={styles.error}>
                {errorText}
              </p>
            )}
            {!auth.user && (
              <p className={styles.warning}>
                {text.expired}{" "}
                <button type="button" onClick={auth.openLogin}>
                  {text.signIn}
                </button>
              </p>
            )}
            {state === "error" && (
              <p role="status" className={styles.warning}>
                {text.unavailable}{" "}
                <button type="button" onClick={() => void load()}>
                  {text.retry}
                </button>
              </p>
            )}
            {conflict && (
              <div className={styles.conflict} role="region" aria-label={text.latest}>
                <h3>{text.latest}</h3>
                <p>{text.overwrite}</p>
                <ol className={styles.latestList}>
                  {conflict.households.map((row, index) => (
                    <li key={row.id}>
                      #{index + 1} ·{" "}
                      {[row.name.en, row.name.te]
                        .filter((name) => name.trim())
                        .join(" / ")}{" "}
                      · {contribution(row)}
                    </li>
                  ))}
                </ol>
                <div className={styles.buttons}>
                  <button
                    type="button"
                    disabled={!auth.user}
                    onClick={() => {
                      discard();
                      setPage(1);
                    }}
                  >
                    {text.useLatest}
                  </button>
                  <button
                    type="button"
                    disabled={!auth.user}
                    onClick={() => {
                      setDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              baseline: structuredClone(conflict.households),
                              revision: conflict.revision,
                            }
                          : null,
                      );
                      setConflict(null);
                      setError("");
                      attempt.current = null;
                    }}
                  >
                    {text.retain}
                  </button>
                </div>
              </div>
            )}
            <div className={styles.saveBar}>
              <button
                type="button"
                className={styles.primary}
                disabled={!canEdit}
                onClick={() => void save()}
              >
                {saving ? text.saving : error === "failure" ? text.retrySave : text.save}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => (dirty ? ask({ kind: "discard" }) : discard())}
              >
                {text.cancel}
              </button>
            </div>
          </>
        )}
        <dialog
          ref={confirmRef}
          className={styles.dialog}
          aria-labelledby="chandas-confirm-title"
          onCancel={() => setConfirmation(null)}
        >
          <h3 id="chandas-confirm-title">
            {confirmation?.kind === "discard" ? text.discardTitle : text.confirmation}
          </h3>
          <p>
            {confirmation?.kind === "discard"
              ? text.discardBody
              : confirmation?.kind === "remove"
                ? text.removeBody
                : text.typeBody}
          </p>
          {confirmation && "id" in confirmation && (
            <p>
              {householdDisplayName(
                draftRows.find((row) => row.id === confirmation.id)?.name ?? {
                  en: "",
                  te: "",
                },
                language,
              )}
            </p>
          )}
          <div className={styles.buttons}>
            <button
              type="button"
              onClick={() => {
                confirmRef.current?.close();
                setConfirmation(null);
              }}
            >
              {text.keep}
            </button>
            <button type="button" className={styles.primary} onClick={confirmChange}>
              {confirmation?.kind === "discard" ? text.discard : text.confirm}
            </button>
          </div>
        </dialog>
        <dialog
          ref={addRef}
          className={styles.dialog}
          aria-labelledby="chandas-add-title"
          onCancel={() => setAddition(null)}
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              addHousehold();
            }}
          >
            <h3 id="chandas-add-title">{text.addTitle}</h3>
            {addition && (
              <fieldset disabled={!canEdit}>
                <legend className={styles.srOnly}>{text.addTitle}</legend>
                <label htmlFor="chandas-placement">
                  {text.position}
                  <select
                    id="chandas-placement"
                    aria-label={text.position}
                    value={placement}
                    onChange={(event) =>
                      setPlacement(event.target.value as "end" | "position")
                    }
                  >
                    <option value="end">{text.end}</option>
                    <option value="position">{text.at}</option>
                  </select>
                </label>
                {placement === "position" && (
                  <label htmlFor="chandas-position">
                    {text.positionNumber}
                    <input
                      id="chandas-position"
                      aria-label={text.positionNumber}
                      type="number"
                      min={1}
                      max={draftRows.length + 1}
                      step={1}
                      value={position}
                      onChange={(event) => setPosition(event.target.value)}
                      aria-invalid={
                        addInvalid &&
                        (!Number.isInteger(Number(position)) ||
                          Number(position) < 1 ||
                          Number(position) > draftRows.length + 1)
                      }
                    />
                  </label>
                )}
                <div className={styles.preview}>
                  <strong>{text.preview}</strong>
                  <p>
                    {householdDisplayName(addition.name, language) || text.name} —{" "}
                    {text.becomes} #
                    {placement === "end" ? draftRows.length + 1 : position}
                  </p>
                  {placement === "position" && draftRows[Number(position) - 1] ? (
                    <p>
                      #{position}{" "}
                      {householdDisplayName(
                        draftRows[Number(position) - 1].name,
                        language,
                      )}{" "}
                      → #{Number(position) + 1}. {text.shift}
                    </p>
                  ) : (
                    <p>{text.emptyEnd}</p>
                  )}
                  <p>{text.positionHelp}</p>
                </div>
                {fields(
                  addition,
                  (patch) =>
                    setAddition((previous) =>
                      previous ? { ...previous, ...patch } : null,
                    ),
                  addInvalid,
                  "new-household",
                )}
                {duplicateHouseholdIds([...draftRows, addition]).has(addition.id) && (
                  <p className={styles.warning}>{text.duplicates}</p>
                )}
              </fieldset>
            )}
            {addInvalid && (
              <p role="alert" className={styles.error}>
                {text.invalid} {text.invalidPosition} {draftRows.length + 1}.
              </p>
            )}
            <div className={styles.buttons}>
              <button
                type="button"
                onClick={() => {
                  addRef.current?.close();
                  setAddition(null);
                }}
              >
                {text.cancel}
              </button>
              <button
                type="submit"
                className={styles.primary}
                disabled={!canEdit || draftRows.length >= MAX_HOUSEHOLDS}
              >
                {text.addDraft}
              </button>
            </div>
          </form>
        </dialog>
      </div>
    </section>
  );
}
