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
  set. Landing round 7, the owner: the rows run the full width of the
  screen, edge to edge, fading only at the very ends (no solid white past
  1210px any more). So that a set is still wider than the screen plus one
  tile, a tile and its gap take at least 1/10.5 of the screen's width: on a
  wide screen the gap grows and the icons spread out, as in the owner's
  reference. A set of 12 or 13 tiles is then at least 12/10.5 of the
  screen, and the same icon is never on screen twice at once. The rows stop
  under a pointer. Off screen, under reduced motion, nothing moves.

  The tiles' shadows have room: each row clips sideways only, with room
  above and below for the shadow and the lift, and the fades at both ends
  run the rows' full height.

  LANDING ROUND 8, THE OWNER:
    dots     "very subtle, extremely subtle, almost invisible light grey dots
             dispersing, going around, very smooth and clean, in some
             corners, fading". <CornerDots> below: one canvas behind the
             section, two soft clouds of grey dots, one in the top right
             beside the heading and one in the bottom left under the rows.
             Each dot circles its corner slowly and drifts outward as it
             goes, fading in as it leaves and out before it reaches the
             cloud's edge, then starts again near the corner, so the cloud
             seems to breathe out and turn. They are at most 16% grey, most far fainter. The
             loop runs only while the section is on screen and the tab is
             visible (usePlatformSection's `live`), at up to 60 frames a
             second, reads no layout, holds no React state; under reduced
             motion it draws one still frame.
    TikTok   the tile came out red with a cyan edge (the white note never took
             its colour). It is TikTok's mark now, drawn as TikTok draws it:
             a cyan note and a red note, white where they overlap
             (./integration-marks TikTokMark).
    accurate the list checked against lib/integrations/catalog.ts again: every
             app a store can connect today (nothing marked Coming soon, no
             built in Storelib feature), plus PostHog and Google Calendar,
             which Send analytics and bookings connect to, and Stripe with
             the Apple Pay and Google Pay it brings. Google Calendar's tile
             is its real four colour icon now (GoogleCalendarMark), not the
             one colour glyph.

  LANDING ROUND 9, THE OWNER: "when I interact with it and scroll, the
  heading moves and stutters and the icons sometimes stutter." Three causes,
  all in this file:
    the dots  were one canvas the size of the section, cleared and redrawn
             on the page's thread 60 times a second for as long as the
             section was on screen. The heading's rise and its ink are
             worked out on that same thread as the page scrolls, and the
             canvas was sent to the screen again every frame beside the
             moving rows. They are drawn once now, as four small SVG layers
             the server sends (two per corner), and they move by CSS alone
             (a slow scale, turn and fade on the compositor): no script, no
             frame loop, no canvas.
    the flip  set off on pointerdown, so every swipe of the page that began
             on an icon turned it over under the finger. A finger turns an
             icon with a tap now (click); a swipe turns nothing.
    the stop  under a mouse was animation-play-state: paused, a dead stop
             and a dead start each time a wheel scroll carried a row under
             the pointer. A row glides to a stop and back now (its playback
             rate eased, as the possibilities' rows do).

  LANDING ROUND 11, THE OWNER:
    more     "add Instagram, Spotify, Apple Music, YouTube and Meta as
             well". A one page embeds Spotify, Apple Music and YouTube
             (lib/onepage/embed-address.ts) and shows Instagram posts and
             a profile (lib/onepage/instagram-*.ts), so each is a real
             connection. Instagram and Apple Music are their app icons
             drawn whole (./integration-marks); Spotify is the green mark
             on black, YouTube the red play button on white. Meta was
             already here as Meta Pixel, in one flat blue that did not read
             as Meta; it is Meta's own mark now, in Meta's blue gradient
             (MetaMark), and not shown twice.
    gap      "reduce the horizontal gap between each icon a little more":
             a tile and its gap now take 1/12 of the screen, not 1/10.5
             (the module's --gap), possible because each set is longer.

  Landing round 12, the owner: the gap "a little more" smaller again. A
  tile and its gap take 1/13 of the screen: the shorter row has 14 tiles,
  13 steps of 1/13 are exactly a screen, so no icon is still seen twice.

  LANDING ROUND 14, THE OWNER: on a computer the gap about half again. A
  tile and its gap take 1/15 of the screen there (10px least): at 1440px
  the gap is 10px (was 21), at 1920 about 20 (was 40). A phone keeps 1/13
  and its 6px. So that 15 steps still make a screen and no icon is seen
  twice, each row has 16 tiles: three more real connections, none marked
  Coming soon in the catalog. Google Sheets, where a OnePage sends its
  signups (lib/onepage/integrations/catalog.ts), in the first row;
  SoundCloud, which a OnePage embeds (app/api/onepage/soundcloud), and
  GitHub, which a website's code syncs with (app/api/github), in the
  second. Zapier, Make and Mailchimp take a OnePage's signups and the
  store's integrations page lists them as working now (OnePage editor fixes
  2), so they are on too, which makes the rows 18 and 17 tiles: more tiles only
  keeps an icon from being seen twice. The rows are run by one hook now
  (loop-gate.ts).
*/

import { useEffect, useMemo, useRef, type CSSProperties, type ComponentType } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { SiAftership } from "@/components/icons/brand/SiAftership"
import { SiBrevo } from "@/components/icons/brand/SiBrevo"
import { SiCalendly } from "@/components/icons/brand/SiCalendly"
import { SiCaldotcom } from "@/components/icons/brand/SiCaldotcom"
import { SiPinterest } from "@/components/icons/brand/SiPinterest"
import { SiGooglesheets } from "@/components/icons/brand/SiGooglesheets"
import { SiGithub } from "@/components/icons/brand/SiGithub"
import { SiPosthog } from "@/components/icons/brand/SiPosthog"
import { SiSoundcloud } from "@/components/icons/brand/SiSoundcloud"
import { SiSpotify } from "@/components/icons/brand/SiSpotify"
import { SiYoutube } from "@/components/icons/brand/SiYoutube"
import { AppleMusicTile, ApplePayMark, GoogleAdsMark, GoogleCalendarMark, GooglePayMark, InstagramTile, MetaMark, StripeMark, TikTokMark } from "./integration-marks"
import { KitLogo, KlaviyoLogo, MailerLiteLogo } from "./email-platform-logos"
import { usePlatformSection } from "./platform-motion"
import { useLoopGate } from "./loop-gate"
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
}

/* Neighbours differ in colour; payments lead. */
const ROWS: App[][] = [
  [
    { name: "Stripe", bg: "#635bff", mark: StripeMark, scale: 0.6 },
    { name: "Apple Pay", bg: "#000000", mark: ApplePayMark, scale: 0.6 },
    { name: "Google Pay", bg: "#ffffff", mark: GooglePayMark, scale: 0.64 },
    { name: "Klaviyo", bg: "#ffffff", tile: KlaviyoLogo },
    { name: "Instagram", bg: "#e1306c", tile: InstagramTile },
    { name: "Google Sheets", bg: "#ffffff", icon: SiGooglesheets, color: "#34a853", scale: 0.56 },
    { name: "TikTok Pixel", bg: "#000000", mark: TikTokMark, scale: 0.6 },
    { name: "Meta Pixel", bg: "#ffffff", mark: MetaMark, scale: 0.62 },
    { name: "Omnisend", bg: "#83ed80", logo: "/home/apps/omnisend.webp", fit: "cover" },
    { name: "Google Analytics", bg: "#ffffff", logo: "/integrations/google-analytics.svg", scale: 0.54 },
    { name: "Pinterest Tag", bg: "#e60023", icon: SiPinterest, color: "#ffffff" },
    { name: "Printful", bg: "#ffffff", logo: "/integrations/printful.svg", scale: 0.74 },
    { name: "Shippo", bg: "#2f4450", logo: "/home/apps/shippo.webp", fit: "cover" },
    /* Bookings made on Calendly and Cal.com come into Bookings (lib/bookings/external). */
    { name: "Calendly", bg: "#006bff", icon: SiCalendly, color: "#ffffff", scale: 0.58 },
    { name: "Google Ads", bg: "#ffffff", mark: GoogleAdsMark, scale: 0.54 },
    { name: "Spotify", bg: "#000000", icon: SiSpotify, color: "#1ed760", scale: 0.62 },
    { name: "MailerLite", bg: "#ffffff", tile: MailerLiteLogo },
    /* A OnePage's signups go to these (lib/onepage/integrations), so they are apps a store connects today. */
    { name: "Zapier", bg: "#fff1e8", logo: "/integrations/zapier.svg", scale: 0.6 },
    { name: "Make", bg: "#f4ebff", logo: "/integrations/make.svg", scale: 0.6 },
  ],
  [
    { name: "Printify", bg: "#a9f86c", logo: "/home/apps/printify.webp", fit: "cover" },
    { name: "Google Calendar", bg: "#ffffff", mark: GoogleCalendarMark, scale: 0.56 },
    { name: "Kit", bg: "#44b1ff", tile: KitLogo },
    { name: "Cal.com", bg: "#111113", icon: SiCaldotcom, color: "#ffffff", scale: 0.64 },
    { name: "SoundCloud", bg: "#ff5500", icon: SiSoundcloud, color: "#ffffff", scale: 0.66 },
    { name: "Tag Manager", bg: "#ffffff", logo: "/integrations/google-tag-manager.svg", scale: 0.56 },
    { name: "ShipStation", bg: "#11003a", logo: "/home/apps/shipstation.svg", fit: "cover" },
    { name: "YouTube", bg: "#ffffff", icon: SiYoutube, color: "#ff0000", scale: 0.66 },
    { name: "Brevo", bg: "#0b996e", icon: SiBrevo, color: "#ffffff" },
    { name: "Gelato", bg: "#ffffff", logo: "/home/apps/gelato.webp", scale: 0.6 },
    { name: "GitHub", bg: "#181717", icon: SiGithub, color: "#ffffff", scale: 0.58 },
    { name: "CJ Dropshipping", bg: "#ff7700", logo: "/home/apps/cj-dropshipping.svg", fit: "cover" },
    { name: "Microsoft Clarity", bg: "#ffffff", logo: "/home/apps/microsoft-clarity.webp", scale: 0.6 },
    { name: "Apple Music", bg: "#fa233b", tile: AppleMusicTile },
    { name: "PostHog", bg: "#eeefe9", icon: SiPosthog, color: "#1d1f27" },
    { name: "AfterShip", bg: "#ff6b2b", icon: SiAftership, color: "#ffffff" },
    { name: "EasyPost", bg: "#ffffff", logo: "/home/apps/easypost.svg", scale: 0.6 },
    { name: "Mailchimp", bg: "#ffe01b", logo: "/integrations/mailchimp.svg", scale: 0.6 },
  ],
]

/** Seconds per tile: every row drifts at the same calm speed. */
const SECONDS_PER_TILE = 4

/** Every app shown, for tests: names and the files they use. */
export const PLATFORM_INTEGRATION_APPS = ROWS.flatMap((r) => r.map((a) => ({ name: a.name, logo: a.logo ?? null })))
/** The rows' sets, for tests: no row may be narrow enough to show a tile twice. */
export const INTEGRATION_ROW_SIZES = ROWS.map((r) => r.length)
/** A tile and its gap take at least this share of the screen's width (1 / 15 on a computer since landing round 14 and 1 / 13 on a phone; 1 / 13 everywhere in round 12, 1 / 12 in round 11; integrations-section.module.css), for tests: a row of n tiles is then at least (n - 1) / 15 screens wide plus a tile. */
export const INTEGRATION_STEP_SHARE = 1 / 15

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
      /* A glyph fills 54% of its tile unless it says otherwise (YouTube's play button is wider on its own icon). */
      <span className={s.mark} style={app.scale ? { width: `${app.scale * 100}%`, height: `${app.scale * 100}%` } : undefined}>
        <Glyph className={s.glyph} color={app.color} />
      </span>
    )
  }
  const cover = app.fit === "cover"
  /*
   * Wave 17: fetched with the section (it mounts screens ahead) and decoded as
   * it is drawn, not loading="lazy" and decoding="async". Lazy, a tile in the
   * moving row, or in a box still skipped (content-visibility), was asked for
   * only once it was near, and on a phone flick the rows came in as empty
   * tiles; async, Safari paints an icon blank until it has decoded it, again
   * each time it has let the decoded copy go. 12 small files, 31 kB in all.
   */
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={app.logo}
      alt=""
      width={90}
      height={90}
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
  THE CORNER DOTS (landing round 8, redrawn in round 9). Two clouds, each
  anchored just outside a corner of the section. cornerDot() below says
  where a dot is on its way out from the corner and how visible: its alpha
  rises over the first fifth of the way and falls to nothing well before
  the cloud's edge, so no dot is ever cut off. Round 8 asked it for every
  dot on every frame and drew them on a canvas; round 9 asks it once per
  dot, for a still picture of each cloud in two layers, and the layers
  themselves drift: each grows slowly out from its corner, turns a few
  degrees and fades, the second half a lap behind the first, so the cloud
  still seems to breathe out and turn. That motion is two CSS animations
  per corner, on the compositor.
