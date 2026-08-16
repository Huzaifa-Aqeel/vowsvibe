import type { ReactNode } from "react";
import { Sparkles, Shirt, Camera, Users, ArrowRight } from "lucide-react";
import Image from "next/image";

type AuthSplitLayoutProps = {
  children: ReactNode;
  eyebrow?: string;
  role?: "bride" | "bridesmaid";
};

export function AuthSplitLayout({
  children,
  eyebrow = "A calmer way to coordinate the wedding party",
  role = "bride",
}: AuthSplitLayoutProps) {
  const isBridesmaid = role === "bridesmaid";
  const heroEyebrow = isBridesmaid ? "Your private fitting room" : eyebrow;
  const heroTitle = isBridesmaid ? (
    <>Find your look. See it with the <em className="font-normal text-rose-200">whole party.</em></>
  ) : (
    <>One beautiful place for the <em className="font-normal text-rose-200">whole look.</em></>
  );
  const heroDescription = isBridesmaid
    ? "Choose a dress, create a private AI try-on, then confirm the look you want to bring into the bridal-party lineup."
    : "Set the dress direction, let each bridesmaid create a private AI try-on, then build the final bridal-party lineup from the looks everyone actually confirms.";
  const steps = isBridesmaid
    ? [
        { icon: Shirt, n: "01", title: "Pick a dress", text: "Explore the looks chosen for you." },
        { icon: Camera, n: "02", title: "Try it on", text: "Create a private AI fitting." },
        { icon: Users, n: "03", title: "Join the lineup", text: "Confirm the look you love." },
      ]
    : [
        { icon: Shirt, n: "01", title: "Set the style", text: "Palette, dress and mood." },
        { icon: Camera, n: "02", title: "Try it on", text: "Private AI fitting." },
        { icon: Users, n: "03", title: "Build the lineup", text: "Confirmed looks only." },
      ];

  return (
    <main className="min-h-screen bg-[#f8f5f1] text-stone-900">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-stone-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(244,185,195,0.18),transparent_38%),radial-gradient(circle_at_85%_75%,rgba(255,255,255,0.08),transparent_35%)]" />
          <div className="relative">
<div className="flex justify-center">
  <Image
    src="/logo.png"
    alt="Vows & Vibe"
    width={420}
    height={204}
    priority
    className="w-[300px] h-auto object-contain -translate-x-10 -translate-y-9"
  />
</div>            <div className="mt-24 max-w-xl">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-rose-200">{heroEyebrow}</p>
              <h1 className="font-serif text-5xl leading-[1.04] xl:text-6xl">{heroTitle}</h1>
              <p className="mt-6 max-w-lg text-sm leading-7 text-stone-300">{heroDescription}</p>
            </div>
          </div>
          <div className="relative grid max-w-xl grid-cols-3 gap-3">
            {steps.map(({ icon: Icon, n, title, text }) => (
              <div key={n} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <Icon size={17} className="text-rose-200" />
                <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.2em] text-stone-500">{n}</p>
                <p className="mt-1 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-[11px] leading-5 text-stone-400">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <span className="font-serif text-xl">Vows &amp; Vibe</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">{eyebrow}</span>
            </div>
            {children}
            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-stone-400"><ArrowRight size={12} /> Your privacy and your look stay yours until you choose to share.</div>
          </div>
        </section>
      </div>
    </main>
  );
}