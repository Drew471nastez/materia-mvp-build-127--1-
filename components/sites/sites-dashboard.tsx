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

function relative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function StatusDot({ status }: { status: Site["status"] }) {
  const live = status === "published"
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      {live ? "Published" : status === "unpublished" ? "Unpublished" : "Draft"}
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

function SiteCard({ site }: { site: Site }) {
  const [coverRef, coverScale] = useCoverScale()
  const address = site.slug ? publishedUrl(site.slug).replace(/^https:\/\//, "") : "No address yet"
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
        aria-label={`Edit ${site.name}`}
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
        <iframe
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
           * Hidden until measured. Rendering at scale 1 for a frame would
           * flash a 1280px page across the card before the observer runs.
           */
          style={{
            width: `${COVER_WIDTH}px`,
            height: `${COVER_HEIGHT}px`,
            transform: `scale(${coverScale})`,
            visibility: coverScale ? "visible" : "hidden",
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
            <SmartLink href={`/sites/${site.id}`}>Edit</SmartLink>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {site.status === "published" && site.slug && (
                <DropdownMenuItem asChild>
                  <a href={publishedUrl(site.slug)} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open site
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <SmartLink href={`/sites/${site.id}/settings`}>Settings</SmartLink>
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
        <h2 className="text-lg font-semibold">Build your first website.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe what you want and Storelib AI writes it. Start from a template, or from nothing
          at all.
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => router.push("/app/sites/new")}>Create site</Button>
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
        New site
      </button>
    </div>
  )
}