*/
type Cloud = { ax: number; ay: number; reach: number }
/** The darkest a dot gets: rgba(24, 24, 27, 0.16), a light grey on white; most are far fainter, on their way in or out. */
export const CORNER_DOT_ALPHA = 0.16
const DOT_RGB = "24,24,27"
const ALPHA_LEVELS = 12

/** Where a dot is and how visible, from its seed and the time (ms). Pure, for tests. */
export function cornerDot(seed: number, t: number, cloud: Cloud): { x: number; y: number; a: number } {
  const r1 = fract(Math.sin(seed * 91.7) * 43758.5)
  const r2 = fract(Math.sin(seed * 12.9 + 4.1) * 24634.6)
  const r3 = fract(Math.sin(seed * 57.3 + 1.7) * 31415.9)
  /* One trip out takes 18 to 34 s; each dot starts at its own point of it. */
  const trip = 18000 + r1 * 16000
  const p = fract(t / trip + r2)
  const dist = cloud.reach * (0.06 + 0.94 * p)
  /* It circles its corner as it goes out, a quarter turn or so per trip, alternate dots the other way. */
  const turn = (r3 < 0.5 ? 1 : -1) * (0.35 + r1 * 0.5)
  const angle = r3 * Math.PI * 2 + (t / trip) * turn * Math.PI * 2 * 0.25
  const x = cloud.ax + Math.cos(angle) * dist
  const y = cloud.ay + Math.sin(angle) * dist * 0.72
  const rise = Math.min(1, p / 0.2)
  const fall = Math.max(0, 1 - p) ** 1.6
  return { x, y, a: CORNER_DOT_ALPHA * rise * fall * (0.55 + 0.45 * r2) }
}
function fract(n: number) {
  return n - Math.floor(n)
}

