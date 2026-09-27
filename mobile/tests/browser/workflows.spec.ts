import { expect, test, type Locator, type Page } from "@playwright/test";
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
async function acknowledge(page: Page) {
  const button = page.getByRole("button", { name: "I understand — show my studio" });
  await expect(button).toBeVisible();
  await button.tap();
}
async function uploadFixture(page: Page, input: Locator) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 300;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#C88A98"; ctx.fillRect(0, 0, 120, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await input.setInputFiles({ name: "mobile-test.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") });
}
async function expectViewportFit(page: Page) {
  const width = page.viewportSize()!.width;
  const measurement = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("body *")].map((element) => ({ tag: element.tagName, classes: element.className,
      right: element.getBoundingClientRect().right, left: element.getBoundingClientRect().left }))
      .filter((item) => item.right > window.innerWidth + 1 || item.left < -1).slice(-12),
  }));
  expect(measurement.width, JSON.stringify(measurement.overflowing)).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
}
test("studio selects, nudges, undoes, saves, restores, and exports", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const requests: string[] = []; page.on("request", (r) => requests.push(r.url()));
  await page.goto("/events/demo-wedding/lineup");
  await expect(page.locator(".upper-canvas")).toBeVisible();
  const canvasBounds = await page.locator(".upper-canvas").boundingBox();
  const controlsBounds = await page.locator(".mobile-arrange-controls").boundingBox();
  expect(canvasBounds!.y + canvasBounds!.height).toBeLessThanOrEqual(controlsBounds!.y + 1);
  for (const label of ["Undo arrangement", "Move left", "Move right", "Move up", "Move down", "Layers and visibility"]) {
    const bounds = await page.getByRole("button", { name: label, exact: true }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const picker = page.getByRole("group", { name: "Select a participant", exact: true });
  await picker.getByRole("button", { name: "Sophie", exact: true }).tap();
  await expect(picker.getByRole("button", { name: "Sophie", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Move right", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Undo arrangement", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo arrangement", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Undo arrangement", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Move right", exact: true }).tap();
  if (page.viewportSize()!.width > page.viewportSize()!.height) {
    for (const label of ["Group Preview", "Download PNG", "Save Lineup"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeHidden();
    await expect(page.locator(".upper-canvas")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Save Lineup", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Save Lineup", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vows-vibe-mobile-demo-v1")!).positions["demo-person-1"].x)).toBeGreaterThan(.3);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PNG", exact: true }).tap();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Layers and visibility", exact: true }).tap();
  await page.getByRole("button", { name: "Remove from lineup", exact: true }).tap();
  await picker.getByRole("button", { name: "Sophie · Restore", exact: true }).tap();
  await expect(picker.getByRole("button", { name: "Sophie", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `test-results/studio-${test.info().project.name}.png` });
  await expectViewportFit(page);
  expect(requests.some((url) => /supabase\.co|vercel\.app|jsdelivr/.test(url))).toBe(false); expect(errors).toEqual([]);
});

for (const path of ["/", "/login", "/dashboard", "/events/new", "/events/demo-wedding/style", "/events/demo-wedding", "/invite/demo", "/messages", "/upgrade"]) {
  test(`workflow page ${path} fits a mobile viewport`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    if (path === "/upgrade") await expect(page.locator(".mobile-demo-banner")).toHaveCount(0);
    else await expect(page.locator(".mobile-demo-banner")).toBeVisible();
    if (path.endsWith("/style")) await acknowledge(page);
    await expectViewportFit(page);
    await page.screenshot({ path: `test-results/${path.replace(/\//g, "-") || "home"}-${test.info().project.name}.png`, fullPage: true });
  });
}

test("bride entry and dashboard keep compose and suggestions in their dedicated screens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue as demo bride" })).toBeVisible();
  await expect(page.getByText("Secure sign-in", { exact: true })).toBeVisible();
  await expect(page.getByText("AI try-on", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open compose studio" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Party suggestions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue as demo bride" }).tap();
  await expect(page.getByRole("heading", { name: "Your events" })).toBeVisible();
  await expect(page.locator(".upper-canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete event" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview guest fitting room" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Party suggestions" })).toHaveCount(0);
});

test("bride can create a local event and confirm a fixture try-on", async ({ page }) => {
  await page.goto("/events/new");
  await page.getByLabel("Event name").fill("My mobile wedding");
  await page.getByRole("button", { name: "Continue", exact: true }).tap();
  await expect(page.getByRole("status")).toContainText("Step 2 of 3");
  for (const fabric of ["Chiffon", "Satin", "Stretch Mesh", "Crepe", "Velvet", "Any / Flexible"]) await expect(page.getByText(fabric, { exact: true }).first()).toBeVisible();
  await expectViewportFit(page);
  await page.getByRole("button", { name: "Previous step" }).tap();
  await expect(page.getByLabel("Event name")).toHaveValue("My mobile wedding");
  await page.getByRole("button", { name: "Continue", exact: true }).tap();
  await page.getByRole("button", { name: "Continue", exact: true }).tap();
  for (const family of ["Green", "Blue", "Pink", "Purple", "Red / Rust", "Neutral", "Jewel Tones", "Grey & Black"]) await expect(page.getByRole("button", { name: family, exact: true })).toBeVisible();
  await expectViewportFit(page);
  await uploadFixture(page, page.getByLabel("Add dress example", { exact: true }));
  await page.getByLabel("Dress color palette").fill("Dusty Rose");
  await expectViewportFit(page);
  await page.getByRole("button", { name: "Save", exact: true }).tap();
  await page.getByRole("button", { name: "Create event & style my look" }).tap();
  await expect(page.getByRole("heading", { name: "Find the one" })).toBeVisible();
  await acknowledge(page);
  // Select an existing fixture dress; the polling response is explicitly a demo result.
  const dress = page.locator('.dress-analysis-card').first();
  await dress.tap();
  await page.getByRole("button", { name: "Preview this dress", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Keep this look" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Keep this look" }).tap();
  await expect(page.getByRole("heading", { name: "My mobile wedding" })).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vows-vibe-mobile-demo-v1")!).looks[0].status)).toBe("confirmed");
  expect(await page.evaluate(() => localStorage.getItem("vows-vibe-mobile-demo-v1")!.includes("data:image/png"))).toBe(false);
});

test("bridesmaid can upload, try on, confirm, and reopen her lineup", async ({ page }) => {
  await page.goto("/invite/demo");
  await expect(page.getByRole("heading", { name: "Our wedding party", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go to home", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your name")).toBeVisible();
  await page.getByLabel("Your name").fill("Mobile guest");
  await page.getByRole("button", { name: "Open my fitting room" }).tap();
  await expect(page.getByRole("heading", { name: "Find your look" })).toBeVisible();
  await acknowledge(page);
  await expect(page.getByText("Upload a clear, full-body photo", { exact: true })).toBeVisible();
  await uploadFixture(page, page.getByLabel("Upload a clear, full-body photo", { exact: true }));
  await page.getByRole("button", { name: "Add a selfie for skin tone" }).tap();
  await page.getByRole("button", { name: /guided/i }).tap();
  await expect(page.getByText(/Guided Camera Kit is not connected/)).toBeVisible();
  await uploadFixture(page, page.getByLabel("Upload a selfie", { exact: true }));
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("vows-vibe-mobile-demo-v1")!).participants.find((p: { name: string }) => p.name === "Mobile guest").skin_tone_hex)).toBe("#cb9678");
  await page.getByRole("button", { name: "Back to full-body photo" }).tap();
  await page.locator(".dress-analysis-card").first().tap();
  await page.getByRole("button", { name: "Try this dress", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Confirm & join lineup" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Confirm & join lineup" }).tap();
  await expect(page.getByRole("button", { name: "Change your look" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Change your look" })).toBeVisible();
  await page.getByRole("button", { name: "Change your look" }).tap();
  await expect(page.getByText("Your lookbook", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Change your look" })).toBeVisible();
  await expectViewportFit(page);
});

test("back follows screen history and unsupported invites are not demo weddings", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo bride" }).tap();
  await page.getByRole("button", { name: "Create a demo event" }).tap();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Your events" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Continue as demo bride" })).toBeVisible();
  await page.goto("/invite/real-wedding");
  await expect(page.getByRole("heading", { name: "This link is not connected yet" })).toBeVisible();
});

