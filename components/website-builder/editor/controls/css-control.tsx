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

export function CssControl({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const dropped = useMemo(() => cleanCustomCss(value, "[data-storelib-theme]").dropped, [value])
  return (
    <div className="space-y-1.5" data-css-control="">
      <textarea
        aria-label={label ?? "Custom CSS"}
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
            <li key={d}>Left out: {d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
