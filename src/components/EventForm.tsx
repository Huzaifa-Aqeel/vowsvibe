"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import ColorPaletteInput from "@/components/ColorPaletteInput";
import DressLengthSelector, { type DressLength } from "@/components/DressLengthSelector";
import FabricSelector, { type FabricType } from "@/components/FabricSelector";
import { DressDropzone } from "@/components/DressDropzone";
import type { ExampleDress, SwatchColor } from "@/lib/types";

export function EventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [dressStyle, setDressStyle] = useState("");
  const [dressLength, setDressLength] = useState<DressLength>("floor");
  const [fabricType, setFabricType] = useState<string>("chiffon-classic");
  const [colors, setColors] = useState<SwatchColor[]>([]);
  const [exampleDresses, setExampleDresses] = useState<ExampleDress[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
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
      if (!res.ok) throw new Error(json.error ?? "Could not create event");
      router.push(`/events/${json.event.id}/style`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const maxDresses = 4;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" size="lg" disabled={submitting || !title} className="w-full">
        {submitting ? "Creating your event…" : "Create event & style my look"}
      </Button>
    </form>
  );
}
