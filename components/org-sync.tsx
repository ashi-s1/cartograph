"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface OrgSyncProps {
  orgId: string;
  needsActivation?: boolean;
}

/**
 * Ensures the resolved organization is set as the active organization in Clerk's session.
 */
export function OrgSync({ orgId, needsActivation }: OrgSyncProps) {
  const { setActive, isLoaded } = useOrganizationList();
  const router = useRouter();

  useEffect(() => {
    if (needsActivation && isLoaded && setActive) {
      setActive({ organization: orgId }).then(() => {
        router.refresh();
      });
    }
  }, [orgId, needsActivation, isLoaded, setActive, router]);

  return null;
}
