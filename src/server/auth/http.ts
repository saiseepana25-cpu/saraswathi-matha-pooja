import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnvironment } from "@/server/env";
import { cookieNames, isToken, trustedOrigin } from "./session-core";

export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
      Vary: "Cookie",
    },
  });
}
export function assertOrigin(request: NextRequest) {
  if (!trustedOrigin(request.headers, getServerEnvironment().APP_ORIGIN)) {
    throw new AuthError(403, "forbidden");
  }
}
export function tokens(request: NextRequest) {
  const names = cookieNames(process.env.APP_ENV === "production");
  return {
    token: request.cookies.get(names.session)?.value,
    csrf: request.cookies.get(names.csrf)?.value,
  };
}
export function setCookies(
  response: NextResponse,
  token: string,
  csrf: string,
  expires: Date,
) {
  const production = getServerEnvironment().APP_ENV === "production";
  const names = cookieNames(production);
  const options = { secure: production, sameSite: "strict" as const, path: "/", expires };
  response.cookies.set(names.session, token, { ...options, httpOnly: true });
  response.cookies.set(names.csrf, csrf, { ...options, httpOnly: false });
}
export function clearCookies(response: NextResponse) {
  const production = process.env.APP_ENV === "production";
  const names = cookieNames(production);
  for (const [type, name] of Object.entries(names)) {
    response.cookies.set(name, "", {
      path: "/",
      secure: production,
      sameSite: "strict",
      httpOnly: type === "session",
      expires: new Date(0),
      maxAge: 0,
    });
  }
  return response;
}
export function assertCsrf(request: NextRequest) {
  const { csrf } = tokens(request);
  if (!isToken(csrf) || request.headers.get("x-csrf-token") !== csrf)
    throw new AuthError(403, "forbidden");
}
export async function loginBody(
  request: NextRequest,
): Promise<{ username: string; password: string }> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new AuthError(415, "invalid");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, "invalid");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new AuthError(413, "invalid");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !data ||
      typeof data.username !== "string" ||
      typeof data.password !== "string" ||
      Object.keys(data).some((key) => !["username", "password"].includes(key))
    )
      throw new Error();
    return { username: data.username, password: data.password };
  } catch {
    throw new AuthError(400, "invalid");
  }
}
export function failure(error: unknown) {
  if (error instanceof AuthError) {
    const response = reply({ error: error.code }, error.status);
    if (error.status === 429)
      response.headers.set("Retry-After", String(error.retryAfter ?? 60));
    return response;
  }
  // Never serialize driver errors, passwords, hashes or environment settings.
  return reply({ error: "unavailable" }, 503);
}
