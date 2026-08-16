import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import type { EventRow } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = createClient();
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
        <Link href="/events/new">
          <Button>
            <Plus size={16} /> New event
          </Button>
        </Link>
      </div>

      {!events?.length ? (
        <Card className="text-center text-neutral-500">
          No events yet — create your first wedding party lineup.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(events as EventRow[]).map((event) => (
            <div key={event.id} className="group relative">
              <Link href={`/events/${event.id}`} className="block h-full">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="mb-2 flex flex-wrap gap-1.5 pr-8">
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
                    {event.event_date ?? "No date set"} · {event.dress_style ?? "No style set"}
                  </p>
                </Card>
              </Link>
              {/* Sibling of the Link, not a descendant — clicking this can never trigger the
                  card's navigation, no stopPropagation hacks needed. Visible on hover for
                  mouse users; always visible on touch devices, since there's no hover state
                  to reveal it there. */}
              <div className="absolute right-3 top-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <DeleteEventButton eventId={event.id} eventTitle={event.title} variant="icon" stayOnPage />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
