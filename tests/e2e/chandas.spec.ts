import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { emptySchedule } from "../../src/lib/schedule";
import {
  emptyChandas,
  type ChandasSnapshot,
  type ChandasSave,
  type Household,
} from "../../src/lib/chandas";

function households(): Household[] {
  return Array.from({ length: 130 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: {
      en: index === 0 ? "Sai" : index === 1 ? "Soman" : "Household " + (index + 1),
      te: "గృహం " + (index + 1),
    },
    contribution:
      index === 2
        ? { type: "money", amountRupees: 101 }
        : index === 3
          ? { type: "money", amountRupees: 501 }
          : index === 4
            ? { type: "vigraham" }
            : { type: "pending" },
  }));
}
async function setup(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  signedIn = true,
  initial = households(),
) {
  let snapshot: ChandasSnapshot = {
    households: initial,
    revision: 1,
    updatedAt: "2026-10-15T12:00:00Z",
  };
  const control = {
    signedIn,
    fail: "" as "" | "network" | "expired" | "conflict" | "read",
    saves: [] as ChandasSave[],
    current: () => snapshot,
  };
  const csrf = "d".repeat(64);
  await context.addCookies([{ name: "saraswathi_csrf", value: csrf, url: baseURL }]);
  await page.route("**/api/schedule", (route) =>
    route.fulfill({ json: { snapshot: emptySchedule() } }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: control.signedIn
          ? {
              username: "mock-organiser",
              expiresAt: new Date(Date.now() + 10_800_000).toISOString(),
            }
          : null,
      },
    }),
  );
  await page.route("**/api/auth/login", (route) => {
    control.signedIn = true;
    return route.fulfill({
      json: {
        user: {
          username: "mock-organiser",
          expiresAt: new Date(Date.now() + 10_800_000).toISOString(),
        },
      },
    });
  });
  await page.route("**/api/auth/logout", (route) => {
    control.signedIn = false;
    return route.fulfill({ json: { user: null } });
  });
  await page.route("**/api/chandas", (route) => {
    if (route.request().method() === "GET")
      return control.fail === "read"
        ? route.fulfill({ status: 503, json: { error: "unavailable" } })
        : route.fulfill({ json: { snapshot } });
    const body = route.request().postDataJSON() as ChandasSave;
    control.saves.push(body);
    expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
    const fail = control.fail;
    control.fail = "";
    if (fail === "network") return route.abort("failed");
    if (fail === "expired") {
      control.signedIn = false;
      return route.fulfill({ status: 401, json: { error: "expired" } });
    }
    if (fail === "conflict") {
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        households: snapshot.households.map((row, index) =>
          index === 0
            ? { ...row, name: { en: "Latest saved name", te: "తాజా పేరు" } }
            : row,
        ),
      };
      return route.fulfill({ status: 409, json: { error: "conflict", snapshot } });
    }
    snapshot = {
      households: body.households,
      revision: snapshot.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    return route.fulfill({ json: { snapshot } });
  });
  await page.goto("/#chandas");
  await expect(
    page.locator("#chandas").getByText("Showing 1–30 of 130 Households", { exact: true }),
  ).toBeVisible();
  return control;
}
const section = (page: Page) => page.locator("#chandas");
const rows = (page: Page) => section(page).locator("li[data-household-id]");
async function edit(page: Page) {
  await section(page).getByRole("button", { name: "Edit Chandas", exact: true }).click();
}

test("public pagination, search, filters and sorting preserve the full-list collected total", async ({
  page,
  context,
  baseURL,
}) => {
  await setup(page, context, baseURL!, false);
  expect(await rows(page).count()).toBe(30);
  await expect(
    section(page).getByRole("button", { name: "Edit Chandas", exact: true }),
  ).toHaveCount(0);
  const total = section(page).getByRole("region", {
    name: "Total amount collected",
    exact: true,
  });
  await expect(total).toHaveCount(1);
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page).getByRole("button", { name: "Page 5", exact: true }).click();
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).first()).toContainText("#121");
  await section(page).getByRole("searchbox").fill("Household 126");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("#126");
  await section(page).getByRole("button", { name: "Clear filters", exact: true }).click();
  await section(page)
    .getByLabel("Contribution filter", { exact: true })
    .selectOption("100-199");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("₹101");
  await section(page)
    .getByLabel("Contribution filter", { exact: true })
    .selectOption("500-999");
  await expect(rows(page)).toContainText("₹501");
  await section(page)
    .getByLabel("Contribution filter", { exact: true })
    .selectOption("vigraham");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("#5");
  await section(page).getByRole("button", { name: "Clear filters", exact: true }).click();
  await section(page).getByLabel("Sort by", { exact: true }).selectOption("desc");
  await expect(rows(page).first()).toContainText("Soman");
  await expect(rows(page).first()).toContainText("#2");
  await expect(total.getByRole("status")).toHaveText("₹602");
});

