import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";

export default function LoginPage() {
  return (
    <AuthSplitLayout eyebrow="For the bride">
      <div className="rounded-[2rem] border border-stone-200/80 bg-white p-7 shadow-[0_24px_70px_-35px_rgba(28,25,23,0.35)] sm:p-9">
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-rose-700">Bride&apos;s studio</p>
          <h2 className="mt-2 font-serif text-3xl text-stone-900">Plan the looks. See the lineup.</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">Sign in to set up your wedding style and curate the final bridal-party scene.</p>
        </div>
        <GoogleSignInButton />
        <div className="mt-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-stone-300"><span className="h-px flex-1 bg-stone-200" /> Secure sign-in <span className="h-px flex-1 bg-stone-200" /></div>
        <p className="mt-5 text-center text-xs leading-5 text-stone-400">Bridesmaids do not need an account. They join from your invite link and only enter their name.</p>
      </div>
    </AuthSplitLayout>
  );
}
