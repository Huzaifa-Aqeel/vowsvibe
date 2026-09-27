import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { proSubscriptionAccess } from "@/lib/billing/revenuecat";
import { FREE_BRIDE_VTO_LIMIT, PRO_PARTICIPANT_VTO_LIMIT } from "@/lib/billing/plan";

export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your membership." }, { status: 401 });
  try {
    const access = await proSubscriptionAccess(user.id);
    return NextResponse.json({
      ...access,
      plan: {
        name: "Vows & Vibe Pro Wedding Pass",
        freeBrideVtoLimit: FREE_BRIDE_VTO_LIMIT,
        proParticipantVtoLimit: PRO_PARTICIPANT_VTO_LIMIT,
        skinAnalysesPerParticipant: 1,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return NextResponse.json({ error: "Could not verify your membership. Please try again." }, { status: 503 }); }
}
