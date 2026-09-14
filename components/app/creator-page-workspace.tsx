"use client"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, ON A CANVAS, EDITED WHERE IT LIVES
 * ===========================================================================
 * The frame holds the real /u/<handle>, signed in, so every control a creator
 * already has on their page is the control they use here. Nothing is
 * reimplemented, so nothing can drift from what a visitor sees.
 *
 * `?embedded=1` is what tells it that it is inside the workspace, and the
 * proxy relaxes X-Frame-Options only for that exact combination. Opened at
 * its own address the page is still unframeable by anybody, us included.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE CHROME IS LIGHT AND NOT DARK
 * ---------------------------------------------------------------------------
 * It was near-black for one round. A dark bar over a white page is a hard
 * edge with nothing in between: the page reads as a bright rectangle stuck
 * to a control panel rather than as the thing you are working on. A very
 * light ground puts the two a shade apart, so the canvas is the brightest
 * thing on screen and the tools recede, which is the right order.
 *
 * ---------------------------------------------------------------------------
 *  RELOADING WITHOUT A LOADING SCREEN
 * ---------------------------------------------------------------------------
 * A colour scheme is applied server side, so seeing it means the frame has to
 * fetch again. It does NOT put the loader up for that: a browser keeps the
 * old document painted until the new one is ready, so swapping the src is
 * very nearly a cut. The loader is only for the first load, when there is
 * genuinely nothing to look at yet. Flashing a spinner over a page that is
 * already on screen is what made every small change feel like a page load.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, ExternalLink, Loader2, Palette, RotateCw, SlidersHorizontal, X } from "lucide-react"

import { BuilderLoader } from "@/components/website-builder/builder-loader"
import { themePresets } from "@/lib/store-builder/defaults"
import type { ThemePreset } from "@/lib/store-builder/types"

/**
 * FIVE, AND THEY HAVE TO BE FIVE DIFFERENT ANSWERS.
 *
 * The engine ships eight, and three of them were the same decision twice:
 * `air` is white with dark accents and so is `blacks`; `bubble` is purple
 * where `pink` is pink; `fusion` is a second near-black beside `astrid`. A
 * picker where three of the eight look like each other is a picker somebody
 * scrolls rather than chooses from.
 *
 * What is left is five shapes nobody confuses: blue, monochrome, warm, pink,
 * dark. The other three still exist in the engine and a page already using
 * one keeps it — this is what is OFFERED, not what is supported.
 */
const SCHEMES: ThemePreset[] = ["default", "blacks", "cream", "pink", "astrid"]

export interface CtaValues {
  text: string
  buttonText: string
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
}

