import { emptySchedule } from "../../src/lib/schedule";
import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/schedule", (route) =>
    route.fulfill({ json: { snapshot: emptySchedule() } }),
  );
});

test("public sections show truthful pending content without sample records", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Rittapadu Saraswathi Puja 2026",
  );
  for (const id of [
    "programme",
    "puja-prasadam",
    "chandas",
    "donation",
    "committee",
    "venue",
    "gallery",
  ]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await expect(
    page.getByText("Household list coming soon", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not yet available", { exact: true })).toBeVisible();
  await expect(page.getByText("Not updated yet", { exact: true })).toBeVisible();
  await expect(page.locator("#chandas")).not.toContainText("₹0");
  await expect(page.getByRole("link", { name: /Google Maps/ })).toHaveCount(0);
  await expect(page.locator("#gallery img")).toHaveCount(0);
});

test("language switching preserves the selected date and search and remembers preference", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab").nth(2).click();
  await page.getByRole("searchbox").fill("Rittapadu కుటుంబం");
  await page.getByRole("button", { name: "తెలుగు", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
  await expect(page.getByRole("tab").nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("18 అక్టోబర్ 2026");
  await expect(page.getByRole("searchbox")).toHaveValue("Rittapadu కుటుంబం");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Rittapadu శ్రీ సరస్వతి పూజ 2026",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("date tabs support keyboard selection and keep puja and prasadam in sync", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByText("16–18 October 2026", { exact: true })).toHaveCount(2);
  const first = page.getByRole("tab").first();
  await first.focus();
  await first.press("End");
  await expect(page.getByRole("tab").last()).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("18 October 2026");
  await expect(page.locator("#puja-prasadam article").first()).toContainText(
    "18 October 2026",
  );
  await expect(page.locator("#puja-prasadam article").last()).toContainText(
    "18 October 2026",
  );
  await page.getByRole("tab").last().press("ArrowRight");
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#puja-prasadam article")).toHaveCount(2);
});

test("announcement can be paused and reduced motion disables animation", async ({
  page,
}) => {
  await page.goto("/");
  const pause = page.getByRole("button", { name: "Pause announcement", exact: true });
  await pause.click();
  const resume = page.getByRole("button", { name: "Resume announcement", exact: true });
  await expect(resume).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-paused]")).toHaveAttribute("data-paused", "true");
  await resume.click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-paused]")).toHaveCSS("animation-name", "none");
});

test("organiser entry shows the login form and restores focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Organiser sign in", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Sign in to manage festival information.",
  );
  await expect(
    page.getByRole("dialog").getByLabel("Organiser account", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByLabel("Password", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("360px layouts fit both languages and mobile More navigation works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  for (const language of ["en", "te"] as const) {
    await page
      .getByRole("button", { name: language === "en" ? "EN" : "తెలుగు", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  }
  const mobileNav = page.getByRole("navigation", { name: "మొబైల్ విభాగాలు" });
  await mobileNav.getByRole("button", { name: "మరిన్ని", exact: true }).click();
  await expect(page.locator("#more-navigation")).toBeVisible();
  await page
    .locator("#more-navigation")
    .getByRole("link", { name: "వేదిక", exact: true })
    .click();
  await expect(page).toHaveURL(/#venue$/);
  await expect(page.locator("#more-navigation")).toHaveCount(0);
});

test("donation QR displays original image and accessible modal in both languages", async ({
  page,
}) => {
  await page.goto("/");
  for (const language of ["en", "te"] as const) {
    await page
      .getByRole("button", { name: language === "en" ? "EN" : "తెలుగు", exact: true })
      .click();
    const donation = page.locator("#donation");
    await expect(donation).toContainText("PINNINTI DINESH");
    await expect(donation.getByRole("link", { name: "88974 98853" })).toHaveAttribute(
      "href",
      "tel:+918897498853",
    );
    const image = donation.getByRole("img");
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("src", /\/donations\/pinninti-dinesh-qr\.jpg$/);
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth === 1080,
        ),
      )
      .toBe(true);
    await expect(donation.locator("a[download]")).toHaveAttribute(
      "href",
      /\/donations\/pinninti-dinesh-qr\.jpg$/,
    );
    const trigger = donation.getByRole("button", {
      name: language === "en" ? "Enlarge QR" : "క్యూఆర్ పెద్దగా చూడండి",
      exact: true,
    });
    await trigger.click();
    const modal = page.getByRole("dialog", {
      name: language === "en" ? "Scan to contribute" : "విరాళం కోసం స్కాన్ చేయండి",
      exact: true,
    });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("PINNINTI DINESH");
    await expect(modal.getByRole("img")).toHaveAttribute(
      "src",
      /\/donations\/pinninti-dinesh-qr\.jpg$/,
    );
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await modal
      .getByRole("button", {
        name: language === "en" ? "Close" : "మూసివేయండి",
        exact: true,
      })
      .last()
      .click();
    await expect(modal).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});

test("venue shows confirmed details and the organiser map link in both languages", async ({
  page,
}) => {
  await page.goto("/");
  for (const language of ["en", "te"] as const) {
    await page
      .getByRole("button", { name: language === "en" ? "EN" : "తెలుగు", exact: true })
      .click();
    const venue = page.locator("#venue");
    await expect(venue).toContainText("Rittapadu Village");
    await expect(venue).toContainText("Venkateswar Swamy Temple");
    await expect(venue).toContainText(
      "Rittapadu village, Vajrapu Kotturu (Mandal), Srikakulam (Dist)",
    );
    await expect(
      venue.getByRole("heading", {
        name: language === "en" ? "Venue photo coming soon" : "వేదిక చిత్రం త్వరలో",
        exact: true,
      }),
    ).toBeVisible();
    const directions = venue.getByRole("link", {
      name: language === "en" ? /Get Directions/ : /మార్గదర్శకాలు పొందండి/,
    });
    await expect(directions).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=18.7379444%2C84.4416667",
    );
    await expect(directions).toHaveAttribute("target", "_blank");
    await expect(directions).toHaveAttribute("rel", "noopener noreferrer");
    await expect(venue.locator("iframe, img")).toHaveCount(0);
    await expect(venue).not.toContainText("[Confirmed");
    await expect(page.locator("#committee")).toContainText("Marpu Kiran");
    await expect(page.locator("#donation")).toContainText("PINNINTI DINESH");
  }
});

test("committee photos and telephone links match the four supplied members in order", async ({
  page,
}) => {
  await page.goto("/");
  const expected = [
    ["Marpu Kiran", "81796 31437", "+918179631437", "marpu-kiran"],
    ["Pinniti Dinesh", "88974 98853", "+918897498853", "pinniti-dinesh"],
    ["Katchi Akhil", "90300 81998", "+919030081998", "katchi-akhil"],
    ["Megavaram Vamsi", "88976 75809", "+918897675809", "megavaram-vamsi"],
  ];
  for (const language of ["en", "te"] as const) {
    await page
      .getByRole("button", { name: language === "en" ? "EN" : "తెలుగు", exact: true })
      .click();
    const cards = page.locator("#committee li");
    await expect(cards).toHaveCount(4);
    for (const [index, [name, phone, telephone, photo]] of expected.entries()) {
      const card = cards.nth(index);
      await expect(card.getByRole("heading")).toHaveText(name);
      await expect(card.getByRole("link")).toHaveText(phone);
      await expect(card.getByRole("link")).toHaveAttribute("href", "tel:" + telephone);
      const image = card.getByRole("img", { name, exact: true });
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const source = await image.getAttribute("src");
      expect(decodeURIComponent(source ?? "")).toContain("/committee/" + photo + ".jpg");
    }
    await expect(page.locator("#committee")).not.toContainText("coming soon");
    await expect(page.locator("#donation")).toContainText("PINNINTI DINESH");
  }
});

test("hero displays the supplied Devi image without the coming-soon placeholder", async ({
  page,
}) => {
  await page.goto("/");
  for (const language of ["en", "te"] as const) {
    await page
      .getByRole("button", { name: language === "en" ? "EN" : "తెలుగు", exact: true })
      .click();
    const hero = page.locator("#home");
    const image = hero.getByRole("img");
    await expect(image).toHaveAttribute(
      "alt",
      language === "en" ? /Saraswathi Devi/ : /సరస్వతి దేవి/,
    );
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const source = await image.getAttribute("src");
    expect(decodeURIComponent(source ?? "")).toContain("/images/saraswathi-devi.png");
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(hero).not.toContainText(
      language === "en" ? "Devi image coming soon" : "అమ్మవారి చిత్రం త్వరలో",
    );
  }
});
