import { publicStorageUrl } from "@/lib/storage/upload";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ParticipantRow, VtoAttemptRow } from "@/lib/types";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type ParticipantDbRow = {
  id: string;
  event_id: string;
  name: string;
  session_token: string;
  role: ParticipantRow["role"];
  original_photo_path: string | null;
  confirmed_look_id: string | null;
  status: ParticipantRow["status"];
  lineup_order: number;
  created_at: string;
  updated_at: string;
  lineup_x: number | null;
  lineup_y: number | null;
  lineup_z_index: number;
  lineup_hidden: boolean;
  skin_tone_hex: string | null;
  skin_undertone: ParticipantRow["skin_undertone"];
  skin_depth: ParticipantRow["skin_depth"];
  hair_tone_hex: string | null;
  hair_color_name: string | null;
};

export function hydrateParticipant(row: ParticipantDbRow, attempts: VtoAttemptRow[] = []): ParticipantRow {
  const history = attempts.map((a) => ({
    id: a.id,
    participant_id: a.participant_id,
    dress_path: a.dress_path,
    dress_url: publicStorageUrl(a.dress_path),
    render_path: a.render_path,
    task_id: a.task_id,
    status: a.status,
    created_at: a.created_at,
    render_url: publicStorageUrl(a.render_path),
    dress_preview_url: publicStorageUrl(a.dress_path),
  }));

  const confirmed = row.confirmed_look_id
    ? attempts.find((a) => a.id === row.confirmed_look_id) ?? null
    : null;
  const latest = attempts[0] ?? null;
  const current = confirmed ?? latest;

  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    session_token: row.session_token,
    role: row.role,
    original_photo_path: row.original_photo_path ?? null,
    original_photo_url: publicStorageUrl(row.original_photo_path),
    confirmed_look_id: row.confirmed_look_id ?? null,
    status: row.status,
    lineup_order: row.lineup_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lineup_x: row.lineup_x ?? null,
    lineup_y: row.lineup_y ?? null,
    lineup_z_index: Number(row.lineup_z_index ?? 0),
    lineup_hidden: Boolean(row.lineup_hidden ?? false),
    skin_tone_hex: row.skin_tone_hex ?? null,
    skin_undertone: row.skin_undertone ?? null,
    skin_depth: row.skin_depth ?? null,
    hair_tone_hex: row.hair_tone_hex ?? null,
    hair_color_name: row.hair_color_name ?? null,
    selected_dress_url: publicStorageUrl(current?.dress_path),
    vto_render_url: publicStorageUrl(current?.render_path),
    vto_task_id: latest?.task_id ?? null,
    vto_history: history,
    // Deliberately sourced from `confirmed`, not `current` — a cutout only ever exists on
    // the attempt that was actually confirmed (extraction runs inline before that flip),
    // never on a still-pending preview.
    cutout_url: confirmed ? publicStorageUrl(confirmed.cutout_path) : null,
  };
}

export function publicParticipant(row: ParticipantRow) {
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    role: row.role,
    vto_render_url: row.vto_render_url,
    cutout_url: row.cutout_url,
    status: row.status,
    lineup_order: row.lineup_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lineup_x: row.lineup_x ?? null,
    lineup_y: row.lineup_y ?? null,
    lineup_z_index: Number(row.lineup_z_index ?? 0),
    lineup_hidden: Boolean(row.lineup_hidden ?? false),
  };
}

export async function getParticipantsWithAttempts(admin: AdminClient, participantIds: string[]) {
  if (!participantIds.length) return { participants: [] as ParticipantRow[], attempts: [] as VtoAttemptRow[] };

  const [{ data: participantRows, error: participantError }, { data: attemptRows, error: attemptsError }] = await Promise.all([
    admin.from("participants").select("*").in("id", participantIds),
    admin.from("vto_attempts").select("*").in("participant_id", participantIds).order("created_at", { ascending: false }),
  ]);

  if (participantError) return { participants: [] as ParticipantRow[], attempts: [] as VtoAttemptRow[], error: participantError };
  const attempts = (attemptRows ?? []) as VtoAttemptRow[];
  const attemptsByParticipant = new Map<string, VtoAttemptRow[]>();
  for (const attempt of attempts) {
    const list = attemptsByParticipant.get(attempt.participant_id) ?? [];
    list.push(attempt);
    attemptsByParticipant.set(attempt.participant_id, list);
  }

  return {
    participants: (participantRows ?? []).map((row) => hydrateParticipant(row as ParticipantDbRow, attemptsByParticipant.get(row.id) ?? [])),
    attempts,
    error: attemptsError ?? null,
  };
}

export async function getParticipantWithAttempts(admin: AdminClient, participantId: string) {
  const { data: participant, error } = await admin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .maybeSingle();

  if (error || !participant) {
    return { participant: null, attempts: [], error };
  }

  const { data: attempts, error: attemptsError } = await admin
    .from("vto_attempts")
    .select("*")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: false });

  return {
    participant: hydrateParticipant(participant as ParticipantDbRow, (attempts ?? []) as VtoAttemptRow[]),
    attempts: (attempts ?? []) as VtoAttemptRow[],
    error: attemptsError,
  };
}
