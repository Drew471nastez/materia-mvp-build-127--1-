"use client"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, EDITED WHERE IT LIVES, INSIDE THE APP
 * ===========================================================================
 * The frame holds the real /u/<handle>, signed in, so every control a creator
 * already has on their page is the control they use here. Nothing is
 * reimplemented, so nothing can drift from what a visitor sees.
 *
 * `?embedded=1` tells the page it is inside the workspace, and the proxy
 * relaxes X-Frame-Options only for that exact combination. At its own address
 * the page stays unframeable by anybody, us included.
 *
 * ---------------------------------------------------------------------------
 *  TWO FRAMES, SO A CHANGE IS NEVER A WHITE FLASH
 * ---------------------------------------------------------------------------
 * A colour scheme is applied server side, so seeing it means fetching the
 * page again. Reloading the one frame in place unmounts the document first,
 * and for the width of a network round trip the canvas is white — which read
 * as "it broke and came back" on every single change.
 *
 * So there are two frames and only one is ever visible. A change loads into
 * the hidden one; when it says it has loaded, the two swap. The old page
 * stays on screen until the new page is ready to replace it, and the
 * replacement is a cut, not a blank.
 *
 * ---------------------------------------------------------------------------
 *  THE TOOLS ARE THE BUILDER'S TOOLS
 * ---------------------------------------------------------------------------
 * The bar editor is a panel that rises in at the side on a desktop and the
 * builder's own MobileEditorSheet on a phone. Its colour control is the
 * builder's colour control — the same swatch beside the same hex field —
 * because two editors in one product that draw the same control two ways
 * feel like two products.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, ExternalLink, Loader2, Palette, RotateCw, SlidersHorizontal, X } from "lucide-react"

import { BuilderLoader } from "@/components/website-builder/builder-loader"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { themePresets } from "@/lib/store-builder/defaults"
import type { ThemePreset } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"

/**
 * FIVE, AND THEY HAVE TO BE FIVE DIFFERENT ANSWERS.
 *
 * The engine ships eight and three were the same decision twice: `air` is
 * white with dark accents and so is `blacks`; `bubble` is purple where `pink`
 * is pink; `fusion` is a second near-black beside `astrid`. What is offered is
 * blue, monochrome, warm, pink, dark. The other three still exist, and a page
 * already on one keeps it: this is what is OFFERED, not what is supported.
 */
const SCHEMES: ThemePreset[] = ["default", "blacks", "cream", "pink", "astrid"]

/** The bar's generated sentences, in the words the bar itself uses. */
const MESSAGE_PRESETS = [
  { value: "style1", label: "Join <name>'s newsletter" },
  { value: "style2", label: "Join our family" },
  { value: "style3", label: "Join our community" },
] as const

const BUTTON_PRESETS = [
  { value: "style1", label: "Subscribe" },
  { value: "style2", label: "Join Now" },
  { value: "style3", label: "Get It" },
  { value: "style4", label: "Follow" },
] as const

export interface CtaValues {
  text: string
  buttonText: string
  style: string
  buttonStyle: string
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
  const [portalReady, setPortalReady] = useState(false)
  const [isPhone, setIsPhone] = useState(false)

  useEffect(() => {
    setPortalReady(true)
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const liveUrl = `/u/${encodeURIComponent(handle)}`
  const srcFor = (v: number) => `/u/${encodeURIComponent(handle)}?embedded=1&v=${v}`

  // ── The two frames ──────────────────────────────────────────────────────
  /** Which frame is showing, and what each one has been told to load. */
  const [front, setFront] = useState<0 | 1>(0)
  const [srcs, setSrcs] = useState<[string, string]>([srcFor(0), ""])
  const [firstLoad, setFirstLoad] = useState(true)
  const version = useRef(0)

  /** Load the page again, into the frame nobody is looking at. */
  const reframe = useCallback(() => {
    version.current += 1
    const back = front === 0 ? 1 : 0
    setSrcs((s) => {
      const next: [string, string] = [s[0], s[1]]
      next[back] = srcFor(version.current)
      return next
    })
  }, [front, handle]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFrameLoad = (index: 0 | 1) => {
    if (firstLoad) setFirstLoad(false)
    /** The hidden frame finished: it becomes the front, and the old front is idle. */
    if (index !== front && srcs[index]) setFront(index)
  }

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
        if (!res.ok) return setScheme(previous)
        reframe()
      } catch {
        setScheme(previous)
      }
    },
    [scheme, reframe],
  )

