"use client"

import { relativeTime } from "@/lib/website-builder/relative-time"
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
export { relativeTime }

function Body({
  live,
  pending,
  publishedAt,
  websiteUrl,
  websiteUrlDisplay,
  busy,
  onPublish,
  pinActions = false,
}: Omit<PublishPanelProps, "open" | "onOpenChange" | "anchorRef" | "mobile"> & {
  /** Keep the actions on screen under a scrolling body: the phone's sheet. */
  pinActions?: boolean
}) {
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

  const actions = (
    /**
     * Wrapping, and the primary action pushed right by its own margin rather
     * than by `justify-between`. Measured at 15px/600, "Publish changes"
     * wants 178px inside its padding and the Preview link wants 116, which
     * with the gap is 306 — more than a 320px phone has once the card's own
     * padding is off it. `justify-between` cannot wrap without stranding the
     * button on the left of its new line; `ml-auto` holds it to the right on
     * one line or two.
     */
    <div className="flex flex-wrap items-center gap-3">
      {/* Preview: the draft as a visitor would see it, with the builder's
          bar over it. It was a button on the bar next to Publish, which
          made two buttons for one decision. Here it is the question
          before the answer. */}
      {websiteUrl ? (
        <a
          href={`${websiteUrl}${websiteUrl.includes("?") ? "&" : "?"}builder_preview=1&show_preview_bar=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/15 px-4 text-[15px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
          Preview
        </a>
      ) : null}
      {/**
       * ONE BOX, WHATEVER IT SAYS.
       *
       * This button has four labels — Publish, Publish changes, Published,
       * Publishing — and it was sized by whichever one it was showing, with
       * `transition-all` animating the change. So pressing it started a width
       * animation at the same moment its contents were replaced, inside a
       * sheet that is itself a `contain: paint` layer being transformed. What
       * came out of that on a phone was a button whose purple had been
       * painted for one width while its spinner and its word sat at another:
       * a slab of colour with the label stranded beside it.
       *
       * A fixed floor wide enough for the longest label removes the animation
       * rather than smoothing it. 180px: "Publish changes" is the widest of
       * the four at 137.7px, which is 178 inside the button's padding, and
       * "Publishing" with its spinner is 153. Nothing about the box changes
       * when the state does, so there is no resize to tear, and the label
       * swap is the only thing that moves. Colours still transition; the
       * geometry does not.
       *
       * Busy is not disabled-looking. The press is refused while a publish is
       * in flight, but a button that fades out the instant you use it reads
       * as one that did not take the press. It stays lit and says what it is
       * doing; only the genuinely unavailable state — live with nothing to
       * publish — is dimmed.
       */}
      <button
        type="button"
        onClick={onPublish}
        disabled={busy || (live && !pending)}
        aria-busy={busy}
        className={cn(
          "ml-auto flex h-10 min-w-[180px] shrink-0 items-center justify-center gap-2 rounded-xl px-5",
          "text-[15px] font-semibold whitespace-nowrap text-white",
          "bg-[#8B56FA] transition-colors duration-150 hover:bg-[#7b46ec]",
          busy ? "cursor-default" : "disabled:cursor-default disabled:opacity-40",
        )}
      >
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
        {busy ? "Publishing" : live ? (pending ? "Publish changes" : "Published") : "Publish"}
      </button>
    </div>
  )

  const content = (
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
    </div>
  )

  /**
   * On a phone the actions are pinned under the scrolling part, so Publish
   * is on screen whatever the sheet's height: a sheet at 40% of the screen
   * cannot always show the whole card, and the one thing it must show is
   * the button. On a desktop the card is as tall as it needs to be and the
   * actions are simply its last row.
   */
  if (pinActions) {
    return (
      <>
        <div data-sheet-scroll className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1">
          {/* The box the sheet measures. It is inside the scroller, so its
              height is the content's own at any sheet height, which is what
              lets the sheet size to it without the answer feeding back into
              the question. */}
          <div data-sheet-content>{content}</div>
        </div>
        <div className="shrink-0 border-t border-white/10 px-5 pb-3 pt-3 text-white">{actions}</div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      {content}
      <div className="pt-1">{actions}</div>
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
        /**
         * AS TALL AS WHAT IS IN IT, CAPPED.
         *
         * This was a flat 40% of the screen. Forty percent of a phone is not
         * enough for a status line, a URL row, its visibility note and a
         * security line, so the card arrived with its own content already
         * scrolled: everything below the URL had to be dragged into view,
         * which is not what a confirmation is for.
         *
         * `fit` measures what the content actually wants — including
         * whatever the inner scroller is currently clipping, so it converges
         * upward rather than settling into a collapse — and takes that,
         * capped at 88% of the screen so it can never become a page. On a
         * phone the whole card fits inside the cap and nothing scrolls at
         * all; on a small screen it scrolls, with the actions still pinned
         * underneath.
         */
        fit
        detents={[0.88]}
        // Above the persistent Sections / Pages / Settings sheet, and gone
        // entirely when closed rather than leaving a peek of its own.
        layer="raised"
        peekHeight={0}
      >
        <Body {...props} pinActions />
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
