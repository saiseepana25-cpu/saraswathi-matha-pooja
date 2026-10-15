import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import {
  emptySchedule,
  type ScheduleSnapshot,
  type ScheduleEntry,
} from "../../src/lib/schedule";

const csrf = "b".repeat(64);
function event(): ScheduleEntry {
  return {
    id: crypto.randomUUID(),
    title: { en: "Morning programme", te: "ఉదయం కార్యక్రమం" },
    time: "09:30",
    notes: null,
    programmeEventId: null,
  };
}
async function mockApp(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  initial = emptySchedule(),
  expiresIn = 10_800_000,
) {
  let snapshot: ScheduleSnapshot = structuredClone(initial);
  const control = {
    user: {
      username: "mock-organiser",
      expiresAt: new Date(Date.now() + expiresIn).toISOString(),
    } as { username: string; expiresAt: string } | null,
    fail: "" as "" | "network" | "expired" | "conflict",
    saves: [] as {
      section: string;
      expectedRevision: number;
      operationId: string;
      data: unknown;
    }[],
    current: () => snapshot,
  };
  await context.addCookies([{ name: "saraswathi_csrf", value: csrf, url: baseURL }]);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: control.user } }),
  );
  await page.route("**/api/auth/login", (route) => {
    control.user = {
      username: "mock-organiser",
      expiresAt: new Date(Date.now() + 10_800_000).toISOString(),
    };
    return route.fulfill({ json: { user: control.user } });
  });
  await page.route("**/api/auth/logout", (route) => {
    control.user = null;
    return route.fulfill({ json: { user: null } });
  });
  await page.route("**/api/schedule", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { snapshot } });
    const body = route.request().postDataJSON();
    control.saves.push(body);
    expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
    const fail = control.fail;
    control.fail = "";
    if (fail === "network") return route.abort("failed");
    if (fail === "expired") {
      control.user = null;
      return route.fulfill({ status: 401, json: { error: "expired" } });
    }
    if (fail === "conflict") {
      snapshot.revisions.programme++;
      snapshot.data.programme.days[0].entries = [
        { ...event(), title: { en: "Newer published event", te: "తాజా కార్యక్రమం" } },
      ];
      return route.fulfill({ status: 409, json: { error: "conflict", snapshot } });
    }
    const section = body.section as keyof ScheduleSnapshot["data"];
    snapshot = {
      ...snapshot,
      data: { ...snapshot.data, [section]: body.data },
      revisions: { ...snapshot.revisions, [section]: snapshot.revisions[section] + 1 },
      updatedAt: { ...snapshot.updatedAt, [section]: new Date().toISOString() },
    };
    return route.fulfill({ json: { snapshot } });
  });
  await page.goto("/#programme");
  await expect(
    page.getByRole("button", { name: "Edit Programme details", exact: true }),
  ).toBeEnabled();
  return control;
}
async function names(page: Page, section: string, en: string, te: string) {
  const form = page.getByRole("form", { name: "Edit " + section, exact: true });
  await form.getByRole("button", { name: "+ Add entry", exact: true }).click();
  await form.getByLabel("Name (English) *", { exact: true }).last().fill(en);
  await form.getByLabel("Name (Telugu) *", { exact: true }).last().fill(te);
  return form;
}
test("programme saves all three dates, retains entries across tabs and survives refresh", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await mockApp(page, context, baseURL!);
  await page.getByRole("button", { name: "Edit Programme details", exact: true }).click();
  const form = await names(
    page,
    "Programme details",
    "First day event",
    "మొదటి రోజు కార్యక్రమం",
  );
  await form.getByRole("button", { name: "17 Oct", exact: true }).click();
  await names(page, "Programme details", "Second day event", "రెండవ రోజు కార్యక్రమం");
  await form.getByRole("button", { name: "16 Oct", exact: true }).click();
  await expect(form.getByLabel("Name (English) *", { exact: true })).toHaveValue(
    "First day event",
  );
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(control.current().data.programme.days[1].entries[0].title?.en).toBe(
    "Second day event",
  );
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByRole("tabpanel")).toContainText("Second day event");
  await page.reload();
  await expect(page.getByRole("tabpanel")).toContainText("First day event");
  await expect(
    page.getByRole("button", { name: "Edit Programme details", exact: true }),
  ).toBeVisible();
});
test("linked puja inherits programme details and prasadam publishes independently", async ({
  page,
  context,
  baseURL,
}) => {
  const initial = emptySchedule();
  initial.data.programme.days[0].entries.push(event());
  initial.revisions.programme = 1;
  const control = await mockApp(page, context, baseURL!, initial);
  await page.getByRole("button", { name: "Edit Daily puja", exact: true }).click();
  const puja = await names(page, "Daily puja", "Independent name", "పూజ");
  await puja.getByLabel("Link to a programme event", { exact: true }).check();
  await expect(puja.getByLabel("Name (English) *", { exact: true })).toHaveValue(
    "Morning programme",
  );
  await expect(puja.getByLabel("Name (English) *", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(puja.getByLabel("Time", { exact: true })).toHaveValue("09:30");
  await puja.getByRole("button", { name: "Save Daily puja", exact: true }).click();
  await expect(puja).not.toBeVisible();
  expect(control.current().data.puja.days[0].entries[0].title).toBeNull();
  await page.getByRole("button", { name: "Edit Prasadam", exact: true }).click();
  const prasadam = await names(page, "Prasadam", "Pulihora", "పులిహోర");
  await prasadam.getByLabel("Time not confirmed", { exact: true }).uncheck();
  await prasadam.getByLabel("Time", { exact: true }).fill("12:30");
  await prasadam.getByRole("button", { name: "Save Prasadam", exact: true }).click();
  await expect(prasadam).not.toBeVisible();
  await expect(page.locator("#puja-prasadam article").last()).toContainText("Pulihora");
  expect(control.current().revisions).toEqual({ programme: 1, puja: 1, prasadam: 1 });
});
test("validation and failed saves preserve drafts and retries keep the operation ID", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await mockApp(page, context, baseURL!);
  await page.getByRole("button", { name: "Edit Programme details", exact: true }).click();
  const form = page.getByRole("form", { name: "Edit Programme details", exact: true });
  await form.getByRole("button", { name: "+ Add entry", exact: true }).click();
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Review the highlighted fields");
  await form.getByLabel("Name (English) *", { exact: true }).fill("Retained event");
  await form.getByLabel("Name (Telugu) *", { exact: true }).fill("నిలిచిన కార్యక్రమం");
  control.fail = "network";
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Your entries are retained");
  await expect(form.getByLabel("Name (English) *", { exact: true })).toHaveValue(
    "Retained event",
  );
  await form
    .getByRole("button", { name: "Retry Save Programme details", exact: true })
    .click();
  await expect(form).not.toBeVisible();
  expect(control.saves).toHaveLength(2);
  expect(control.saves[0].operationId).toBe(control.saves[1].operationId);
});
test("expired save retains the editor, and reauthentication never automatically publishes", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await mockApp(page, context, baseURL!);
  await page.getByRole("button", { name: "Edit Programme details", exact: true }).click();
  const form = await names(page, "Programme details", "Pending draft", "డ్రాఫ్ట్");
  control.fail = "expired";
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Your session has expired");
  await dialog.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  await dialog.getByLabel("Password", { exact: true }).fill("Test@123");
  await dialog.getByRole("button", { name: "Sign in to continue", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(form.getByLabel("Name (English) *", { exact: true })).toHaveValue(
    "Pending draft",
  );
  expect(control.saves).toHaveLength(1);
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(control.saves).toHaveLength(2);
});
test("cancel and sign-out require confirmation before discarding draft entries", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await mockApp(page, context, baseURL!);
  await page.getByRole("button", { name: "Edit Programme details", exact: true }).click();
  const form = await names(
    page,
    "Programme details",
    "Keep this draft",
    "డ్రాఫ్ట్ ఉంచండి",
  );
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Discard unsaved changes?");
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(form.getByLabel("Name (English) *", { exact: true })).toHaveValue(
    "Keep this draft",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Sign out and discard changes?");
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(form).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes and sign out", exact: true })
    .click();
  await expect(form).not.toBeVisible();
  expect(control.saves).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Edit Programme details", exact: true }),
  ).toHaveCount(0);
});
test("conflicts require review before saving a draft over the latest revision", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await mockApp(page, context, baseURL!);
  await page.getByRole("button", { name: "Edit Programme details", exact: true }).click();
  const form = await names(page, "Programme details", "My reviewed draft", "నా డ్రాఫ్ట్");
  control.fail = "conflict";
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  await expect(form).toContainText("Newer published event");
  await expect(
    form.getByRole("button", { name: "Save Programme details", exact: true }),
  ).toBeDisabled();
  await form
    .getByRole("button", { name: "Keep my draft after review", exact: true })
    .click();
  await form.getByRole("button", { name: "Save Programme details", exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(control.saves[1].expectedRevision).toBe(1);
});
test("mobile Telugu editor and tighter hero image fit without horizontal overflow", async ({
  page,
  context,
  baseURL,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApp(page, context, baseURL!);
  await page.getByRole("button", { name: "తెలుగు", exact: true }).click();
  await page
    .getByRole("button", { name: "సవరించండి కార్యక్రమ వివరాలు", exact: true })
    .click();
  const form = page.getByRole("form", {
    name: "సవరించండి కార్యక్రమ వివరాలు",
    exact: true,
  });
  await form.getByRole("button", { name: "+ వివరాన్ని జోడించండి", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  ).toBe(false);
  const dimensions = await page.locator("#home img").evaluate((img) => {
    const image = img.getBoundingClientRect();
    const frame = img.parentElement!.getBoundingClientRect();
    return {
      gap: frame.width - image.width,
      height: image.height,
      frameWidth: frame.width,
      imageWidth: image.width,
    };
  });
  expect(dimensions.gap, JSON.stringify(dimensions)).toBeLessThanOrEqual(34);
  expect(dimensions.height).toBeLessThanOrEqual(320);
  await form.getByLabel("పేరు (ఇంగ్లీషు) *", { exact: true }).fill("Sample event");
  await form.getByLabel("పేరు (తెలుగు) *", { exact: true }).fill("నమూనా కార్యక్రమం");
  await form.screenshot({ path: test.info().outputPath("mobile-editor.png") });
});

test("automatic session expiry preserves unsaved entries until reauthentication", async ({
  page,
  context,
  baseURL,
}) => {
  await page.clock.install({ time: new Date() });
  const control = await mockApp(page, context, baseURL!, emptySchedule(), 5000);
  await page.getByRole("button", { name: "Edit Programme details", exact: true }).click();
  const form = await names(
    page,
    "Programme details",
    "Timer retained draft",
    "సమయం ముగిసినా డ్రాఫ్ట్",
  );
  await page.clock.fastForward(7000);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Your session has expired");
  await dialog.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  await dialog.getByLabel("Password", { exact: true }).fill("Test@123");
  await dialog.getByRole("button", { name: "Sign in to continue", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(form.getByLabel("Name (English) *", { exact: true })).toHaveValue(
    "Timer retained draft",
  );
  expect(control.saves).toHaveLength(0);
});
