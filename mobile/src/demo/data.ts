import type { EventRow, ParticipantRow } from "@/lib/types";

// Original code-native illustrations: not real people or AI-generated results.
function personIllustration(dress: string, skin: string, hair: string, bridal = false) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="600" viewBox="0 0 240 600"><g><path d="M85 85 Q76 14 119 12 Q164 10 157 85 L150 120 L88 119Z" fill="${hair}"/><ellipse cx="120" cy="61" rx="31" ry="39" fill="${skin}"/><path d="M112 89H129V124H112Z" fill="${skin}"/><path d="M91 115 Q74 125 65 176 L49 298 Q46 310 57 312 Q67 312 68 299 L90 205Z" fill="${skin}"/><path d="M149 115 Q166 125 175 176 L191 298 Q194 310 183 312 Q173 312 172 299 L150 205Z" fill="${skin}"/><path d="M91 113 Q120 132 149 113 L158 211 Q171 301 204 547 Q120 577 36 547 Q69 301 82 211Z" fill="${dress}"/><path d="M94 208 Q121 214 146 208" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="4"/><path d="M104 240 Q84 411 79 550 M137 240 Q159 411 161 550" fill="none" stroke="#000000" stroke-opacity=".09" stroke-width="6"/><path d="M83 551H106V580H72Q68 566 83 551 M136 551H159L171 580H135Z" fill="#e6d8c9"/>${bridal ? '<path d="M87 37 Q120 2 154 37" stroke="#fafafa" stroke-width="7" fill="none"/>' : ""}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
export const demoEvent: EventRow = {
  id: "demo-wedding", owner_id: "demo-owner", title: "Our wedding party", event_date: "2026-12-12", dress_style: "Romantic", dress_length: "Floor-Length", fabric_type: "Stretch Satin",
  color_palette: [{ id: "rose", name: "Dusty Rose", hex: "#C88A98", family: "pink" }, { id: "sage", name: "Sage Green", hex: "#9BAE93", family: "green" }],
  example_dresses: [], invite_code: "demo", created_at: "2026-09-15T00:00:00Z", group_preview_path: null, group_preview_updated_at: null,
};
const people = [
  ["Bride", "#fff8eb", "#cb9678", "#553a2c"], ["Sophie", "#C88A98", "#e4b99c", "#c39c63"], ["Darlena", "#9BAE93", "#8d5741", "#30251f"],
  ["Catherine", "#C88A98", "#b77a57", "#483527"], ["Amelia", "#9BAE93", "#f0c7b0", "#6c4130"], ["Noor", "#A78CAD", "#b78766", "#25201c"],
];
export const demoParticipants: ParticipantRow[] = people.map(([name, dress, skin, hair], index) => ({
  id: `demo-person-${index}`, event_id: demoEvent.id, name, session_token: `local-demo-${index}`, role: index === 0 ? "bride" : "bridesmaid",
  original_photo_path: null, original_photo_url: personIllustration(dress, skin, hair, index === 0), confirmed_look_id: `demo-look-${index}`, status: "confirmed", lineup_order: index,
  lineup_x: [0.5, 0.3, 0.7, 0.14, 0.86, 0.6][index], lineup_y: 0.08, lineup_z_index: index === 0 ? 100 : index, lineup_hidden: false,
  created_at: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`, updated_at: "2026-09-15T00:00:00Z",
  skin_tone_hex: skin, skin_undertone: "neutral", hair_tone_hex: hair, hair_color_name: null, selected_dress_url: null, vto_render_url: null, vto_task_id: null,
  cutout_url: personIllustration(dress, skin, hair, index === 0), confirmed_dress_primary_hex: dress,
  confirmed_dress_color_name: dress === "#C88A98" ? "Dusty Rose" : dress === "#9BAE93" ? "Sage Green" : "Lavender",
}));
demoEvent.example_dresses = demoParticipants.slice(1, 3).map((p) => ({ url: p.cutout_url!, label: p.confirmed_dress_color_name!, primaryHex: p.confirmed_dress_primary_hex, colorName: p.confirmed_dress_color_name }));
