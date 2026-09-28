import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_STORAGE_KEY, demoRequest, readDemoState, resetDemo } from "../../src/demo/backend";
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
  vi.stubGlobal("window", new EventTarget());
});
describe("isolated mobile demo backend", () => {
  it("saves only local arrangements and resets them", async () => {
    const state = readDemoState(); expect(Object.keys(state.positions)).toHaveLength(6);
    state.positions["demo-person-1"].x = .42;
    expect((await demoRequest("/api/events/demo-wedding/lineup", { method: "POST", body: JSON.stringify({ items: Object.values(state.positions) }) })).status).toBe(200);
    expect(readDemoState().positions["demo-person-1"].x).toBe(.42);
    resetDemo(); expect(readDemoState().positions["demo-person-1"].x).toBe(.3);
  });
  it("keeps bride and bridesmaid messages in one conversation and blocks cross-bridesmaid suggestions", async () => {
    expect((await demoRequest("/api/participants/demo-person-0/suggestions", { method: "POST", body: JSON.stringify({ to_participant_id: "demo-person-1", text: "Love the dusty rose!" }) })).status).toBe(201);
    const bride = await (await demoRequest("/api/participants/demo-person-0/suggestions")).json();
    const target = await (await demoRequest("/api/participants/demo-person-1/suggestions")).json();
    const other = await (await demoRequest("/api/participants/demo-person-2/suggestions")).json();
    expect(bride.suggestions).toHaveLength(1); expect(target.suggestions).toHaveLength(1); expect(other.suggestions).toHaveLength(0);
    expect((await demoRequest("/api/participants/demo-person-1/suggestions", { method: "POST", body: JSON.stringify({ to_participant_id: "demo-person-2", text: "Cross-party message" }) })).status).toBe(400);
    expect((await demoRequest("/api/participants/demo-person-2/suggestions", { method: "DELETE", body: JSON.stringify({ suggestion_id: target.suggestions[0].id }) })).status).toBe(404);
  });
  it("never forwards production requests", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    expect((await demoRequest("https://vowsvibe-one.vercel.app/api/events/real-event/lineup", { method: "POST" })).status).toBe(503);
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects invalid arrangement coordinates", async () => {
    expect((await demoRequest("/api/events/demo-wedding/lineup", { method: "POST", body: JSON.stringify({ items: [{ participant_id: "demo-person-1", x: "bad", y: .1, z_index: 1, hidden: false }] }) })).status).toBe(400);
  });
  it("matches the actual colorLabel payload and rejects unsupported fixture colors", async () => {
    const result = await (await demoRequest("/api/dresses/resolve-color", { method: "POST", body: JSON.stringify({ colorLabel: "Sage Green" }) })).json();
    expect(result.primaryHex).toBe("#9BAE93");
    expect((await demoRequest("/api/dresses/resolve-color", { method: "POST", body: JSON.stringify({ colorLabel: "made-up shade" }) })).status).toBe(400);
  });
  it("persists only one confirmed preview and restores the participant lookbook", async () => {
    const join = await (await demoRequest("/api/participants", { method: "POST", body: JSON.stringify({ name: "Unit guest" }) })).json();
    const participantId = join.participant.id;
    const start = () => demoRequest("/api/vto/start", { method: "POST", body: JSON.stringify({ participant_id: participantId, dress_url: "demo-fixture" }) });
    const first = await (await start()).json();
    const second = await (await start()).json();
    for (const attempt of [first, second]) {
      expect((await demoRequest(`/api/participants/${participantId}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed", confirmed_look_id: attempt.attempt_id }) })).status).toBe(200);
    }
    const restored = readDemoState().participants.find((p) => p.id === participantId)!;
    expect(restored.confirmed_look_id).toBe(second.attempt_id);
    expect(restored.vto_history).toHaveLength(2);
    expect(restored.vto_history?.filter((look) => look.status === "confirmed")).toHaveLength(1);
    expect(readDemoState().positions[participantId]).toBeDefined();
  });
  it("does not persist image bytes in nested event/preview fields", async () => {
    const image = "data:image/png;base64,PRIVATE-USER-IMAGE-CONTENTS";
    await demoRequest("/api/events", { method: "POST", body: JSON.stringify({ example_dresses: [{ url: image }] }) });
    const start = await (await demoRequest("/api/bridal-look/start", { method: "POST", body: JSON.stringify({ dress_url: image }) })).json();
    await demoRequest(`/api/bridal-look/${start.look_id}/confirm`, { method: "POST" });
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).not.toContain("PRIVATE-USER-IMAGE-CONTENTS");
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).not.toContain("data:image/png");
  });
  it("rejects malformed JSON without crashing a mobile screen", async () => {
    expect((await demoRequest("/api/events", { method: "POST", body: "{" })).status).toBe(400);
  });
});