  // ── The bar across the top of the page ───────────────────────────────────
  const [ctaOpen, setCtaOpen] = useState(false)

  /**
   * A SWATCH IS A TINY PAGE, not three stripes. The page colour, a card on it
   * in the card colour, and a pill in the primary: the three things a scheme
   * decides, in the arrangement the page puts them in.
   */
  const Swatch = ({ preset }: { preset: ThemePreset }) => {
    const t = themePresets[preset]
    return (
      <span
        aria-hidden
        className="relative flex h-9 w-12 shrink-0 flex-col gap-1 overflow-hidden rounded-md border border-[#e5e7eb] p-1.5"
        style={{ background: t.sections.pageBackgroundColor }}
      >
        <span className="h-1.5 w-5 rounded-full" style={{ background: t.colors.primary }} />
        <span
          className="h-3 w-full rounded-[3px] border"
          style={{ background: t.productCard.backgroundColor, borderColor: t.productCard.borderColor }}
        />
      </span>
    )
  }

  const schemeList = (
    <div className="p-1">
      {SCHEMES.map((preset) => {
        const active = preset === scheme
        return (
          <button
            key={preset}
            type="button"
            onClick={() => applyScheme(preset)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f3f4f6]",
              active && "bg-[#f3f4f6]",
            )}
          >
            <Swatch preset={preset} />
            <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e] md:text-[13px]">{themePresets[preset].name}</span>
            {active && <Check className="h-4 w-4 shrink-0 text-[#6b7280]" />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#f1f1f3]">
      {/* ONE LIGHT ROW. The handle first, because it is the subject. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e7eb] bg-white px-3 py-2 sm:gap-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#1a1a2e]">{displayName}</p>
          <p className="truncate text-[11px] leading-tight text-[#9ca3af]">
            storelib.com/u/{handle}
            {published ? "" : "  ·  not published yet"}
          </p>
        </div>

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
            <div className="wb-settings-in absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_-16px_rgba(0,0,0,0.28)]">
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
        THE CANVAS. Inset and bordered on a desktop so the page has edges of
        its own. Not on a phone: a gutter and a hairline around a 390px page
        eats the content it frames. There, the page simply is the screen.
      */}
      <div className="min-h-0 flex-1 overflow-hidden p-0 md:p-2.5">
        <div className="relative h-full w-full overflow-hidden bg-white md:rounded-xl md:border md:border-[#e5e7eb] md:shadow-[0_12px_36px_-20px_rgba(0,0,0,0.35)]">
          {firstLoad && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <BuilderLoader tone="light" lines={["Loading your page"]} />
            </div>
          )}
          {([0, 1] as const).map((i) =>
            srcs[i] ? (
              <iframe
                key={i}
                src={srcs[i]}
                title={i === front ? `${displayName}'s creator page` : "Loading the next version"}
                aria-hidden={i !== front}
                onLoad={() => onFrameLoad(i)}
                className={cn(
                  "absolute inset-0 block h-full w-full border-0 bg-white",
                  i === front ? "z-[1] opacity-100" : "z-0 opacity-0 pointer-events-none",
                )}
              />
            ) : null,
          )}
        </div>
      </div>

      {/* A phone gets the builder's own sheet, not a popover on a 36px button. */}
      {isPhone && portalReady && (
        <MobileEditorSheet open={schemeOpen} onOpenChange={setSchemeOpen} fit>
          <div className="px-2 pb-2">
            <p className="px-3 pb-2 pt-1 text-[15px] font-semibold text-[#1a1a2e]">Colour scheme</p>
            {schemeList}
          </div>
        </MobileEditorSheet>
      )}

      {/* The bar editor: a panel at the side on a desktop, the sheet on a phone. */}
      {isPhone ? (
        portalReady && (
          <MobileEditorSheet open={ctaOpen} onOpenChange={setCtaOpen} detents={[0.92]} openFull>
            <CtaEditor initial={cta} onClose={() => setCtaOpen(false)} onSaved={reframe} />
          </MobileEditorSheet>
        )
      ) : (
        ctaOpen && (
          <>
            <button type="button" aria-label="Close" onClick={() => setCtaOpen(false)} className="absolute inset-0 z-20 bg-black/10" />
            <div className="wb-settings-in absolute bottom-3 right-3 top-[56px] z-30 w-[360px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]">
              <CtaEditor initial={cta} onClose={() => setCtaOpen(false)} onSaved={reframe} />
            </div>
          </>
        )
      )}
    </div>
  )
}

/**
 * THE BUILDER'S COLOUR CONTROL, to the class. A swatch that is the picker
 * itself, and the hex beside it in a monospace field. Copied rather than
 * imported because the builder's is a branch inside a 400-line field
 * renderer, and lifting that out is a change to the builder for the sake of
 * this one panel.
 */
function ColorControl({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value)
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[#374151]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb]">
          <input
            type="color"
            aria-label={label}
            className="absolute -inset-1 cursor-pointer"
            value={valid ? value : fallback}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
        <input
          type="text"
          aria-label={`${label} hex`}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-3 font-mono text-sm text-[#111827] outline-none transition-colors focus:border-[#9ca3af] focus:ring-2 focus:ring-neutral-900/10"
          value={value}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      </span>
    </label>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[#374151]">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white px-3 pr-8 text-sm text-[#111827] outline-none transition-colors focus:border-[#9ca3af] focus:ring-2 focus:ring-neutral-900/10"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
      </span>
    </label>
  )
}

/**
 * The bar across the top of the creator's page: which sentence, or a custom
 * one; which button label, or a custom one; and the four colours. It writes
 * through the same /api/creator-profile everything else on the page uses,
 * which validates every colour as a hex before it reaches a public page.
 */
function CtaEditor({ initial, onClose, onSaved }: { initial: CtaValues; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<CtaValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof CtaValues>(key: K, value: CtaValues[K]) => setV((s) => ({ ...s, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribeBar: v }),
      })
      if (!res.ok) return setError("That could not be saved. Try again.")
      onClose()
      onSaved()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full max-h-[85vh] flex-col md:max-h-none">
      <div className="flex shrink-0 items-center justify-between border-b border-[#f3f4f6] px-4 py-3">
        <p className="text-[14px] font-semibold text-[#1a1a2e]">Top bar</p>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="wb-slim-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Select label="Message" value={v.style} options={MESSAGE_PRESETS} onChange={(x) => set("style", x)} />
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[#374151]">Or your own message</span>
          <input
            value={v.text}
            maxLength={120}
            onChange={(e) => set("text", e.target.value)}
            placeholder="Leave empty to use the preset above"
            className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] outline-none transition-colors focus:border-[#9ca3af] focus:ring-2 focus:ring-neutral-900/10"
          />
        </label>

        <Select label="Button" value={v.buttonStyle} options={BUTTON_PRESETS} onChange={(x) => set("buttonStyle", x)} />
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[#374151]">Or your own label</span>
          <input
            value={v.buttonText}
            maxLength={30}
            onChange={(e) => set("buttonText", e.target.value)}
            placeholder="Leave empty to use the preset above"
            className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] outline-none transition-colors focus:border-[#9ca3af] focus:ring-2 focus:ring-neutral-900/10"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <ColorControl label="Background" value={v.backgroundColor} fallback="#ffffff" onChange={(x) => set("backgroundColor", x)} />
          <ColorControl label="Text" value={v.textColor} fallback="#111827" onChange={(x) => set("textColor", x)} />
          <ColorControl label="Button" value={v.buttonColor} fallback="#2563eb" onChange={(x) => set("buttonColor", x)} />
          <ColorControl label="Button text" value={v.buttonTextColor} fallback="#ffffff" onChange={(x) => set("buttonTextColor", x)} />
        </div>

        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#f3f4f6] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
        <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-[#e5e7eb] text-[14px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1a1a2e] text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a3e] disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  )
}
