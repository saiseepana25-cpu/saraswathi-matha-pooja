// Explicit IST offset: the switch never depends on the server/browser timezone.
export const ANNADANAM_EXPIRES_AT = Date.parse("2026-10-18T00:00:00+05:30");
export const BANNER_EXPIRES_AT = Date.parse("2026-10-19T00:00:00+05:30");
const annadanam = {
  id: "annadanam",
  label: { en: "Annadanam announcement", te: "అన్నదానం ప్రకటన" },
  message: {
    en: "Annadanam: Saturday, 17 October 2026, at 12:00 noon IST.",
    te: "అన్నదానం: శనివారం, 17 అక్టోబర్ 2026 మధ్యాహ్నం 12 గంటలకు.",
  },
} as const;
const nimajjanam = {
  id: "nimajjanam",
  label: { en: "Nimajjanam announcement", te: "నిమజ్జన కార్యక్రమం ప్రకటన" },
  message: {
    en: "Saraswathi Nimajjanam: Sunday, 18 October 2026, at 5:00 PM IST.",
    te: "సరస్వతీ దేవి నిమజ్జన కార్యక్రమం: ఆదివారం, 18 అక్టోబర్ 2026 సాయంత్రం 5 గంటలకు.",
  },
} as const;
const combined = {
  id: "combined",
  label: { en: "Festival announcements", te: "ఉత్సవ ప్రకటనలు" },
  message: {
    en: annadanam.message.en + " • " + nimajjanam.message.en,
    te: annadanam.message.te + " • " + nimajjanam.message.te,
  },
} as const;
export type FestivalAnnouncement = typeof combined | typeof nimajjanam;
export function announcementAt(now: number): FestivalAnnouncement | null {
  if (now >= BANNER_EXPIRES_AT) return null;
  return now < ANNADANAM_EXPIRES_AT ? combined : nimajjanam;
}
export function announcementCheckDelay(now: number) {
  const boundary = now < ANNADANAM_EXPIRES_AT ? ANNADANAM_EXPIRES_AT : BANNER_EXPIRES_AT;
  const remaining = boundary - now;
  return remaining > 0 ? Math.min(60_000, remaining) : 60_000;
}