test("all-page edits survive language and browsing changes and publish together", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page).first().getByLabel("English name", { exact: true }).fill("Sai edited");
  await section(page).getByRole("button", { name: "Page 2", exact: true }).click();
  await rows(page)
    .first()
    .getByLabel("Contribution type", { exact: true })
    .selectOption("money");
  await rows(page)
    .first()
    .getByLabel("Amount (whole rupees) *", { exact: true })
    .fill("2001");
  await page.getByRole("button", { name: "తెలుగు", exact: true }).click();
  await expect(rows(page).first().getByRole("textbox").last()).toHaveValue("2001");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await section(page).getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(
    rows(page).first().getByLabel("English name", { exact: true }),
  ).toHaveValue("Sai edited");
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByText("Chandas saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.saves[0].households).toHaveLength(130);
  expect(control.saves[0].households[30].contribution).toEqual({
    type: "money",
    amountRupees: 2001,
  });
  await page.reload();
  await expect(rows(page).first()).toContainText("Sai edited");
});

test("insert at position two defaults Pending and shifts Soman without losing identity", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  const soman = control.current().households[1];
  await edit(page);
  await section(page)
    .getByRole("button", { name: "Add / Insert household", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add or insert household",
    exact: true,
  });
  await expect(dialog.getByLabel("Contribution type", { exact: true })).toHaveValue(
    "pending",
  );
  await dialog.getByLabel("English name", { exact: true }).fill("Kornakar");
  await dialog.getByLabel("Telugu name", { exact: true }).fill("కొర్నకార్");
  await dialog
    .getByLabel("Placement in original list", { exact: true })
    .selectOption("position");
  await dialog.getByLabel("Position number", { exact: true }).fill("2");
  await expect(dialog).toContainText("Soman → #3");
  await dialog.getByRole("button", { name: "Add as draft", exact: true }).click();
  await expect(rows(page).nth(1).getByLabel("English name", { exact: true })).toHaveValue(
    "Kornakar",
  );
  await expect(rows(page).nth(2).getByLabel("English name", { exact: true })).toHaveValue(
    "Soman",
  );
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByText("Chandas saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.current().households[2]).toEqual(soman);
  expect(control.current().households[1].contribution).toEqual({ type: "pending" });
});

test("changing money to Vigraham requires confirmation and removes the amount", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page)
    .nth(2)
    .getByLabel("Contribution type", { exact: true })
    .selectOption("vigraham");
  const dialog = page.getByRole("dialog", { name: "Confirm change", exact: true });
  await expect(dialog).toBeVisible();
  expect(control.saves).toHaveLength(0);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    rows(page).nth(2).getByLabel("Amount (whole rupees) *", { exact: true }),
  ).toHaveCount(0);
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByText("Chandas saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.current().households[2].contribution).toEqual({ type: "vigraham" });
});

test("invalid values block saving and network retry retains the operation identity and draft", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page)
    .first()
    .getByLabel("Contribution type", { exact: true })
    .selectOption("money");
  await rows(page)
    .first()
    .getByLabel("Amount (whole rupees) *", { exact: true })
    .fill("10.5");
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    rows(page).first().getByLabel("Amount (whole rupees) *", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(control.saves).toHaveLength(0);
  await rows(page)
    .first()
    .getByLabel("Amount (whole rupees) *", { exact: true })
    .fill("101");
  control.fail = "network";
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByRole("button", { name: "Retry Save", exact: true }),
  ).toBeVisible();
  await section(page).getByRole("button", { name: "Retry Save", exact: true }).click();
  await expect(
    section(page).getByText("Chandas saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.saves[0].operationId).toBe(control.saves[1].operationId);
});

test("cancel restores inserted households and sign-out confirms unsaved edits", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page)
    .first()
    .getByLabel("English name", { exact: true })
    .fill("Unsaved name");
  await section(page).getByRole("button", { name: "Cancel", exact: true }).click();
  let dialog = page.getByRole("dialog", {
    name: "Discard all unsaved Chandas changes?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    rows(page).first().getByLabel("English name", { exact: true }),
  ).toHaveValue("Unsaved name");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  dialog = page.getByRole("dialog", {
    name: "Sign out and discard changes?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await section(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Discard all unsaved Chandas changes?", exact: true })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(rows(page).first()).toContainText("Sai");
  await expect(rows(page).first()).not.toContainText("Unsaved name");
  expect(control.saves).toHaveLength(0);
});

