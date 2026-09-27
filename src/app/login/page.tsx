import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { BrideLoginPanel } from "@/components/BrideLoginPanel";

export default function LoginPage() {
  return (
    <AuthSplitLayout eyebrow="For the bride">
      <BrideLoginPanel action={<GoogleSignInButton/>}/>
    </AuthSplitLayout>
  );
}
