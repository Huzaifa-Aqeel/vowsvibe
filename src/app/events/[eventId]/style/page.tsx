import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BridalLookStudio } from "@/components/BridalLookStudio";
import { createClient } from "@/lib/supabase/server";
import { getParticipantWithAttempts } from "@/lib/vto/participant";
import { publicStorageUrl } from "@/lib/storage/upload";
import type { EventRow, BridalLookView, VtoAttemptRow } from "@/lib/types";

export default async function BridalStylePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).eq("owner_id", user.id).maybeSingle<EventRow>();
  if (!event) notFound();
  const admin = (await import("@/lib/supabase/server")).createServiceRoleClient();
  const { data: bride } = await admin.from("participants").select("id").eq("event_id", event.id).eq("role", "bride").maybeSingle();
  if (!bride) notFound();
  const result = await getParticipantWithAttempts(admin, bride.id);
  const initialLooks: BridalLookView[] = (result.attempts as VtoAttemptRow[]).map((attempt) => ({
    ...attempt,
    original_photo_url: publicStorageUrl(attempt.body_photo_path),
    dress_url: publicStorageUrl(attempt.dress_path),
    vto_render_url: publicStorageUrl(attempt.render_path),
  }));
  return <main className="relative min-h-screen overflow-hidden bg-[#fbf9f5] px-4 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl"><div className="mb-3 flex items-center justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{event.title}</p><Link href={`/events/${event.id}`} className="text-xs font-medium text-stone-500 transition hover:text-rose-800">Skip for now · Bridal lineup →</Link></div><BridalLookStudio event={event} initialLooks={initialLooks} brideParticipantId={bride.id} initialPhotoUrl={result.participant?.original_photo_url ?? null} initialUndertone={result.participant?.skin_undertone ?? null} initialSkinToneHex={result.participant?.skin_tone_hex ?? null} initialHairToneHex={result.participant?.hair_tone_hex ?? null} /></div></main>;
}
