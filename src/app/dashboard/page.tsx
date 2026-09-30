import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import type { EventRow } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Your events</h1>
        </div>
      </div>

      {!events?.length ? (
        <Card className="px-6 py-10 text-center">
          <h2 className="font-serif text-2xl text-stone-900">Create your wedding</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
            Set your palette and styling direction, then invite your bridal party.
          </p>
          <Link href="/events/new" className="mt-6 inline-flex">
            <Button size="lg">Create event</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(events as EventRow[]).map((event) => (
            <div key={event.id} className="relative">
              <Link href={`/events/${event.id}`} className="block h-full">
                <Card className="h-full pr-14 transition-shadow hover:shadow-md">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {event.color_palette?.map((color) => (
                      <span
                        key={color.id}
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: color.hex }}
                      />
                    ))}
                  </div>
                  <h2 className="font-serif text-lg">{event.title}</h2>
                  <p className="text-sm text-neutral-500">
                    {event.event_date ?? "No date set"}
                  </p>
                </Card>
              </Link>
              <div className="absolute right-3 top-3 z-10">
                <DeleteEventButton eventId={event.id} eventTitle={event.title} variant="icon" stayOnPage />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
