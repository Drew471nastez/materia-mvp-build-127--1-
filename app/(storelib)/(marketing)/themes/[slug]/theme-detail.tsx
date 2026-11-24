"use client"

/**
 * ===========================================================================
 *  ONE TEMPLATE'S BUTTONS: USE THIS TEMPLATE, AND THE DEMO
 * ===========================================================================
 * Round 58: the page around these is drawn on the server (./page.tsx), so
 * its words, pictures and questions are in the HTML a crawler reads. Only
 * what answers a click is here.
 *
 * Use this template adds the template to the visitor's website library
 * (components/themes/use-add-theme). Signed out, the server answers 401 and
 * the page goes to sign in, coming back with ?add=1, which adds it once by
 * itself; the address then loses the flag so a reload does not add it
 * again. A paid template says it opens soon.
 *
 * The demo is the template's real website: a code template's prerendered
 * pages (public/theme-previews, sandboxed and noindex, next.config.mjs), a
 * Storelib package drawn live (/theme-preview), or an imported theme's demo
 * store. It opens in a new tab; the gallery (./theme-live.tsx) shows the
 * same website in a frame on this page, made only once the page has loaded.
 */
import * as React from "react"

import { AddStatus } from "@/components/themes/add-status"
import { useAddTheme } from "@/components/themes/use-add-theme"
import type { ThemeTier } from "@/lib/themes/marketplace-shared"

export function ThemeActions({ slug, name, tier, demo }: { slug: string; name: string; tier: ThemeTier; demo: string | null }) {
  const { state, add, reset } = useAddTheme()
  const paid = tier === "paid"

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("add") !== "1") return
    p.delete("add")
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${p.toString() ? `?${p}` : ""}`)
    if (!paid) void add(slug)
  }, [add, slug, paid])

  return (
    <>
      <div className="flex flex-col gap-2.5 min-[420px]:flex-row lg:flex-col">
        {paid ? (
          <span className="inline-flex h-12 items-center min-[420px]:max-lg:flex-1 justify-center rounded-xl bg-[#f1f2f4] px-5 text-[15px] font-semibold text-[#6b7280]">Coming soon</span>
        ) : (
          <button
            type="button"
            onClick={() => void add(slug)}
            disabled={state.phase === "adding"}
            data-theme-add=""
            className="inline-flex h-12 items-center min-[420px]:max-lg:flex-1 justify-center rounded-xl bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.2),0_6px_14px_-8px_rgba(26,26,46,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[background-color,scale] duration-150 hover:bg-[#2d2d44] active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100"
          >
            {state.phase === "adding" ? "Adding" : state.phase === "added" ? "Add another copy" : "Use this template"}
          </button>
        )}
        {demo ? (
          <a
            href={demo}
            target="_blank"
            rel="noopener"
            data-theme-demo=""
            className="inline-flex h-12 items-center min-[420px]:max-lg:flex-1 justify-center rounded-xl border border-[#e5e7eb] bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] transition-colors hover:border-[#d1d5db] hover:bg-[#f8f9fa]"
          >
            View demo
          </a>
        ) : null}
      </div>
      <AddStatus state={state} name={name} onClose={reset} />
    </>
  )
}
