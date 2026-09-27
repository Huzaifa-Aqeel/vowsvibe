import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveStorageUrl } from "@/lib/storage/upload";
import type { EventRow } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  const admin = createServiceRoleClient();
  const { data: event, error } = await admin.from("events")
    .select("id,title,event_date,dress_style,dress_length,fabric_type,color_palette,example_dresses,invite_code,created_at,group_preview_path,group_preview_updated_at")
    .eq("invite_code", inviteCode).maybeSingle<Omit<EventRow, "owner_id">>();
  if (error) return NextResponse.json({ error: "Could not load this invitation." }, { status: 500 });
  if (!event) return NextResponse.json({ error: "This invitation was not found. Ask the bride for a current link." }, { status: 404 });
  return NextResponse.json({ event: { ...event,
    example_dresses: (event.example_dresses ?? []).map((dress) => ({ ...dress, url: resolveStorageUrl(dress.storage_path ?? dress.url) ?? dress.url })),
    group_preview_path: resolveStorageUrl(event.group_preview_path),
  } }, { headers: { "Cache-Control": "no-store" } });
}
