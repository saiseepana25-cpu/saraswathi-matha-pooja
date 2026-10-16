import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import sharp from "sharp";
import { emptySchedule } from "../../src/lib/schedule";
import { emptyChandas } from "../../src/lib/chandas";
import {
  emptyGallery,
  type GallerySave,
  type GallerySnapshot,
  type GalleryItem,
} from "../../src/lib/gallery";
const section = (page: Page) => page.locator("#gallery");
const portrait = () =>
  sharp({ create: { width: 400, height: 700, channels: 3, background: "#b65370" } })
    .jpeg()
    .toBuffer();
const landscape = () =>
  sharp({ create: { width: 900, height: 500, channels: 3, background: "#d5a642" } })
    .jpeg()
    .toBuffer();
async function setup(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  count = 24,
  signedIn = true,
) {
  const small = await portrait(),
    wide = await landscape();
  const items: GalleryItem[] = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    mediaId: crypto.randomUUID(),
    publishedAt: "2026-10-16T00:00:00Z",
    width: index % 2 ? 900 : 400,
    height: index % 2 ? 500 : 700,
  }));
  let snapshot: GallerySnapshot = { ...emptyGallery(), items, revision: 1 };
  const uploads = new Map<string, { mediaId: string; width: number; height: number }>();
  const control = {
    signedIn,
    fail: "" as "" | "upload" | "save" | "expired" | "conflict" | "read",
    saves: [] as GallerySave[],
    uploadBodies: [] as Buffer[],
    current: () => snapshot,
    mediaFail: false,
  };
  const csrf = "c".repeat(64);
  await context.addCookies([{ name: "saraswathi_csrf", value: csrf, url: baseURL }]);
  await page.route("**/api/schedule", (r) =>
    r.fulfill({ json: { snapshot: emptySchedule() } }),
  );
  await page.route("**/api/chandas", (r) =>
    r.fulfill({ json: { snapshot: emptyChandas() } }),
  );
  const user = () => ({
    user: control.signedIn
      ? {
          username: "mock-organiser",
          expiresAt: new Date(Date.now() + 10800000).toISOString(),
        }
      : null,
  });
  await page.route("**/api/auth/session", (r) => r.fulfill({ json: user() }));
  await page.route("**/api/auth/login", (r) => {
    control.signedIn = true;
    return r.fulfill({ json: user() });
  });
  await page.route("**/api/auth/logout", (r) => {
    control.signedIn = false;
    return r.fulfill({ json: { user: null } });
  });
  await page.route("**/api/gallery**", async (r) => {
    const request = r.request(),
      path = new URL(request.url()).pathname;
    if (path.includes("/media/")) {
      if (control.mediaFail)
        return r.fulfill({ status: 404, json: { error: "notFound" } });
      const index = snapshot.items.findIndex((item) => path.endsWith(item.mediaId));
      return r.fulfill({ contentType: "image/jpeg", body: index % 2 ? wide : small });
    }
    if (path === "/api/gallery" && request.method() === "GET") {
      if (control.fail === "read")
        return r.fulfill({ status: 503, json: { error: "unavailable" } });
      return r.fulfill({ json: { snapshot } });
    }
    expect(request.headers()["x-csrf-token"]).toBe(csrf);
    if (request.method() === "DELETE") return r.fulfill({ json: { abandoned: true } });
    if (path === "/api/gallery/batches")
      return r.fulfill({ json: { batchId: request.postDataJSON().clientBatchId } });
    if (path.includes("/files/")) {
      if (control.fail === "upload") {
        control.fail = "";
        return r.abort("failed");
      }
      const bytes = request.postDataBuffer()!;
      control.uploadBodies.push(bytes);
      const form = await new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": request.headers()["content-type"] },
      }).formData();
      expect((form.get("main") as File).size).toBeLessThanOrEqual(3000000);
      expect((form.get("thumbnail") as File).size).toBeLessThanOrEqual(200000);
      let result = uploads.get(path);
      if (!result) {
        result = { mediaId: crypto.randomUUID(), width: 400, height: 700 };
        uploads.set(path, result);
      }
      return r.fulfill({ json: result });
    }
    const body = request.postDataJSON() as GallerySave;
    control.saves.push(body);
    if (control.fail === "expired") {
      control.fail = "";
      control.signedIn = false;
      return r.fulfill({ status: 401, json: { error: "expired" } });
    }
    if (control.fail === "conflict") {
      control.fail = "";
      snapshot = { ...snapshot, revision: snapshot.revision + 1 };
      return r.fulfill({ status: 409, json: { error: "conflict", snapshot } });
    }
    const next = body.items.map(
      (item) =>
        snapshot.items.find((old) => old.id === item.id) ?? {
          id: item.id,
          mediaId: item.mediaId,
          publishedAt: new Date().toISOString(),
          width: 400,
          height: 700,
        },
    );
    snapshot = {
      items: next,
      revision: snapshot.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (control.fail === "save") {
      control.fail = "";
      return r.abort("failed");
    }
    return r.fulfill({ json: { snapshot } });
  });
  await page.goto("/#gallery");
  await expect(
    section(page).getByRole("heading", { name: "Celebration Gallery", exact: true }),
  ).toBeVisible();
  await expect(
    section(page).getByRole("button", { name: "Edit gallery", exact: true }),
  ).toHaveCount(signedIn ? 1 : 0);
  await expect
    .poll(() =>
      section(page)
        .getByRole("button", { name: /^Open photo / })
        .count(),
    )
    .toBe(Math.min(count, 12));
  return control;
}
async function edit(page: Page) {
  await section(page).getByRole("button", { name: "Edit gallery", exact: true }).click();
}
async function select(page: Page, buffer: Buffer, name = "photo.jpg") {
  await section(page)
    .getByLabel("Add photos", { exact: true })
    .setInputFiles({ name, mimeType: "image/jpeg", buffer });
}
test("public gallery shows 12 at a time with full-size keyboard viewer and restored focus", async ({
  page,
  context,
  baseURL,
}) => {
  await setup(page, context, baseURL!, 24, false);
  expect(
    await section(page)
      .getByRole("button", { name: /^Open photo / })
      .count(),
  ).toBe(12);
  await section(page)
    .getByRole("button", { name: "Load more photos (+12)", exact: true })
    .click();
  await expect(section(page).getByRole("button", { name: /^Open photo / })).toHaveCount(
    24,
  );
  await expect(
    section(page).getByRole("button", { name: "Load more photos (+12)", exact: true }),
  ).toHaveCount(0);
  const first = section(page).getByRole("button", { name: "Open photo 1", exact: true });
  await first.click();
  const dialog = page.getByRole("dialog", { name: "Celebration Gallery", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveCSS("object-fit", "contain");
  await expect
    .poll(() =>
      dialog.evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      })),
    )
    .toEqual(page.viewportSize());
  await dialog.press("ArrowRight");
  await expect(dialog).toContainText("Photo 2 / 24");
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(first).toBeFocused();
});
test("organiser uploads a compressed photo and publishes only on Save", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  const original = Buffer.concat([await portrait(), Buffer.alloc(3100000)]);
  await select(page, original);
  expect(control.current().items).toHaveLength(24);
  expect(control.uploadBodies).toHaveLength(0);
  await expect(section(page)).toContainText("25 / 60 photos");
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(
    section(page).getByText("Gallery saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.current().items).toHaveLength(25);
  expect(control.uploadBodies).toHaveLength(1);
  expect(control.saves[0].items[0].selectionIndex).toBe(0);
  await page.reload();
  await expect(section(page)).toContainText("Showing 12 of 25 photos");
});
test("selection rejects originals above 7 MB, unsupported files and over-capacity selections", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!, 59);
  await edit(page);
  await select(page, Buffer.alloc(7000001), "too-large.jpg");
  await expect(section(page).getByRole("alert")).toContainText("7 MB");
  await section(page)
    .getByLabel("Add photos", { exact: true })
    .setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("bad"),
    });
  await expect(section(page).getByRole("alert")).toContainText("JPEG");
  const buffer = await portrait();
  await section(page)
    .getByLabel("Add photos", { exact: true })
    .setInputFiles([
      { name: "one.jpg", mimeType: "image/jpeg", buffer },
      { name: "two.jpg", mimeType: "image/jpeg", buffer },
    ]);
  await expect(section(page).getByRole("alert").first()).toContainText(
    "exceeds the available slots",
  );
  expect(control.uploadBodies).toHaveLength(0);
  await select(page, buffer);
  await expect(section(page)).toContainText("60 / 60 photos");
  await expect(
    section(page).getByRole("button", { name: "Add photos", exact: true }),
  ).toBeDisabled();
});
test("removal has Undo, needs confirmation and Cancel restores the published gallery", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await section(page)
    .getByRole("button", { name: "Remove photo 1", exact: true })
    .click();
  await expect(section(page)).toContainText("Pending removal");
  await section(page)
    .getByRole("button", { name: "Undo removal 1", exact: true })
    .click();
  await expect(section(page).getByText("Pending removal", { exact: true })).toHaveCount(
    0,
  );
  await section(page)
    .getByRole("button", { name: "Remove photo 1", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  expect(control.saves).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await section(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    section(page).getByRole("button", { name: "Edit gallery", exact: true }),
  ).toBeVisible();
  expect(control.current().items).toHaveLength(24);
  await edit(page);
  await section(page)
    .getByRole("button", { name: "Remove photo 1", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(
    section(page).getByText("Gallery saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.current().items).toHaveLength(23);
  expect(control.saves[0].confirmedRemovalIds).toHaveLength(1);
});
test("unknown save result locks draft edits and retries the exact operation without reuploading", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await select(page, await portrait());
  control.fail = "save";
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(section(page).getByRole("alert")).toContainText("could not be confirmed");
  await expect(
    section(page).getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await section(page).getByRole("button", { name: "Retry Save", exact: true }).click();
  await expect(
    section(page).getByText("Gallery saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.saves[1]).toEqual(control.saves[0]);
  expect(control.uploadBodies).toHaveLength(1);
});
test("expired session retains selections and requires explicit Save after sign-in", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await select(page, await portrait());
  control.fail = "expired";
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(section(page).getByRole("alert")).toContainText("session expired");
  const login = page.getByRole("dialog", {
    name: "Your session has expired",
    exact: true,
  });
  await login.getByLabel("Organiser account", { exact: true }).fill("mock-organiser");
  await login.getByLabel("Password", { exact: true }).fill("Mock@123");
  await login.getByRole("button", { name: "Sign in to continue", exact: true }).click();
  await expect(login).not.toBeVisible();
  expect(control.saves).toHaveLength(1);
  await section(page).getByRole("button", { name: "Retry Save", exact: true }).click();
  await expect(
    section(page).getByText("Gallery saved and published.", { exact: true }),
  ).toBeVisible();
});
test("conflicting publication retains the draft until an explicit discard and reload", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await select(page, await portrait());
  control.fail = "conflict";
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(section(page).getByRole("alert")).toContainText(
    "changed in another session",
  );
  await expect(
    section(page).getByRole("button", { name: "Save gallery", exact: true }),
  ).toBeDisabled();
  await expect(
    section(page).getByRole("heading", { name: "Latest published gallery", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await section(page)
    .getByRole("button", { name: "Discard draft and load latest", exact: true })
    .click();
  await expect(
    section(page).getByRole("button", { name: "Edit gallery", exact: true }),
  ).toBeVisible();
  expect(control.current().items).toHaveLength(24);
});
test("empty, failed image, read retry and narrow Telugu layouts remain usable", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!, 0, false);
  await expect(section(page)).toContainText("Celebration photos coming soon.");
  control.fail = "read";
  await page.reload();
  await expect(section(page).getByRole("alert")).toContainText("could not be loaded");
  control.fail = "";
  await section(page).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(section(page)).toContainText("Celebration photos coming soon.");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "తెలుగు", exact: true }).click();
  await expect(
    section(page).getByRole("heading", { name: "ఉత్సవ చిత్రాల గ్యాలరీ", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test("interrupted uploads preserve local selections and retry before publishing", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  await edit(page);
  await select(page, await portrait());
  control.fail = "upload";
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(section(page).getByRole("alert")).toContainText("could not be confirmed");
  expect(control.saves).toHaveLength(0);
  expect(control.current().items).toHaveLength(24);
  await expect(
    section(page).getByRole("button", { name: "Cancel", exact: true }),
  ).toBeEnabled();
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(
    section(page).getByText("Gallery saved and published.", { exact: true }),
  ).toBeVisible();
  expect(control.saves).toHaveLength(1);
  expect(control.current().items).toHaveLength(25);
});
test("broken image previews offer Retry and the full-size viewer handles image errors", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!);
  control.mediaFail = true;
  await page.reload();
  await section(page).scrollIntoViewIfNeeded();
  await expect(
    section(page).getByText("Photo could not be loaded.", { exact: true }).first(),
  ).toBeVisible();
  control.mediaFail = false;
  await section(page).getByRole("button", { name: "Retry", exact: true }).first().click();
  await expect(
    section(page).getByRole("button", { name: "Open photo 1", exact: true }),
  ).toBeVisible();
  control.mediaFail = true;
  await section(page).getByRole("button", { name: "Open photo 1", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Celebration Gallery", exact: true });
  await expect(viewer).toContainText("Photo could not be loaded.");
  control.mediaFail = false;
  await viewer.getByRole("button", { name: "Retry", exact: true }).click();
  await expect
    .poll(() =>
      viewer
        .locator("img")
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
});

test("lost batch creation responses do not exhaust staging after Cancel", async ({
  page,
  context,
  baseURL,
}) => {
  const control = await setup(page, context, baseURL!, 1);
  const openBatches = new Set<string>();
  const created: string[] = [];
  const abandoned: string[] = [];
  const csrf = "c".repeat(64);

  await page.route("**/api/gallery/batches", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
    const id = route.request().postDataJSON().clientBatchId as string;
    if (!openBatches.has(id) && openBatches.size >= 2) {
      return route.fulfill({ status: 409, json: { error: "stagingLimit" } });
    }
    openBatches.add(id);
    created.push(id);
    // Commit the mock batch, then lose its acknowledgement on the first two saves.
    if (created.length <= 2) return route.abort("failed");
    return route.fulfill({ json: { batchId: id } });
  });
  await page.route("**/api/gallery/batches/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    openBatches.delete(id);
    abandoned.push(id);
    return route.fulfill({ json: { abandoned: true } });
  });

  const photo = await portrait();
  for (let attempt = 0; attempt < 2; attempt++) {
    await edit(page);
    await select(page, photo);
    await section(page)
      .getByRole("button", { name: "Save gallery", exact: true })
      .click();
    await expect(section(page).getByRole("alert")).toContainText(
      "could not be confirmed",
    );
    await expect(
      section(page).getByRole("button", { name: "Cancel", exact: true }),
    ).toBeEnabled();
    expect(created).toHaveLength(attempt + 1);
    expect(control.saves).toHaveLength(0);
    expect(control.uploadBodies).toHaveLength(0);
    expect(control.current().items).toHaveLength(1);
    page.once("dialog", (dialog) => dialog.accept());
    await section(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.poll(() => abandoned.length).toBe(attempt + 1);
    expect(abandoned[attempt]).toBe(created[attempt]);
    expect(openBatches.size).toBe(0);
    await expect(
      section(page).getByRole("button", { name: "Edit gallery", exact: true }),
    ).toBeVisible();
  }

  await edit(page);
  await select(page, photo);
  await section(page).getByRole("button", { name: "Save gallery", exact: true }).click();
  await expect(
    section(page).getByText("Gallery saved and published.", { exact: true }),
  ).toBeVisible();
  expect(created).toHaveLength(3);
  expect(control.saves).toHaveLength(1);
  expect(control.uploadBodies).toHaveLength(1);
  expect(control.current().items).toHaveLength(2);
});

for (const failure of ["none", "cleanup", "logout"] as const) {
  test(
    "sign-out awaits gallery cleanup and preserves drafts on " + failure + " failure",
    async ({ page, context, baseURL }) => {
      const control = await setup(page, context, baseURL!, 1);
      const events: string[] = [];
      let fail: string = failure;
      await page.route("**/api/gallery/batches/*", async (route) => {
        if (route.request().method() !== "DELETE") return route.fallback();
        expect(control.signedIn).toBe(true);
        expect(route.request().headers()["x-csrf-token"]).toBe("c".repeat(64));
        await new Promise((resolve) => setTimeout(resolve, 100));
        events.push("cleanup");
        return route.fulfill({
          status: fail === "cleanup" ? 503 : 200,
          json: { abandoned: true },
        });
      });
      await page.route("**/api/auth/logout", async (route) => {
        events.push("logout");
        expect(events[0]).toBe("cleanup");
        if (fail === "logout")
          return route.fulfill({ status: 503, json: { error: "unavailable" } });
        control.signedIn = false;
        await context.clearCookies();
        return route.fulfill({ json: { user: null } });
      });
      await edit(page);
      await select(page, await portrait());
      control.fail = "upload";
      await section(page)
        .getByRole("button", { name: "Save gallery", exact: true })
        .click();
      await expect(section(page).getByRole("alert")).toContainText(
        "could not be confirmed",
      );
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Sign out and discard changes?",
        exact: true,
      });
      await dialog
        .getByRole("button", { name: "Discard changes and sign out", exact: true })
        .click();
      if (failure !== "none") {
        await expect(dialog.getByRole("alert")).toContainText("Unable to connect");
        expect(control.signedIn).toBe(true);
        expect(events).toEqual(
          failure === "cleanup" ? ["cleanup"] : ["cleanup", "logout"],
        );
        await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
        await expect(
          section(page).getByRole("button", { name: "Save gallery", exact: true }),
        ).toBeVisible();
        fail = "none";
        await section(page)
          .getByRole("button", { name: "Save gallery", exact: true })
          .click();
        await expect(
          section(page).getByText("Gallery saved and published.", { exact: true }),
        ).toBeVisible();
        expect(control.current().items).toHaveLength(2);
      } else {
        await expect(
          page.getByRole("button", { name: "Organiser sign in", exact: true }),
        ).toBeVisible();
        expect(events).toEqual(["cleanup", "logout"]);
        expect(control.saves).toHaveLength(0);
        expect(control.current().items).toHaveLength(1);
      }
    },
  );
}