/** Dots drawn in each layer of a cloud. */
const LAYER_DOTS = 44
/** A layer's box, in its own units: the cloud's reach across, 0.72 of it down (cornerDot squashes the cloud by that). */
const LAYER_W = 100
const LAYER_H = 72

/**
 * One layer of one corner's cloud as SVG paths: the dots that fall inside the
 * section's quarter of the cloud, grouped by how visible they are and by
 * size, each a zero length stroke with a round cap. `corner` 0 is the top
 * right (the anchor is the box's top right corner), 1 the bottom left.
 * Pure, the same on the server and in the browser.
 */
export function cornerLayer(corner: 0 | 1, layer: 0 | 1): { d: string; alpha: number; width: number }[] {
  const cloud: Cloud = { ax: 0, ay: 0, reach: LAYER_W }
  const groups = new Map<string, { d: string; alpha: number; width: number }>()
  let kept = 0
  for (let i = 1; kept < LAYER_DOTS && i < 4000; i++) {
    const seed = corner * 997 + layer * 4831 + i
    const dot = cornerDot(seed, seed * 7919, cloud)
    const inside = corner === 0 ? dot.x < -1 && dot.y > 1 : dot.x > 1 && dot.y < -1
    const level = Math.round((dot.a / CORNER_DOT_ALPHA) * (ALPHA_LEVELS - 1))
    if (!inside || level < 2) continue
    kept++
    const width = 1.8 + ((i * 7) % 3) * 0.7
    const key = `${level}:${width}`
    const group = groups.get(key) ?? { d: "", alpha: +((level / (ALPHA_LEVELS - 1)) * CORNER_DOT_ALPHA).toFixed(3), width }
    group.d += `M${dot.x.toFixed(1)} ${dot.y.toFixed(1)}h.01`
    groups.set(key, group)
  }
  return [...groups.values()]
}