test("suggestions update another local inbox without leaking to other recipients", async ({ page, context }) => {
  await page.goto("/events/demo-wedding/lineup");
  const inbox = await context.newPage();
  await inbox.goto("/messages");
  await inbox.getByRole("button", { name: "Open suggestions" }).tap();
  await page.getByRole("group", { name: "Select a participant", exact: true }).getByRole("button", { name: "Sophie", exact: true }).tap();
  await page.getByRole("button", { name: "Open suggestions" }).tap();
  await page.getByPlaceholder("Any helpful thought…").fill("Mobile suggestion test");
  expect(await page.getByPlaceholder("Any helpful thought…").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "Send suggestion about Sophie" }).tap();
  await expect(inbox.getByText("Mobile suggestion test", { exact: false })).toBeVisible();
  await inbox.getByRole("combobox").selectOption("demo-person-2");
  await inbox.getByRole("button", { name: "Open suggestions" }).tap();
  await expect(inbox.getByText("Mobile suggestion test", { exact: false })).toHaveCount(0);
  await inbox.getByRole("combobox").selectOption("demo-person-1");
  await inbox.getByRole("button", { name: "Open suggestions" }).tap();
  await inbox.getByRole("button", { name: "Dismiss suggestion" }).tap();
  await expect(inbox.getByText("Mobile suggestion test", { exact: false })).toHaveCount(0);
  await inbox.close();
});

