import type { BridalLookView, EventRow, LineupPosition, ParticipantRow } from "@/lib/types";
import { canExchangeSuggestion } from "@/lib/suggestions/permissions";
import { demoEvent, demoParticipants } from "./data";
export const DEMO_STORAGE_KEY = "vows-vibe-mobile-demo-v1";
export const DEMO_UPDATE_EVENT = "vows-vibe-mobile-demo-update";
interface Suggestion { id: string; text: string; from_participant_id: string; to_participant_id: string; from_name: string; created_at: string }
interface DemoDress { id: string; participant_id: string; storage_path: string; url: string; primary_hex: string | null; color_name: string | null }
interface DemoState { event: EventRow; positions: Record<string, LineupPosition>; suggestions: Suggestion[]; participants: ParticipantRow[]; looks: BridalLookView[]; dresses: DemoDress[] }
const uploadedImages = new Map<string, string>();
const fixtureImages = new Set(demoParticipants.flatMap((p) => [p.cutout_url, p.original_photo_url]).filter(Boolean));
function imagePath(url: string) { return [...uploadedImages].find(([, value]) => value === url)?.[0] ?? null; }
function hydrate(state: DemoState): DemoState {
  state.dresses ??= [];
  state.event.example_dresses.forEach((d) => { d.url = uploadedImages.get(d.storage_path ?? "") ?? d.url; });
  state.dresses.forEach((d) => { d.url = uploadedImages.get(d.storage_path) ?? d.url; });
  state.looks.forEach((look) => { look.dress_url = uploadedImages.get(look.dress_path ?? "") ?? look.dress_url; });
  state.participants.forEach((p) => { p.original_photo_url = uploadedImages.get(p.original_photo_path ?? "") ?? p.original_photo_url; });
  return state;
}

export function readDemoState(): DemoState {
  try {
    const state = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? "null");
    if (state?.event && state?.positions && Array.isArray(state.suggestions) && Array.isArray(state.participants) && Array.isArray(state.looks)) return hydrate(state);
  } catch { /* Missing/malformed data starts a fresh, usable demo. */ }
  return { event: structuredClone(demoEvent), positions: Object.fromEntries(demoParticipants.map((p) => [p.id, { participant_id: p.id, x: p.lineup_x!, y: p.lineup_y!, z_index: p.lineup_z_index, hidden: false }])), suggestions: [], participants: structuredClone(demoParticipants), looks: [], dresses: [] };
}
function save(state: DemoState) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state, (_key, value) => {
    // Never persist user image bytes, including nested moodboards/lookbooks.
    if (typeof value === "string" && /^(data:image\/|blob:)/.test(value) && !fixtureImages.has(value)) return demoParticipants[1].cutout_url;
    return value;
  }));
  window.dispatchEvent(new Event(DEMO_UPDATE_EVENT));
}
function confirmLook(state: DemoState, participant: ParticipantRow, look: BridalLookView) {
  state.looks.filter((item) => item.participant_id === participant.id).forEach((item) => { item.status = item.id === look.id ? "confirmed" : "ready"; });
  participant.status = "confirmed";
  participant.confirmed_look_id = look.id;
  participant.selected_dress_url = look.dress_url;
  participant.vto_render_url = look.vto_render_url;
  participant.cutout_url = look.vto_render_url;
  participant.vto_task_id = look.task_id;
  participant.vto_history = state.looks.filter((item) => item.participant_id === participant.id).map((item) => ({ id: item.id, participant_id: participant.id, dress_path: item.dress_path, dress_url: item.dress_url, render_path: null, task_id: item.task_id, status: item.status, created_at: item.created_at, render_url: item.vto_render_url }));
  state.positions[participant.id] ??= { participant_id: participant.id, x: .5, y: .08, z_index: state.participants.length, hidden: false };
}
export function resetDemo() { localStorage.removeItem(DEMO_STORAGE_KEY); localStorage.removeItem(`vv-session-${demoEvent.id}`); uploadedImages.clear(); window.dispatchEvent(new Event(DEMO_UPDATE_EVENT)); }
export function subscribeToDemoUpdates(refresh: () => void) {
  window.addEventListener(DEMO_UPDATE_EVENT, refresh);
  const onStorage = (event: StorageEvent) => { if (event.key === DEMO_STORAGE_KEY) refresh(); };
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(DEMO_UPDATE_EVENT, refresh); window.removeEventListener("storage", onStorage); };
}
function imageData(file: Blob) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read demo image")); reader.readAsDataURL(file); });
}
function fixtureLook(participant: ParticipantRow, dressUrl: string, id: string): BridalLookView {
  return { id, participant_id: participant.id, participant_dress_id: null, dress_path: imagePath(dressUrl), body_photo_path: "demo-fixture", render_path: null, task_id: id, status: "ready", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), cutout_path: null, original_photo_url: participant.original_photo_url, dress_url: dressUrl, vto_render_url: participant.cutout_url ?? demoParticipants[1].cutout_url };
}

