"use client"

/**
 * Theme settings › Custom CSS. A code box that keeps exactly what is typed,
 * and under it, only when something did not take, what the page left out
 * and why: the same cleanCustomCss the page draws with, run as you type, so
 * the list is the truth rather than a guess. Nothing is said while the CSS
 * is fine.
 */
import { useMemo } from "react"

import { CUSTOM_CSS_MAX, cleanCustomCss } from "@/lib/storelib-theme/custom-css"
import { PROBLEM } from "./styles"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"

/** Rules to start from: each one line of intent and the CSS that does it. */
const CSS_EXAMPLES: { label: string; css: string }[] = [
  { get label() { return tt("Wider letter spacing on headings") }, css: "h1, h2, h3 {\n  letter-spacing: 0.02em;\n}" },
  { get label() { return tt("Rounder product images") }, css: "[data-card=\"product\"] img {\n  border-radius: 16px;\n}" },
  { get label() { return tt("Hide breadcrumbs on phones") }, css: "@media (max-width: 640px) {\n  [data-section-type=\"breadcrumbs\"] {\n    display: none;\n  }\n}" },
]

export function CssControl({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const dropped = useMemo(() => cleanCustomCss(value, "[data-storelib-theme]").dropped, [value])
  return (
    <div className="space-y-1.5" data-css-control="">
      {/*
        WHAT THE BOX DOES, IN THREE LINES. It is scoped to the website, so a
        rule here cannot reach the editor around it; a section is reached by
        its type, which every section carries on its box. And a few rules to
        start from, added at the end of what is there.
      */}
      <div className="space-y-1 text-[11.5px] leading-[1.5] text-muted-foreground" data-css-help="">
        <p>{tt("Applies to every page of your website, after the theme's own styles, so it wins.")}</p>
        <p>
          <Rich text={tt("One kind of section: start the rule with {selector}. Your own coded sections keep their own styles unless you target them.")} parts={{ selector: <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">{"[data-section-type=\"hero\"]"}</code> }} />
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" data-css-examples="">
        {CSS_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => onChange(`${value.trim() ? `${value.replace(/\s+$/, "")}\n\n` : ""}${ex.css}`)}
            className="h-7 rounded-md border border-border bg-background px-2 text-[11.5px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            + {ex.label}
          </button>
        ))}
      </div>
      <textarea
        aria-label={label ?? tt("Custom CSS")}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={8}
        maxLength={CUSTOM_CSS_MAX}
        className="w-full min-h-[160px] resize-y rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[12px] leading-[1.55] max-sm:text-[16px] focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {dropped.length > 0 ? (
        <ul className={PROBLEM + " list-none space-y-0.5"} aria-live="polite">
          {dropped.map((d) => (
            <li key={d}>{tt("Left out: {d}", { d })}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
