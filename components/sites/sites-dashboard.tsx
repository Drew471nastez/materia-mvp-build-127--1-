"use client"

/**
 * The Sites list.
 *
 * Deliberately quiet chrome: the thing worth looking at is the site, so a card
 * is mostly its own preview. Compact controls, subtle borders, 10px corners —
 * the Linear/Vercel register the brief asks for, not the big rounded SaaS card.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Globe, MoreHorizontal, Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"
import { publishedUrl } from "@/lib/sites/public-host"
import type { Site } from "@/lib/sites/types"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

function relative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return tt("just now")
  if (mins < 60) return tt("{mins}m ago", { mins })
  const hours = Math.round(mins / 60)
  if (hours < 24) return tt("{hours}h ago", { hours })
  const days = Math.round(hours / 24)
  if (days < 30) return tt("{days}d ago", { days })
  return new Date(then).toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric" }))
}

function StatusDot({ status }: { status: Site["status"] }) {
  const live = status === "published"
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      {live ? tt("Published") : status === "unpublished" ? tt("Unpublished") : tt("Draft")}
    </span>
  )
}

/** The width the cover is rendered at: a desktop layout, 16:10 like the card. */
const COVER_WIDTH = 1280
const COVER_HEIGHT = 800

/**
 * The scale that makes a 1280px render fill this card.
 *
 * MEASURED, not expressed in CSS. The obvious version is
 * `transform: scale(calc(100cqw / 1280))` with a container-type parent, and
 * it silently does nothing: `cqw` is a LENGTH and `scale()` takes a unitless
 * NUMBER, so the declaration is invalid and dropped. The card then shows the
 * top-left corner of a 1280px page, which looks like a broken thumbnail
 * rather than like a CSS error. Caught by measuring a real browser at three
 * widths — the rendered frame came back 1280px wide in all of them.
 *
 * A ResizeObserver is the version that works, and it costs one number per
 * card per resize.
 */
function useCoverScale(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = React.useState(0)

  React.useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const measure = () => setScale(box.clientWidth / COVER_WIDTH)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  return [ref, scale]
}

/**
 * Has the frame's OWN document said hello?
 *
 * ---------------------------------------------------------------------------
 *  "storelib.com refused to connect.", in the middle of a card
 * ---------------------------------------------------------------------------
 * The last time that appeared it was the cover route's 404, carrying no
 * `frame-ancestors` for the blanket `X-Frame-Options: DENY` to be overridden
 * by. That is fixed at the route. But fixing causes one at a time is a losing
 * game: a frame also shows the browser's error page for a gateway timeout, a
 * middleware refusal, a platform error page, a redirect to somewhere that
 * refuses framing, and whatever is invented next. Every one of those is
 * somebody else's response arriving where a cover should be, and none of them
 * can be enumerated from here.
 *
 * So this does not ask WHY a frame failed. The cover document announces itself
 * on load — `previewDocument` already sends `ready`, and the placeholder now
 * does too — and the frame is REVEALED ONLY WHEN THAT ARRIVES. Anything else,
 * for any reason, stays invisible behind the card's own placeholder.
 *
 * ---------------------------------------------------------------------------
 *  WHY THERE IS NO TIMER
 * ---------------------------------------------------------------------------
 * The obvious version decides at the iframe's `load` event, and it is wrong.
 * Measured in Chromium: `load` DOES fire on a frame the browser refused —
 * which is the part that works — but on a cover that loads perfectly the
 * `ready` message arrives AFTER `load`, so deciding there would hide working
 * covers. A timer instead of an event just moves the race: a cold cover is a
 * full bundle and can take many seconds, and any timeout short enough to feel
 * responsive is short enough to hide a real one.
 *
 * Waiting for the message and nothing else has no race in it. A cover that
 * never arrives leaves a placeholder, which is what a card should show anyway.
 *
 * The sender is identified by `event.source`, not by origin: the frame runs
 * sandboxed on an opaque origin, so `event.origin` is the string "null" and
 * proves nothing. A reference to the window is the only thing that does.
 */
function useCoverReady(): [React.RefObject<HTMLIFrameElement | null>, boolean] {
  const ref = React.useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== ref.current?.contentWindow) return
      const data = event.data as { source?: string; kind?: string } | null
      if (data?.source === "storelib-preview" && data.kind === "ready") setReady(true)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  return [ref, ready]
}

