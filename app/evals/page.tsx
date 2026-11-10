export const dynamic = "force-dynamic";

import React from "react";
import { AppShell } from "@/components/app-shell";
import { EvalsDashboard } from "@/components/evals/evals-dashboard";

export default function EvalsPage() {
  return (
    <AppShell>
      <EvalsDashboard />
    </AppShell>
  );
}
