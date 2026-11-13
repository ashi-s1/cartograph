"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DependencyMapIllustration,
  BlastRadiusIllustration,
  FrameworkTaxonomyIllustration,
} from "./illustrations";
import { ArrowRight, Loader2, GitFork, AlertCircle } from "lucide-react";

export function LandingPage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = repoUrl.trim();
    if (!trimmed) return;

    // Simple validation for repository URL or owner/repo format
    const isValid =
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.includes("/");

    if (!isValid) {
      setError("Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Save pending repository URL in sessionStorage for sign-in return flow
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cartograph_pending_repo", trimmed);
    }

    // Direct into sign-in with returnBackUrl pointing back with repo query
    const returnBackUrl = `/?repo=${encodeURIComponent(trimmed)}`;
    router.push(`/sign-in?returnBackUrl=${encodeURIComponent(returnBackUrl)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-zinc-800 selection:text-zinc-100 overflow-x-hidden flex flex-col font-sans">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1140px] items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80 font-mono"
          >
            cartograph
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-md border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 shadow-xs cursor-pointer"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content: Single Column Capped at 1140px */}
      <main className="flex-1 w-full max-w-[1140px] mx-auto px-6">
        {/* Hero Section */}
        <section className="min-h-[82vh] flex flex-col justify-center py-20 lg:py-28">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-mono text-muted-foreground w-fit">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Grounded in abstract syntax trees</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-foreground leading-[1.08] max-w-[16ch]">
              A dependency map drawn directly from your code.
            </h1>

            <p className="max-w-[64ch] text-base sm:text-lg text-muted-foreground leading-relaxed">
              Cartograph parses TypeScript and JavaScript abstract syntax trees into an interactive topological architecture graph. Every edge is a real resolved import. No guessing, no approximate connections.
            </p>

            {/* Repository Submission Hero Form */}
            <div className="pt-2 max-w-[600px]">
              <form onSubmit={handleSubmit} className="space-y-2">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                      <GitFork className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                      disabled={isSubmitting}
                      className="w-full rounded-md border border-border bg-card px-3 py-2.5 pl-9 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-sky-500 focus:outline-hidden disabled:opacity-50 shadow-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || !repoUrl.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer shrink-0 shadow-xs"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Starting...</span>
                      </>
                    ) : (
                      <>
                        <span>Map repository</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-500 font-mono pt-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <p className="text-[11px] font-mono text-muted-foreground/80 pt-1">
                  Public repositories supported. Private repos require GitHub integration after sign-in.
                </p>
              </form>
            </div>
          </div>
        </section>

        {/* Section 1: What the thing does */}
        <section className="border-t border-border/80 py-28 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
            <div className="space-y-4">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Topological Mapping
              </span>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.12]">
                Every connection is an import that really resolved.
              </h2>
              <p className="max-w-[46ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                Cartograph inspects every file via compiler-level abstract syntax trees. When a line connects two files, it is because one literally imported a symbol from the other.
              </p>
              <p className="max-w-[46ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                Unresolved imports are counted and reported with reasons rather than hallucinated or patched with heuristic guesswork.
              </p>
            </div>

            <div className="w-full">
              <DependencyMapIllustration />
            </div>
          </div>
        </section>

        {/* Section 2: How it works */}
        <section className="border-t border-border/80 py-28 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
            <div className="w-full order-2 lg:order-1">
              <BlastRadiusIllustration />
            </div>

            <div className="space-y-4 order-1 lg:order-2">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Graph Mathematics
              </span>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.12]">
                Blast radius, cycle detection, and fan metrics.
              </h2>
              <p className="max-w-[46ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                Graph calculations are pure mathematical functions. Transitive walks trace exactly what breaks if a given file is modified or removed.
              </p>
              <p className="max-w-[46ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                Fan-in and fan-out indices identify structural architectural hubs versus safe reading entrypoints, while cycle detection highlights circular dependency loops.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Which frameworks it understands */}
        <section className="border-t border-border/80 py-28 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
            <div className="space-y-4">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Taxonomy & Classification
              </span>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.12]">
                Recognises how real web frameworks organize code.
              </h2>
              <p className="max-w-[46ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                Framework taxonomies adapt to Next.js App Router and Pages Router, Express, Fastify, NestJS, and standalone TypeScript libraries.
              </p>
              <p className="max-w-[46ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                Files are deterministically categorised by architectural role: pages, route handlers, controllers, services, middleware, models, and test fixtures.
              </p>
            </div>

            <div className="w-full">
              <FrameworkTaxonomyIllustration />
            </div>
          </div>
        </section>

        {/* Section 4: What it deliberately doesn't do (The Most Opinionated Section) */}
        <section className="border-t border-border/80 py-28 lg:py-32">
          <div className="space-y-12">
            <div className="space-y-4">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Principles & Non-Goals
              </span>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.12]">
                What Cartograph deliberately doesn&apos;t do.
              </h2>
              <p className="max-w-[64ch] text-sm sm:text-base text-muted-foreground leading-relaxed">
                A tool designed to explain a codebase must resist the urge to invent, grade, or speculate. These boundaries are enforced in code, not just in prose.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              <div className="space-y-2 border-t border-border/60 pt-4">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  Never guesses connections
                </h3>
                <p className="max-w-[46ch] text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  An edge exists only when an import cleanly resolves to a real target file on disk. Unresolved imports are counted and reported with clear reasons, never fudged.
                </p>
              </div>

              <div className="space-y-2 border-t border-border/60 pt-4">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  Never grades or scores code
                </h3>
                <p className="max-w-[46ch] text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  No vanity quality scores, maintainability grades, or arbitrary &ldquo;issue counts&rdquo;. Cartograph explains how software is structured; it never reviews or judges engineering decisions.
                </p>
              </div>

              <div className="space-y-2 border-t border-border/60 pt-4">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  Never invents to fill gaps
                </h3>
                <p className="max-w-[46ch] text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  If dynamic routing prevents static route extraction, Cartograph lists zero routes rather than fabricating candidates. In codebase intelligence, absent beats approximate every time.
                </p>
              </div>

              <div className="space-y-2 border-t border-border/60 pt-4">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  Never executes untrusted code
                </h3>
                <p className="max-w-[46ch] text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Analysis is performed entirely through static syntax tree inspection. Your repository is never compiled, run, or evaluated inside a runtime sandbox.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-border/80 bg-background/80 py-8">
        <div className="mx-auto flex max-w-[1140px] flex-col sm:flex-row items-center justify-between gap-4 px-6 text-xs text-muted-foreground font-mono">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">cartograph</span>
            <span>&bull;</span>
            <span>Visual codebase architecture &amp; AST dependency mapper</span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/evals" className="hover:text-foreground transition-colors">
              Evals
            </Link>
            <span>&bull;</span>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
