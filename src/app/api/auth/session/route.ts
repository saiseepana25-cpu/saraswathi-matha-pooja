import type { NextRequest } from "next/server";
import { failure, reply } from "@/server/auth/http";
import { currentOrganiser } from "@/server/auth/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    // A delayed probe must never erase cookies issued by a newer sign-in.
    return reply({ user: await currentOrganiser(request) });
  } catch (error) {
    return failure(error);
  }
}
