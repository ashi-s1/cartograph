import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { NextResponse } from "next/server";

const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/preview(.*)",
  "/api/agent/tools(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Always call auth() so Clerk refreshes and rotates session cookies on every request
  const { userId, redirectToSignIn } = await auth();

  if (!isPublicRoute(req)) {
    if (!userId) {
      if (isApiRoute(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToSignIn({ returnBackUrl: req.url });
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
