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
  const [panelOpen, setPanelOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const dismissedSuggestionIdsRef = useRef<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authQuery = tokenQuery(currentParticipantToken);

  useEffect(() => {
    if (enabled && target && target.id !== currentParticipantId) setPanelOpen(true);
  }, [enabled, target, currentParticipantId]);

  async function refresh() {
    if (!currentParticipantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/participants/${currentParticipantId}/suggestions${authQuery}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not load suggestions");
      const nextEnabled = Boolean(json.suggestions_enabled);
      setEnabled(nextEnabled);
      if (!nextEnabled) setPanelOpen(false);
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
      if (!nextEnabled) setPanelOpen(false);
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
    <div className={`pointer-events-none flex flex-col items-end gap-2 ${className}`}>
      {enabled && panelOpen && (
        <div className="suggestion-sheet pointer-events-auto border border-white/80 bg-white/95 p-4 shadow-2xl shadow-stone-900/20 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-700">Suggestions</p>
              <p className="truncate text-sm font-semibold text-stone-900">
                {target && target.id !== currentParticipantId ? `About ${target.name}` : "Messages"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Minimize suggestions"
              title="Minimize suggestions"
              onClick={() => setPanelOpen(false)}
              className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-full text-stone-500 transition active:bg-stone-100 active:text-stone-900 sm:hover:bg-stone-100 sm:hover:text-stone-900"
            >
              <X size={15} />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-stone-200/70 pt-3">
              {suggestions.slice(0, 3).map((suggestion) => (
                <div key={suggestion.id} className="group flex items-start gap-2 rounded-xl bg-stone-50 px-2.5 py-2 text-[11px] leading-relaxed text-stone-700">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-stone-900">{suggestion.from_name}:</span> {suggestion.text}
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss suggestion"
                    title="Dismiss suggestion"
                    onClick={() => dismissSuggestion(suggestion.id)}
                    className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-full text-stone-400 transition active:bg-white active:text-stone-700 sm:hover:bg-white sm:hover:text-stone-700"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {target && target.id !== currentParticipantId ? (
            <div className="mt-3 border-t border-stone-200/70 pt-3">
              <p className="mb-2 text-[10px] text-stone-500">Send a suggestion about <span className="font-semibold text-stone-800">{target.name}</span></p>
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value.slice(0, 500))}
                  rows={2}
                  maxLength={500}
                  placeholder="Any helpful thought…"
                  className="min-h-[58px] flex-1 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 outline-none placeholder:text-stone-400 focus:border-rose-300"
                />
                <button
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={() => void sendSuggestion()}
                  className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-full bg-stone-900 text-white shadow-sm transition active:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-40 sm:hover:bg-rose-950"
                  title={`Send suggestion about ${target.name}`}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 border-t border-stone-200/70 pt-3 text-xs text-stone-500">Select another person in the lineup to start a suggestion.</p>
          )}

          {loading && suggestions.length === 0 && <p className="mt-2 text-[10px] text-stone-400">Loading…</p>}
          {error && <p className="mt-2 text-[10px] font-medium text-red-600">{error}</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        {enabled && (
          <button
            type="button"
            aria-label={panelOpen ? "Minimize suggestions" : "Open suggestions"}
            title={panelOpen ? "Minimize suggestions" : "Open suggestions"}
            onClick={() => setPanelOpen((current) => !current)}
            className="pointer-events-auto relative grid h-14 w-14 touch-manipulation place-items-center rounded-full border border-white/70 bg-stone-900 text-white shadow-xl shadow-stone-900/25 transition active:bg-rose-950 sm:hover:-translate-y-0.5 sm:hover:bg-rose-950"
          >
            <MessageCircle size={22} />
            {suggestions.length > 0 && (
              <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-rose-600 px-1 text-[9px] font-bold text-white">
                {suggestions.length > 99 ? "99+" : suggestions.length}
              </span>
            )}
          </button>
        )}

        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle size={14} className="shrink-0 text-rose-700" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">Suggestions</span>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          disabled={busy}
          onClick={() => void toggleEnabled()}
          className={`relative inline-flex h-11 w-14 shrink-0 touch-manipulation items-center rounded-full border transition ${enabled ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-stone-200"}`}
          title={enabled ? "Turn suggestions off" : "Turn suggestions on"}
        >
          <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-7" : "translate-x-1.5"}`} />
        </button>
      </div>
      </div>
    </div>
  );
}
