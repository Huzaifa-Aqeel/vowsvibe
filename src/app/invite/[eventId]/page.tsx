import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BridesmaidFlow } from "@/components/BridesmaidFlow";
import { resolveStorageUrl } from "@/lib/storage/upload";
import type { EventRow } from "@/lib/types";
export default async function InvitePage({ params }: { params: { eventId: string } }) {
  // Service-role client, not the RLS-respecting one: a bridesmaid opening this link has
  // no Supabase session at all, and `events` has no public-read policy (see schema.sql —
  // that policy was intentionally dropped in favor of server-mediated access). Only the
  // event row itself is exposed here, via the invite_code lookup, same as the lineup and
  // participants API routes already do.
  const admin = createServiceRoleClient();
  const { data: event } = await admin.from("events").select("*").eq("invite_code", params.eventId).maybeSingle<EventRow>();
  if (!event) notFound();
  const example_dresses = await Promise.all((event.example_dresses ?? []).map(async (dress) => ({ ...dress, url: resolveStorageUrl(dress.storage_path ?? dress.url) ?? dress.url })));
  return <main className="relative min-h-screen overflow-hidden bg-[#FBF9F5] px-5 py-7 sm:px-8 sm:py-10"><div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10"><div className="absolute inset-0 bg-[#FBF9F5]" /><div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-blush-100/50 blur-[110px]" /><div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] translate-x-1/3 translate-y-1/3 rounded-full bg-blush-200/30 blur-[100px]" /></div><BridesmaidFlow event={{ ...event, example_dresses }} /></main>;
}
