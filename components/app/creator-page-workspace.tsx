"use client"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, EDITED WHERE IT LIVES
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
 *  ITS OWN SCREEN
 * ---------------------------------------------------------------------------
 * This moved into /app for a round, to keep the sidebar, and back out again
 * on the owner's instruction. Their reason holds: a creator page is a
 * full-width design, and editing one through the two thirds of a window an
 * /app sidebar leaves means judging a narrower page than the one being
 * published. The way back to the app is the arrow at the left of the bar.
 *
 * ---------------------------------------------------------------------------
 *  TWO FRAMES, AND THE NEW ONE FADES UP OVER THE OLD
 * ---------------------------------------------------------------------------
 * A colour scheme is applied server side, so seeing it means fetching the
 * page again. Reloading the one frame in place unmounts the document first,
 * and for the width of a round trip the canvas is white — which read as "it
 * broke and came back" on every single change.
 *
 * So there are two frames. A change loads into the hidden one; when it says
 * it has loaded, it comes to the front and fades up over the old one, which
 * stays fully opaque underneath until it is covered. There is never a frame
 * of empty canvas, and the change reads as a change rather than as a cut.
 *
 * ---------------------------------------------------------------------------
 *  THE BAR EDITS IN REAL TIME
 * ---------------------------------------------------------------------------
 * Everything in the Top bar panel is posted into the frame as it is typed, so
 * the canvas repaints on the keystroke. Save writes it; the reload that
 * follows is invisible because of the two frames above. Cancel posts the
 * original values back, so leaving the panel undoes what leaving it should.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, ChevronDown, ExternalLink, Loader2, Palette, RotateCw, SlidersHorizontal, X } from "lucide-react"
import { useRouter } from "next/navigation"

