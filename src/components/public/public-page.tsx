"use client";

import Image from "next/image";
import { CelebrationGallery } from "@/components/gallery/gallery";
import { Chandas } from "@/components/chandas/chandas";
import { ScheduleSections } from "@/components/schedule/schedule-sections";
import { OrganiserAccess, useOrganiserAuth } from "@/components/auth/organiser-auth";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  announcementAt,
  announcementCheckDelay,
  type FestivalAnnouncement,
} from "@/lib/announcements";
import { PROJECT } from "@/config/project";
import {
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  publicCopy,
  type Language,
} from "@/lib/i18n/public-copy";
import { Icon } from "./icon";
import { DonationInformation } from "./donation-information";
import { CelebrationVenue } from "./celebration-venue";
import { OrganisingCommittee } from "./organising-committee";
import styles from "./public-page.module.css";

const dates = PROJECT.celebrationDays;
const navigation = [
  "programme",
  "pujaPrasadam",
  "chandas",
  "donation",
  "committee",
  "venue",
  "gallery",
] as const;
const sectionIds = {
  programme: "programme",
  pujaPrasadam: "puja-prasadam",
  chandas: "chandas",
  donation: "donation",
  committee: "committee",
  venue: "venue",
  gallery: "gallery",
};

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      {description && <p className={styles.sectionDescription}>{description}</p>}
    </div>
  );
}

