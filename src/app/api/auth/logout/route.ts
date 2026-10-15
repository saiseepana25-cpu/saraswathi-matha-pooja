import type { NextRequest } from "next/server";
import {
  assertCsrf,
  assertOrigin,
  clearCookies,
  failure,
  reply,
} from "@/server/auth/http";
import { signOut } from "@/server/auth/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    assertCsrf(request);
    await signOut(request);
    return clearCookies(reply({ user: null }));
  } catch (error) {
    return failure(error);
  }
}
