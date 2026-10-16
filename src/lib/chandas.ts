import { z } from "zod";

export const CHANDAS_PAGE_SIZE = 30;
export const MAX_HOUSEHOLDS = 1000;
export const MAX_RUPEES = Math.floor(Number.MAX_SAFE_INTEGER / 100);
export const contributionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pending") }).strict(),
  z.object({ type: z.literal("vigraham") }).strict(),
  z
    .object({
      type: z.literal("money"),
      amountRupees: z.number().int().positive().max(MAX_RUPEES),
    })
    .strict(),
]);
const name = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length <= 120, "Use at most 120 characters.");
export const householdSchema = z
  .object({
    id: z.uuid(),
    name: z
      .object({ en: name, te: name })
      .strict()
      .superRefine((value, ctx) => {
        if (!value.en && !value.te) {
          for (const language of ["en", "te"])
            ctx.addIssue({
              code: "custom",
              path: [language],
              message: "Enter a household name in English or Telugu.",
            });
        }
      }),
    contribution: contributionSchema,
  })
  .strict();
export type Household = z.infer<typeof householdSchema>;
export type ContributionType = Household["contribution"]["type"];
export const householdsSchema = z
  .array(householdSchema)
  .max(MAX_HOUSEHOLDS)
  .superRefine((rows, ctx) => {
    const ids = new Set<string>();
    rows.forEach((row, index) => {
      if (ids.has(row.id))
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Household IDs must be unique.",
        });
      ids.add(row.id);
    });
  });
export const saveChandasSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    operationId: z.uuid(),
    households: householdsSchema,
  })
  .strict();
export type ChandasSave = z.infer<typeof saveChandasSchema>;
export type ChandasSnapshot = {
  households: Household[];
  revision: number;
  updatedAt: string | null;
};
export const emptyChandas = (): ChandasSnapshot => ({
  households: [],
  revision: 0,
  updatedAt: null,
});

export const contributionFilters = [
  "all",
  "pending",
  "50-99",
  "100-199",
  "200-299",
  "300-399",
  "400-499",
  "500-999",
  "1000-1999",
  "2000+",
  "vigraham",
] as const;
export type ContributionFilter = (typeof contributionFilters)[number];
export type ChandasSort = "original" | "asc" | "desc";
export function normalizeName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-IN");
}
export function householdDisplayName(name: Household["name"], language: "en" | "te") {
  return name[language].trim() || name[language === "en" ? "te" : "en"].trim();
}
export function matchesContribution(row: Household, filter: ContributionFilter) {
  if (filter === "all") return true;
  if (filter === "pending" || filter === "vigraham")
    return row.contribution.type === filter;
  if (row.contribution.type !== "money") return false;
  const amount = row.contribution.amountRupees;
  if (filter === "2000+") return amount >= 2000;
  const [min, max] = filter.split("-").map(Number);
  return amount >= min && amount <= max;
}
export function browseHouseholds(
  rows: Household[],
  query: string,
  filter: ContributionFilter,
  sort: ChandasSort,
  language: "en" | "te",
) {
  const normalized = normalizeName(query);
  const result = rows
    .map((row, index) => ({ row, serial: index + 1 }))
    .filter(
      ({ row }) =>
        (!normalized ||
          normalizeName(row.name.en).includes(normalized) ||
          normalizeName(row.name.te).includes(normalized)) &&
        matchesContribution(row, filter),
    );
  if (sort !== "original") {
    const collator = new Intl.Collator(language === "te" ? "te-IN" : "en-IN", {
      sensitivity: "base",
      numeric: true,
    });
    result.sort(
      (a, b) =>
        (sort === "asc" ? 1 : -1) *
          collator.compare(
            householdDisplayName(a.row.name, language),
            householdDisplayName(b.row.name, language),
          ) || a.serial - b.serial,
    );
  }
  return result;
}
export function insertHousehold(rows: Household[], row: Household, position: number) {
  if (!Number.isInteger(position) || position < 1 || position > rows.length + 1)
    throw new Error("Invalid household position.");
  return [...rows.slice(0, position - 1), row, ...rows.slice(position - 1)];
}
export function duplicateHouseholdIds(rows: Pick<Household, "id" | "name">[]) {
  const groups = new Map<string, Set<string>>();
  for (const row of rows)
    for (const value of [row.name.en, row.name.te]) {
      const key = normalizeName(value);
      if (!key) continue;
      const ids = groups.get(key) ?? new Set<string>();
      ids.add(row.id);
      groups.set(key, ids);
    }
  return new Set(
    [...groups.values()].filter((ids) => ids.size > 1).flatMap((ids) => [...ids]),
  );
}

// Derive only from a complete published snapshot. BigInt keeps whole-rupee sums exact.
export function collectedChandasRupees(rows: readonly Household[]): bigint {
  return rows.reduce(
    (sum, row) =>
      row.contribution.type === "money"
        ? sum + BigInt(row.contribution.amountRupees)
        : sum,
    0n,
  );
}
