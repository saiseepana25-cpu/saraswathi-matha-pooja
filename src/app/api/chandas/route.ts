import type { NextRequest } from "next/server";
import { saveChandasSchema } from "@/lib/chandas";
import { assertCsrf, assertOrigin, AuthError, failure, reply } from "@/server/auth/http";
import { requireOrganiser } from "@/server/auth/service";
import { getDatabase } from "@/server/db/mongodb";
import {
  ChandasConflict,
  ChandasTooLarge,
  readChandas,
  saveChandas,
  type ChandasDocument,
} from "@/server/chandas/store";
export const runtime = "nodejs";
const collection = async () =>
  (await getDatabase()).collection<ChandasDocument>("chandas");
export async function GET() {
  try {
    return reply({ snapshot: await readChandas(await collection()) });
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
          throw new AuthError(413, "tooLarge");
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
    const parsed = saveChandasSchema.safeParse(body);
    if (!parsed.success)
      return reply(
        {
          error: "validation",
          fields: parsed.error.issues
            .slice(0, 100)
            .map((issue) => ({ path: issue.path.join("."), message: issue.message })),
          truncated: parsed.error.issues.length > 100,
        },
        422,
      );
    return reply(await saveChandas(await collection(), parsed.data));
  } catch (error) {
    if (error instanceof ChandasConflict)
      return reply({ error: error.code, snapshot: error.snapshot }, 409);
    if (error instanceof ChandasTooLarge) return reply({ error: "tooLarge" }, 413);
    return failure(error);
  }
}
