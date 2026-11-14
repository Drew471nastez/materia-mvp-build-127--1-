"use client"

/*
  HOME SECTION 13: CONNECT YOUR FAVORITE APPS.

  Only apps Storelib connects to today (lib/integrations/catalog.ts and the
  payments it runs on): the trackers (Google Analytics, Tag Manager, Google
  Ads, Meta Pixel, TikTok Pixel, Pinterest Tag, Microsoft Clarity), the five
  email platforms it syncs (Klaviyo, Omnisend, Brevo, MailerLite, Kit),
  Send analytics to PostHog, print on demand and dropshipping (Printful,
  Printify, Gelato, CJ Dropshipping), shipping (ShipStation, Shippo,
  EasyPost, AfterShip), Google Calendar for bookings, and Stripe with the
  Apple Pay and Google Pay it brings to checkout. Nothing listed as Coming
  soon is shown, and no rival store builder.

  WAVE 13, THE OWNER: a light section, the heading alone (no count, no
  "hover or tap" line, no subheading), and each tile is the app's real icon
  and nothing else, filling the card edge to edge.

  LANDING ROUND, THE OWNER: cleaner. Every mark is sharp at any size: a
  vector (./integration-marks for Apple Pay, Google Pay, the current Stripe
  wordmark and Google Ads in its colours; ./email-platform-logos for
  Klaviyo, MailerLite and Kit; Simple Icons through the trimmed generated
  set; the catalog's SVG files), or the company's own app icon at three
  times the drawn size (public/home/apps). No light follows the pointer any
  more (it was cut off at the rows' edges and cost a layout read per move).
  Landing round 4, the owner: a tile does not bump under the pointer; it
  turns over once, smoothly, with nothing square behind it.

  TWO ROWS THAT NEVER SHOW A TILE TWICE (the owner: two rows, icons a fifth
  smaller). Each row is its set twice over and one loop travels exactly one
  set. A set (12 or 13 tiles of 90px and a 20px gap) is wider than the most
  of the rows ever seen (1210px, solid fades past it) plus one tile, so the
  same icon is never on screen twice at once, never side by side. The rows stop under a pointer. Off
  screen, under reduced motion, nothing moves.

  The tiles' shadows have room: each row clips sideways only, with room
  above and below for the shadow and the lift, and the fades at both ends
  run the rows' full height.
*/

import { useEffect, useRef, type CSSProperties, type ComponentType } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { SiAftership, SiBrevo, SiGooglecalendar, SiPinterest, SiPosthog, SiTiktok } from "@/components/icons/brand-icons.generated"
import { ApplePayMark, GoogleAdsMark, GooglePayMark, StripeMark } from "./integration-marks"
import { KitLogo, KlaviyoLogo, MailerLiteLogo } from "./email-platform-logos"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./integrations-section.module.css"

type Glyph = ComponentType<{ className?: string; color?: string }>
type Vector = ComponentType<{ className?: string }>

type App = {
  name: string
  /** The tile's ground: the app icon's own colour. */
  bg: string
  /** A Simple Icons mark, drawn in `color` on the ground. */
  icon?: Glyph
  color?: string
  /** A vector mark drawn at `scale` of the tile's width. */
  mark?: Vector
  /** A vector app icon that is the whole tile. */
  tile?: Vector
  /** A file: the catalog's own, or the company's app icon at 3x (public/home/apps). */
  logo?: string
  /** "cover" for a file that is already a square app icon; otherwise it is contained at `scale` of the tile. */
  fit?: "cover"
  scale?: number
  /** TikTok's mark carries its cyan and red echo, as its app icon does. */
  echo?: boolean
}

