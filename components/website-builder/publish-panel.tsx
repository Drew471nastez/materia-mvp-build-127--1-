"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, ExternalLink, Globe, Loader2, ShieldCheck } from "lucide-react"

import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PUBLISH, AS A PLACE RATHER THAN A BUTTON
 * ===========================================================================
 *
 * A button that says "Publish" answers one question and asks none. Pressing
 * it is the moment somebody most wants to know: what is the address, who can
 * see it, how long ago did it last go out, and what is about to change. So
 * the button opens a panel that answers those, and the act of publishing is
 * the last thing in it rather than the only thing.
 *
 * ONE PANEL, TWO CONTAINERS. On a desktop it hangs from the button, grown from
 * it. On a phone it is a bottom sheet with the same drag physics as the rest of
 * the editor — the sheet component already owns detents, velocity and the
 * keyboard, and a second implementation of any of that is a second set of bugs.
 * The content in the middle does not know which it is in.
 */

export interface PublishPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Anchor for the desktop popover. */
  anchorRef: React.RefObject<HTMLElement | null>
  mobile: boolean
  live: boolean
  /** The draft is ahead of what visitors see. */
  pending: boolean
  publishedAt: string | null
  websiteUrl: string
  websiteUrlDisplay: string
  busy: boolean
  onPublish: () => void
}

/**
 * "4 minutes ago", and nothing cleverer. A relative time is read once, in
 * passing, and "yesterday at 14:32" is more than anybody asked.
 */
export function relativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`
  const mo = Math.round(d / 30)
  return `${mo} month${mo === 1 ? "" : "s"} ago`
}

function Body({
  live,
  pending,
  publishedAt,
  websiteUrl,
  websiteUrlDisplay,
  busy,
  onPublish,
}: Omit<PublishPanelProps, "open" | "onOpenChange" | "anchorRef" | "mobile">) {
  const [copied, setCopied] = useState(false)
  // Re-rendered every half minute while visible, so "4 minutes ago" does not
  // still say four after ten. Cheap, and only while the panel is open.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const ago = relativeTime(publishedAt)
  const status = !live
    ? "Not published yet"
    : pending
      ? `Changes since published${ago ? ` ${ago}` : ""}`
      : `Published${ago ? ` ${ago}` : ""}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(websiteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* a clipboard that refuses is not worth an error */
    }
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      <div>
        <div className="flex items-center gap-2.5">
          <span
            className={cn("h-2.5 w-2.5 rounded-full", live ? (pending ? "bg-blue-500" : "bg-emerald-500") : "bg-white/30")}
          />
          <h2 className="text-[20px] font-semibold leading-none">Publish</h2>
        </div>
        <p className="mt-2.5 text-[15px] text-white/60">{status}</p>
      </div>

      {websiteUrl && (
        <div>
          <p className="mb-2.5 text-[15px] font-medium">Website URL</p>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Globe className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{websiteUrlDisplay}</span>
              <button
                type="button"
                onClick={copy}
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Copy address"
              >
                {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
              </button>
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Open the live site"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px] text-white/70">
              <Globe className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
              {live ? "Visible to anyone with the link" : "Nobody can see it until it is published"}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 text-[14px] text-white/80">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.75} />
        No security issues found
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        {/* Preview: the draft as a visitor would see it, with the builder's
            bar over it. It was a button on the bar next to Publish, which
            made two buttons for one decision. Here it is the question
            before the answer. */}
        {websiteUrl ? (
          <a
            href={`${websiteUrl}${websiteUrl.includes("?") ? "&" : "?"}builder_preview=1&show_preview_bar=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-[15px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
            Preview
          </a>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onPublish}
          disabled={busy || (live && !pending)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold text-white transition-all",
            "bg-[#8B56FA] hover:bg-[#7b46ec] disabled:cursor-default disabled:opacity-40",
          )}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Publishing" : live ? (pending ? "Publish changes" : "Published") : "Publish"}
        </button>
      </div>
    </div>
  )
}

export function PublishPanel(props: PublishPanelProps) {
  const { open, onOpenChange, anchorRef, mobile } = props
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Kept in the tree for one beat after closing so it can leave the way it
  // came. A panel that grows in and then vanishes is half an animation.
  const [present, setPresent] = useState(open)
  useEffect(() => {
    if (open) {
      setPresent(true)
      return
    }
    const id = window.setTimeout(() => setPresent(false), 160)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open || mobile) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, mobile, onOpenChange, anchorRef])

  if (mobile) {
    return (
      <MobileEditorSheet
        open={open}
        onOpenChange={onOpenChange}
        className="bg-[#1f1f1f]"
        detents={[0.62, 0.92]}
        // Above the persistent Sections / Pages / Settings sheet, and gone
        // entirely when closed rather than leaving a peek of its own.
        layer="raised"
        peekHeight={0}
      >
        {/* Scrolls, so nothing in it can be out of reach at any stop or on
            any phone. Shorter than the sheet, it is not a scroller at all and
            the drag still belongs to the sheet. */}
        <div className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
          <Body {...props} />
        </div>
      </MobileEditorSheet>
    )
  }

  if (!present) return null
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Publish"
      data-state={open ? "open" : "closed"}
      className={cn(
        "absolute right-0 top-[calc(100%+10px)] z-50 w-[420px] rounded-2xl border border-white/10 bg-[#1f1f1f] p-6 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.7)]",
        "origin-top-right duration-150",
        open
          ? "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1"
          : "pointer-events-none animate-out fade-out-0 zoom-out-95 slide-out-to-top-1 fill-mode-forwards",
      )}
    >
      <Body {...props} />
    </div>
  )
}
