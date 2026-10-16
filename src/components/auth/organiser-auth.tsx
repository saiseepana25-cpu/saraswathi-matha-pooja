"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Language } from "@/lib/i18n/public-copy";
import { Icon } from "@/components/public/icon";
import styles from "./organiser-auth.module.css";

type User = { username: string; expiresAt: string };
type View = "login" | "expired" | "discard" | null;
type DraftGuard = {
  dirty: boolean;
  busy: boolean;
  discard: () => void;
  beforeLogout?: () => Promise<void>;
};

type AuthContextValue = {
  user: User | null;
  checking: boolean;
  view: View;
  busy: boolean;
  error: string;
  openLogin: () => void;
  close: () => void;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<string | null>;
  logout: (discard?: boolean) => Promise<void>;
  registerDraft: (key: string, guard: DraftGuard) => () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

const copy = {
  en: {
    signIn: "Organiser sign in",
    short: "Sign in",
    title: "Organiser sign in",
    description: "Sign in to manage festival information.",
    username: "Organiser account",
    password: "Password",
    show: "Show password",
    hide: "Hide password",
    close: "Close",
    loading: "Signing in…",
    logout: "Sign out",
    loggingOut: "Signing out…",
    public: "Visitors can browse without signing in.",
    credentials: "Account or password is incorrect.",
    unavailable: "Unable to connect. Please try again.",
    invalid: "Enter your account and password.",
    required: "This field is required.",
    limited: "Too many attempts. Please wait before trying again.",
    forbidden: "This request could not be verified. Refresh the page and try again.",
    expired: "Your session has expired",
    continue: "Sign in to continue",
    retained: "Your unsaved entries are retained while this page remains open.",
    reminder:
      "Signing in returns to the editor. Updates are published only when you press Save.",
    session: "Session expires three hours after sign-in. Activity does not extend it.",
    organiser: "Organiser",
    cancel: "Cancel",
    discardTitle: "Sign out and discard changes?",
    discardBody: "Your unsaved changes will be lost.",
    keep: "Keep editing",
    discard: "Discard changes and sign out",
    saving: "Please wait for the current save to finish.",
  },
  te: {
    signIn: "నిర్వాహకుల ప్రవేశం",
    short: "ప్రవేశం",
    title: "నిర్వాహకుల ప్రవేశం",
    description: "ఉత్సవ వివరాలను నిర్వహించడానికి ప్రవేశించండి.",
    username: "నిర్వాహక ఖాతా",
    password: "పాస్‌వర్డ్",
    show: "పాస్‌వర్డ్ చూపించు",
    hide: "పాస్‌వర్డ్ దాచు",
    close: "మూసివేయి",
    loading: "ప్రవేశిస్తోంది…",
    logout: "సైన్ అవుట్",
    loggingOut: "సైన్ అవుట్ అవుతోంది…",
    public: "సందర్శకులు ప్రవేశించకుండానే వివరాలను చూడవచ్చు.",
    credentials: "ఖాతా పేరు లేదా పాస్‌వర్డ్ సరికాదు.",
    unavailable: "కనెక్ట్ కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.",
    invalid: "ఖాతా పేరు మరియు పాస్‌వర్డ్ నమోదు చేయండి.",
    required: "ఈ వివరాన్ని నమోదు చేయండి.",
    limited: "చాలాసార్లు ప్రయత్నించారు. కొంత సమయం తర్వాత మళ్లీ ప్రయత్నించండి.",
    forbidden:
      "అభ్యర్థనను నిర్ధారించలేకపోయాము. పేజీని రిఫ్రెష్ చేసి మళ్లీ ప్రయత్నించండి.",
    expired: "మీ సెషన్ గడువు ముగిసింది",
    continue: "కొనసాగించడానికి ప్రవేశించండి",
    retained: "ఈ పేజీ తెరిచి ఉన్నంత వరకు సేవ్ చేయని వివరాలు ఉంటాయి.",
    reminder:
      "ప్రవేశించిన తర్వాత ఎడిటర్‌కు తిరిగి వస్తారు. సేవ్ చేసినప్పుడే వివరాలు ప్రచురించబడతాయి.",
    session:
      "ప్రవేశించిన మూడు గంటల తర్వాత సెషన్ ముగుస్తుంది. వినియోగంతో గడువు పొడిగించబడదు.",
    organiser: "నిర్వాహకుడు",
    cancel: "రద్దు",
    discardTitle: "సైన్ అవుట్ చేసి మార్పులను రద్దు చేయాలా?",
    discardBody: "సేవ్ చేయని మార్పులు కోల్పోతారు.",
    keep: "సవరణ కొనసాగించండి",
    discard: "మార్పులు రద్దు చేసి సైన్ అవుట్ చేయండి",
    saving: "ప్రస్తుతం సేవ్ పూర్తయ్యే వరకు వేచి ఉండండి.",
  },
};

export function csrfCookie() {
  const cookies = document.cookie.split(";").map((value) => value.trim());
  for (const name of ["__Host-saraswathi_csrf", "saraswathi_csrf"]) {
    const value = cookies
      .find((cookie) => cookie.startsWith(name + "="))
      ?.slice(name.length + 1);
    if (value && /^[a-f0-9]{64}$/.test(value)) return value;
  }
  return "";
}

export function OrganiserAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<User | null>(null);
  const generation = useRef(0);
  const draftGuards = useRef(new Map<string, DraftGuard>());
  const registerDraft = useCallback((key: string, guard: DraftGuard) => {
    draftGuards.current.set(key, guard);
    return () => {
      draftGuards.current.delete(key);
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if ([...draftGuards.current.values()].some((guard) => guard.dirty || guard.busy)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const refresh = useCallback(async () => {
    const version = generation.current;
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const result = (await response.json()) as { user: User | null };
      if (version !== generation.current) return;
      if (!result.user && current.current) setView("expired");
      current.current = result.user;
      setUser((previous) =>
        previous?.username === result.user?.username &&
        previous?.expiresAt === result.user?.expiresAt
          ? previous
          : result.user,
      );
    } catch {
      /* An offline request must not discard an active draft or claim logout. */
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void refresh();
    });
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(onFocus, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(
      () => {
        generation.current++;
        current.current = null;
        setUser(null);
        setView("expired");
      },
      Math.max(0, Date.parse(user.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [user]);

  async function login(username: string, password: string) {
    if (busy) return "unavailable";
    setBusy(true);
    setError("");
    generation.current++;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { user?: User; error?: string };
      if (!response.ok || !result.user) return result.error ?? "unavailable";
      generation.current++;
      current.current = result.user;
      setUser(result.user);
      setView(null);
      return null;
    } catch {
      return "unavailable";
    } finally {
      setBusy(false);
    }
  }
  async function logout(discard = false) {
    if ([...draftGuards.current.values()].some((guard) => guard.busy)) {
      setError("saving");
      return;
    }
    if (!discard && [...draftGuards.current.values()].some((guard) => guard.dirty)) {
      setView("discard");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    generation.current++;
    try {
      const csrf = csrfCookie();
      if (!csrf) {
        await refresh();
        return;
      }
      // Finish protected cleanup while cookies are valid; retain drafts until logout succeeds.
      for (const guard of draftGuards.current.values()) {
        await guard.beforeLogout?.();
      }
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": csrf },
      });
      if (!response.ok) {
        setError("unavailable");
        return;
      }
      generation.current++;
      current.current = null;
      draftGuards.current.forEach((guard) => guard.discard());
      setUser(null);
      setView(null);
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        checking,
        view,
        busy,
        error,
        refresh,
        login,
        logout,
        registerDraft,
        openLogin: () => {
          setError("");
          setView("login");
        },
        close: () => {
          if (!busy) setView(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useOrganiserAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Organiser authentication provider is missing.");
  return value;
}

export function OrganiserAccess({ language }: { language: Language }) {
  const auth = useOrganiserAuth();
  const text = copy[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const account = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState({ username: false, password: false });

  useEffect(() => {
    if (auth.view) {
      if (!dialog.current?.open) {
        previousFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.current?.showModal();
        account.current?.focus();
      }
    } else {
      dialog.current?.close();
    }
  }, [auth.view]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (auth.busy) return;
    const fields = { username: !username.trim(), password: !password };
    setMissing(fields);
    setError("");
    if (fields.username || fields.password) {
      (fields.username ? account : passwordInput).current?.focus();
      return;
    }
    const result = await auth.login(username, password);
    setPassword("");
    if (result) {
      setError(result);
      passwordInput.current?.focus();
    }
  }
  const message = (code: string) => text[code as keyof typeof text] ?? text.unavailable;
  return (
    <>
      <div className={styles.access}>
        {auth.user ? (
          <>
            <span className={styles.identity} title={text.session}>
              {text.organiser}: {auth.user.username}
            </span>
            <button
              type="button"
              className={styles.trigger}
              aria-label={auth.busy ? text.loggingOut : text.logout}
              onClick={() => void auth.logout()}
              disabled={auth.busy}
            >
              <Icon name="lock" />
              <span>{auth.busy ? text.loggingOut : text.logout}</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.trigger}
            onClick={auth.openLogin}
            aria-label={text.signIn}
            disabled={auth.checking}
          >
            <Icon name="lock" />
            <span>{text.short}</span>
          </button>
        )}
        {auth.error && auth.view !== "discard" && (
          <span role="alert" className={styles.headerError}>
            {message(auth.error)}
          </span>
        )}
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="organiser-dialog-title"
        aria-describedby="organiser-dialog-description"
        onCancel={(event) => {
          if (auth.busy) event.preventDefault();
          else auth.close();
        }}
        onClose={() => {
          auth.close();
          setPassword("");
          setVisible(false);
          setError("");
          setMissing({ username: false, password: false });
          if (previousFocus.current?.isConnected) previousFocus.current.focus();
        }}
      >
        <div className={styles.inner}>
          <button
            type="button"
            className={styles.close}
            aria-label={text.close}
            onClick={auth.close}
            disabled={auth.busy}
          >
            <Icon name="close" />
          </button>
          <span className={styles.symbol}>
            <Icon name="shield" />
          </span>
          <h2 id="organiser-dialog-title">
            {auth.view === "discard"
              ? text.discardTitle
              : auth.view === "expired"
                ? text.expired
                : text.title}
          </h2>
          <p id="organiser-dialog-description">
            {auth.view === "discard"
              ? text.discardBody
              : auth.view === "expired"
                ? text.retained
                : text.description}
          </p>
          {auth.view === "expired" && <p className={styles.notice}>{text.reminder}</p>}
          {auth.view === "discard" ? (
            <div>
              {auth.error && (
                <p role="alert" className={styles.error}>
                  {message(auth.error)}
                </p>
              )}
              <button
                type="button"
                className={styles.cancel}
                onClick={auth.close}
                disabled={auth.busy}
              >
                {text.keep}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void auth.logout(true)}
                disabled={auth.busy}
              >
                {auth.busy ? text.loggingOut : text.discard}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate aria-busy={auth.busy}>
              <label htmlFor="organiser-account">{text.username}</label>
              <input
                ref={account}
                id="organiser-account"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={32}
                disabled={auth.busy}
                required
                aria-invalid={missing.username}
                aria-describedby={missing.username ? "account-error" : undefined}
              />
              {missing.username && (
                <p id="account-error" className={styles.fieldError}>
                  {text.required}
                </p>
              )}
              <label htmlFor="organiser-password">{text.password}</label>
              <div className={styles.password}>
                <input
                  ref={passwordInput}
                  id="organiser-password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (Array.from(next).length <= 15) setPassword(next);
                  }}
                  // Fifteen Unicode code points can occupy thirty UTF-16 code units.
                  maxLength={30}
                  disabled={auth.busy}
                  required
                  aria-invalid={missing.password}
                  aria-describedby={missing.password ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setVisible((value) => !value)}
                  aria-label={visible ? text.hide : text.show}
                  aria-pressed={visible}
                  disabled={auth.busy}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {visible && <path d="m3 3 18 18" />}
                  </svg>
                </button>
              </div>
              {missing.password && (
                <p id="password-error" className={styles.fieldError}>
                  {text.required}
                </p>
              )}
              {error && (
                <p role="alert" className={styles.error}>
                  {message(error)}
                </p>
              )}
              <button className={styles.primary} type="submit" disabled={auth.busy}>
                {auth.busy
                  ? text.loading
                  : auth.view === "expired"
                    ? text.continue
                    : text.short}
              </button>
              {auth.view === "expired" && (
                <button
                  className={styles.cancel}
                  type="button"
                  onClick={auth.close}
                  disabled={auth.busy}
                >
                  {text.cancel}
                </button>
              )}
            </form>
          )}
          <p className={styles.publicNote}>{text.public}</p>
        </div>
      </dialog>
    </>
  );
}
