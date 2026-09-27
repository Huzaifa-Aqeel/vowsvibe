import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { proSubscriptionAccess, revenueCatEntitlementId } from "@/lib/billing/revenuecat";
import { persistRevenueCatAccess, readCachedRevenueCatAccess } from "@/lib/billing/revenuecat-store";
import { FREE_BRIDE_VTO_LIMIT, PRO_PARTICIPANT_VTO_LIMIT } from "@/lib/billing/plan";

export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your membership." }, { status: 401 });
  try {
    const admin = createServiceRoleClient();
    const cached = await readCachedRevenueCatAccess(admin, user.id, revenueCatEntitlementId());
    // Active webhook snapshots make the membership screen instant. An inactive or
    // absent snapshot is always reconciled directly so a new purchase appears at once.
    const access = cached?.active ? cached : await proSubscriptionAccess(user.id);
    if (!cached?.active) {
      await persistRevenueCatAccess(admin, user.id, access).catch(() => {});
    }
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
