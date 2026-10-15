import { z } from "zod";

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ORIGIN: z.url(),
    MONGODB_URI: z
      .string()
      .min(1)
      .refine((value) => /^mongodb(?:\+srv)?:\/\//.test(value)),
    MONGODB_DB: z.enum(["saraswathi_puja", "saraswathi_puja_test"]),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  })
  .superRefine((env, context) => {
    const production = env.APP_ENV === "production";
    const expectedDatabase = production ? "saraswathi_puja" : "saraswathi_puja_test";

    if (env.MONGODB_DB !== expectedDatabase) {
      context.addIssue({
        code: "custom",
        path: ["MONGODB_DB"],
        message: "The selected database must match the application environment.",
      });
    }

    let origin: URL;
    try {
      origin = new URL(env.APP_ORIGIN);
    } catch {
      // The URL schema already reports the invalid origin without exposing its value.
      return;
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      (origin.protocol !== "https:" &&
        !(origin.protocol === "http:" && local && !production))
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Use an HTTPS origin, or localhost HTTP for development.",
      });
    }

    if (env.VERCEL_ENV && (env.VERCEL_ENV === "production") !== production) {
      context.addIssue({
        code: "custom",
        path: ["APP_ENV"],
        message:
          "Preview deployments must use test data; production must use production data.",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof environmentSchema>;

export function parseServerEnvironment(source: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    // Never include rejected environment values or the connection URI in errors.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Configure valid server environment fields: ${fields.join(", ")}.`);
  }
  return result.data;
}