export function CreatorPageWorkspace({
  handle,
  displayName,
  published,
  themePreset,
  cta,
}: {
  handle: string
  displayName: string
  published: boolean
  themePreset: string
  cta: CtaValues
}) {
  const router = useRouter()
  const [firstLoad, setFirstLoad] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [isPhone, setIsPhone] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    setPortalReady(true)
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const src = `/u/${encodeURIComponent(handle)}?embedded=1&v=${nonce}`
  const liveUrl = `/u/${encodeURIComponent(handle)}`

  /** Swap the src. No loader: the old document stays painted until the new one is. */
  const reframe = useCallback(() => setNonce((n) => n + 1), [])

  const leave = useCallback(() => {
    setLeaving(true)
    window.setTimeout(() => router.push("/app"), 220)
  }, [router])

  // ── The colour scheme ────────────────────────────────────────────────────
  const [scheme, setScheme] = useState(themePreset)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const schemeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!schemeOpen || isPhone) return
    const onDown = (e: MouseEvent) => {
      if (schemeRef.current && !schemeRef.current.contains(e.target as Node)) setSchemeOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [schemeOpen, isPhone])

  const applyScheme = useCallback(
    async (preset: string) => {
      setSchemeOpen(false)
      if (preset === scheme) return
      const previous = scheme
      setScheme(preset)
      try {
        const res = await fetch("/api/creator-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ themePreset: preset }),
        })
        if (!res.ok) {
          setScheme(previous)
          return
        }
        reframe()
      } catch {
        setScheme(previous)
      }
    },
    [scheme, reframe],
  )

  // ── The bar across the top of the page ───────────────────────────────────
  const [ctaOpen, setCtaOpen] = useState(false)

  const schemeList = (
    <div className="p-1">
      {SCHEMES.map((preset) => {
        const theme = themePresets[preset]
        const active = preset === scheme
        return (
          <button
            key={preset}
            type="button"
            onClick={() => applyScheme(preset)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[#f3f4f6]"
          >
            {/* The scheme, not its name: three of its own colours in a row. */}
            <span aria-hidden className="flex h-7 w-7 shrink-0 overflow-hidden rounded-md border border-[#e5e7eb]">
              <span className="h-full w-1/2" style={{ background: theme.colors.background }} />
              <span className="h-full w-1/4" style={{ background: theme.colors.primary }} />
              <span className="h-full w-1/4" style={{ background: theme.colors.secondary }} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e] md:text-[13px]">{theme.name}</span>
            {active && <Check className="h-4 w-4 shrink-0 text-[#6b7280]" />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex h-svh min-h-0 flex-col bg-[#f1f1f3]">
      {/* ONE LIGHT ROW. The handle first, because it is the subject. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e7eb] bg-white px-2 py-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          onClick={leave}
          aria-label="Back to Storelib"
          title="Back to Storelib"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#1a1a2e]">{displayName}</p>
          <p className="truncate text-[11px] leading-tight text-[#9ca3af]">
            storelib.com/u/{handle}
            {published ? "" : "  ·  not published yet"}
          </p>
        </div>

        {/*
          NO active:scale ON ANY OF THESE. A control that shrinks under the
          cursor reads as a toy; these are a toolbar, and a colour change is
          the feedback for a colour button.
        */}
        <button
          type="button"
          onClick={() => setCtaOpen(true)}
          aria-label="Edit the top bar"
          title="Edit the top bar"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] sm:px-3"
        >
          <SlidersHorizontal className="h-4 w-4 text-[#6b7280]" />
          <span className="hidden lg:inline">Top bar</span>
        </button>

        <div ref={schemeRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSchemeOpen((v) => !v)}
            aria-label="Colour scheme"
            title="Colour scheme"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] sm:px-3"
          >
            <Palette className="h-4 w-4 text-[#6b7280]" />
            <span className="hidden lg:inline">{themePresets[scheme as ThemePreset]?.name ?? "Theme"}</span>
          </button>

          {schemeOpen && !isPhone && (
            <div className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-16px_rgba(0,0,0,0.28)]">
              {schemeList}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={reframe}
          aria-label="Reload the page"
          title="Reload the page"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-[#374151]"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-[#2a2a3e]"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">View live</span>
        </a>
      </div>

      {/*
        THE CANVAS. On a desktop it is inset and bordered, so the page has
        edges of its own. ON A PHONE IT IS NOT: a 4px gutter and a hairline
        around a page that is already only 390px wide is a border eating the
        content it frames. There, the page simply is the screen.
      */}
      <div className="min-h-0 flex-1 overflow-hidden p-0 md:p-2.5">
        <div className="relative h-full w-full overflow-hidden bg-white md:rounded-xl md:border md:border-[#e5e7eb] md:shadow-[0_12px_36px_-20px_rgba(0,0,0,0.35)]">
          {firstLoad && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <BuilderLoader tone="light" lines={["Loading your page"]} />
            </div>
          )}
          <iframe
            key={nonce}
            src={src}
            title={`${displayName}'s creator page`}
            onLoad={() => setFirstLoad(false)}
            className="block h-full w-full border-0 bg-white"
          />
        </div>
      </div>

      {/* A phone gets a sheet, not a popover anchored to a 36px button. */}
      {isPhone && schemeOpen && portalReady && createPortal(
        <div className="fixed inset-0 z-[80]" role="dialog" aria-label="Colour scheme">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSchemeOpen(false)}
            className="absolute inset-0 bg-black/35"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-[#f3f4f6] px-4 py-3">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">Colour scheme</p>
              <button
                type="button"
                onClick={() => setSchemeOpen(false)}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-2 py-2">{schemeList}</div>
          </div>
        </div>,
        document.body,
      )}

      {ctaOpen && portalReady && createPortal(
        <CtaDialog initial={cta} onClose={() => setCtaOpen(false)} onSaved={reframe} isPhone={isPhone} />,
        document.body,
      )}

      {leaving && portalReady && createPortal(
        <div className="wb-leaving" role="status" aria-live="polite" aria-label="Going back">
          <BuilderLoader className="wb-leaving-content" tone="dark" lines={["Going back"]} />
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * The bar across the top of the creator's page: what it says, what the button
 * says, and the four colours it is painted with. It writes through the same
 * /api/creator-profile everything else on the page uses, which validates every
 * colour as a hex before it reaches a style attribute on a public page.
 */
function CtaDialog({
  initial,
  onClose,
  onSaved,
  isPhone,
}: {
  initial: CtaValues
  onClose: () => void
  onSaved: () => void
  isPhone: boolean
}) {
  const [values, setValues] = useState<CtaValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof CtaValues, value: string) => setValues((v) => ({ ...v, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribeBar: values }),
      })
      if (!res.ok) {
        setError("That could not be saved. Try again.")
        return
      }
      onClose()
      onSaved()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const COLOURS: Array<[keyof CtaValues, string, string]> = [
    ["backgroundColor", "Background", "#ffffff"],
    ["textColor", "Text", "#111827"],
    ["buttonColor", "Button", "#2563eb"],
    ["buttonTextColor", "Button text", "#ffffff"],
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-label="Top bar">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/35" />
      <div
        className={`relative w-full overflow-hidden bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)] ${
          isPhone ? "rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]" : "m-4 max-w-md rounded-2xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-3.5">
          <p className="text-[15px] font-semibold text-[#1a1a2e]">Top bar</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#374151]">Message</span>
            <input
              value={values.text}
              maxLength={120}
              onChange={(e) => set("text", e.target.value)}
              placeholder="Join my newsletter"
              className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-[14px] text-[#111827] outline-none transition-colors focus:border-[#9ca3af]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[#374151]">Button</span>
            <input
              value={values.buttonText}
              maxLength={30}
              onChange={(e) => set("buttonText", e.target.value)}
              placeholder="Follow"
              className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-[14px] text-[#111827] outline-none transition-colors focus:border-[#9ca3af]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {COLOURS.map(([key, label, fallback]) => (
              <label key={key} className="block space-y-1.5">
                <span className="text-[13px] font-medium text-[#374151]">{label}</span>
                <span className="flex h-10 items-center gap-2 rounded-lg border border-[#e5e7eb] px-2">
                  <input
                    type="color"
                    aria-label={label}
                    value={/^#[0-9a-f]{6}$/i.test(values[key]) ? values[key] : fallback}
                    onChange={(e) => set(key, e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="truncate text-[12px] text-[#6b7280]">{values[key] || fallback}</span>
                </span>
              </label>
            ))}
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[#f3f4f6] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-lg border border-[#e5e7eb] text-[14px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1a1a2e] text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a3e] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
