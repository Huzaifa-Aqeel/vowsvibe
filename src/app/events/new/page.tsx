import { EventForm } from "@/components/EventForm";

export default function NewEventPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-serif text-3xl">Create your event</h1>
      <EventForm />
    </main>
  );
}
