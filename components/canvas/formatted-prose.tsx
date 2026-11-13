"use client";

import React, { useMemo } from "react";
import { Link2 } from "lucide-react";

interface FormattedProseProps {
  content: string;
  knownPaths?: Set<string>;
  onSelectPath?: (path: string) => void;
  className?: string;
}

/**
 * Custom renderer for Phase 10:
 * - Exactly three formatting elements: inline code, bullets, and bold.
 * - No headings (# stripped and converted to bold text).
 * - No stray backticks or asterisks.
 * - Every repository path mentioned in the prose turns into a clickable link
 *   that selects the node and moves the canvas map to it.
 */
export function FormattedProse({
  content,
  knownPaths = new Set(),
  onSelectPath,
  className = "",
}: FormattedProseProps) {
  // Normalize paths set for fast case-insensitive & exact lookup
  const normalizedPathsMap = useMemo(() => {
    const map = new Map<string, string>();
    const basenameCounts = new Map<string, number>();
    for (const p of knownPaths) {
      const base = p.split("/").pop()?.toLowerCase();
      if (base) basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    }
    for (const p of knownPaths) {
      const base = p.split("/").pop();
      if (base && basenameCounts.get(base.toLowerCase()) === 1) {
        map.set(base, p);
        map.set(base.toLowerCase(), p);
      }
    }
    // Full paths take precedence over shorthand basenames.
    for (const p of knownPaths) {
      map.set(p, p);
      map.set(p.toLowerCase(), p);
    }
    return map;
  }, [knownPaths]);

  // Helper to resolve whether a token is a repo path
  const resolvePath = (token: string): string | null => {
    const clean = token.trim().replace(/^[`'"]|[`'"]$/g, "").replace(/[,.;:)]+$/, "");
    if (!clean) return null;
    return normalizedPathsMap.get(clean) || normalizedPathsMap.get(clean.toLowerCase()) || null;
  };

  /**
   * Parses inline formatting: bold (**), inline code (`), and path links.
   * Strips any leftover unclosed markers so no stray symbols exist in output.
   */
  const renderInline = (text: string, inlineKeyPrefix = "inl"): React.ReactNode[] => {
    // 1. Convert any accidental headings (#...) at start of text into bold
    const cleaned = text.replace(/^#+\s*(.*)$/, "**$1**");

    // 2. Tokenize by bold **...** and inline code `...`
    const tokens: React.ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(cleaned)) !== null) {
      // Plain text segment before the match
      if (match.index > lastIndex) {
        const plain = cleaned.slice(lastIndex, match.index);
        tokens.push(
          ...renderPlainTextWithLinks(
            plain,
            `${inlineKeyPrefix}-pre-${lastIndex}`,
            resolvePath,
            onSelectPath
          )
        );
      }

      const matchText = match[0];
      if (matchText.startsWith("**") && matchText.endsWith("**")) {
        const inner = matchText.slice(2, -2).trim();
        tokens.push(
          <strong key={`${inlineKeyPrefix}-b-${match.index}`} className="font-semibold text-zinc-100">
            {renderInline(inner, `${inlineKeyPrefix}-b-${match.index}`)}
          </strong>
        );
      } else if (matchText.startsWith("`") && matchText.endsWith("`")) {
        const inner = matchText.slice(1, -1).trim();
        const matchedPath = resolvePath(inner);

        if (matchedPath && onSelectPath) {
          tokens.push(
            <button
              key={`${inlineKeyPrefix}-link-${match.index}`}
              type="button"
              onClick={() => onSelectPath(matchedPath)}
              title={`Focus ${matchedPath} on map`}
              className="inline-flex items-center gap-1 rounded bg-sky-950/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-sky-300 border border-sky-700/60 hover:bg-sky-900/60 hover:text-sky-100 transition-colors cursor-pointer select-text mx-0.5"
            >
              <Link2 className="h-2.5 w-2.5 text-sky-400 shrink-0" />
              <span>{inner}</span>
            </button>
          );
        } else {
          tokens.push(
            <code
              key={`${inlineKeyPrefix}-c-${match.index}`}
              className="rounded bg-zinc-800/90 px-1 py-0.5 font-mono text-[11px] text-zinc-200 border border-zinc-700/50 mx-0.5"
            >
              {inner}
            </code>
          );
        }
      }

      lastIndex = pattern.lastIndex;
    }

    // Trailing plain text
    if (lastIndex < cleaned.length) {
      const remaining = cleaned.slice(lastIndex);
      tokens.push(
        ...renderPlainTextWithLinks(
          remaining,
          `${inlineKeyPrefix}-post-${lastIndex}`,
          resolvePath,
          onSelectPath
        )
      );
    }

    return tokens;
  };

  // Split lines into paragraphs and bullet lists
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentBullets: string[] = [];

  const flushBullets = (key: string) => {
    if (currentBullets.length > 0) {
      blocks.push(
        <ul key={key} className="space-y-1.5 my-2 pl-4 list-disc marker:text-zinc-500">
          {currentBullets.map((bullet, i) => (
            <li key={i} className="text-xs text-zinc-300 leading-relaxed">
              {renderInline(bullet, `${key}-b-${i}`)}
            </li>
          ))}
        </ul>
      );
      currentBullets = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      flushBullets(`bullets-${i}`);
      continue;
    }

    // Bullet line
    const bulletMatch = rawLine.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      currentBullets.push(bulletMatch[1]);
    } else {
      flushBullets(`bullets-before-${i}`);
      blocks.push(
        <p key={`p-${i}`} className="text-xs text-zinc-300 leading-relaxed mb-2.5">
          {renderInline(rawLine, `p-${i}`)}
        </p>
      );
    }
  }
  flushBullets("bullets-end");

  return <div className={`prose-sm font-sans ${className}`}>{blocks}</div>;
}

/**
 * Scans plain text for repository paths outside backticks and turns them into clickable buttons.
 * Cleans any stray backticks or asterisks.
 */
function renderPlainTextWithLinks(
  plainText: string,
  keyPrefix: string,
  resolvePath: (token: string) => string | null,
  onSelectPath?: (path: string) => void
): React.ReactNode[] {
  // Strip any stray backticks, asterisks, or hash symbols per acceptance criteria
  const cleanedText = plainText.replace(/[`*#]/g, "");

  const words = cleanedText.split(/(\s+)/);
  return words.map((word, idx) => {
    const path = resolvePath(word);
    if (path && onSelectPath) {
      const punctuationMatch = word.match(/[,.;:)]+$/);
      const punctuation = punctuationMatch ? punctuationMatch[0] : "";
      const cleanWord = punctuation ? word.slice(0, -punctuation.length) : word;

      return (
        <React.Fragment key={`${keyPrefix}-link-${idx}`}>
          <button
            type="button"
            onClick={() => onSelectPath(path)}
            title={`Focus ${path} on map`}
            className="inline-flex items-center gap-0.5 rounded bg-sky-950/60 px-1 py-0.2 font-mono text-[11px] font-medium text-sky-300 border border-sky-800/50 hover:bg-sky-900/60 hover:text-sky-100 transition-colors cursor-pointer select-text mx-0.5"
          >
            <Link2 className="h-2.5 w-2.5 text-sky-400 shrink-0" />
            <span>{cleanWord}</span>
          </button>
          {punctuation}
        </React.Fragment>
      );
    }
    return <span key={`${keyPrefix}-text-${idx}`}>{word}</span>;
  });
}
