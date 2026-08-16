export type ParticipantStatus = "pending" | "confirmed";
export type ParticipantRole = "bride" | "bridesmaid";
export type VtoAttemptStatus = "processing" | "ready" | "confirmed" | "error";

export interface SwatchColor { id: string; name: string; hex: string; family: string; }
export interface ExampleDress {
  url: string;
  label?: string;
  storage_path?: string | null;
  /** Canonical dress palette name + representative hex resolved after the user labels the dress color. */
  primaryHex?: string | null;
  colorName?: string | null;
}
export interface EventRow {
  id: string; owner_id: string; title: string; event_date: string | null; dress_style: string | null;
  dress_length: string | null; fabric_type: string | null; color_palette: SwatchColor[];
  example_dresses: ExampleDress[]; invite_code: string; created_at: string;
}

/** Database participant row plus URLs/attempt-derived fields used by the UI. */
export interface LineupPosition {
  participant_id: string;
  x: number;
  y: number;
  scale: number;
  z_index: number;
  hidden: boolean;
}

export interface ParticipantRow {
  id: string; event_id: string; name: string; session_token: string; role: ParticipantRole;
  original_photo_path: string | null; original_photo_url: string | null;
  confirmed_look_id: string | null;
  status: ParticipantStatus; lineup_order: number; suggestions_enabled: boolean;
  lineup_x: number | null; lineup_y: number | null; lineup_scale: number; lineup_z_index: number; lineup_hidden: boolean;
  created_at: string; updated_at: string;
  skin_tone_hex: string | null; skin_undertone: "warm" | "cool" | "neutral" | null;
  skin_depth: "fair" | "light" | "medium" | "deep" | null;
  /** From the same YouCam skin-tone-analysis task as skin_tone_hex — read together in one
   *  call, never a separate request. Used alongside skin tone for dress-rail scoring
   *  (personal contrast between skin and hair — see analyzeDressWithSkinAndHair). */
  hair_tone_hex: string | null; hair_color_name: string | null;
  selected_dress_url: string | null;
  vto_render_url: string | null;
  vto_task_id: string | null;
  vto_history?: VtoHistoryEntry[];
  /** Background-removed cutout of the confirmed render. Only ever set once status is
   *  "confirmed" — extraction happens synchronously before that flip, so a null here on a
   *  confirmed participant just means the row predates this feature. */
  cutout_url: string | null;
  confirmed_dress_primary_hex?: string | null;
  confirmed_dress_color_name?: string | null;
}

export interface ParticipantDressRow {
  id: string;
  participant_id: string;
  storage_path: string;
  primary_hex?: string | null;
  color_name?: string | null;
  created_at: string;
}

export interface VtoHistoryEntry {
  id: string; participant_id?: string; dress_path: string | null; dress_url: string | null;
  render_path: string | null; task_id: string; status: VtoAttemptStatus; created_at: string;
  render_url?: string | null; dress_preview_url?: string | null;
}

export interface VtoAttemptRow {
  id: string; participant_id: string; participant_dress_id: string | null; dress_path: string | null;
  body_photo_path: string; render_path: string | null; task_id: string; status: VtoAttemptStatus;
  created_at: string; updated_at: string; cutout_path: string | null;
}

/** UI projection for the bride's fitting-room lookbook; not a database table. */
export interface BridalLookView extends VtoAttemptRow {
  original_photo_url: string | null;
  dress_url: string | null;
  vto_render_url: string | null;
}
