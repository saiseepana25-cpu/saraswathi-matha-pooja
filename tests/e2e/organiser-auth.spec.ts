import { emptyChandas } from "../../src/lib/chandas";
import { emptySchedule } from "../../src/lib/schedule";
import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/schedule", (route) =>
    route.fulfill({ json: { snapshot: emptySchedule() } }),
  );
});

test("sign-in validates fields, hides passwords and preserves the account on network failure", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: null } }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Organiser sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByText("This field is required.")).toHaveCount(2);
  await dialog.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  await dialog.getByLabel("Password", { exact: true }).fill("Test@123");
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await dialog.getByRole("button", { name: "Show password" }).click();
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await dialog.getByRole("button", { name: "Hide password" }).click();
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Unable to connect. Please try again.",
  );
  await expect(dialog.getByLabel("Organiser account", { exact: true })).toHaveValue(
    "mock-organiser",
  );
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("successful mocked login and logout update the header without navigating", async ({
  page,
  context,
  baseURL,
}) => {
  let user: { username: string; expiresAt: string } | null = null;
  await context.addCookies([
    { name: "saraswathi_csrf", value: "b".repeat(64), url: baseURL! },
  ]);
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/auth/login", async (route) => {
    user = {
      username: "mock-organiser",
      expiresAt: new Date(Date.now() + 10_800_000).toISOString(),
    };
    await route.fulfill({ json: { user } });
  });
  await page.route("**/api/auth/logout", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("b".repeat(64));
    user = null;
    await route.fulfill({ json: { user } });
  });
  await page.goto("/#programme");
  await page.getByRole("button", { name: "Organiser sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  await dialog.getByLabel("Password", { exact: true }).fill("Test@123");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#programme$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Organiser sign in", exact: true }),
  ).toBeVisible();
});

test("three-hour deadline opens reauthentication without automatically publishing", async ({
  page,
}) => {
  const now = new Date();
  await page.clock.install({ time: now });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: {
          username: "mock-organiser",
          expiresAt: new Date(now.getTime() + 5000).toISOString(),
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.clock.fastForward(6000);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Your session has expired");
  await expect(
    dialog.getByRole("button", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Updates are published only when you press Save.");
});

test("360px login fits English and Telugu and More exposes organiser access", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: null } }),
  );
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  for (const language of ["en", "te"] as const) {
    await page
      .getByRole("button", { name: language === "en" ? "EN" : "తెలుగు", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: language === "en" ? "Organiser sign in" : "నిర్వాహకుల ప్రవేశం",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
      true,
    );
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(360);
    await dialog
      .getByRole("button", {
        name: language === "en" ? "Close" : "మూసివేయి",
        exact: true,
      })
      .click();
  }
  await page
    .getByRole("navigation", { name: "మొబైల్ విభాగాలు" })
    .getByRole("button", { name: "మరిన్ని", exact: true })
    .click();
  await page
    .locator("#more-navigation")
    .getByRole("button", { name: "నిర్వాహకుల ప్రవేశం", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("cross-origin sign-in is rejected before touching authentication storage", async ({
  request,
}) => {
  const response = await request.post("/api/auth/login", {
    headers: { origin: "https://untrusted.example" },
    data: { username: "mock-organiser", password: "Test@123" },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: "forbidden" });
});

test("sign-in accepts provisionable Unicode passwords without UTF-16 truncation", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: null } }),
  );
  const submitted: string[] = [];
  await page.route("**/api/auth/login", async (route) => {
    submitted.push(route.request().postDataJSON().password);
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Organiser sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  const password = dialog.getByLabel("Password", { exact: true });
  for (const value of ["😀".repeat(8), "😀".repeat(15)]) {
    await password.pressSequentially(value);
    await expect(password).toHaveValue(value);
    await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Unable to connect. Please try again.",
    );
    await expect(password).toHaveValue("");
    expect(submitted.at(-1)).toBe(value);
  }
  await password.pressSequentially("a".repeat(15) + "b");
  await expect(password).toHaveValue("a".repeat(15));
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/chandas", (route) =>
    route.fulfill({ json: { snapshot: emptyChandas() } }),
  );
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/gallery", (route) =>
    route.fulfill({ json: { snapshot: { items: [], revision: 0, updatedAt: null } } }),
  );
});
