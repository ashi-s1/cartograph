"use client";

import { ClerkLoaded, ClerkLoading, OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import React from "react";

interface AppShellProps {
  children: React.ReactNode;
  fluid?: boolean;
}

export function AppShell({ children, fluid = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-zinc-800 selection:text-zinc-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div
          className={`mx-auto flex h-13 items-center justify-between px-4 sm:px-6 ${
            fluid ? "w-full max-w-none" : "max-w-6xl"
          }`}
        >
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
            >
              cartograph
            </Link>

            <span className="text-sm font-light text-muted-foreground/40">/</span>

            {/* Organization Switcher */}
            <div className="flex items-center min-h-[28px]">
              <ClerkLoading>
                <div className="h-6 w-28 animate-pulse rounded-md bg-muted/60" />
              </ClerkLoading>
              <ClerkLoaded>
                <OrganizationSwitcher
                  hidePersonal
                  afterCreateOrganizationUrl="/"
                  afterSelectOrganizationUrl="/"
                  afterLeaveOrganizationUrl="/"
                  appearance={{
                    elements: {
                      rootBox: "flex items-center",
                      organizationSwitcherTrigger:
                        "py-1 px-2 rounded-md hover:bg-muted/60 text-xs font-medium text-foreground transition-colors border-0 shadow-none focus:outline-hidden",
                      organizationPreview: "gap-2",
                      organizationPreviewTextContainer: "text-xs font-medium",
                    },
                  }}
                />
              </ClerkLoaded>
            </div>

            <span className="text-sm font-light text-muted-foreground/40">/</span>

            <Link
              href="/evals"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/60"
            >
              Evals
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center min-h-[28px] min-w-[28px]">
              <ClerkLoading>
                <div className="h-7 w-7 animate-pulse rounded-full bg-muted/60" />
              </ClerkLoading>
              <ClerkLoaded>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-7 w-7 rounded-full border border-border/60",
                    },
                  }}
                />
              </ClerkLoaded>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {fluid ? (
        <main className="flex-1 flex flex-col overflow-hidden w-full">{children}</main>
      ) : (
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
        </main>
      )}
    </div>
  );
}
