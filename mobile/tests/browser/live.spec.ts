import { expect, test, type Page, type Request, type WebSocketRoute } from "@playwright/test";
import { demoEvent, demoParticipants } from "../../src/demo/data";
import type { BridalLookView, EventRow, ParticipantRow } from "../../../src/lib/types";

const API = "http://127.0.0.1:3006";
const OWNER = "00000000-0000-4000-8000-000000000001";
const EVENT = "00000000-0000-4000-8000-000000000002";
const INVITE = "abc123invite";
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: OWNER, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.test-signature`;

async function setupLive(page: Page, signedIn = true) {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const event: EventRow = { ...structuredClone(demoEvent), id: EVENT, owner_id: OWNER, invite_code: INVITE, title: "Live test wedding" };
  const events = [event, { ...event, id: "second-wedding", title: "Second wedding", invite_code: "secondinvite" }];
  const people = structuredClone(demoParticipants).map((person) => ({ ...person, event_id: EVENT }));
  const looks: BridalLookView[] = [];
  const dresses = new Map<string, Array<{ url: string; storage_path: string; primary_hex: string; color_name: string }>>();
  const requests: Request[] = [];
  let failList = false; let membershipRequired = false; let participantFailure = false;
  const sockets: WebSocketRoute[] = [];
  const bindings = new Map<WebSocketRoute, Array<{ topic: string; ids: number[]; array: boolean; joinRef: string }>>();
  await page.routeWebSocket(/mobile-test\.supabase\.co/, (socket) => {
    sockets.push(socket); bindings.set(socket, []);
    socket.onMessage((message) => {
      const raw = JSON.parse(String(message));
      const frame = Array.isArray(raw) ? { join_ref: raw[0], ref: raw[1], topic: raw[2], event: raw[3], payload: raw[4] } : raw;
      const send = (event: string, payload: unknown) => socket.send(JSON.stringify(Array.isArray(raw)
        ? [frame.join_ref, frame.ref, frame.topic, event, payload] : { topic: frame.topic, ref: frame.ref, event, payload }));
      if (frame.event === "phx_join") {
        const changes = (frame.payload.config?.postgres_changes ?? []).map((change: unknown, index: number) => ({ ...(change as object), id: index + 1 }));
        bindings.get(socket)!.push({ topic: frame.topic, ids: changes.map((change: { id: number }) => change.id), array: Array.isArray(raw), joinRef: frame.join_ref });
        send("phx_reply", { status: "ok", response: { postgres_changes: changes } });
      } else if (frame.event === "heartbeat" || frame.event === "phx_leave") send("phx_reply", { status: "ok", response: {} });
    });
  });
  await page.route("https://mobile-test.supabase.co/auth/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) return route.fulfill({ json: { access_token: token, token_type: "bearer", refresh_token: "test-refresh", expires_in: 3600, user: { id: OWNER, email: "bride@example.com" } } });
    if (url.pathname.endsWith("/authorize")) return route.fulfill({ contentType: "text/html", body: "<p>Controlled Google authorization page</p>" });
    return route.fulfill({ json: { id: OWNER, email: "bride@example.com" } });
  });
  if (signedIn) await page.addInitScript(({ accessToken, owner }) => {
    localStorage.setItem("sb-mobile-test-auth-token", JSON.stringify({ access_token: accessToken, refresh_token: "test-refresh", token_type: "bearer", expires_at: 4102444800, user: { id: owner, email: "bride@example.com" } }));
  }, { accessToken: token, owner: OWNER });
  await page.route(`${API}/api/**`, async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname; const method = request.method();
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:5176", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
    const reply = (json: unknown, status = 200) => route.fulfill({ json, status, headers });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    requests.push(request);
    let body: Record<string, any> = {};
    if (request.headers()["content-type"]?.includes("application/json")) body = request.postDataJSON();
    const ownerRequest = request.headers().authorization === `Bearer ${token}`;
    if (path === "/api/mobile/billing") return ownerRequest
      ? reply({ configured: true, active: true, entitlementId: "vows_vibes_pro", productIdentifier: "vows_vibes_pro_monthly", periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z", plan: { name: "Vows & Vibes Pro", freeBrideVtoLimit: 2, proParticipantVtoLimit: 8, skinAnalysesPerParticipant: 1 } })
      : reply({ error: "Sign in first" }, 401);
    if ((path === "/api/events" || path.match(/^\/api\/events\/[^/]+(?:\/mobile)?$/)) && !ownerRequest) return reply({ error: "Sign in first" }, 401);
    if (path === "/api/events") {
      if (method === "GET") return reply(failList ? { error: "Temporary service failure" } : { events }, failList ? 503 : 200);
      const created = { ...event, ...body, id: "created-wedding", invite_code: "createdinvite" }; events.push(created); return reply({ event: created }, 201);
    }
    const wedding = events.find((item) => item.id === path.split("/")[3]);
    if (path.endsWith("/mobile")) return wedding ? reply({ event: wedding, bride: people[0], looks: looks.filter((look) => look.participant_id === people[0].id) }) : reply({ error: "Event not found" }, 404);
    if (path.endsWith("/lineup")) {
      if (method === "POST") { body.items.forEach((item: { participant_id: string; x: number; y: number; z_index: number; hidden: boolean }) => {
        const person = people.find((candidate) => candidate.id === item.participant_id)!; Object.assign(person, { lineup_x: item.x, lineup_y: item.y, lineup_z_index: item.z_index, lineup_hidden: item.hidden });
      }); return reply({ ok: true }); }
      const confirmed = people.filter((person) => person.status === "confirmed");
      return reply({ participants: confirmed, positions: Object.fromEntries(confirmed.map((person) => [person.id, { participant_id: person.id, x: person.lineup_x, y: person.lineup_y, z_index: person.lineup_z_index, hidden: person.lineup_hidden }])) });
    }
    if (wedding && /^\/api\/events\/[^/]+$/.test(path)) {
      if (method === "DELETE") { events.splice(events.indexOf(wedding), 1); return reply({ ok: true }); }
      Object.assign(wedding, body); return reply({ event: wedding });
    }
    if (path.startsWith("/api/invites/")) {
      const invited = events.find((item) => item.invite_code === path.split("/").at(-1));
      return invited ? reply({ event: invited }) : reply({ error: "Invitation not found" }, 404);
    }
    if (path === "/api/participants") {
      if (body.event_id !== INVITE) return reply({ error: "Invitation not found" }, 404);
      const participant: ParticipantRow = { ...people[1], id: "live-guest", name: body.name, session_token: "private-guest-token", original_photo_url: null, skin_tone_hex: null, hair_tone_hex: null, status: "pending", cutout_url: null, vto_history: [] };
      people.push(participant); return reply({ participant }, 201);
    }
    if (path === "/api/upload") {
      const form = await new Request(request.url(), { method: "POST", headers: request.headers(), body: Uint8Array.from(request.postDataBuffer()!) }).formData();
      if (!ownerRequest && (form.get("participant_id") !== "live-guest" || form.get("token") !== "private-guest-token")) return reply({ error: "Upload not authorized" }, 403);
      return reply({ path: `${form.get("folder")}/test-image.png`, url: demoParticipants[1].cutout_url });
    }
    if (path === "/api/dresses/resolve-color") return reply({ primaryHex: "#C88A98", colorName: "Dusty Rose", family: "pink" });
    const match = path.match(/^\/api\/participants\/([^/]+)(?:\/(dresses|skin-tone|suggestions))?$/);
    if (match) {
      const person = people.find((candidate) => candidate.id === match[1]);
      if (!person) return reply({ error: "Participant not found" }, 404);
      if (!match[2] && method === "GET" && participantFailure) return reply({ error: "Temporary fitting room failure" }, 503);
      if (match[2] === "skin-tone") {
        const form = await new Request(request.url(), { method: "POST", headers: request.headers(), body: Uint8Array.from(request.postDataBuffer()!) }).formData();
        if (!ownerRequest && form.get("token") !== person.session_token) return reply({ error: "Tone analysis not authorized" }, 403);
        Object.assign(person, { skin_tone_hex: "#cb9678", hair_tone_hex: "#553a2c", skin_undertone: "warm" });
        return reply({ status: "success", skin_tone_hex: person.skin_tone_hex, hair_tone_hex: person.hair_tone_hex, undertone: "warm" });
      }
      if (!ownerRequest && url.searchParams.get("token") !== person.session_token) return reply({ error: "Participant not authorized" }, 403);
      if (match[2] === "dresses") {
        if (method === "POST") { dresses.set(person.id, [...(dresses.get(person.id) ?? []), { ...body, url: demoParticipants[1].cutout_url! } as any]); return reply({ ok: true }); }
        return reply({ dresses: dresses.get(person.id) ?? [] });
      }
      if (match[2] === "suggestions") return reply({ suggestions: [] });
      if (method === "PATCH") {
        if (body.original_photo_path !== undefined) Object.assign(person, { original_photo_path: body.original_photo_path, original_photo_url: body.original_photo_path ? demoParticipants[1].original_photo_url : null });
        if (body.status === "confirmed") { person.status = "confirmed"; person.confirmed_look_id = body.confirmed_look_id; person.cutout_url = demoParticipants[1].cutout_url; person.vto_history = looks.filter((look) => look.participant_id === person.id).map((look) => ({ ...look, status: look.id === body.confirmed_look_id ? "confirmed" : "ready", render_url: look.vto_render_url })); }
      }
      return reply({ participant: person });
    }
    if (path === "/api/vto/start" || path === "/api/bridal-look/start") {
      if (!ownerRequest && body.token !== "private-guest-token") return reply({ error: "Try-on not authorized" }, 403);
      const person = people.find((candidate) => candidate.id === body.participant_id) ?? people[0];
      const id = `live-look-${looks.length + 1}`;
      looks.push({ id, participant_id: person.id, participant_dress_id: null, task_id: id, dress_path: null, body_photo_path: "test-body.png", render_path: null, cutout_path: null, status: "ready", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), original_photo_url: person.original_photo_url, dress_url: body.dress_url, vto_render_url: demoParticipants[1].cutout_url });
      return reply({ task_id: id, look_id: id, attempt_id: id });
    }
    if (/\/api\/(vto|bridal-look)\/status\//.test(path)) return reply({ status: "success", render_url: demoParticipants[1].cutout_url });
    if (/\/api\/bridal-look\/[^/]+\/confirm/.test(path)) { const look = looks.find((item) => item.id === path.split("/")[3])!; look.status = "confirmed"; return reply({ ok: true }); }
    if (path.endsWith("/group-preview")) {
      if (method === "GET") return reply({ previewUrl: null });
      if (body.action === "generate" && membershipRequired) return reply({ error: "Membership required" }, 402);
      return reply(body.action === "generate" ? { image: demoParticipants[1].cutout_url } : body.action === "save" ? { previewUrl: demoParticipants[1].cutout_url } : { venueUrl: demoParticipants[1].cutout_url });
    }
    return reply({ error: `Unexpected controlled-service request: ${path}` }, 500);
  });
  return { requests, events, people, looks, errors, setListFailure: (value: boolean) => { failList = value; }, setParticipantFailure: (value: boolean) => { participantFailure = value; }, setMembershipRequired: () => { membershipRequired = true; },
    broadcastLineup: () => {
      for (const socket of sockets) for (const binding of bindings.get(socket) ?? []) if (binding.topic.startsWith("realtime:mobile-event:")) {
        const payload = { ids: binding.ids, data: { schema: "public", table: "lineup_updates", type: "INSERT", commit_timestamp: new Date().toISOString(), record: { event_id: EVENT }, old_record: {}, columns: [] } };
        socket.send(JSON.stringify(binding.array ? [binding.joinRef, null, binding.topic, "postgres_changes", payload] : { topic: binding.topic, event: "postgres_changes", payload }));
      }
    } };
}

async function upload(page: Page, label: string) {
  const image = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 300; canvas.getContext("2d")!.fillRect(0, 0, 120, 300); return canvas.toDataURL("image/png").split(",")[1]; });
  await page.getByLabel(label, { exact: true }).setInputFiles({ name: "service-test.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
}
async function fit(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width); }

test("live login protects private routes and starts PKCE Google authorization", async ({ page }) => {
  const state = await setupLive(page, false); await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("Joining as a bridesmaid?", { exact: false })).toHaveCount(0);
  await page.goto(`/events/${EVENT}/style`);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe(`/events/${EVENT}/style`);
  await page.getByRole("button", { name: "Continue with Google" }).tap();
  await expect(page).toHaveURL(/mobile-test\.supabase\.co\/auth\/v1\/authorize/);
  expect(new URL(page.url()).searchParams.get("code_challenge")).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("prompt")).toBe("select_account");
  expect(new URL(page.url()).searchParams.get("redirect_to")).toBe("http://127.0.0.1:5176/auth/callback");
  expect(state.requests).toHaveLength(0); expect(state.errors).toEqual([]);
});

test("live dashboard recovers from service failure, edits the selected event, and signs out", async ({ page }) => {
  const state = await setupLive(page); state.setListFailure(true); await page.goto("/dashboard");
  await expect(page.getByRole("alert")).toContainText("Temporary service failure"); state.setListFailure(false);
  await page.getByRole("button", { name: "Try again" }).tap();
  await expect(page.getByRole("heading", { name: "Second wedding", exact: true })).toBeVisible();
  await expect(page.getByText(demoEvent.dress_style!, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete event", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Second wedding" }).tap();
  await expect(page.getByRole("button", { name: "Arrange bridal party", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview guest fitting room", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Party suggestions", exact: true })).toHaveCount(0);
  await expect(page.locator(".lineup-pan-surface")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete event", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit styling brief" }).tap();
  await page.getByLabel("Event name").fill("Updated second wedding");
  await page.getByRole("button", { name: "Continue", exact: true }).tap(); await page.getByRole("button", { name: "Continue", exact: true }).tap();
  await page.getByRole("button", { name: "Save event changes" }).tap();
  await expect(page.getByRole("heading", { name: "Updated second wedding", exact: true })).toBeVisible();
  expect(state.events[0].title).toBe("Live test wedding");
  expect(state.requests.find((request) => request.method() === "PATCH")?.headers().authorization).toBe(`Bearer ${token}`);
  await fit(page); await page.getByRole("button", { name: "Sign out" }).tap();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible(); expect(state.errors).toEqual([]);
});

test("live bride creates an event, runs a service try-on, and persists confirmation", async ({ page }) => {
  const state = await setupLive(page); await page.goto("/events/new"); await page.getByLabel("Event name").fill("Created through mobile API");
  await page.getByRole("button", { name: "Continue", exact: true }).tap(); await page.getByRole("button", { name: "Continue", exact: true }).tap();
  await upload(page, "Add dress example"); await page.getByLabel("Dress color palette").fill("Dusty Rose"); await page.getByRole("button", { name: "Save", exact: true }).tap();
  await page.getByRole("button", { name: "Create event & style my look" }).tap();
  await expect(page).toHaveURL(/\/events\/created-wedding\/style/);
  await page.getByRole("button", { name: "I understand — show my studio" }).tap();
  await page.getByRole("button", { name: "Add a selfie for skin tone" }).tap(); await upload(page, "Upload a selfie");
  await page.getByRole("button", { name: "Back to full-body photo" }).tap();
  await upload(page, "Add a dress"); await page.getByLabel("Dress color palette").fill("Dusty Rose");
  await page.getByRole("button", { name: "Save", exact: true }).tap();
  await page.getByRole("button", { name: "Preview this dress", exact: true }).tap();
  await page.getByRole("button", { name: "Keep this look" }).tap();
  await expect(page.getByRole("heading", { name: "Created through mobile API", exact: true })).toBeVisible();
  expect(state.looks[0].status).toBe("confirmed");
  for (const request of state.requests.filter((request) => ["/api/events", "/api/upload", "/api/bridal-look/start"].includes(new URL(request.url()).pathname))) expect(request.headers().authorization).toBe(`Bearer ${token}`);
  expect(state.errors).toEqual([]);
});

test("live invite supports anonymous uploads, tone analysis, custom dress save and confirmation", async ({ page }) => {
  const state = await setupLive(page, false); await page.goto(`/invite/${INVITE}`);
  await expect(page.getByRole("heading", { name: "Live test wedding", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go to home", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByText(/membership/i)).toHaveCount(0);
  await page.getByLabel("Your name").fill("Live guest"); await page.getByRole("button", { name: "Open my fitting room" }).tap();
  await page.getByRole("button", { name: "I understand — show my studio" }).tap();
  await upload(page, "Upload a clear, full-body photo");
  await page.getByRole("button", { name: "Add a selfie for skin tone" }).tap(); await upload(page, "Upload a selfie");
  await page.getByRole("button", { name: "Back to full-body photo" }).tap();
  await upload(page, "Add a dress"); await page.getByLabel("Dress color palette").fill("Dusty Rose"); await page.getByRole("button", { name: "Save", exact: true }).tap();
  await expect.poll(() => state.requests.some((request) => request.url().includes("/live-guest/dresses?token=private-guest-token") && request.method() === "POST")).toBe(true);
  await fit(page);
  await page.getByRole("button", { name: "Try this dress", exact: true }).tap();
  await page.getByRole("button", { name: "Confirm & join lineup" }).tap();
  await expect(page.getByRole("button", { name: "Change your look" })).toBeVisible(); state.setParticipantFailure(true); await page.reload();
  await expect(page.getByRole("alert")).toContainText("Temporary fitting room failure");
  state.setParticipantFailure(false); await page.getByRole("button", { name: "Try again", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Change your look" })).toBeVisible();
  expect(state.requests.filter((request) => new URL(request.url()).pathname === "/api/participants")).toHaveLength(1);
  expect(state.people.at(-1)?.skin_tone_hex).toBe("#cb9678");
  expect(state.requests.find((request) => new URL(request.url()).pathname === "/api/participants")!.postDataJSON().event_id).toBe(INVITE);
  expect(state.requests.every((request) => !request.headers().authorization)).toBe(true); await fit(page); expect(state.errors).toEqual([]);
});

test("live studio saves to the cloud, incorporates party updates and generates a preview", async ({ page }) => {
  if (page.viewportSize()!.width > page.viewportSize()!.height) await page.setViewportSize({ width: 390, height: 844 });
  const state = await setupLive(page); await page.goto(`/events/${EVENT}/lineup`);
  await expect(page.locator('[data-canvas-ready="true"]')).toBeVisible();
  const picker = page.getByRole("group", { name: "Select a participant", exact: true }); await picker.getByRole("button", { name: "Sophie", exact: true }).tap();
  await page.getByRole("button", { name: "Move right", exact: true }).tap(); await page.getByRole("button", { name: "Save Lineup", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible(); expect(state.people[1].lineup_x).toBeGreaterThan(.3);
  state.people.push({ ...state.people[1], id: "new-party-member", name: "New party member" }); state.broadcastLineup();
  await expect(picker.getByRole("button", { name: "New party member", exact: true })).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PNG", exact: true }).tap(); expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Group Preview", exact: true }).tap(); await upload(page, "Upload venue image");
  await page.getByRole("button", { name: "Generate Preview", exact: true }).tap(); await expect(page.getByAltText("Generated bridal party group preview")).toBeVisible();
  await page.getByRole("button", { name: "Save Preview", exact: true }).tap(); await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await fit(page); expect(state.errors).toEqual([]);
});

test("unknown live invites report the server error without opening demo data", async ({ page }) => {
  const state = await setupLive(page, false); await page.goto("/invite/unknowninvite");
  await expect(page.getByRole("alert")).toContainText("Invitation not found");
  await expect(page.getByLabel("Your name")).toHaveCount(0); await expect(page.locator(".mobile-demo-banner")).toHaveCount(0); expect(state.errors).toEqual([]);
});
