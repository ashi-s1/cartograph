import { auth, clerkClient } from "@clerk/nextjs/server";

export interface CurrentOrgInfo {
  id: string;
  name: string;
  slug: string | null;
  imageUrl?: string;
  role: string | null;
  needsActivation?: boolean;
}

/**
 * Reads the current organization during server rendering.
 * Per Phase 1 spec:
 * - "The current organization is readable during server rendering, not only in the browser."
 * - "Signing in for the first time lands the person inside one without being asked to create it."
 */
export async function getOrEnsureCurrentOrg(): Promise<CurrentOrgInfo | null> {
  const { userId, orgId, orgRole, orgSlug } = await auth();

  if (!userId) {
    return null;
  }

  const client = await clerkClient();

  // 1. If an active organization is already in the session:
  if (orgId) {
    try {
      const org = await client.organizations.getOrganization({
        organizationId: orgId,
      });
      return {
        id: org.id,
        name: org.name,
        slug: org.slug || orgSlug || null,
        imageUrl: org.imageUrl,
        role: orgRole || "member",
        needsActivation: false,
      };
    } catch {
      // Fall through to membership check if org fetch failed
    }
  }

  // 2. If no active organization in session, inspect user's memberships:
  const memberships = await client.users.getOrganizationMembershipList({
    userId,
    limit: 10,
  });

  if (memberships.data && memberships.data.length > 0) {
    const firstMembership = memberships.data[0];
    const org = firstMembership.organization;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug || null,
      imageUrl: org.imageUrl,
      role: firstMembership.role,
      needsActivation: true,
    };
  }

  // 3. Brand new user with 0 organizations:
  // Auto-provision an organization so they land inside one without being asked to create it.
  const user = await client.users.getUser(userId);
  const preferredName =
    user.firstName || user.username || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "My";
  const orgName = `${preferredName}'s Team`;

  const newOrg = await client.organizations.createOrganization({
    name: orgName,
    createdBy: userId,
  });

  return {
    id: newOrg.id,
    name: newOrg.name,
    slug: newOrg.slug || null,
    imageUrl: newOrg.imageUrl,
    role: "org:admin",
    needsActivation: true,
  };
}