test("studio preserves saved positions through rotation and preview navigation", async ({ page }) => {
  if (page.viewportSize()!.width > page.viewportSize()!.height) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events/demo-wedding/lineup");
  await expect(page.locator('[data-canvas-ready="true"]')).toBeVisible();
  const readPosition = () => page.evaluate(() => JSON.parse(localStorage.getItem("vows-vibe-mobile-demo-v1")!).positions["demo-person-1"]);
  const picker = page.getByRole("group", { name: "Select a participant", exact: true });
  await picker.getByRole("button", { name: "Sophie", exact: true }).tap();
  await page.getByRole("button", { name: "Move right", exact: true }).tap();
  await page.getByRole("button", { name: "Save Lineup", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  const original = await readPosition();
  const rotated = { width: 844, height: 390 };
  await page.setViewportSize(rotated);
  await expect.poll(async () => (await page.locator(".upper-canvas").boundingBox())!.width).toBeCloseTo(rotated.width - 18, 0);
  for (const label of ["Group Preview", "Download PNG", "Save Lineup"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeHidden();
  await expect(page.locator(".upper-canvas")).toBeVisible();
  await expectViewportFit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Group Preview", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Group Preview", exact: true })).toBeVisible();
  await expectViewportFit(page);
  await page.getByRole("button", { name: "Back to lineup", exact: true }).tap();
  await page.getByRole("button", { name: "Save Lineup", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  const restored = await readPosition();
  expect(restored.x).toBeCloseTo(original.x, 5);
  expect(restored.y).toBeCloseTo(original.y, 5);
});

test("RevenueCat screen does not simulate configured purchases", async ({ page }) => {
  await page.goto("/upgrade"); await expect(page.getByRole("status")).toContainText("Wedding Pass purchases are currently unavailable");
  await expect(page.getByRole("heading", { name: "Vows & Vibe Pro — One-Time Wedding Pass" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Choose a plan" })).toBeVisible();
  await expect(page.getByText("Mobile preview", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/test purchase|test store|not configured/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /restore/i })).toHaveCount(0);
});
