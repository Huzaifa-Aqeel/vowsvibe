import { NextRequest, NextResponse } from "next/server";
import { resolveDressColor, type DressColorPaletteOption } from "@/lib/color/dress-color-resolver";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const colorLabel = typeof body?.colorLabel === "string" ? body.colorLabel : "";
    const palette = Array.isArray(body?.palette)
      ? body.palette
          .filter((item: unknown): item is { name: string; hex: string } => {
            if (!item || typeof item !== "object") return false;
            const value = item as Record<string, unknown>;
            return typeof value.name === "string" && typeof value.hex === "string";
          })
          .map((item: { name: string; hex: string; family?: string }): DressColorPaletteOption => ({ name: item.name, hex: item.hex, family: item.family ?? null }))
      : [];

    const result = await resolveDressColor(colorLabel, palette);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Dress color resolution failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve dress color" },
      { status: 502 },
    );
  }
}
