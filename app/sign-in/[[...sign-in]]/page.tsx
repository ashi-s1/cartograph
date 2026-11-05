import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Suspense fallback={<div className="h-96 w-80 animate-pulse rounded-xl bg-muted" />}>
        <SignIn />
      </Suspense>
    </div>
  );
}
