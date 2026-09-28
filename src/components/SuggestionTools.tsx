"use client";
import { clientFetch as fetch } from "@/lib/platform/runtime";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow } from "@/lib/types";

interface SuggestionItem {
  id: string;
  text: string;
  created_at: string;
  from_participant_id: string;
  to_participant_id: string;
  from_name: string;
  to_name: string;
}

interface Props {
  eventId: string;
  currentParticipantId: string | null;
  participants: ParticipantRow[];
  currentParticipantToken?: string | null;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  request?: typeof fetch;
  subscribeToUpdates?: (refresh: () => void) => () => void;
}

function tokenQuery(token?: string | null) {
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function SuggestionTools({
  eventId,
  currentParticipantId,
  participants,
  currentParticipantToken,
  className = "",
  onOpenChange,
  request = fetch,
  subscribeToUpdates,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const dismissedSuggestionIdsRef = useRef<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authQuery = tokenQuery(currentParticipantToken);
  const currentParticipant = participants.find((person) => person.id === currentParticipantId) ?? null;
  const conversationTargets = useMemo(() => {
    if (!currentParticipant) return [];
    return participants.filter((person) => person.id !== currentParticipant.id && (
      currentParticipant.role === "bride" ? person.role === "bridesmaid" : person.role === "bride"
    ));
  }, [currentParticipant, participants]);
  const activeTarget = currentParticipant?.role === "bridesmaid"
    ? conversationTargets[0] ?? null
    : conversationTargets.find((person) => person.id === selectedTargetId) ?? null;
  const conversation = activeTarget
    ? suggestions.filter((suggestion) => (
      suggestion.from_participant_id === currentParticipantId && suggestion.to_participant_id === activeTarget.id
    ) || (
      suggestion.from_participant_id === activeTarget.id && suggestion.to_participant_id === currentParticipantId
    )).slice().reverse()
    : [];
  const incomingCount = suggestions.filter((suggestion) => suggestion.to_participant_id === currentParticipantId).length;

  async function refresh() {
    if (!currentParticipantId) return;
    setLoading(true);
    try {
      const response = await request(`/api/participants/${currentParticipantId}/suggestions${authQuery}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not load suggestions");
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
    setSelectedTargetId(null);
    dismissedSuggestionIdsRef.current = new Set();
    if (!currentParticipantId) {
      setPanelOpen(false);
      onOpenChange?.(false);
      setSuggestions([]);
      return;
    }

    void refresh();

    if (subscribeToUpdates) return subscribeToUpdates(() => { void refresh(); });

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

  async function dismissSuggestion(suggestionId: string) {
    const removed = suggestions.find((suggestion) => suggestion.id === suggestionId);
    if (!removed || !currentParticipantId || removed.to_participant_id !== currentParticipantId) return;

    dismissedSuggestionIdsRef.current = new Set(dismissedSuggestionIdsRef.current).add(suggestionId);
    setSuggestions((current) => current.filter((suggestion) => suggestion.id !== suggestionId));
    setError(null);

    try {
      const response = await request(`/api/participants/${currentParticipantId}/suggestions${authQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggestionId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not delete suggestion");
    } catch (err) {
      const nextDismissed = new Set(dismissedSuggestionIdsRef.current);
      nextDismissed.delete(suggestionId);
      dismissedSuggestionIdsRef.current = nextDismissed;
      setSuggestions((current) => current.some((suggestion) => suggestion.id === suggestionId)
        ? current
        : [...current, removed].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setError(err instanceof Error ? err.message : "Could not delete suggestion");
    }
  }

  async function sendSuggestion() {
    if (!currentParticipantId || !activeTarget || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request(`/api/participants/${currentParticipantId}/suggestions${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_participant_id: activeTarget.id, text: text.trim() }),
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
      {panelOpen && (
        <div className="suggestion-sheet pointer-events-auto border border-white/80 bg-white/95 p-4 shadow-2xl shadow-stone-900/20 backdrop-blur-2xl">
          <div className="flex items-center gap-2 border-b border-stone-200/70 pb-3">
            {currentParticipant?.role === "bride" && activeTarget && (
              <button
                type="button"
                aria-label="Back to bridesmaids"
                onClick={() => { setSelectedTargetId(null); setText(""); setError(null); }}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 transition active:bg-stone-100 sm:hover:bg-stone-100"
              >
                <ArrowLeft size={17}/>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-700">Suggestions</p>
              <p className="truncate text-sm font-semibold text-stone-900">
                {activeTarget ? activeTarget.name : "Bridesmaids"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Minimize suggestions"
              title="Minimize suggestions"
              onClick={() => { setPanelOpen(false); setSelectedTargetId(null); onOpenChange?.(false); }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-stone-500 transition active:bg-stone-100 active:text-stone-900 sm:hover:bg-stone-100 sm:hover:text-stone-900"
            >
              <X size={15}/>
            </button>
          </div>

          {currentParticipant?.role === "bride" && !activeTarget ? (
            <div className="mt-3 space-y-1.5">
              {conversationTargets.map((person) => {
                const last = suggestions.find((suggestion) => (
                  suggestion.from_participant_id === person.id && suggestion.to_participant_id === currentParticipantId
                ) || (
                  suggestion.from_participant_id === currentParticipantId && suggestion.to_participant_id === person.id
                ));
                return <button
                  key={person.id}
                  type="button"
                  onClick={() => { setSelectedTargetId(person.id); setText(""); setError(null); }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50 px-3 py-2 text-left transition active:bg-rose-50 sm:hover:border-rose-100 sm:hover:bg-rose-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-100 font-serif text-sm text-rose-900">{person.name.trim().charAt(0).toUpperCase() || "B"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-900">{person.name}</span>
                    <span className="block truncate text-[11px] text-stone-500">{last ? `${last.from_participant_id === currentParticipantId ? "You: " : ""}${last.text}` : "Start a private suggestion"}</span>
                  </span>
                  {last && <span className="shrink-0 text-[9px] text-stone-400">{messageTime(last.created_at)}</span>}
                </button>;
              })}
              {conversationTargets.length === 0 && <p className="rounded-2xl bg-stone-50 px-4 py-5 text-center text-xs leading-5 text-stone-500">Confirmed bridesmaids will appear here.</p>}
            </div>
          ) : activeTarget ? (
            <>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {conversation.map((suggestion) => {
                  const sentByCurrent = suggestion.from_participant_id === currentParticipantId;
                  return <div key={suggestion.id} className={`flex ${sentByCurrent ? "justify-end" : "justify-start"}`}>
                    <div className={`group relative max-w-[86%] rounded-2xl px-3 py-2 text-xs leading-5 ${sentByCurrent ? "rounded-br-md bg-stone-900 text-white" : "rounded-bl-md bg-stone-100 text-stone-800"}`}>
                      <p>{suggestion.text}</p>
                      <div className={`mt-1 flex items-center gap-1.5 text-[9px] ${sentByCurrent ? "justify-end text-stone-300" : "text-stone-400"}`}>
                        <span>{messageTime(suggestion.created_at)}</span>
                        {!sentByCurrent && (
                          <button type="button" aria-label="Dismiss suggestion" title="Dismiss suggestion" onClick={() => void dismissSuggestion(suggestion.id)} className="grid h-6 w-6 place-items-center rounded-full transition active:bg-white sm:hover:bg-white">
                            <X size={10}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>;
                })}
                {!loading && conversation.length === 0 && <p className="py-5 text-center text-xs text-stone-400">No suggestions yet. Start the conversation below.</p>}
                {loading && conversation.length === 0 && <p className="py-5 text-center text-xs text-stone-400">Loading…</p>}
              </div>

              <div className="mt-3 border-t border-stone-200/70 pt-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value.slice(0, 500))}
                    rows={2}
                    maxLength={500}
                    placeholder={`Write to ${activeTarget.name}…`}
                    className="min-h-[58px] flex-1 resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 outline-none placeholder:text-stone-400 focus:border-rose-300"
                  />
                  <button
                    type="button"
                    disabled={busy || !text.trim()}
                    onClick={() => void sendSuggestion()}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-900 text-white shadow-sm transition active:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-40 sm:hover:bg-rose-950"
                    title={`Send suggestion to ${activeTarget.name}`}
                    aria-label={`Send suggestion to ${activeTarget.name}`}
                  >
                    <Send size={15}/>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 rounded-2xl bg-stone-50 px-4 py-5 text-center text-xs leading-5 text-stone-500">The bride will appear here after confirming her look.</p>
          )}

          {error && <p className="mt-2 text-[10px] font-medium text-red-600">{error}</p>}
        </div>
      )}

      <button
        type="button"
        aria-label={panelOpen ? "Close suggestions" : "Open suggestions"}
        title={panelOpen ? "Close suggestions" : "Open suggestions"}
        aria-expanded={panelOpen}
        onClick={() => {
          const nextOpen = !panelOpen;
          setPanelOpen(nextOpen);
          if (nextOpen && currentParticipant?.role === "bride") setSelectedTargetId(null);
          onOpenChange?.(nextOpen);
        }}
        className="pointer-events-auto relative grid h-14 w-14 place-items-center rounded-full border border-white/70 bg-stone-900 text-white shadow-xl shadow-stone-900/25 transition active:bg-rose-950 sm:hover:-translate-y-0.5 sm:hover:bg-rose-950"
      >
        <MessageCircle size={22}/>
        {incomingCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-rose-600 px-1 text-[9px] font-bold text-white">
            {incomingCount > 99 ? "99+" : incomingCount}
          </span>
        )}
      </button>
    </div>
  );
}
