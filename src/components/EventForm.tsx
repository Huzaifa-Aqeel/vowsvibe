"use client";
import { clientFetch as fetch } from "@/lib/platform/runtime";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import ColorPaletteInput from "@/components/ColorPaletteInput";
import DressLengthSelector, { type DressLength } from "@/components/DressLengthSelector";
import FabricSelector, { type FabricType } from "@/components/FabricSelector";
import { DressDropzone } from "@/components/DressDropzone";
import type { EventRow, ExampleDress, SwatchColor } from "@/lib/types";

export function EventForm({ mobileMode = false, initialEvent, onUpgradeRequired }: { mobileMode?: boolean; initialEvent?: EventRow; onUpgradeRequired?: () => void } = {}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [eventDate, setEventDate] = useState(initialEvent?.event_date ?? "");
  const [dressStyle, setDressStyle] = useState(initialEvent?.dress_style ?? "");
  const [dressLength, setDressLength] = useState<DressLength>(initialEvent?.dress_length === "Short" ? "short" : initialEvent?.dress_length === "Long" ? "long" : initialEvent?.dress_length === "Ankle-Length" ? "ankle" : "floor");
  const [fabricType, setFabricType] = useState<string>(initialEvent?.fabric_type ?? "chiffon-classic");
  const [colors, setColors] = useState<SwatchColor[]>(initialEvent?.color_palette ?? []);
  const [exampleDresses, setExampleDresses] = useState<ExampleDress[]>(initialEvent?.example_dresses ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const steps = ["Event details", "Dress code", "Colors & dresses"];
  function moveStep(next: number) {
    if (next > step && !title.trim()) {
      setError("Enter an event name to continue.");
      document.getElementById("title")?.focus();
      return;
    }
    setError(null);
    setStep(next);
    document.getElementById("event-form")?.scrollIntoView({ block: "start" });
  }

  const dressLengthLabels: Record<DressLength, string> = {
    short: 'Short',
    long: 'Long',
    ankle: 'Ankle-Length',
    floor: 'Floor-Length',
  };

  const handleFabricChange = (fabric: FabricType, subFabric?: string) => {
    setFabricType(subFabric ?? fabric);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (mobileMode && step < 2) { moveStep(step + 1); return; }
    if (!title.trim()) { setStep(0); setError("Enter an event name to continue."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(initialEvent ? `/api/events/${initialEvent.id}` : "/api/events", {
        method: initialEvent ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          event_date: eventDate || null,
          dress_style: dressStyle || null,
          dress_length: dressLengthLabels[dressLength],
          fabric_type: fabricType,
          color_palette: colors,
          example_dresses: exampleDresses,
        }),
      });
      const json = await res.json();
      if (res.status === 402 && json.upgrade_required) onUpgradeRequired?.();
      if (!res.ok) throw new Error(json.error ?? "Could not create event");
      router.push(`/events/${json.event.id}${initialEvent ? "" : "/style"}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const maxDresses = 4;

  return (
    <form id="event-form" onSubmit={handleSubmit} noValidate={mobileMode} className="space-y-6">
      {mobileMode && <nav aria-label="Event creation progress"><p role="status" className="mb-3 text-xs font-semibold text-rose-800">Step {step + 1} of 3 · {steps[step]}</p><div className="flex gap-2">{steps.map((label, index) => <span key={label} aria-current={index === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-rose-400" : "bg-stone-200"}`}/>)}</div></nav>}
      <fieldset hidden={mobileMode && step !== 0} className="space-y-6">
      <legend className="sr-only">Event details</legend>
      <Card>
        <Label htmlFor="title">Event name</Label>
        <Input
          id="title"
          required
          placeholder="Ayesha's Destination Wedding"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="mt-4">
          <Label htmlFor="date">Event date</Label>
          <Input id="date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>

        <div className="mt-4">
          <Label htmlFor="style">Style guideline</Label>
          <Input
            id="style"
            placeholder="Lehenga / Indo-Western Gown; Silk or Chiffon"
            value={dressStyle}
            onChange={(e) => setDressStyle(e.target.value)}
          />
        </div>
      </Card>
      </fieldset>
      <fieldset hidden={mobileMode && step !== 1} className="space-y-6">
      <legend className="sr-only">Dress code</legend>
      <Card>
        <Label>Dress length</Label>
        <div className="mt-4">
          <DressLengthSelector value={dressLength} onChange={setDressLength} />
        </div>
      </Card>
      <Card>
        <Label>Fabric requirement</Label>
        <div className="mt-4">
          <FabricSelector value={fabricType} onChange={handleFabricChange} />
        </div>
      </Card>
      </fieldset>
      <fieldset hidden={mobileMode && step !== 2} className="space-y-6">
      <legend className="sr-only">Colors and dresses</legend>
      <Card>
        <Label>Color palette</Label>
        <ColorPaletteInput value={colors} onChange={setColors} />
      </Card>

      <Card>
        <Label>Dress moodboard</Label>
        <p className="mb-3 -mt-1 text-xs text-neutral-500">
          Add up to four example dresses. After upload, tell us the dress color palette; we use that named palette consistently for match analysis and lineup filtering.
        </p>
<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">          {exampleDresses.map((d, i) => (
            <DressDropzone
              key={i}
              folder="catalog-dresses/bride"
              currentUrl={d.url}
              onUploaded={() => {}}
              onClear={() => setExampleDresses(exampleDresses.filter((_, idx) => idx !== i))}
            />
          ))}
          {exampleDresses.length < maxDresses && (
            <DressDropzone
              folder="catalog-dresses/bride"
              label="Add dress example"
              askColorPalette
              paletteOptions={colors}
              onUploaded={(url, path, meta) =>
                setExampleDresses([
                  ...exampleDresses,
                  {
                    url,
                    storage_path: path ?? null,
                    primaryHex: meta?.primaryHex ?? null,
                    colorName: meta?.colorName ?? null,
                  },
                ])
              }
            />
          )}
        </div>
      </Card>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {mobileMode && step < 2 && <Button type="submit" size="lg" className="w-full">Continue</Button>}
      {mobileMode && step > 0 && <Button type="button" variant="outline" onClick={() => moveStep(step - 1)} disabled={submitting} className="w-full">Previous step</Button>}

      {(!mobileMode || step === 2) && (
      <Button type="submit" size="lg" disabled={submitting || !title} className="w-full">
        {submitting ? "Saving your event…" : initialEvent ? "Save event changes" : "Create event & style my look"}
      </Button>
      )}
    </form>
  );
}