function CornerDots() {
  const layers = useMemo(() => ([0, 1] as const).flatMap((corner) => ([0, 1] as const).map((layer) => ({ corner, layer, paths: cornerLayer(corner, layer) }))), [])
  return (
    <div className={s.dots} aria-hidden="true" data-corner-dots="">
      {layers.map(({ corner, layer, paths }) => (
        <svg
          key={`${corner}-${layer}`}
          className={`${s.cloud} ${m.loop}`}
          data-corner={corner}
          data-layer={layer}
          viewBox={corner === 0 ? `${-LAYER_W} 0 ${LAYER_W} ${LAYER_H}` : `0 ${-LAYER_H} ${LAYER_W} ${LAYER_H}`}
          fill="none"
          focusable="false"
        >
          {paths.map((p) => (
            <path key={`${p.alpha}-${p.width}`} d={p.d} stroke={`rgba(${DOT_RGB},${p.alpha})`} strokeWidth={p.width} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      ))}
    </div>
  )
}

/*
  One turn, landing where it started: edge on at the half, then round from
  the other side, so the mirrored back never shows. The two halves' easings
  meet at the same speed at the edge (1.25 on both), so the turn reads as
  one smooth motion. Landing round 8 (the owner: "the flip thing is delayed;
  a little more smooth, buttery and a bit faster"): the first half started
  from a standstill (an ease in that barely moved for its first 150ms of
  900), which read as a delay after the pointer arrived. Now it sets off at
  once and the whole turn takes 680ms, the shine a little sooner.
*/
const FLIP: Keyframe[] = [
  { transform: "perspective(700px) rotateY(0deg)", easing: "cubic-bezier(0.25, 0.05, 0.6, 0.5)" },
  { transform: "perspective(700px) rotateY(90deg)", offset: 0.5 },
  { transform: "perspective(700px) rotateY(-90deg)", offset: 0.5, easing: "cubic-bezier(0.3, 0.375, 0.4, 1)" },
  { transform: "perspective(700px) rotateY(0deg)" },
]
/* The flash: a band of light across the face as it comes round. */
const SHINE: Keyframe[] = [
  { transform: "translate3d(-130%, 0, 0)", opacity: 0 },
  { transform: "translate3d(-130%, 0, 0)", opacity: 0, offset: 0.4 },
  { transform: "translate3d(-10%, 0, 0)", opacity: 1, offset: 0.65 },
  { transform: "translate3d(130%, 0, 0)", opacity: 0 },
]
const TURN_MS = 680

/* The rows the gate runs; a stable object, so the hook is set up once. */
const ROW_GATE = { tracks: "[data-row-track]", stopMs: 600 } as const

export function IntegrationsSection() {
  const ref = useRef<HTMLElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const { reduced } = usePlatformSection(ref)

  /* A tile turns once when a mouse reaches it or a finger taps it (a tap, not a touch: a swipe of the page that starts on an icon turns nothing). Nothing is read from the layout. */
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
    let touch = false
    const down = (e: PointerEvent) => {
      touch = !fine(e)
    }
    const tap = (e: MouseEvent) => {
      if (touch) flip((e.target as Element).closest("[data-tile]"))
    }
    rows.addEventListener("pointerover", over, { passive: true })
    rows.addEventListener("pointerdown", down, { passive: true })
    rows.addEventListener("click", tap, { passive: true })
    return () => {
      rows.removeEventListener("pointerover", over)
      rows.removeEventListener("pointerdown", down)
      rows.removeEventListener("click", tap)
    }
  }, [reduced])

  /*
    Landing round 14 (the owner: the possibilities' rows "sometimes freeze and block"; the same check here): one hook
    runs both rows (loop-gate.ts). Off screen or in a background tab they stop; a mouse moved over a row glides it to
    a stop and back up when it leaves; the page scrolling under a resting pointer stops nothing (it used to stop a
    row as the wheel carried it under the pointer); a row on screen that anything else left paused goes again within
    two seconds.
  */
  useLoopGate(ref, ROW_GATE)

  return (
    <section
      ref={ref}
      id="integrations"
      aria-labelledby="integrations-title"
      className={`${m.root} ${s.clip} bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#18181b]`}
    >
      <CornerDots />
      {/* Landing round 7: the shared home width, the heading set in like the showcase's. */}
      <div className="home-wrap">
        <div className="mb-8 ml-[var(--home-head-inset,14px)] max-w-[880px] sm:mb-12">
          <StoryHeading id="integrations-title" text="Connect your favorite apps" accent={["favorite", "apps"]} />
        </div>
      </div>

      <div ref={rowsRef} className={`${s.rows} ${m.reveal}`}>
        {ROWS.map((apps, r) => (
          <div key={r} className={`${s.row} ${r % 2 ? s.reverse : ""}`}>
            <div className={`${s.track} ${m.loop}`} data-row-track="" style={{ "--dur": `${apps.length * SECONDS_PER_TILE}s` } as CSSProperties}>
              {[0, 1].flatMap((copy) => apps.map((app) => <Tile key={`${copy}-${app.name}`} app={app} copy={copy > 0} />))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
