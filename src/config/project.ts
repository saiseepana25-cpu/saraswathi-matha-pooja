// Shared baseline limits from Database Design V1 and API Design V1.
export const PROJECT = {
  name: "Saraswathi Puja",
  timezone: "Asia/Kolkata",
  currency: "INR",
  celebrationStart: "2026-10-16",
  celebrationEnd: "2026-10-18",
  celebrationDays: [16, 17, 18],
  mainProgrammeDate: "2026-10-16",
  sessionSeconds: 10_800,
} as const;

export const LIMITS = {
  originalImageBytes: 5_000_000,
  mainImageBytes: 3_000_000,
  thumbnailBytes: 200_000,
  uploadBodyBytes: 3_400_000,
  jsonBodyBytes: 2_000_000,
  galleryItems: 30,
  households: 1_000,
  mediaBatchSeconds: 86_400,
} as const;

export const SECTION_KEYS = [
  "welcome",
  "announcement",
  "programme",
  "puja_prasadam",
  "committee",
  "venue",
  "donation",
] as const;
