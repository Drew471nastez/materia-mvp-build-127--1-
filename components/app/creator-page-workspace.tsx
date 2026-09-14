"use client"

/**
 * ===========================================================================
 *  THE CREATOR PAGE, ON A CANVAS, IN THE SAME EDITOR THE REST OF THE PRODUCT USES
 * ===========================================================================
 * The frame holds the real /u/<handle>, signed in, so every control a creator
 * already has on their own page is the control they use here: the pencil on
 * the CTA bar, Edit profile, the About editor, the owner menu. Nothing is
 * reimplemented, so nothing can drift out of step with what a visitor sees.
 *
 * WHY A FRAME AND NOT AN IMPORT. The page is a server component that reads
 * cookies, queries six tables and renders a thousand lines. Calling it from a
 * client workspace is not possible; copying it is an approximation that
 * drifts. A frame runs the actual route, with the actual session.
 *
 * `?embedded=1` is what tells it that it is inside the workspace, and the
 * proxy only relaxes X-Frame-Options for that exact combination — see the
 * frame-ancestors block in proxy.ts. Opened at its own address the page is
 * still unframeable by anybody, us included.
 *
 * ---------------------------------------------------------------------------
 *  IT LOOKS LIKE THE WEBSITE BUILDER BECAUSE IT IS THE SAME KIND OF THING
 * ---------------------------------------------------------------------------
 * A dark bar, and the page itself on a canvas: inset, rounded, one hairline
 * border, a soft shadow under it. That shape is not decoration. A page
 * rendered edge to edge inside another page has no edges of its own, so
 * nothing tells you where the thing you are editing stops and the tool
 * around it starts — which is what the flat white slab with a gap down one
 * side was failing to say.
 *
 * The leaving and arriving screens are the builder's own BuilderLoader on the
 * builder's own `.wb-leaving` glass, not a second implementation of either.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, ExternalLink, Palette, RotateCw } from "lucide-react"

import { themePresets } from "@/lib/store-builder/defaults"
import type { ThemePreset } from "@/lib/store-builder/types"

import { BuilderLoader } from "@/components/website-builder/builder-loader"

export function CreatorPageWorkspace({
  handle,
  displayName,
  published,
  themePreset,
}: {
  handle: string
  displayName: string
  published: boolean
  /** The scheme the page is painted with now. */
  themePreset: string
}) {
  const router = useRouter()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [leaving, setLeaving] = useState(false)
  /** Portals need a document, and this renders on the server first. */
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => setPortalReady(true), [])

  /**
   * Bumped to reload the frame after an edit made somewhere else, without
   * reloading the workspace around it. `key` on the iframe is the only
   * reliable way: assigning to contentWindow.location is a cross-document
   * navigation the browser may refuse once the page has its own history.
   */
  const [nonce, setNonce] = useState(0)

  /**
   * THE COLOUR SCHEME, CHANGED FROM HERE.
   *
   * It writes through the same /api/creator-profile every other control on
   * the page uses, which already does the auth, the ownership check and the
   * merge into BOTH the draft and the published config — so the preview and
   * the live page never disagree about which scheme is current. Then the
   * frame reloads, and what you are looking at is the new one for real
   * rather than a swatch claiming it.
   */
  const [scheme, setScheme] = useState(themePreset)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const [savingScheme, setSavingScheme] = useState(false)
  const schemeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!schemeOpen) return
    const onDown = (e: MouseEvent) => {
      if (schemeRef.current && !schemeRef.current.contains(e.target as Node)) setSchemeOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [schemeOpen])

  const applyScheme = useCallback(async (preset: string) => {
    setSchemeOpen(false)
    if (preset === scheme) return
    const previous = scheme
    setScheme(preset)
    setSavingScheme(true)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themePreset: preset }),
      })
      if (!res.ok) {
        /** Put the swatch back rather than showing a choice that did not take. */
        setScheme(previous)
        return
      }
      setLoading(true)
      setNonce((n) => n + 1)
    } catch {
      setScheme(previous)
    } finally {
      setSavingScheme(false)
    }
  }, [scheme])

  const src = `/u/${encodeURIComponent(handle)}?embedded=1`
  const liveUrl = `/u/${encodeURIComponent(handle)}`

  const refresh = useCallback(() => {
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])

  const leave = useCallback(() => {
    setLeaving(true)
    /**
     * Long enough for the glass to actually arrive. The builder does the
     * same: a fade that is cut off by the navigation is worse than no fade,
     * because the half-drawn frame is the thing you remember.
     */
    window.setTimeout(() => router.push("/app"), 220)
  }, [router])

  return (
    <div className="flex h-svh min-h-0 flex-col bg-[#131316]">
      {/*
        ONE DARK ROW, and it says where you are before it offers anything.
        The handle is the subject of this screen, so it is first; whether it
        is published is a fact, not a badge with a colour for its own sake.
      */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[#18181c] px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-16px_rgba(0,0,0,0.9)] sm:px-4">
        <button
          type="button"
          onClick={leave}
          aria-label="Back to Storelib"
          title="Back to Storelib"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.08] hover:text-white active:scale-95"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-white">{displayName}</p>
          <p className="truncate text-[11px] leading-tight text-white/45">
            storelib.com/u/{handle}
            {published ? "" : "  ·  not published yet"}
          </p>
        </div>

        {/*
          The whole page's colours, in the bar, because that is where a
          decision about the whole page belongs. Each row is painted in its
          own scheme: a list of names would make somebody try all eight.
        */}
        <div ref={schemeRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSchemeOpen((v) => !v)}
            disabled={savingScheme}
            aria-label="Colour scheme"
            title="Colour scheme"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] font-medium text-white/70 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.09] hover:text-white active:scale-95 disabled:opacity-50"
          >
            <Palette className="h-4 w-4" />
            <span className="hidden md:inline">{themePresets[scheme as ThemePreset]?.name ?? "Theme"}</span>
          </button>

          {schemeOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.09] bg-[#1d1d22] p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
              {(Object.keys(themePresets) as ThemePreset[]).map((preset) => {
                const theme = themePresets[preset]
                const active = preset === scheme
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyScheme(preset)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.07]"
                  >
                    <span
                      aria-hidden
                      className="h-6 w-6 shrink-0 rounded-md border border-white/15"
                      style={{ background: theme.colors.background }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{theme.name}</span>
                    {active && <Check className="h-4 w-4 shrink-0 text-white/70" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={refresh}
          aria-label="Reload the page"
          title="Reload the page"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/70 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.09] hover:text-white active:scale-95"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-[13px] font-semibold text-[#131316] no-underline transition-[background-color,transform] duration-150 hover:bg-white/90 active:scale-95"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">View live</span>
        </a>
      </div>

      {/*
        THE CANVAS. Inset on every side, so the page has edges of its own and
        the gap is deliberate rather than the leftover it looked like when the
        frame was flush left and short on the right.
      */}
      <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/[0.09] bg-white shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <BuilderLoader tone="light" lines={["Loading your page"]} />
            </div>
          )}
          <iframe
            key={nonce}
            ref={frameRef}
            src={src}
            title={`${displayName}'s creator page`}
            onLoad={() => setLoading(false)}
            /** block, or the iframe keeps a baseline gap under it. */
            className="block h-full w-full border-0 bg-white"
          />
        </div>
      </div>

      {/*
        The builder's own leaving glass, not a second one. Portalled to the
        body so it covers the bar as well — an overlay that leaves the chrome
        visible reads as a modal rather than as a departure.
      */}
      {leaving && portalReady && createPortal(
        <div className="wb-leaving" role="status" aria-live="polite" aria-label="Going back">
          <BuilderLoader className="wb-leaving-content" tone="dark" lines={["Going back"]} />
        </div>,
        document.body,
      )}
    </div>
  )
}
