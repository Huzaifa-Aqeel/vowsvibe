"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow } from "@/lib/types";

interface SuggestionItem {
  id: string;
  text: string;
  created_at: string;
  from_participant_id: string;
  from_name: string;
}

interface Props {
  eventId: string;
  currentParticipantId: string | null;
  currentParticipantToken?: string | null;
  target: ParticipantRow | null;
  className?: string;
  onEnabledChange?: (enabled: boolean) => void;
}

function tokenQuery(token?: string | null) {
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

export function SuggestionTools({ eventId, currentParticipantId, currentParticipantToken, target, className = "", onEnabledChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const dismissedSuggestionIdsRef = useRef<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authQuery = tokenQuery(currentParticipantToken);

  async function refresh() {
    if (!currentParticipantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/participants/${currentParticipantId}/suggestions${authQuery}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not load suggestions");
      const nextEnabled = Boolean(json.suggestions_enabled);
      setEnabled(nextEnabled);
      onEnabledChange?.(nextEnabled);
      const incoming = (json.suggestions ?? []) as SuggestionItem[];
      setSuggestions(incoming.filter((suggestion) => !dismissedSuggestionIdsRef.current.has(suggestion.id)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load suggestions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setText("");
    setError(null);
    dismissedSuggestionIdsRef.current = new Set();
    if (!currentParticipantId) {
      setEnabled(false);
      setSuggestions([]);
      return;
    }

    void refresh();

    const supabase = createClient();
    const suggestionChannel = supabase
      .channel(`suggestions:${eventId}:${currentParticipantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "suggestion_updates", filter: `event_id=eq.${eventId}` },
        () => { void refresh(); },
      )
      .subscribe();

    const lineupChannel = supabase
      .channel(`suggestions-look:${eventId}:${currentParticipantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lineup_updates", filter: `event_id=eq.${eventId}` },
        () => { void refresh(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(suggestionChannel);
      void supabase.removeChannel(lineupChannel);
    };
    // The current participant identity is intentionally the subscription boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, currentParticipantId, currentParticipantToken]);

  async function toggleEnabled() {
    if (!currentParticipantId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/participants/${currentParticipantId}${authQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions_enabled: !enabled }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not update suggestion setting");
      const nextEnabled = Boolean(json.participant?.suggestions_enabled);
      setEnabled(nextEnabled);
      onEnabledChange?.(nextEnabled);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update suggestion setting");
    } finally {
      setBusy(false);
    }
  }

  function dismissSuggestion(suggestionId: string) {
    // UI-only dismissal: keep the database row and realtime behavior untouched.
    dismissedSuggestionIdsRef.current = new Set(dismissedSuggestionIdsRef.current).add(suggestionId);
    setSuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
  }

  async function sendSuggestion() {
    if (!currentParticipantId || !target || target.id === currentParticipantId || !enabled || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/participants/${currentParticipantId}/suggestions${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_participant_id: target.id, text: text.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not send suggestion");
      setText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send suggestion");
    } finally {
      setBusy(false);
    }
  }

  if (!currentParticipantId) return null;

  return (
    <div className={`rounded-2xl border border-white/70 bg-white/60 px-3 py-2 shadow-sm backdrop-blur-xl ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle size={14} className="shrink-0 text-rose-700" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">Suggestions</span>
          {suggestions.length > 0 && (
            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{suggestions.length}</span>
          )}
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          disabled={busy}
          onClick={() => void toggleEnabled()}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${enabled ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-stone-200"}`}
          title={enabled ? "Turn suggestions off" : "Turn suggestions on"}
        >
          <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-stone-200/70 pt-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <div key={suggestion.id} className="group flex items-start gap-2 rounded-xl bg-white/75 px-2.5 py-2 text-[11px] leading-relaxed text-stone-700">
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-stone-900">{suggestion.from_name}:</span> {suggestion.text}
              </div>
              <button
                type="button"
                aria-label="Dismiss suggestion"
                title="Dismiss suggestion"
                onClick={() => dismissSuggestion(suggestion.id)}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-stone-400 opacity-70 transition hover:bg-stone-100 hover:text-stone-700 group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {enabled && target && target.id !== currentParticipantId && (
        <div className="mt-2 border-t border-stone-200/70 pt-2">
          <p className="mb-1.5 text-[10px] text-stone-500">Suggest to <span className="font-semibold text-stone-800">{target.name}</span></p>
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 500))}
              rows={2}
              maxLength={500}
              placeholder="Any helpful thought…"
              className="min-h-[52px] flex-1 resize-none rounded-xl border border-stone-200 bg-white/85 px-2.5 py-2 text-xs text-stone-800 outline-none ring-0 placeholder:text-stone-400 focus:border-rose-300"
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void sendSuggestion()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-900 text-white shadow-sm transition hover:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-40"
              title={`Send suggestion to ${target.name}`}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {enabled && !target && (
        <p className="mt-2 border-t border-stone-200/70 pt-2 text-[10px] text-stone-500">Select another person in the lineup to suggest a change.</p>
      )}

      {loading && suggestions.length === 0 && <p className="mt-2 text-[10px] text-stone-400">Loading…</p>}
      {error && <p className="mt-2 text-[10px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