/* Neighbours differ in colour; payments lead. */
const ROWS: App[][] = [
  [
    { name: "Stripe", bg: "#635bff", mark: StripeMark, scale: 0.6 },
    { name: "Apple Pay", bg: "#000000", mark: ApplePayMark, scale: 0.6 },
    { name: "Google Pay", bg: "#ffffff", mark: GooglePayMark, scale: 0.64 },
    { name: "Klaviyo", bg: "#ffffff", tile: KlaviyoLogo },
    { name: "TikTok Pixel", bg: "#000000", icon: SiTiktok, color: "#ffffff", echo: true },
    { name: "Meta Pixel", bg: "#ffffff", logo: "/integrations/meta.svg", scale: 0.62 },
    { name: "Omnisend", bg: "#83ed80", logo: "/home/apps/omnisend.webp", fit: "cover" },
    { name: "Google Analytics", bg: "#ffffff", logo: "/integrations/google-analytics.svg", scale: 0.54 },
    { name: "Pinterest Tag", bg: "#e60023", icon: SiPinterest, color: "#ffffff" },
    { name: "Printful", bg: "#ffffff", logo: "/integrations/printful.svg", scale: 0.74 },
    { name: "Shippo", bg: "#2f4450", logo: "/home/apps/shippo.webp", fit: "cover" },
    { name: "Google Ads", bg: "#ffffff", mark: GoogleAdsMark, scale: 0.54 },
    { name: "MailerLite", bg: "#ffffff", tile: MailerLiteLogo },
  ],
  [
    { name: "Printify", bg: "#a9f86c", logo: "/home/apps/printify.webp", fit: "cover" },
    { name: "Google Calendar", bg: "#ffffff", icon: SiGooglecalendar, color: "#4285f4" },
    { name: "Kit", bg: "#44b1ff", tile: KitLogo },
    { name: "Tag Manager", bg: "#ffffff", logo: "/integrations/google-tag-manager.svg", scale: 0.56 },
    { name: "ShipStation", bg: "#11003a", logo: "/home/apps/shipstation.svg", fit: "cover" },
    { name: "Brevo", bg: "#0b996e", icon: SiBrevo, color: "#ffffff" },
    { name: "Gelato", bg: "#ffffff", logo: "/home/apps/gelato.webp", scale: 0.6 },
    { name: "CJ Dropshipping", bg: "#ff7700", logo: "/home/apps/cj-dropshipping.svg", fit: "cover" },
    { name: "Microsoft Clarity", bg: "#ffffff", logo: "/home/apps/microsoft-clarity.webp", scale: 0.6 },
    { name: "PostHog", bg: "#eeefe9", icon: SiPosthog, color: "#1d1f27" },
    { name: "AfterShip", bg: "#ff6b2b", icon: SiAftership, color: "#ffffff" },
    { name: "EasyPost", bg: "#ffffff", logo: "/home/apps/easypost.svg", scale: 0.6 },
  ],
]

/** Seconds per tile: every row drifts at the same calm speed. */
const SECONDS_PER_TILE = 4

/** Every app shown, for tests: names and the files they use. */
export const PLATFORM_INTEGRATION_APPS = ROWS.flatMap((r) => r.map((a) => ({ name: a.name, logo: a.logo ?? null })))
/** The rows' sets, for tests: no row may be narrow enough to show a tile twice. */
export const INTEGRATION_ROW_SIZES = ROWS.map((r) => r.length)
/** What one tile takes on a wide screen (tile and gap) and the most of a row ever seen, for tests. */
export const INTEGRATION_TILE_STEP = 90 + 20
export const INTEGRATION_SEEN_MAX = 1210

function Icon({ app }: { app: App }) {
  if (app.tile) {
    const Whole = app.tile
    return <Whole className={s.whole} />
  }
  if (app.mark) {
    const Mark = app.mark
    return (
      <span className={s.vector} style={{ "--scale": app.scale ?? 0.6 } as CSSProperties}>
        <Mark className={s.vectorSvg} />
      </span>
    )
  }
  const Glyph = app.icon
  if (Glyph) {
    return (
      <span className={s.mark}>
        {app.echo ? (
          <>
            <Glyph className={s.echoA} color="#25f4ee" />
            <Glyph className={s.echoB} color="#fe2c55" />
          </>
        ) : null}
        <Glyph className={s.glyph} color={app.color} />
      </span>
    )
  }
  const cover = app.fit === "cover"
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={app.logo}
      alt=""
      width={90}
      height={90}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cover ? s.cover : s.contain}
      style={cover ? undefined : ({ "--scale": app.scale ?? 0.64 } as CSSProperties)}
    />
  )
}

