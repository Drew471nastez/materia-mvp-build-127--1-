"use client"

/**
 * ===========================================================================
 *  ONE THEME: ITS NAME, WHO MADE IT, WHAT IT COSTS, AND THE THEME ITSELF
 * ===========================================================================
 * No description (the owner: "It should not have a description"). The page
 * is the theme: a live preview you can scroll and click, on a desktop or a
 * phone width, then its screenshots large.
 *
 * The live preview is the theme drawn by Storelib's own engine with no shop
 * in it (app/(site)/theme-preview). A theme that cannot be drawn there (an
 * imported Shopify theme) shows its demo store when it has one, and its
 * cover when it does not.
 *
 * Coming back from sign in with ?add=1 adds it once, then the address loses
 * the flag so a reload does not add it again.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { AddStatus } from "@/components/themes/add-status"
import { useAddTheme } from "@/components/themes/use-add-theme"
import { MARKETPLACE_PATH, categoryLabel, hasLivePreview, listingPreviewPath, tierLabel, type ThemeListing } from "@/lib/themes/marketplace-shared"

export function ThemeDetail({ listing }: { listing: ThemeListing }) {
  const [device, setDevice] = React.useState<"desktop" | "phone">("desktop")
  const [loaded, setLoaded] = React.useState(false)
  const { state, add, reset } = useAddTheme()

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("add") !== "1") return
    p.delete("add")
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${p.toString() ? `?${p}` : ""}`)
    if (listing.tier !== "paid") void add(listing.slug)
  }, [add, listing.slug, listing.tier])

  const live = hasLivePreview(listing)
  const frameSrc = live ? listingPreviewPath(listing.slug) : listing.demoUrl
  const still = listing.cover ?? listing.screenshots[0] ?? null
  const paid = listing.tier === "paid"

  return (
    <div className="bg-white" data-theme-detail={listing.slug}>
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <Link
          href={MARKETPLACE_PATH}
          className="group inline-flex h-9 items-center gap-2 rounded-full pr-3 text-[14px] font-medium text-[#4b5563] transition-colors duration-200 hover:text-[#1a1a2e]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.06)] transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-0.5 group-hover:shadow-[0_0_0_1px_rgba(17,24,39,0.12),0_3px_8px_rgba(17,24,39,0.1)] group-active:scale-95">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          Themes
        </Link>

        {/* ── Name, author, price, Add ─────────────────────────── */}
        <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-[30px] font-bold leading-tight tracking-tight text-[#1a1a2e] sm:text-[38px]">{listing.name}</h1>
            <div className="mt-3 flex items-center gap-2.5 text-[14px] text-[#6b7280]">
              {listing.authorAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.authorAvatar} alt="" className="h-7 w-7 rounded-full bg-[#f1f2f4] object-cover shadow-[0_0_0_1px_rgba(17,24,39,0.08)]" />
              ) : /^storelib$/i.test(listing.author.trim()) ? (
                /* Storelib's own themes: Storelib's mark, not an "S" on grey. */
                <span className="overflow-hidden rounded-[8px] shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.08)]">
                  <StorelibLogo size={28} />
                </span>
              ) : (
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eef0f3] text-[12px] font-semibold text-[#4b5563]">
                  {listing.author.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span>
                by <span className="font-medium text-[#1a1a2e]">{listing.author}</span>
                <span className="text-[#9ca3af]"> · </span>
                {categoryLabel(listing.category)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span data-theme-price="" className="text-[20px] font-semibold tabular-nums text-[#1a1a2e]">{tierLabel(listing)}</span>
            {paid ? (
              <span className="inline-flex h-11 items-center rounded-lg bg-[#f1f2f4] px-5 text-[14px] font-semibold text-[#6b7280]">Coming soon</span>
            ) : (
              <button
                type="button"
                onClick={() => void add(listing.slug)}
                disabled={state.phase === "adding"}
                data-theme-add=""
                className="inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-5 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.2),0_6px_14px_-8px_rgba(26,26,46,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[background-color,transform] duration-150 hover:bg-[#2d2d44] active:scale-[0.98] disabled:opacity-60"
              >
                {state.phase === "adding" ? "Adding" : state.phase === "added" ? "Add another copy" : "Add to my library"}
              </button>
            )}
          </div>
        </div>
        {listing.tier === "pro" ? <p className="mt-3 text-[14px] text-[#6b7280]">Included with the <Link href="/pricing" className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2">Pro plan</Link>.</p> : null}

        {/* ── Live preview ─────────────────────────────────────── */}
        <section aria-label="Preview" className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Preview on" className="flex rounded-lg bg-[#f1f2f4] p-0.5">
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={device === d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "h-9 rounded-md px-3.5 text-[13.5px] font-medium transition-colors duration-150",
                    device === d ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {d === "desktop" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
            {frameSrc ? (
              <a href={live ? `/theme-preview/${encodeURIComponent(listing.slug)}` : frameSrc} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f3f4f6]">
                {live ? "Full screen" : "Demo store"}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </div>

          <div className={cn("rounded-2xl bg-[#f3f4f6] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.04)] transition-[padding] duration-300", device === "phone" ? "px-4 py-8" : "p-2 sm:p-3")}>
            <div
              data-theme-frame={device}
              className={cn(
                "relative mx-auto overflow-hidden bg-white transition-[width,height,border-radius] duration-300 ease-out",
                device === "desktop" ? "h-[min(78vh,760px)] w-full rounded-xl ring-1 ring-black/[0.06] shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)]" : "h-[min(78vh,780px)] w-[min(100%,390px)] rounded-[28px] ring-1 ring-black/[0.08] shadow-[0_22px_44px_-18px_rgba(15,23,42,0.35)]",
              )}
            >
              {still && !loaded ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={still} alt="" className="absolute inset-x-0 top-0 w-full object-cover object-top" />
              ) : null}
              {frameSrc ? (
                <iframe
                  src={frameSrc}
                  title={`${listing.name} preview`}
                  loading="lazy"
                  onLoad={() => setLoaded(true)}
                  referrerPolicy="no-referrer"
                  className={cn("absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
                />
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Screenshots, large ───────────────────────────────── */}
        {listing.screenshots.length ? (
          <section aria-label="Screenshots" className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {listing.screenshots.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" className="w-full rounded-2xl bg-[#eef0f3] ring-1 ring-black/[0.06]" />
            ))}
          </section>
        ) : null}
      </div>
      <AddStatus state={state} name={listing.name} onClose={reset} />
    </div>
  )
}
