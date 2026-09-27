import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), attempts: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.client, createServiceRoleClient: mock.admin }));
vi.mock("@/lib/vto/participant", () => ({ getParticipantWithAttempts: mock.attempts }));
vi.mock("@/lib/storage/upload", () => ({
  resolveStorageUrl: (path: string | null) => path ? `https://storage.test/${path}` : null,
  publicStorageUrl: (path: string | null) => path ? `https://storage.test/${path}` : null,
  isStorageFolder: (folder: string) => ["user-photos/bride", "user-photos/bridesmaid", "user-dresses/bridesmaid"].includes(folder), uploadToStorage: mock.upload,
}));
import { GET as eventBundle } from "../../../src/app/api/events/[eventId]/mobile/route";
import { GET as invitation } from "../../../src/app/api/invites/[inviteCode]/route";
import { POST as join } from "../../../src/app/api/participants/route";
import { POST as upload } from "../../../src/app/api/upload/route";
import { POST as createEvent } from "../../../src/app/api/events/route";

function query(data: unknown) {
  const builder = { select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.ilike.mockReturnValue(builder);
  return builder;
}
beforeEach(() => {
  vi.resetAllMocks(); mock.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});
const eventParams = { params: Promise.resolve({ eventId: "wedding-a" }) };

it("rejects unauthenticated access before loading the bride's private photos", async () => {
  expect((await eventBundle(new Request("https://backend.test"), eventParams)).status).toBe(401);
  expect(mock.admin).not.toHaveBeenCalled();
});
it("restricts event lookup to the verified owner before using a service client", async () => {
  const events = query(null);
  mock.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "other-account" } } }) }, from: () => events });
  expect((await eventBundle(new Request("https://backend.test"), eventParams)).status).toBe(404);
  expect(events.eq).toHaveBeenCalledWith("owner_id", "other-account"); expect(mock.admin).not.toHaveBeenCalled();
});
it("serves the owner lookbook with resolved images and no caching", async () => {
  const events = query({ id: "wedding-a", owner_id: "bride-a", example_dresses: [], group_preview_path: "preview.png", group_preview_venue_path: null });
  mock.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "bride-a" } } }) }, from: () => events });
  mock.admin.mockReturnValue({ from: () => query({ id: "bride-participant" }) });
  mock.attempts.mockResolvedValue({ participant: { id: "bride-participant" }, attempts: [{ id: "look-a", body_photo_path: "body.png", dress_path: "dress.png", render_path: "render.png" }] });
  const response = await eventBundle(new Request("https://backend.test"), eventParams);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect((await response.json()).looks[0].vto_render_url).toBe("https://storage.test/render.png");
});
it("exposes invitation styling without selecting owner identity or participant credentials", async () => {
  const events = query({ id: "wedding-a", title: "Wedding", invite_code: "code-a", example_dresses: [], group_preview_path: null });
  mock.admin.mockReturnValue({ from: () => events });
  const response = await invitation(new Request("https://backend.test"), { params: Promise.resolve({ inviteCode: "code-a" }) });
  expect(response.status).toBe(200); expect(events.eq).toHaveBeenCalledWith("invite_code", "code-a");
  expect(events.select.mock.calls[0][0]).not.toMatch(/owner_id|session_token|original_photo/);
});
it("does not hand an existing participant's private session to someone who knows her name", async () => {
  const events = query({ id: "wedding-a" }); const people = query({ id: "participant-a" });
  mock.admin.mockReturnValue({ from: (table: string) => table === "events" ? events : people });
  const response = await join(new NextRequest("https://backend.test/api/participants", { method: "POST", body: JSON.stringify({ event_id: "invite-a", name: "Existing guest" }) }));
  expect(response.status).toBe(409); expect(mock.attempts).not.toHaveBeenCalled();
  expect(events.eq).toHaveBeenCalledWith("invite_code", "invite-a");
});
function imageUpload(token?: string, folder = "user-photos/bridesmaid") {
  const form = new FormData(); form.set("file", new File(["image bytes"], "body.png", { type: "image/png" })); form.set("folder", folder);
  if (token) { form.set("participant_id", "participant-a"); form.set("token", token); }
  return new NextRequest("https://backend.test/api/upload", { method: "POST", body: form });
}
it("requires upload authorization and refuses the wrong guest token or destination", async () => {
  expect((await upload(imageUpload())).status).toBe(401);
  mock.admin.mockReturnValue({ from: () => query({ id: "participant-a", session_token: "correct-token", role: "bridesmaid" }) });
  expect((await upload(imageUpload("wrong-token"))).status).toBe(403);
  expect((await upload(imageUpload("correct-token", "user-photos/bride"))).status).toBe(403);
  expect(mock.upload).not.toHaveBeenCalled();
});
it("uploads for an authenticated invitation session after verifying the private token", async () => {
  mock.admin.mockReturnValue({ from: () => query({ id: "participant-a", session_token: "correct-token", role: "bridesmaid" }) });
  mock.upload.mockResolvedValue({ url: "https://storage.test/image.png", path: "user-photos/bridesmaid/image.png" });
  expect((await upload(imageUpload("correct-token"))).status).toBe(200);
  expect(mock.upload).toHaveBeenCalledTimes(1);
});
it("refuses a second wedding even when the bride has a Wedding Pass", async () => {
  const count = vi.fn().mockResolvedValue({ count: 1, error: null });
  const events = { select: vi.fn().mockReturnValue({ eq: count }) };
  mock.client.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "bride-a" } } }) },
    from: vi.fn().mockReturnValue(events),
  });
  const response = await createEvent(new NextRequest("https://backend.test/api/events", {
    method: "POST",
    body: JSON.stringify({ title: "Second wedding" }),
  }));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "WEDDING_LIMIT_REACHED", upgrade_required: false });
  expect(mock.admin).not.toHaveBeenCalled();
});
