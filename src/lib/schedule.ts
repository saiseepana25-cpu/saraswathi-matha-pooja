import { z } from "zod";

export const scheduleKeys = ["programme", "puja", "prasadam"] as const;
export type ScheduleKey = (typeof scheduleKeys)[number];
export const scheduleDates = ["2026-10-16", "2026-10-17", "2026-10-18"] as const;
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= max, "Text is too long.");
const bilingual = (max: number) => z.object({ en: text(max), te: text(max) }).strict();
const time = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
const entrySchema = z
  .object({
    id: z.uuid(),
    title: bilingual(200).nullable(),
    time,
    notes: bilingual(2000).nullable(),
    programmeEventId: z.uuid().nullable(),
  })
  .strict();
export type ScheduleEntry = z.infer<typeof entrySchema>;
export const sectionSchema = z
  .object({
    days: z
      .array(
        z
          .object({
            date: z.enum(scheduleDates),
            entries: z.array(entrySchema).max(100),
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    data.days.forEach((day, index) => {
      if (day.date !== scheduleDates[index])
        ctx.addIssue({
          code: "custom",
          path: ["days", index, "date"],
          message: "Keep the three festival dates in order.",
        });
      day.entries.forEach((entry, row) => {
        if (ids.has(entry.id))
          ctx.addIssue({
            code: "custom",
            path: ["days", index, "entries", row, "id"],
            message: "Entry IDs must be unique.",
          });
        ids.add(entry.id);
      });
    });
  });
export type SectionData = z.infer<typeof sectionSchema>;
export type ScheduleSnapshot = {
  data: Record<ScheduleKey, SectionData>;
  revisions: Record<ScheduleKey, number>;
  updatedAt: Record<ScheduleKey, string | null>;
};
export const saveScheduleSchema = z
  .object({
    section: z.enum(scheduleKeys),
    expectedRevision: z.number().int().min(0),
    operationId: z.uuid(),
    data: sectionSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    input.data.days.forEach((day, index) =>
      day.entries.forEach((entry, row) => {
        const linked = input.section === "puja" && entry.programmeEventId !== null;
        if (
          (input.section !== "puja" && entry.programmeEventId !== null) ||
          (linked && (entry.title !== null || entry.time !== null)) ||
          (!linked && entry.title === null)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["data", "days", index, "entries", row],
            message:
              "Independent entries require bilingual names; linked pujas inherit name and time.",
          });
        }
      }),
    );
  });
export type ScheduleSave = z.infer<typeof saveScheduleSchema>;
export function emptySection(): SectionData {
  return { days: scheduleDates.map((date) => ({ date, entries: [] })) };
}
export function emptySchedule(): ScheduleSnapshot {
  return {
    data: { programme: emptySection(), puja: emptySection(), prasadam: emptySection() },
    revisions: { programme: 0, puja: 0, prasadam: 0 },
    updatedAt: { programme: null, puja: null, prasadam: null },
  };
}
export function linksValid(data: ScheduleSnapshot["data"]) {
  return data.puja.days.every((day) => {
    const events =
      data.programme.days.find((item) => item.date === day.date)?.entries ?? [];
    return day.entries.every(
      (entry) =>
        !entry.programmeEventId ||
        events.some((event) => event.id === entry.programmeEventId),
    );
  });
}
export function resolveEntry(
  entry: ScheduleEntry,
  date: string,
  programme: SectionData,
): ScheduleEntry {
  if (!entry.programmeEventId) return entry;
  const event = programme.days
    .find((day) => day.date === date)
    ?.entries.find((item) => item.id === entry.programmeEventId);
  return { ...entry, title: event?.title ?? null, time: event?.time ?? null };
}
export function publicEntries(
  entries: ScheduleEntry[],
  date: string,
  programme: SectionData,
) {
  return entries
    .map((entry) => resolveEntry(entry, date, programme))
    .sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return a.time ? -1 : b.time ? 1 : 0;
    });
}

export function mergeScheduleSnapshots(
  current: ScheduleSnapshot,
  incoming: ScheduleSnapshot,
): ScheduleSnapshot {
  const result = {
    data: { ...current.data },
    revisions: { ...current.revisions },
    updatedAt: { ...current.updatedAt },
  };
  for (const section of scheduleKeys) {
    if (incoming.revisions[section] >= current.revisions[section]) {
      result.data[section] = incoming.data[section];
      result.revisions[section] = incoming.revisions[section];
      result.updatedAt[section] = incoming.updatedAt[section];
    }
  }
  return result;
}
