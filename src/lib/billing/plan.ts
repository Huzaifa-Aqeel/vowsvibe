import type { SupabaseClient } from "@supabase/supabase-js";
import { proSubscriptionAccess, type ProSubscriptionAccess } from "@/lib/billing/revenuecat";

export const FREE_BRIDE_VTO_LIMIT = 2;
export const PRO_PARTICIPANT_VTO_LIMIT = 8;
export const FREE_PERIOD_START = "1970-01-01T00:00:00.000Z";

type ParticipantForPlan = {
  id: string;
  event_id: string;
  role: "bride" | "bridesmaid";
};

export type ParticipantAiPlan = {
  ownerId: string;
  pro: ProSubscriptionAccess;
  tier: "free" | "pro" | "locked";
  vtoLimit: number;
  periodStart: string;
  periodEnd: string | null;
  skinAnalysisAllowed: boolean;
};

export class VtoQuotaError extends Error {
  constructor(public readonly plan: ParticipantAiPlan) {
    super(plan.tier === "pro"
      ? `You have used all ${plan.vtoLimit} Wedding Pass try-ons for this participant.`
      : plan.tier === "free"
        ? `The free bride plan includes ${plan.vtoLimit} successful try-ons. Buy a one-time Vows & Vibe Pro Wedding Pass for eight total try-ons per participant.`
        : "The bride needs an active Vows & Vibe Pro Wedding Pass before bridesmaids can use AI try-on.");
    this.name = "VtoQuotaError";
  }
}

export async function participantAiPlan(
  admin: SupabaseClient,
  participant: ParticipantForPlan,
): Promise<ParticipantAiPlan> {
  const { data: event, error } = await admin.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
  if (error || !event?.owner_id) throw new Error("Could not verify the wedding owner.");
  const pro = await proSubscriptionAccess(event.owner_id);
  if (pro.active) {
    return {
      ownerId: event.owner_id,
      pro,
      tier: "pro",
      vtoLimit: PRO_PARTICIPANT_VTO_LIMIT,
      periodStart: pro.periodStart ?? new Date().toISOString(),
      periodEnd: pro.periodEnd,
      skinAnalysisAllowed: true,
    };
  }
  if (participant.role === "bride") {
    return {
      ownerId: event.owner_id,
      pro,
      tier: "free",
      vtoLimit: FREE_BRIDE_VTO_LIMIT,
      periodStart: FREE_PERIOD_START,
      periodEnd: null,
      skinAnalysisAllowed: true,
    };
  }
  return {
    ownerId: event.owner_id,
    pro,
    tier: "locked",
    vtoLimit: 0,
    periodStart: FREE_PERIOD_START,
    periodEnd: null,
    skinAnalysisAllowed: false,
  };
}

export async function reserveVtoAttempt(
  admin: SupabaseClient,
  plan: ParticipantAiPlan,
  input: {
    participantId: string;
    participantDressId: string | null;
    dressPath: string | null;
    bodyPhotoPath: string;
  },
) {
  if (!plan.vtoLimit) throw new VtoQuotaError(plan);
  const reservationTaskId = `reserved:${crypto.randomUUID()}`;
  const { data, error } = await admin.rpc("reserve_vto_attempt", {
    p_participant_id: input.participantId,
    p_participant_dress_id: input.participantDressId,
    p_dress_path: input.dressPath,
    p_body_photo_path: input.bodyPhotoPath,
    p_task_id: reservationTaskId,
    p_period_start: plan.periodStart,
    p_limit: plan.vtoLimit,
  }).single();
  if (error?.message?.includes("VTO_QUOTA_EXCEEDED")) throw new VtoQuotaError(plan);
  if (error || !data) {
    console.error("VTO quota reservation failed", error);
    throw new Error("AI usage tracking is unavailable. Apply the latest Supabase schema and try again.");
  }
  return data as { id: string; task_id: string };
}

export async function releaseVtoReservation(admin: SupabaseClient, attemptId: string | null) {
  if (!attemptId) return;
  await admin.from("vto_attempts").update({ status: "error" }).eq("id", attemptId).eq("status", "processing");
}

export function vtoQuotaPayload(error: VtoQuotaError) {
  return {
    error: error.message,
    code: error.plan.tier === "locked" ? "PRO_REQUIRED" : "VTO_QUOTA_EXCEEDED",
    upgrade_required: error.plan.tier !== "pro",
    tier: error.plan.tier,
    limit: error.plan.vtoLimit,
    period_end: error.plan.periodEnd,
  };
}
