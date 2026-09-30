import { EventForm } from "@/components/EventForm";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existingEvent } = await supabase
    .from("events")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingEvent) redirect(`/events/${existingEvent.id}`);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-serif text-3xl">Create your event</h1>
      <EventForm />
    </main>
  );
}