// No request is forwarded to a network. AI responses here are illustrated test fixtures.
export const demoRequest: typeof fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, "https://demo.invalid");
  if (url.origin !== "https://demo.invalid") return Response.json({ error: "External requests are disabled in the offline demo." }, { status: 503 });
  const method = init?.method?.toUpperCase() ?? "GET";
  let body: Record<string, any> = {};
  try { body = typeof init?.body === "string" ? JSON.parse(init.body) : {}; } catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }
  const state = readDemoState();
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  if (url.pathname === "/api/upload" && init?.body instanceof FormData) {
    const file = init.body.get("file");
    if (!(file instanceof Blob) || !file.type.startsWith("image/")) return json({ error: "Choose an image" }, 400);
    // Keep user-selected uploads in memory, not a cloud bucket or persisted demo state.
    const path = `demo-upload-${crypto.randomUUID()}`;
    const image = await imageData(file);
    uploadedImages.set(path, image);
    return json({ url: image, path });
  }
  if (url.pathname === "/api/events" && method === "POST") {
    state.event = { ...state.event, ...body, id: demoEvent.id };
    save(state); return json({ event: state.event }, 201);
  }
  if (url.pathname === "/api/participants" && method === "POST") {
    const name = String(body.name ?? "").trim();
    if (!name) return json({ error: "Enter your name" }, 400);
    let participant = state.participants.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!participant) {
        participant = { ...demoParticipants[1], id: `demo-guest-${crypto.randomUUID()}`, name, session_token: `demo-token-${crypto.randomUUID()}`, original_photo_url: null, skin_tone_hex: null, hair_tone_hex: null, status: "pending", confirmed_look_id: null, cutout_url: null, vto_history: [] };
      state.participants.push(participant); save(state);
    }
    return json({ participant });
  }
  if (url.pathname === `/api/events/${demoEvent.id}/lineup`) {
    if (method === "GET") return json({ participants: state.participants.filter((p) => p.status === "confirmed"), positions: state.positions });
    if (method === "POST" && Array.isArray(body.items)) {
      const valid = body.items.every((item: LineupPosition) => state.participants.some((p) => p.id === item.participant_id) && Number.isFinite(item.x) && item.x >= 0 && item.x <= 1 && Number.isFinite(item.y) && item.y >= 0 && item.y <= 1 && Number.isFinite(item.z_index) && typeof item.hidden === "boolean");
      if (!valid) return json({ error: "Invalid demo arrangement" }, 400);
      state.positions = Object.fromEntries(body.items.map((item: LineupPosition) => [item.participant_id, item])); save(state); return json({ ok: true });
    }
  }
  if (url.pathname === `/api/events/${demoEvent.id}/group-preview`) {
    if (method === "GET") return json({ previewUrl: state.event.group_preview_path });
    return json({ error: "Real Qwen generation is not connected in this offline prototype." }, 503);
  }
  const match = url.pathname.match(/^\/api\/participants\/(demo-(?:person-\d+|guest-[a-f0-9-]+))(?:\/(suggestions|dresses|skin-tone))?$/);
  if (match) {
    const participant = state.participants.find((p) => p.id === match[1]);
    if (!participant) return json({ error: "Demo participant not found" }, 404);
    if (match[2] === "skin-tone") {
      participant.skin_tone_hex = "#cb9678"; participant.skin_undertone = "warm"; participant.hair_tone_hex = "#553a2c";
      save(state); return json({ status: "success", skin_tone_hex: participant.skin_tone_hex, skin_undertone: "warm", undertone: "warm", hair_tone_hex: participant.hair_tone_hex });
    }
    if (match[2] === "dresses") {
      if (method === "POST") {
        if (!uploadedImages.has(body.storage_path)) return json({ error: "Upload a dress first" }, 400);
        state.dresses.push({ id: crypto.randomUUID(), participant_id: participant.id, storage_path: body.storage_path, url: uploadedImages.get(body.storage_path)!, primary_hex: body.primary_hex ?? null, color_name: body.color_name ?? null });
        save(state); return json({ ok: true });
      }
      return json({ dresses: [...state.event.example_dresses.map((d, index) => ({ id: `demo-dress-${index}`, url: d.url, storage_path: d.storage_path ?? "demo", primary_hex: d.primaryHex, color_name: d.colorName })), ...state.dresses.filter((d) => d.participant_id === participant.id)] });
    }
    if (match[2] === "suggestions") {
      if (method === "GET") return json({ suggestions: state.suggestions
        .filter((suggestion) => suggestion.from_participant_id === participant.id || suggestion.to_participant_id === participant.id)
        .flatMap((suggestion) => {
          const sender = state.participants.find((person) => person.id === suggestion.from_participant_id);
          const recipient = state.participants.find((person) => person.id === suggestion.to_participant_id);
          const validDirection = sender && recipient && canExchangeSuggestion(sender.role, recipient.role);
          return validDirection ? [{ ...suggestion, from_name: sender.name, to_name: recipient.name }] : [];
        }) });
      if (method === "POST") {
        const target = state.participants.find((p) => p.id === body.to_participant_id);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!target || target.id === participant.id || !text || text.length > 500) return json({ error: "Choose another person and enter a suggestion." }, 400);
        const validDirection = canExchangeSuggestion(participant.role, target.role);
        if (!validDirection) return json({ error: "Suggestions can only be exchanged between the bride and a bridesmaid." }, 400);
        const suggestion: Suggestion = { id: crypto.randomUUID(), text, from_participant_id: participant.id, to_participant_id: target.id, from_name: participant.name, created_at: new Date().toISOString() };
        state.suggestions.unshift(suggestion); save(state); return json({ suggestion }, 201);
      }
      if (method === "DELETE") {
        if (!state.suggestions.some((s) => s.id === body.suggestion_id && s.to_participant_id === participant.id)) return json({ error: "Suggestion not found" }, 404);
        state.suggestions = state.suggestions.filter((s) => s.id !== body.suggestion_id); save(state); return json({ ok: true });
      }
    }
    if (!match[2] && method === "GET") return json({ participant });
    if (!match[2] && method === "PATCH") {
      if ("original_photo_path" in body) { participant.original_photo_path = body.original_photo_path; participant.original_photo_url = body.original_photo_path ? (uploadedImages.get(body.original_photo_path) ?? demoParticipants[1].original_photo_url) : null; }
      if (body.status === "confirmed") {
        const look = state.looks.find((l) => l.id === body.confirmed_look_id);
        if (!look || look.participant_id !== participant.id) return json({ error: "Preview not found" }, 404);
        confirmLook(state, participant, look);
      }
      save(state); return json({ participant });
    }
  }
  if (url.pathname === "/api/bridal-look/start" || url.pathname === "/api/vto/start") {
    const participant = state.participants.find((p) => p.id === body.participant_id) ?? state.participants[0];
    const id = `demo-look-${crypto.randomUUID()}`;
    if (typeof body.dress_url !== "string") return json({ error: "Choose a dress" }, 400);
    state.looks.unshift(fixtureLook(participant, body.dress_url, id)); save(state);
    return json({ look_id: id, attempt_id: id, task_id: id });
  }
  const status = url.pathname.match(/^\/api\/(?:bridal-look|vto)\/status\/(demo-look-[a-f0-9-]+)$/);
  if (status) {
    const look = state.looks.find((l) => l.id === status[1]);
    if (!look) return json({ error: "Preview not found" }, 404);
    return json({ status: "success", render_url: look.vto_render_url });
  }
  const confirmation = url.pathname.match(/^\/api\/bridal-look\/(demo-look-[a-f0-9-]+)\/confirm$/);
  if (confirmation && method === "POST") {
    const look = state.looks.find((l) => l.id === confirmation[1]);
    const participant = state.participants.find((p) => p.id === look?.participant_id);
    if (!look || !participant) return json({ error: "Preview not found" }, 404);
    confirmLook(state, participant, look); save(state); return json({ ok: true, participant });
  }
  if (url.pathname === "/api/dresses/resolve-color") {
    const swatch = [...state.event.color_palette, ...demoEvent.color_palette].find((s) => s.name.toLowerCase() === String(body.colorLabel ?? "").toLowerCase());
    if (!swatch) return json({ error: "In this demo, choose Dusty Rose, Sage Green, or a named event palette color." }, 400);
    return json({ primary_hex: swatch.hex, color_name: swatch.name, primaryHex: swatch.hex, colorName: swatch.name, family: swatch.family });
  }
  return json({ error: "This offline compatibility demo does not connect to production services." }, 503);
};
