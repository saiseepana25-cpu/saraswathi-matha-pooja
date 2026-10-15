import type { NextRequest } from "next/server";
import { saveScheduleSchema } from "@/lib/schedule";
import { assertCsrf, assertOrigin, AuthError, failure, reply } from "@/server/auth/http";
import { requireOrganiser } from "@/server/auth/service";
import { getDatabase } from "@/server/db/mongodb";
import {
  readSchedule,
  saveSchedule,
  ScheduleConflict,
  ScheduleTooLarge,
  type ScheduleDocument,
} from "@/server/schedule/store";
export const runtime = "nodejs";
const collection = async () =>
  (await getDatabase()).collection<ScheduleDocument>("content_sections");
export async function GET() {
  try {
    return reply({ snapshot: await readSchedule(await collection()) });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest) {
  try {
    assertOrigin(request);
    assertCsrf(request);
    await requireOrganiser(request);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
      throw new AuthError(415, "invalid");
    const reader = request.body?.getReader();
    if (!reader) throw new AuthError(400, "invalid");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_000_000) {
          await reader.cancel();
          throw new AuthError(413, "invalid");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AuthError(400, "invalid");
    }
    const parsed = saveScheduleSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error: "validation",
          fields: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        422,
      );
    return reply(await saveSchedule(await collection(), parsed.data));
  } catch (error) {
    if (error instanceof ScheduleTooLarge) return reply({ error: "tooLarge" }, 413);
    if (error instanceof ScheduleConflict)
      return reply({ error: error.code, snapshot: error.snapshot }, 409);
    return failure(error);
  }
}
