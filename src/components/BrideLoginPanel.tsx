import type { ReactNode } from "react";
import { Camera, Shirt, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

export function BrideLoginPanel({ action }: { action: ReactNode }) {
  const steps = [
    { icon: Shirt, text: "Set the style" },
    { icon: Camera, text: "AI try-on" },
    { icon: Users, text: "Build the lineup" },
  ];

  return (
    <Card className="rounded-[2rem] border-stone-200/80 bg-white p-7 shadow-[0_24px_70px_-35px_rgba(28,25,23,0.35)] sm:p-9">
      <div className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-rose-700">Bride&apos;s studio</p>
        <h2 className="mt-2 font-serif text-3xl leading-tight text-stone-900">Plan the looks. See the lineup.</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">Sign in to set up your wedding style and curate the final bridal-party scene.</p>
      </div>
      {action}
      <div className="mt-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-stone-300"><span className="h-px flex-1 bg-stone-200" /> Secure sign-in <span className="h-px flex-1 bg-stone-200" /></div>
      <div className="mt-5 grid grid-cols-3 divide-x rounded-2xl border border-stone-100 bg-stone-50/80 py-3 text-center">
        {steps.map(({ icon: Icon, text }) => <div key={text} className="px-2"><Icon className="mx-auto mb-1.5 text-rose-500" size={15}/><p className="text-[9px] font-semibold text-stone-600">{text}</p></div>)}
      </div>
      <p className="mt-5 text-center text-xs leading-5 text-stone-400">Bridesmaids do not need an account. They join from your invite link and only enter their name.</p>
    </Card>
  );
}