function Tile({ app, copy }: { app: App; copy: boolean }) {
  return (
    <span
      className={s.tile}
      data-tile=""
      role={copy ? undefined : "img"}
      aria-label={copy ? undefined : app.name}
      aria-hidden={copy || undefined}
      data-copy={copy ? "" : undefined}
      title={copy ? undefined : app.name}
    >
      <span className={s.inner} style={{ background: app.bg }} data-light={/^#(fff|ffffff|eeefe9)$/i.test(app.bg) || undefined}>
        <Icon app={app} />
        <span className={s.shine} />
      </span>
    </span>
  )
}

/*
  One turn, landing where it started: edge on at the half, then round from
  the other side, so the mirrored back never shows. The two halves' easings
  meet at the same speed at the edge, so the turn reads as one smooth motion.
*/
const FLIP: Keyframe[] = [
  { transform: "perspective(700px) rotateY(0deg)", easing: "cubic-bezier(0.45, 0, 0.75, 0.55)" },
  { transform: "perspective(700px) rotateY(90deg)", offset: 0.5 },
  { transform: "perspective(700px) rotateY(-90deg)", offset: 0.5, easing: "cubic-bezier(0.25, 0.45, 0.55, 1)" },
  { transform: "perspective(700px) rotateY(0deg)" },
]
/* The flash: a band of light across the face as it comes round. */
const SHINE: Keyframe[] = [
  { transform: "translate3d(-130%, 0, 0)", opacity: 0 },
  { transform: "translate3d(-130%, 0, 0)", opacity: 0, offset: 0.45 },
  { transform: "translate3d(-10%, 0, 0)", opacity: 1, offset: 0.7 },
  { transform: "translate3d(130%, 0, 0)", opacity: 0 },
]
const TURN_MS = 900

export function IntegrationsSection() {
  const ref = useRef<HTMLElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const { reduced } = usePlatformSection(ref)

  /* A tile turns once when a pointer reaches it or a finger taps it. Nothing is read from the layout. */
  useEffect(() => {
    const rows = rowsRef.current
    if (!rows || reduced) return
    const turning = new WeakSet<Element>()
    const flip = (tile: Element | null) => {
      const inner = tile?.firstElementChild as HTMLElement | null
      if (!inner || turning.has(inner) || typeof inner.animate !== "function") return
      turning.add(inner)
      const turn = inner.animate(FLIP, { duration: TURN_MS })
      ;(inner.lastElementChild as HTMLElement | null)?.animate(SHINE, { duration: TURN_MS, easing: "linear" })
      turn.onfinish = turn.oncancel = () => turning.delete(inner)
    }
    const fine = (e: PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen"
    const over = (e: PointerEvent) => {
      if (fine(e)) flip((e.target as Element).closest("[data-tile]"))
    }
    const down = (e: PointerEvent) => {
      if (!fine(e)) flip((e.target as Element).closest("[data-tile]"))
    }
    rows.addEventListener("pointerover", over, { passive: true })
    rows.addEventListener("pointerdown", down, { passive: true })
    return () => {
      rows.removeEventListener("pointerover", over)
      rows.removeEventListener("pointerdown", down)
    }
  }, [reduced])

  return (
    <section
      ref={ref}
      id="integrations"
      aria-labelledby="integrations-title"
      className={`${m.root} ${s.clip} bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#18181b]`}
    >
      <div className="mx-auto max-w-[1400px] px-[var(--landing-gutter,22px)]">
        <div className="mb-8 max-w-[880px] sm:mb-12">
          <StoryHeading id="integrations-title" text="Connect your favorite apps" accent={["favorite", "apps"]} />
        </div>
      </div>

      <div ref={rowsRef} className={`${s.rows} ${m.reveal}`}>
        {ROWS.map((apps, r) => (
          <div key={r} className={`${s.row} ${r % 2 ? s.reverse : ""}`}>
            <div className={`${s.track} ${m.loop}`} style={{ "--dur": `${apps.length * SECONDS_PER_TILE}s` } as CSSProperties}>
              {[0, 1].flatMap((copy) => apps.map((app) => <Tile key={`${copy}-${app.name}`} app={app} copy={copy > 0} />))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
