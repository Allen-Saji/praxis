"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/primitives/CopyButton";

/**
 * Code block, based on ScrollX UI CodeBlock and restyled to our tokens. Light
 * TypeScript-aware highlighting (keywords, strings, comments, numbers, types)
 * keeps the bundle tiny; this is a data tool, not a docs platform. Optional tabs
 * switch between snippets. The copy button is the hero affordance for an SDK
 * product.
 */
export interface CodeTab {
  label: string;
  code: string;
  language?: string;
}

const KEYWORDS = new Set([
  "const", "let", "var", "await", "async", "function", "return", "import", "from",
  "export", "new", "if", "else", "true", "false", "null", "undefined", "type",
  "interface", "for", "of", "in", "class", "extends", "void", "as",
]);

function highlight(code: string): React.ReactNode[] {
  // Tokenize once per render. Order matters: comments and strings first.
  const tokenRe =
    /(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d[\d_]*n?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$]+)/g;
  const out: React.ReactNode[] = [];
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = tokenRe.exec(code)) !== null) {
    const [, comment, str, num, ident, ws, sym] = match;
    if (comment) out.push(<span key={i++} style={{ color: "var(--text-low)" }}>{comment}</span>);
    else if (str) out.push(<span key={i++} style={{ color: "var(--risk-low)" }}>{str}</span>);
    else if (num) out.push(<span key={i++} style={{ color: "var(--risk-medium)" }}>{num}</span>);
    else if (ident) {
      if (KEYWORDS.has(ident)) out.push(<span key={i++} style={{ color: "var(--accent)" }}>{ident}</span>);
      else out.push(<span key={i++}>{ident}</span>);
    } else if (ws) out.push(<span key={i++}>{ws}</span>);
    else out.push(<span key={i++} style={{ color: "var(--text-mid)" }}>{sym}</span>);
  }
  return out;
}

export function CodeBlock({
  tabs,
  className,
}: {
  tabs: CodeTab[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const current = tabs[active] ?? tabs[0];
  if (!current) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-2)] px-2">
        <div className="flex items-center" role="tablist" aria-label="Code samples">
          {tabs.map((tab, idx) => (
            <button
              key={tab.label}
              role="tab"
              aria-selected={idx === active}
              onClick={() => setActive(idx)}
              className={cn(
                "min-h-11 cursor-pointer border-b-2 px-3 text-[12px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                idx === active
                  ? "border-[var(--accent)] text-[var(--text-hi)]"
                  : "border-transparent text-[var(--text-mid)] hover:text-[var(--text-hi)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CopyButton value={current.code} label="Copy code" />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[13px] leading-[22px]">
        <code className="font-mono text-[var(--text-hi)]">{highlight(current.code)}</code>
      </pre>
    </div>
  );
}