function SiteCard({ site }: { site: Site }) {
  const [coverRef, coverScale] = useCoverScale()
  const [frameRef, coverReady] = useCoverReady()
  const address = site.slug ? publishedUrl(site.slug).replace(/^https:\/\//, "") : tt("No address yet")
  return (
    <div className="group overflow-hidden rounded-[10px] border border-border bg-card transition-colors hover:border-foreground/20">
      <SmartLink
        href={`/sites/${site.id}`}
        /*
         * `container-type: inline-size` turns this box into the reference the
         * frame below scales against, so the cover fills the card at every
         * breakpoint instead of at the one width it was measured for.
         */
        className="relative block aspect-[16/10] w-full overflow-hidden bg-muted/40"
        aria-label={tt("Edit {name}", { name: site.name })}
      >
        {/*
          * THE SITE AS YOU LAST LEFT IT — published or not.
          *
          * This used to frame the PUBLISHED page, so a site you had spent an
          * hour on showed "Not published yet" until you shipped it: a grey box
          * where the work is. The cover is built from the current files and
          * rebuilt only when the revision moves, so it is what you left behind
          * without costing a compile per keystroke.
          *
          * Rendered at 1280px and scaled, so the card shows the DESKTOP
          * layout rather than a 400px-wide column squeezed into a landscape
          * box — a phone-shaped render in a 16:10 frame is what makes these
          * cards look broken on mobile.
          *
          * `sandbox` WITHOUT allow-same-origin: the frame runs on an opaque
          * origin, so a creator's generated JavaScript cannot read the
          * session, reach the parent, or touch storage — which is what makes
          * it safe to render on the dashboard's own domain at all.
          * `pointer-events: none` and a cover span on top keep the frame from
          * swallowing the click, because the whole card is a link.
          */}
        <div ref={coverRef} className="absolute inset-0">
        {/*
          * UNDERNEATH, ALWAYS. The frame is painted on top of this once its
          * own document reports in, so whatever else a request to that path
          * might return — a gateway timeout, a refusal, somebody's error page
          * — is never what a creator sees.
          */}
        <div className="absolute inset-0 grid place-items-center bg-muted/40" aria-hidden="true">
          <span className="text-xs text-muted-foreground/70">{site.name}</span>
        </div>
        <iframe
          ref={frameRef}
          src={`/api/sites/${site.id}/cover`}
          title=""
          aria-hidden="true"
          tabIndex={-1}
          loading="lazy"
          sandbox="allow-scripts"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-background"
          /*
           * 1280x800 is 16:10, the card's own ratio, so the desktop layout
           * lands in the frame without letterboxing. `100cqw / 1280` is the
           * card's current width over the render width — one expression that
           * is correct at every column count, where the fixed 0.3125 it
           * replaced was correct only at 400px.
           */
          /*
           * Hidden until measured AND until the frame's own document has said
           * hello. Measured, because rendering at scale 1 would flash a 1280px
           * page across the card before the observer runs; and greeted,
           * because until then there is no way to know that what loaded is a
           * cover rather than a browser error page.
           *
           * `visibility` rather than `display`, so the frame still loads.
           */
          style={{
            width: `${COVER_WIDTH}px`,
            height: `${COVER_HEIGHT}px`,
            transform: `scale(${coverScale})`,
            visibility: coverScale && coverReady ? "visible" : "hidden",
          }}
        />
        </div>
        <span className="absolute inset-0" />
      </SmartLink>

      <div className="flex items-start justify-between gap-3 border-t border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{site.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Globe className="h-3 w-3 shrink-0" />
            {address}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusDot status={site.status} />
            <span className="text-xs text-muted-foreground">· {relative(site.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button asChild size="sm" variant="outline" className="h-8">
            <SmartLink href={`/sites/${site.id}`}>{tt("Edit")}</SmartLink>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={tt("More")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {site.status === "published" && site.slug && (
                <DropdownMenuItem asChild>
                  <a href={publishedUrl(site.slug)} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {tt("Open site")}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <SmartLink href={`/sites/${site.id}/settings`}>{tt("Settings")}</SmartLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export function SitesDashboard({ sites, canCreate }: { sites: Site[]; canCreate: string | null }) {
  const router = useRouter()

  if (sites.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-[10px] border border-border">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        </span>
        <h2 className="text-lg font-semibold">{tt("Build your first website.")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tt("Describe what you want and Storelib AI writes it. Start from a template, or from nothing at all.")}
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => router.push("/app/sites/new")}>{tt("Create site")}</Button>
        </div>
        {canCreate && <p className="mt-4 text-xs text-muted-foreground">{canCreate}</p>}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sites.map((site) => (
        <SiteCard key={site.id} site={site} />
      ))}

      <button
        type="button"
        onClick={() => router.push("/app/sites/new")}
        className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
        {tt("New site")}
      </button>
    </div>
  )
}
