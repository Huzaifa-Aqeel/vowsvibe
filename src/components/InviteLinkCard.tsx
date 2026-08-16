"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function InviteLinkCard({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="border-stone-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush-50 text-blush-700 sm:flex">
          <Link2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">Invite your bridal party</h3>
            <span className="hidden rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-stone-500 sm:inline">Private link</span>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">Share via WhatsApp or SMS. No app download required.</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          <span className="sm:hidden">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-stone-50 px-3 py-2.5">
        <code className="min-w-0 flex-1 truncate text-[11px] text-stone-600">{inviteUrl}</code>
      </div>
    </Card>
  );
}