test("conflict requires explicit review and a second Save", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page)
    .first()
    .getByLabel("English name", { exact: true })
    .fill("My retained draft");
  control.fail = "conflict";
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  const review = section(page).getByRole("region", {
    name: "Latest saved list — all households",
    exact: true,
  });
  await expect(review).toContainText("Latest saved name");
  await review
    .getByRole("button", { name: "Keep my full draft after review", exact: true })
    .click();
  expect(control.saves).toHaveLength(1);
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByText("Chandas saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.saves[1].expectedRevision).toBe(2);
});

test("expired save retains fields through reauthentication without publishing", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page)
    .first()
    .getByLabel("English name", { exact: true })
    .fill("Retained after expiry");
  control.fail = "expired";
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  await dialog.getByLabel("Password", { exact: true }).fill("MockPass@1");
  await dialog.getByRole("button", { name: "Sign in to continue", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    rows(page).first().getByLabel("English name", { exact: true }),
  ).toHaveValue("Retained after expiry");
  expect(control.saves).toHaveLength(1);
});

test("360px English and Telugu names, status badges and editor fit without overflow", async ({
  page,
  context,
  baseURL,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const initial = households();
  initial[0].name = {
    en: "A deliberately long village household name for wrapping completely",
    te: "శ్రీ రిట్టపాడు గ్రామ కుటుంబ పెద్ద సత్యనారాయణ మూర్తి",
  };
  initial[0].contribution = { type: "vigraham" };
  await setup(page, context, baseURL!, true, initial);
  for (const language of ["తెలుగు", "EN"]) {
    await page.getByRole("button", { name: language, exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    ).toBe(false);
    const clipped = await rows(page)
      .first()
      .evaluate((element) =>
        [...element.querySelectorAll("strong,span")].some(
          (item) => item.scrollWidth > item.clientWidth + 1,
        ),
      );
    expect(clipped).toBe(false);
  }
  await rows(page)
    .first()
    .screenshot({ path: test.info().outputPath("chandas-mobile-household.png") });
  await edit(page);
  await section(page).getByRole("searchbox").fill("A deliberately");
  await section(page).screenshot({
    path: test.info().outputPath("chandas-mobile-editor.png"),
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  ).toBe(false);
});

test("removing a household is a confirmed draft and Cancel restores it", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await rows(page)
    .first()
    .getByRole("button", { name: "Remove household #1", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm change", exact: true })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    rows(page).first().getByLabel("English name", { exact: true }),
  ).toHaveValue("Soman");
  await section(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Discard all unsaved Chandas changes?", exact: true })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(rows(page).first()).toContainText("Sai");
  expect(control.saves).toHaveLength(0);
});

test("temporary loading failure is not shown as an empty confirmed list", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  control.fail = "read";
  await page.reload();
  await expect(section(page).getByRole("alert")).toContainText("could not be loaded");
  await expect(
    section(page).getByText("Household list coming soon", { exact: true }),
  ).toHaveCount(0);
  control.fail = "";
  await section(page).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(rows(page)).toHaveCount(30);
});

test("an empty database has no invented names and allows the organiser to add a Pending household", async ({
  page,
  context,
  baseURL,
}) => {
  // setup's ready assertion is for 130 households, so replace only the content route after setup.
  const control = await setup(page, context, baseURL!);
  await page.route("**/api/chandas", (route) =>
    route.fulfill({ json: { snapshot: emptyChandas() } }),
  );
  await page.reload();
  await expect(
    section(page).getByText("Household list coming soon", { exact: true }),
  ).toBeVisible();
  await edit(page);
  await section(page)
    .getByRole("button", { name: "Add / Insert household", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add or insert household",
    exact: true,
  });
  await expect(dialog.getByLabel("Contribution type", { exact: true })).toHaveValue(
    "pending",
  );
  await expect(dialog.getByLabel("Amount (whole rupees) *", { exact: true })).toHaveCount(
    0,
  );
  expect(control.saves).toHaveLength(0);
});

test("single-language households can be added and edited, with public fallback and blank-name rejection", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await section(page)
    .getByRole("button", { name: "Add / Insert household", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add or insert household" });
  await dialog.getByLabel("English name", { exact: true }).fill("English only household");
  await dialog.getByRole("button", { name: "Add as draft", exact: true }).click();
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByRole("button", { name: "Edit Chandas", exact: true }),
  ).toBeVisible();
  const target = section(page).locator(
    'li[data-household-id="' + control.current().households.at(-1)!.id + '"]',
  );
  expect(control.current().households.at(-1)?.name).toEqual({
    en: "English only household",
    te: "",
  });
  await section(page).getByRole("searchbox").fill("English only household");
  await page.getByRole("button", { name: "తెలుగు", exact: true }).click();
  await expect(target.locator("strong")).toHaveText("English only household");
  await expect(target.locator("strong")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await edit(page);
  await target.getByLabel("English name", { exact: true }).fill("");
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  expect(control.saves).toHaveLength(1);
  await expect(target.getByLabel("English name", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await target.getByLabel("Telugu name", { exact: true }).fill("తెలుగు గృహం");
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByRole("button", { name: "Edit Chandas", exact: true }),
  ).toBeVisible();
  await section(page).getByRole("searchbox").fill("తెలుగు గృహం");
  await expect(target.locator("strong")).toHaveText("తెలుగు గృహం");
  await expect(target.locator("strong")).toHaveAttribute("lang", "te");
  expect(control.current().households.at(-1)?.name).toEqual({
    en: "",
    te: "తెలుగు గృహం",
  });
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/gallery", (route) =>
    route.fulfill({ json: { snapshot: { items: [], revision: 0, updatedAt: null } } }),
  );
});

test("published total stays fixed through drafts and failed saves, then reflects saved corrections, Vigraham and removals", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  const total = section(page).getByRole("region", {
    name: "Total amount collected",
    exact: true,
  });
  await expect(total.getByRole("status")).toHaveText("₹602");
  await edit(page);
  await rows(page)
    .nth(2)
    .getByLabel("Amount (whole rupees) *", { exact: true })
    .fill("701");
  await expect(total.getByRole("status")).toHaveText("₹602");
  await expect(total).toContainText("Total updates after Save Chandas succeeds.");
  control.fail = "network";
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(
    section(page).getByRole("button", { name: "Retry Save", exact: true }),
  ).toBeVisible();
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page).getByRole("button", { name: "Retry Save", exact: true }).click();
  await expect(total.getByRole("status")).toHaveText("₹1,202");
  await edit(page);
  await rows(page)
    .nth(3)
    .getByLabel("Contribution type", { exact: true })
    .selectOption("vigraham");
  await page
    .getByRole("dialog", { name: "Confirm change", exact: true })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(total.getByRole("status")).toHaveText("₹1,202");
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(total.getByRole("status")).toHaveText("₹701");
  await edit(page);
  await rows(page)
    .nth(2)
    .getByRole("button", { name: "Remove household #3", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm change", exact: true })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(total.getByRole("status")).toHaveText("₹701");
  await section(page).getByRole("button", { name: "Save Chandas", exact: true }).click();
  await expect(total.getByRole("status")).toHaveText("₹0");
});
test("one global total survives search, ranges, pagination, language switching and Cancel on 360px", async ({
  page,
  context,
  baseURL,
}) => {
  await setup(page, context, baseURL!);
  await page.setViewportSize({ width: 360, height: 800 });
  const total = section(page).getByRole("region", {
    name: "Total amount collected",
    exact: true,
  });
  await section(page).getByRole("button", { name: "Page 5", exact: true }).click();
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page).getByRole("searchbox").fill("Household 129");
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page).getByRole("button", { name: "Clear filters", exact: true }).click();
  await section(page)
    .getByLabel("Contribution filter", { exact: true })
    .selectOption("500-999");
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page)
    .getByLabel("Contribution filter", { exact: true })
    .selectOption("pending");
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page)
    .getByLabel("Contribution filter", { exact: true })
    .selectOption("vigraham");
  await expect(total.getByRole("status")).toHaveText("₹602");
  await section(page).getByRole("button", { name: "Clear filters", exact: true }).click();
  await edit(page);
  await rows(page)
    .nth(2)
    .getByLabel("Amount (whole rupees) *", { exact: true })
    .fill("9999");
  await section(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Discard all unsaved Chandas changes?", exact: true })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(total.getByRole("status")).toHaveText("₹602");
  await page.getByRole("button", { name: "తెలుగు", exact: true }).click();
  const telugu = section(page).getByRole("region", {
    name: "మొత్తం వసూలైన చందాలు",
    exact: true,
  });
  await expect(telugu).toHaveCount(1);
  await expect(telugu.getByRole("status")).toHaveText("₹602");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});
test("total loading and read failure never display a fabricated zero", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route("**/api/chandas", async (route) => {
    await gate;
    return fail
      ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.fulfill({ json: { snapshot: control.current() } });
  });
  await page.reload();
  const total = section(page).getByRole("region", {
    name: "Total amount collected",
    exact: true,
  });
  await expect(total.getByRole("status")).toHaveText("Loading total…");
  await expect(total).not.toContainText("₹0");
  release();
  await expect(total.getByRole("status")).toHaveText("Total unavailable");
  await expect(total).not.toContainText("₹0");
  fail = false;
  await section(page).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(total.getByRole("status")).toHaveText("₹602");
});