import { BuilderLoader } from "@/components/website-builder/builder-loader"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { CreatorPageShare } from "@/components/app/creator-page-share"
import { InlinePanel } from "@/components/app/inline-panel"
import { CREATOR_EDITOR_CHANNEL } from "@/components/store-builder/live-subscribe-bar"
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
  const router = useRouter()
  const [shareOpen, setShareOpen] = useState(false)
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

  const srcFor = (v: number) => `/u/${encodeURIComponent(handle)}?embedded=1&v=${v}`

  // ── The two frames ──────────────────────────────────────────────────────
  /** Which frame is showing, and what each one has been told to load. */
  const [front, setFront] = useState<0 | 1>(0)
  const [srcs, setSrcs] = useState<[string, string]>([srcFor(0), ""])
  const [firstLoad, setFirstLoad] = useState(true)
  const version = useRef(0)
  const frames = useRef<Array<HTMLIFrameElement | null>>([null, null])

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

  /**
   * THE DRAFT, POSTED INTO BOTH FRAMES.
   *
   * Both, not just the visible one: the hidden frame may be part way through
   * loading a fresh copy, and a draft that only reached the front would be
   * lost the moment the two swapped. Held in a ref as well, so the frame can
   * ask for it again after it reloads (it says "ready" when it mounts).
   */
  const draft = useRef<CtaValues | null>(null)
  const post = useCallback((values: CtaValues | null) => {
    draft.current = values
    for (const frame of frames.current) {
      try {
        frame?.contentWindow?.postMessage(
          { channel: CREATOR_EDITOR_CHANNEL, kind: "bar", values: values ?? {} },
          window.location.origin,
        )
      } catch {
        /* A frame that has not loaded yet has no window; it will say "ready". */
      }
    }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { channel?: string; kind?: string } | null
      if (!data || data.channel !== CREATOR_EDITOR_CHANNEL || data.kind !== "ready") return
      if (draft.current) post(draft.current)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [post])

  // ── The colour scheme ────────────────────────────────────────────────────
  const [scheme, setScheme] = useState(themePreset)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const [applying, setApplying] = useState(false)
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
      setApplying(true)
      try {
        const res = await fetch("/api/creator-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ themePreset: preset }),
        })
        if (!res.ok) {
          setScheme(previous)
          setApplying(false)
          return
        }
        reframe()
      } catch {
        setScheme(previous)
        setApplying(false)
      }
    },
    [scheme, reframe],
  )

  /** The spinner in the palette button goes when the new render is on screen. */
  useEffect(() => {
    if (applying) setApplying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front])

  // ── The bar across the top of the page ───────────────────────────────────
  const [ctaOpen, setCtaOpen] = useState(false)

  const closeCta = useCallback(() => {
    setCtaOpen(false)
    /* Leaving without saving puts the page back where it was. */
    post(null)
  }, [post])

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
    <div className="relative flex h-svh min-h-0 flex-col overflow-hidden bg-[#f1f1f3]">
      {/* ONE LIGHT ROW. The way back first, then the handle, then the tools. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e7eb] bg-white px-3 py-2 sm:gap-2 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/app")}
          aria-label="Back to Storelib"
          title="Back to Storelib"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

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
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
            ) : (
              <Palette className="h-4 w-4 text-[#6b7280]" />
            )}
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

        {/*
          THE ADDRESS, NOT A ONE-WAY DOOR.

          This was a bare link out, so the only thing the bar could do with
          the page's own address was leave for it. Opening the card first puts
          the address somewhere it can be copied, says in words that a creator
          page needs no publishing, and is the way to a custom domain.
          Opening the page is still one tap inside it.
        */}
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
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
                ref={(el) => { frames.current[i] = el }}
                src={srcs[i]}
                title={i === front ? `${displayName}'s creator page` : "Loading the next version"}
                aria-hidden={i !== front}
                onLoad={() => onFrameLoad(i)}
                className={cn(
                  "absolute inset-0 block h-full w-full border-0 bg-white",
                  /*
                    The front frame carries the fade. Moving the class between
                    the two elements is what restarts the animation, so every
                    swap plays it and a re-render in between does not.

                    The other frame stays OPAQUE rather than being hidden:
                    fading in over a transparent frame would show the white
                    canvas underneath for a third of a second, which on a dark
                    scheme is the flash this whole arrangement exists to
                    remove.
                  */
                  i === front ? "creator-frame-in z-[2]" : "z-[1] pointer-events-none",
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

      <CreatorPageShare open={shareOpen} onClose={() => setShareOpen(false)} handle={handle} isPhone={isPhone} />

      {/* The bar editor: a panel at the side on a desktop, the sheet on a phone. */}
      {isPhone ? (
        portalReady && (
          <MobileEditorSheet open={ctaOpen} onOpenChange={(o) => { if (!o) closeCta() }} detents={[0.92]} openFull>
            <CtaEditor initial={cta} onClose={closeCta} onPreview={post} onSaved={reframe} />
          </MobileEditorSheet>
        )
      ) : (
        <InlinePanel
          open={ctaOpen}
          onClose={closeCta}
          label="Top bar"
          className="bottom-3 right-3 top-[56px] w-[360px]"
        >
          <CtaEditor initial={cta} onClose={closeCta} onPreview={post} onSaved={reframe} />
        </InlinePanel>
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
 *
 * EVERY CHANGE IS POSTED TO THE CANVAS as it is made, so the page behind the
 * panel is already showing what Save is about to store. That is the whole of
 * "it should appear in real time, I should not have to reload and wait".
 */
function CtaEditor({
  initial,
  onClose,
  onPreview,
  onSaved,
}: {
  initial: CtaValues
  onClose: () => void
  onPreview: (values: CtaValues | null) => void
  onSaved: () => void
}) {
  const [v, setV] = useState<CtaValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof CtaValues>(key: K, value: CtaValues[K]) =>
    setV((s) => {
      const next = { ...s, [key]: value }
      onPreview(next)
      return next
    })

  /** Opening shows the stored state, which is what the canvas already has. */
  useEffect(() => {
    setV(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribeBar: v }),
      })
      if (!res.ok) {
        setError("That could not be saved. Try again.")
        return
      }
      /*
        The panel closes on what is already on screen. The reload behind it
        replaces the preview with the server's own render of the same values,
        so the draft is dropped only once the real thing has arrived — see the
        two frames in the workspace.
      */
      setSaving(false)
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
