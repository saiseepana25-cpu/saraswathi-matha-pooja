import { MongoClient } from "mongodb";
import { parseServerEnvironment } from "../src/config/env";
import {
  hasOrganiser,
  normalizeUsername,
  provisionOrganiser,
  type OrganiserAccount,
} from "../src/server/auth/provision-organiser";
import { CredentialValidationError, validatePassword } from "../src/server/auth/password";
import {
  readHidden,
  readUsername,
  requireInteractiveTerminal,
  SetupCancelled,
  SetupInputError,
} from "./lib/terminal-input";

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run organizer:setup");
    console.log(
      "Creates the sole organiser interactively in the database configured in .env.local.",
    );
    console.log(
      "Passwords are hidden. Existing accounts are never changed. Ctrl+C cancels.",
    );
    return;
  }
  if (process.argv.length > 2)
    throw new SetupInputError(
      "Credentials must be entered at the prompts, not as command arguments.",
    );
  requireInteractiveTerminal(process.stdin, process.stdout);
  const env = parseServerEnvironment(process.env);
  const client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 10_000,
  });
  let password = "";
  let confirmation = "";
  try {
    await client.connect();
    const accounts = client.db(env.MONGODB_DB).collection<OrganiserAccount>("organisers");
    if (await hasOrganiser(accounts)) {
      console.log(
        "An organiser account already exists. No account or password was changed.",
      );
      return;
    }
    console.log("Create the sole website organiser in " + env.MONGODB_DB + ".");
    console.log("This is separate from your Atlas database user. Ctrl+C cancels.");
    const username = normalizeUsername(await readUsername(process.stdin, process.stdout));
    password = await readHidden(
      "Password (8–15 characters; typing hidden): ",
      process.stdin,
      process.stdout,
    );
    validatePassword(password);
    confirmation = await readHidden(
      "Confirm password (typing hidden): ",
      process.stdin,
      process.stdout,
    );
    if (password !== confirmation)
      throw new SetupInputError("Passwords do not match. No account was created.");
    const result = await provisionOrganiser(accounts, username, password);
    console.log(
      result === "created"
        ? "Organiser account created successfully. Keep your credentials private. Website login implementation is next."
        : "An organiser account already exists. No account or password was changed.",
    );
  } finally {
    password = "";
    confirmation = "";
    await client.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof SetupCancelled) {
    console.error("Setup cancelled. No further action was taken.");
    process.exitCode = 130;
  } else {
    // Raw driver and environment errors can contain private connection details.
    console.error(
      error instanceof SetupInputError || error instanceof CredentialValidationError
        ? error.message
        : "Setup did not complete. Check credentials, input requirements and Atlas connectivity. If a write was attempted, its outcome may be uncertain; rerun setup to check before trying recovery.",
    );
    process.exitCode = 1;
  }
});
