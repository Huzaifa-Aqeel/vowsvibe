import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getParticipantWithAttempts, publicParticipant } from "@/lib/vto/participant";
export async function GET(_req: Request, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const admin = createServiceRoleClient();
  const result = await getParticipantWithAttempts(admin, participantId);
  if (!result.participant || result.participant.status !== "confirmed") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ participant: publicParticipant(result.participant) });
}