export default function PublicPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [selectedDay, setSelectedDay] = useState<number>(16);

  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState<FestivalAnnouncement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const auth = useOrganiserAuth();
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const copy = publicCopy[language];

  useEffect(() => {
    // Defer reading a browser preference so server and initial client HTML agree.
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguage(saved)) setLanguage(saved);
      } catch {
        /* Reading still works when browser storage is unavailable. */
      }
    });
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(query.matches);
    const motionFrame = requestAnimationFrame(updateMotion);
    query.addEventListener("change", updateMotion);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(motionFrame);
      query.removeEventListener("change", updateMotion);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      const now = Date.now();
      setAnnouncement(announcementAt(now));
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, announcementCheckDelay(now));
    };
    const frame = requestAnimationFrame(refresh);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-page-section]");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target))
        setMoreOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [moreOpen]);

  function changeLanguage(next: Language) {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* The preference is optional. */
    }
  }

  function chooseDay(day: number, focus = false) {
    setSelectedDay(day);
    if (focus) document.getElementById(`day-tab-${day}`)?.focus();
  }

  function onDateKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowRight") next = dates[(index + 1) % dates.length];
    if (event.key === "ArrowLeft")
      next = dates[(index - 1 + dates.length) % dates.length];
    if (event.key === "Home") next = dates[0];
    if (event.key === "End") next = dates[dates.length - 1];
    if (next !== undefined) {
      event.preventDefault();
      chooseDay(next, true);
    }
  }

  return (
    <div className={styles.page} data-language={language}>
      <a href="#main-content" className={styles.skipLink}>
        {copy.skip}
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a
            href="#home"
            className={styles.brand}
            aria-label={`${copy.village} ${copy.brand} — ${copy.home}`}
          >
            <span className={styles.brandMark}>
              <Icon name="lotus" />
            </span>
            <span className={styles.brandText}>
              <span>{copy.village}</span>
              <strong>{copy.brand}</strong>
            </span>
          </a>
          <nav className={styles.desktopNav} aria-label={copy.navigation}>
            <a
              href="#home"
              aria-current={activeSection === "home" ? "location" : undefined}
            >
              {copy.home}
            </a>
            {navigation.map((key) => (
              <a
                key={key}
                href={`#${sectionIds[key]}`}
                aria-current={activeSection === sectionIds[key] ? "location" : undefined}
              >
                {copy[key]}
              </a>
            ))}
          </nav>
          <div className={styles.headerActions}>
            <div
              className={styles.languageSwitch}
              role="group"
              aria-label={copy.language}
            >
              <button
                type="button"
                lang="en"
                aria-pressed={language === "en"}
                onClick={() => changeLanguage("en")}
              >
                EN
              </button>
              <button
                type="button"
                lang="te"
                aria-pressed={language === "te"}
                onClick={() => changeLanguage("te")}
              >
                తెలుగు
              </button>
            </div>
            <OrganiserAccess language={language} />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {announcement && (
          <aside
            className={styles.announcement}
            aria-label={announcement.label[language]}
          >
            <div className={styles.announcementInner}>
              <span className={styles.announcementLabel}>
                <span className={styles.dot} />
                {announcement.label[language]}
              </span>
              <div className={styles.marqueeViewport}>
                <p
                  key={announcement.id}
                  className={styles.marquee}
                  data-paused={paused || reducedMotion}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {[false, true].map((duplicate) => (
                    <span
                      key={String(duplicate)}
                      className={styles.marqueeGroup}
                      aria-hidden={duplicate || undefined}
                    >
                      <span lang="en">{announcement.message.en}</span>
                      <span className={styles.marqueeOrnament} aria-hidden="true">
                        ✦
                      </span>
                      <span lang="te">{announcement.message.te}</span>
                      <span className={styles.marqueeOrnament} aria-hidden="true">
                        ✦
                      </span>
                    </span>
                  ))}
                </p>
              </div>
              <button
                type="button"
                className={styles.pauseButton}
                onClick={() => setPaused((value) => !value)}
                aria-label={paused ? copy.resumeAnnouncement : copy.pauseAnnouncement}
                aria-pressed={paused}
              >
                <Icon name={paused ? "play" : "pause"} />
                <span>{paused ? copy.resume : copy.pause}</span>
              </button>
            </div>
          </aside>
        )}

        <section
          id="home"
          data-page-section
          className={`${styles.container} ${styles.hero}`}
          aria-labelledby="welcome-heading"
        >
          <div className={styles.heroCopy}>
            <p className={styles.villageBadge}>
              <Icon name="pin" />
              {copy.villageLabel}
            </p>
            <h1 id="welcome-heading">{copy.heroTitle}</h1>
            {language === "en" && (
              <p className={styles.teluguTitle} lang="te">
                శ్రీ సరస్వతి పూజా మహోత్సవం 2026
              </p>
            )}
            <p className={styles.heroSubtitle}>{copy.heroSubtitle}</p>
            <div className={styles.dateFacts}>
              <div className={styles.dateFact}>
                <Icon name="calendar" />
                <div>
                  <span>{copy.festivalDates}</span>
                  <strong>{copy.dateRange}</strong>
                </div>
              </div>
              <div className={`${styles.dateFact} ${styles.mainDate}`}>
                <Icon name="sparkles" />
                <div>
                  <span>{copy.mainProgramme}</span>
                  <strong>{copy.mainDate}</strong>
                </div>
              </div>
            </div>
            <p className={styles.welcome}>{copy.welcome}</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#programme">
                <Icon name="calendar" />
                {copy.viewProgramme}
              </a>
              <a className={styles.secondaryButton} href="#chandas">
                <Icon name="book" />
                {copy.viewChandas}
              </a>
            </div>
          </div>
          <div className={styles.deviFrame}>
            <p className={styles.blessing} lang="te">
              ఓం శ్రీ సరస్వత్యై నమః
            </p>
            <Image
              src="/images/saraswathi-devi.png"
              alt={copy.imageAlt}
              width={456}
              height={817}
              sizes="(max-width: 700px) 280px, 374px"
              preload
              className={styles.deviImage}
            />
            <p className={styles.frameCaption}>
              <span aria-hidden="true">✦</span>
              {copy.blessing}
              <span aria-hidden="true">✦</span>
            </p>
          </div>
        </section>

        <section
          id="programme"
          data-page-section
          className={`${styles.container} ${styles.section}`}
          aria-labelledby="programme-heading"
        >
          <div id="programme-heading">
            <SectionHeading
              eyebrow={copy.programmeEyebrow}
              title={copy.programmeTitle}
              description={copy.programmeDescription}
            />
          </div>
          <div className={styles.dateTabs} role="tablist" aria-label={copy.datesLabel}>
            {dates.map((day, index) => (
              <button
                key={day}
                id={`day-tab-${day}`}
                type="button"
                role="tab"
                aria-selected={selectedDay === day}
                aria-controls="programme-panel"
                tabIndex={selectedDay === day ? 0 : -1}
                className={styles.dayTab}
                onClick={() => chooseDay(day)}
                onKeyDown={(event) => onDateKey(event, index)}
              >
                <span className={styles.dayNumber}>
                  {language === "en"
                    ? `${copy.day} 0${index + 1}`
                    : `${index + 1}వ ${copy.day}`}
                  {day === 16 && <Icon name="sparkles" />}
                </span>
                <strong>
                  {day} <span>{copy.octoberShort}</span>
                </strong>
                <span className={styles.dayCaption}>
                  {day === 16
                    ? copy.mainDay
                    : day === 18
                      ? copy.nimajjanamDay
                      : `${copy.day} ${index + 1}`}
                </span>
              </button>
            ))}
          </div>
          <ScheduleSections
            language={language}
            selectedDay={selectedDay}
            onDate={chooseDay}
          />
        </section>

        <Chandas language={language} />

        <section
          id="donation"
          data-page-section
          className={`${styles.container} ${styles.section}`}
          aria-labelledby="donation-heading"
        >
          <div id="donation-heading">
            <SectionHeading eyebrow={copy.donationEyebrow} title={copy.donationTitle} />
          </div>
          <DonationInformation language={language} />
        </section>

        <div className={`${styles.container} ${styles.communityGrid}`}>
          <section
            id="committee"
            data-page-section
            className={styles.communitySection}
            aria-labelledby="committee-heading"
          >
            <div id="committee-heading">
              <SectionHeading
                eyebrow={copy.committeeEyebrow}
                title={copy.committeeTitle}
              />
            </div>
            <OrganisingCommittee language={language} />
          </section>
          <section
            id="venue"
            data-page-section
            className={styles.communitySection}
            aria-labelledby="venue-heading"
          >
            <div id="venue-heading">
              <SectionHeading eyebrow={copy.venueEyebrow} title={copy.venueTitle} />
            </div>
            <CelebrationVenue language={language} />
          </section>
        </div>

        <CelebrationGallery language={language} />
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerTop}`}>
          <div>
            <a href="#home" className={styles.footerBrand}>
              <Icon name="lotus" />
              {copy.village} {copy.brand}
            </a>
            <p>{copy.dateRange}</p>
          </div>
          <a href="#home" className={styles.backToTop}>
            <Icon name="arrowUp" />
            {copy.backToTop}
          </a>
        </div>
        <div className={`${styles.container} ${styles.footerBottom}`}>
          <p>{copy.footerNote}</p>
          <span>{copy.footerBlessing}</span>
        </div>
      </footer>

      <nav className={styles.mobileNav} aria-label={copy.mobileNavigation}>
        {(
          [
            ["programme", "calendar"],
            ["chandas", "book"],
            ["gallery", "image"],
          ] as const
        ).map(([key, icon]) => (
          <a
            key={key}
            href={`#${key}`}
            aria-current={activeSection === key ? "location" : undefined}
            onClick={() => setMoreOpen(false)}
          >
            <Icon name={icon} />
            <span>{copy[key]}</span>
          </a>
        ))}
        <div className={styles.moreWrapper} ref={moreRef}>
          <button
            type="button"
            ref={moreButtonRef}
            aria-expanded={moreOpen}
            aria-controls="more-navigation"
            onClick={() => setMoreOpen((value) => !value)}
          >
            <Icon name={moreOpen ? "close" : "more"} />
            <span>{copy.more}</span>
          </button>
          {moreOpen && (
            <div
              id="more-navigation"
              className={styles.morePanel}
              aria-label={copy.moreNavigation}
            >
              <p>{copy.moreNavigation}</p>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  if (auth.user) void auth.logout();
                  else auth.openLogin();
                }}
              >
                {auth.user
                  ? language === "en"
                    ? "Sign out"
                    : "సైన్ అవుట్"
                  : copy.signIn}
              </button>
              {auth.user && <p>{auth.user.username}</p>}
              {(["home", "pujaPrasadam", "donation", "committee", "venue"] as const).map(
                (key) => (
                  <a
                    key={key}
                    href={`#${key === "home" ? "home" : sectionIds[key]}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    {copy[key]}
                    <Icon name="chevron" />
                  </a>
                ),
              )}
            </div>
          )}
        </div>
      </nav>

      <span className={styles.srOnly}>{PROJECT.name}</span>
    </div>
  );
}
