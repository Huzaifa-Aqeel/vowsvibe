export type SuggestionParticipantRole = "bride" | "bridesmaid";

export function canExchangeSuggestion(
  senderRole: SuggestionParticipantRole,
  recipientRole: SuggestionParticipantRole,
) {
  return (senderRole === "bride" && recipientRole === "bridesmaid")
    || (senderRole === "bridesmaid" && recipientRole === "bride");
}
