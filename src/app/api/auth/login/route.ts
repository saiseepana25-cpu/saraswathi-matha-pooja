import type { NextRequest } from "next/server";
import { assertOrigin, failure, loginBody, reply, setCookies } from "@/server/auth/http";
import { signIn } from "@/server/auth/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const result = await signIn(request, await loginBody(request));
    const response = reply({ user: result.user });
    setCookies(response, result.token, result.csrf, result.expiresAt);
    return response;
  } catch (error) {
    return failure(error);
  }
}
