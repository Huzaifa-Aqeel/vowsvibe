import { NextRequest, NextResponse } from "next/server";
import { resolveDressColor, type DressColorPaletteOption } from "@/lib/color/dress-color-resolver";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { participantAiPlan } from "@/lib/billing/plan";
import { RevenueCatUnavailableError } from "@/lib/billing/revenuecat";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const participantId = typeof body?.participantId === "string" ? body.participantId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const admin = createServiceRoleClient();
    if (!participantId) {
      // Event creation has two fixed moodboard dress slots before a bride participant
      // exists. It is still restricted to a verified signed-in bride.
      const client = await createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return NextResponse.json({ error: "Sign in before analyzing a dress." }, { status: 401 });
    } else {
      const { data: participant } = await admin.from("participants").select("id,event_id,session_token,role").eq("id", participantId).maybeSingle();
      if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });
      let authorized = Boolean(token && token === participant.session_token);
      if (!authorized) {
        const client = await createClient();
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          const { data: event } = await admin.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
          authorized = event?.owner_id === user.id;
        }
      }
      if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      const plan = await participantAiPlan(admin, participant);
      if (plan.tier === "locked") {
        return NextResponse.json({
          error: "The bride needs an active Vows & Vibe Pro Wedding Pass before bridesmaids can analyze dresses.",
          code: "PRO_REQUIRED",
          upgrade_required: true,
        }, { status: 402 });
      }
    }
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
    if (error instanceof RevenueCatUnavailableError) {
      return NextResponse.json({ error: error.message, code: "MEMBERSHIP_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve dress color" },
      { status: 502 },
    );
  }
}
