"use client";

import Image from "next/image";
import { ScheduleSections } from "@/components/schedule/schedule-sections";
import { OrganiserAccess, useOrganiserAuth } from "@/components/auth/organiser-auth";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { PROJECT } from "@/config/project";
import {
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  publicCopy,
  type Language,
} from "@/lib/i18n/public-copy";
import { Icon, type IconName } from "./icon";
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

function EmptyState({
  icon,
  title,
  description,
  children,
  compact = false,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.emptyState} ${compact ? styles.compactEmpty : ""}`}>
      <span className={styles.iconDisc}>
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

export default function PublicPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [selectedDay, setSelectedDay] = useState<number>(16);
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
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
        <aside className={styles.announcement} aria-label={copy.announcementLabel}>
          <div className={styles.announcementInner}>
            <span className={styles.announcementLabel}>
              <span className={styles.dot} />
              {copy.announcementLabel}
            </span>
            <div className={styles.marqueeViewport}>
              <p className={styles.marquee} data-paused={paused || reducedMotion}>
                {copy.announcement}
                <span className={styles.marqueeOrnament} aria-hidden="true">
                  ✦
                </span>
                <span aria-hidden="true">{copy.announcement}</span>
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
                  {day === 16 ? copy.mainDay : `${copy.day} ${index + 1}`}
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

        <section
          id="chandas"
          data-page-section
          className={styles.tintedSection}
          aria-labelledby="chandas-heading"
        >
          <div className={styles.container}>
            <div id="chandas-heading">
              <SectionHeading
                eyebrow={copy.chandasEyebrow}
                title={copy.chandasTitle}
                description={copy.chandasDescription}
              />
            </div>
            <p className={styles.notice}>
              <Icon name="shield" />
              {copy.verification}
            </p>
            <div className={styles.chandasTools}>
              <div className={styles.searchCard}>
                <label htmlFor="household-search">{copy.searchLabel}</label>
                <div className={styles.searchField}>
                  <Icon name="search" />
                  <input
                    id="household-search"
                    type="search"
                    autoComplete="off"
                    placeholder={copy.searchPlaceholder}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-describedby="search-pending"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        document.getElementById("household-search")?.focus();
                      }}
                      aria-label={copy.clearSearch}
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.statCard}>
                <span>{copy.total}</span>
                <strong>{copy.unavailable}</strong>
              </div>
              <div className={styles.statCard}>
                <span>{copy.lastUpdated}</span>
                <strong>{copy.notUpdated}</strong>
              </div>
            </div>
            <div className={styles.surface}>
              <EmptyState
                icon="book"
                title={copy.householdsPending}
                description={copy.householdsDescription}
              />
              <p id="search-pending" className={styles.searchNote} role="status">
                {search ? copy.searchPending : copy.verification}
              </p>
            </div>
          </div>
        </section>

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

        <section
          id="gallery"
          data-page-section
          className={styles.tintedSection}
          aria-labelledby="gallery-heading"
        >
          <div className={styles.container}>
            <div id="gallery-heading">
              <SectionHeading eyebrow={copy.galleryEyebrow} title={copy.galleryTitle} />
            </div>
            <div className={styles.surface}>
              <EmptyState
                icon="image"
                title={copy.photosPending}
                description={copy.photosDescription}
              />
            </div>
          </div>
        </section>
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
