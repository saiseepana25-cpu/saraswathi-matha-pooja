import "server-only";
import { parseServerEnvironment } from "@/config/env";

export function getServerEnvironment() {
  return parseServerEnvironment(process.env);
}
