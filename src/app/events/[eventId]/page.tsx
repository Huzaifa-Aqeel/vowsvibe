import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { InviteLinkCard } from "@/components/InviteLinkCard";
import { LineupRow } from "@/components/LineupRow";
import { Card } from "@/components/ui/card";
import { siteUrl } from "@/lib/utils";
import { getParticipantsWithAttempts } from "@/lib/vto/participant";
import type { EventRow, ParticipantRow } from "@/lib/types";

export default async function EventDashboardPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).eq("owner_id", user.id).maybeSingle<EventRow>();
  if (!event) notFound();
  const admin = createServiceRoleClient();
  const { data: rows } = await admin.from("participants").select("id").eq("event_id", event.id).eq("status", "confirmed").order("created_at", { ascending: true });
  const batch = await getParticipantsWithAttempts(admin, (rows ?? []).map((row) => row.id));
  const participants: ParticipantRow[] = batch.participants;
  const inviteUrl = siteUrl(`/invite/${event.invite_code}`);
  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-rose-700">Bridal party dashboard</p>
          <h1 className="font-serif text-3xl text-stone-900 sm:text-4xl">{event.title}</h1>
          <p className="mt-1 text-sm text-stone-500">{event.event_date ?? "No date set"} · {event.dress_style ?? "No style set"}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href={`/events/${event.id}/lineup`}
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-950 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:ring-offset-2"
            >
              Compose lineup <span aria-hidden="true">→</span>
            </Link>
            <Link
              href={`/events/${event.id}/style`}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-rose-200 hover:bg-rose-50"
            >
              Change your look
            </Link>
          </div>
        </div>

      </div>
      <div className="mb-5">
        <InviteLinkCard inviteUrl={inviteUrl} />
      </div>
      <Card className="border-stone-200/80 bg-white/90 p-4 shadow-sm sm:p-6">
        <LineupRow eventId={event.id} initialParticipants={participants} />
      </Card>
    </main>
  );
}
