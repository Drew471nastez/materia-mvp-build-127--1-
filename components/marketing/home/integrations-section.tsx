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

  Marks: the service's own file in /public/integrations (the catalog's), or
  a Simple Icons mark through the trimmed generated set
  (components/icons/brand-icons.generated.ts, one import per icon). A file
  that is already a square app icon covers the tile; a mark is drawn on its
  brand's own ground the way its app icon is (white on Stripe's violet,
  Pinterest's red, AfterShip's orange; colour on white for Google's).

  Three rows drift past, alternating direction, and stop under a pointer.
  Each row is its set four times over, so half the track (the distance one
  loop travels) is wider than a 2,300px window and no gap ever shows.

  A tile turns over once when a pointer reaches it (or a finger taps it) and
  lands on the same icon: the first half turns it edge on, the second half
  comes round from the other side, so the icon is never seen mirrored. One
  soft light follows the pointer across the rows (a violet glow under the
  tiles and a white flash over them, two layers moved by transform). Off
  screen, under reduced motion, nothing moves.
*/

import { useEffect, useRef, type CSSProperties, type ComponentType } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import {
  SiApplepay,
  SiAftership,
  SiBrevo,
  SiGoogleads,
  SiGooglecalendar,
  SiGooglepay,
  SiPinterest,
  SiPosthog,
  SiStripe,
  SiTiktok,
} from "@/components/icons/brand-icons.generated"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./integrations-section.module.css"

type Mark = ComponentType<{ className?: string; color?: string }>

type App = {
  name: string
  /** The tile's ground: the app icon's own colour. */
  bg: string
  /** A Simple Icons mark, drawn in `color` on the ground. */
  icon?: Mark
  color?: string
  /** The catalog's own file. */
  logo?: string
  /** "cover" for a file that is already a square app icon; otherwise it is contained at `scale` of the tile. */
  fit?: "cover"
  scale?: number
  /** Turns a dark mark white on a dark ground (Klaviyo's flag). */
  invert?: boolean
  /** TikTok's mark carries its cyan and red echo, as its app icon does. */
  echo?: boolean
}

const ROWS: Array<{ dur: string; apps: App[] }> = [
  {
    dur: "64s",
    apps: [
      { name: "Klaviyo", bg: "#000000", logo: "/integrations/klaviyo.png", scale: 0.9, invert: true },
      { name: "Omnisend", bg: "#ffffff", logo: "/integrations/omnisend.png", fit: "cover" },
      { name: "Brevo", bg: "#0b996e", icon: SiBrevo, color: "#ffffff" },
      { name: "MailerLite", bg: "#09c269", logo: "/integrations/mailerlite.svg", fit: "cover" },
      { name: "Kit", bg: "#1a1a1a", logo: "/integrations/kit.svg", fit: "cover" },
      { name: "Meta Pixel", bg: "#ffffff", logo: "/integrations/meta.svg", scale: 0.62 },
      { name: "TikTok Pixel", bg: "#000000", icon: SiTiktok, color: "#ffffff", echo: true },
      { name: "Pinterest Tag", bg: "#e60023", icon: SiPinterest, color: "#ffffff" },
      { name: "Google Ads", bg: "#ffffff", icon: SiGoogleads, color: "#4285f4" },
    ],
  },
  {
    dur: "56s",
    apps: [
      { name: "Google Analytics", bg: "#ffffff", logo: "/integrations/google-analytics.svg", scale: 0.54 },
      { name: "Tag Manager", bg: "#ffffff", logo: "/integrations/google-tag-manager.svg", scale: 0.56 },
      { name: "Microsoft Clarity", bg: "#ffffff", logo: "/integrations/microsoft-clarity.png", scale: 0.6 },
      { name: "PostHog", bg: "#eeefe9", icon: SiPosthog, color: "#1d1f27" },
      { name: "Stripe", bg: "#635bff", icon: SiStripe, color: "#ffffff" },
      { name: "Apple Pay", bg: "#000000", icon: SiApplepay, color: "#ffffff" },
      { name: "Google Pay", bg: "#ffffff", icon: SiGooglepay, color: "#3c4043" },
      { name: "Google Calendar", bg: "#ffffff", icon: SiGooglecalendar, color: "#4285f4" },
    ],
  },
  {
    dur: "60s",
    apps: [
      { name: "Printful", bg: "#ffffff", logo: "/integrations/printful.svg", scale: 0.74 },
      { name: "Printify", bg: "#a9f86c", logo: "/integrations/printify.png", fit: "cover" },
      { name: "Gelato", bg: "#000000", logo: "/integrations/gelato.png", scale: 1 },
      { name: "CJ Dropshipping", bg: "#ff7a00", logo: "/integrations/cj-dropshipping.png", fit: "cover" },
      { name: "ShipStation", bg: "#14002d", logo: "/integrations/shipstation.png", fit: "cover" },
      { name: "Shippo", bg: "#ffffff", logo: "/integrations/shippo.png", scale: 0.8 },
      { name: "EasyPost", bg: "#ffffff", logo: "/integrations/easypost.png", scale: 0.7 },
      { name: "AfterShip", bg: "#ff6b2b", icon: SiAftership, color: "#ffffff" },
    ],
  },
]

/** Every app shown, for tests: names and the files they use. */
export const PLATFORM_INTEGRATION_APPS = ROWS.flatMap((r) => r.apps.map((a) => ({ name: a.name, logo: a.logo ?? null })))

function Icon({ app }: { app: App }) {
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
      width={112}
      height={112}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cover ? s.cover : s.contain}
      style={cover ? undefined : ({ "--scale": app.scale ?? 0.64, filter: app.invert ? "invert(1)" : undefined } as CSSProperties)}
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
      <span className={s.inner} style={{ background: app.bg }}>
        <Icon app={app} />
        <span className={s.shine} />
      </span>
    </span>
  )
}

/* One turn, landing where it started: edge on at the half, then round from the other side. */
const FLIP: Keyframe[] = [
  { transform: "perspective(600px) rotateY(0deg)", easing: "cubic-bezier(0.5, 0, 0.9, 0.5)" },
  { transform: "perspective(600px) rotateY(90deg)", offset: 0.5 },
  { transform: "perspective(600px) rotateY(-90deg)", offset: 0.5, easing: "cubic-bezier(0.1, 0.5, 0.4, 1)" },
  { transform: "perspective(600px) rotateY(0deg)" },
]
/* The flash: a band of light across the face as it comes round. */
const SHINE: Keyframe[] = [
  { transform: "translate3d(-130%, 0, 0)", opacity: 0 },
  { transform: "translate3d(-130%, 0, 0)", opacity: 0, offset: 0.45 },
  { transform: "translate3d(-10%, 0, 0)", opacity: 1, offset: 0.7 },
  { transform: "translate3d(130%, 0, 0)", opacity: 0 },
]
const TURN_MS = 760

export function IntegrationsSection() {
  const ref = useRef<HTMLElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const { reduced } = usePlatformSection(ref)

  useEffect(() => {
    const rows = rowsRef.current
    if (!rows || reduced) return
    const glow = rows.querySelector<HTMLElement>("[data-glow]")
    const spot = rows.querySelector<HTMLElement>("[data-spot]")
    const turning = new WeakSet<Element>()
    let frame = 0
    let x = 0
    let y = 0

    const flip = (tile: Element | null) => {
      const inner = tile?.firstElementChild as HTMLElement | null
      if (!inner || turning.has(inner) || typeof inner.animate !== "function") return
      turning.add(inner)
      const turn = inner.animate(FLIP, { duration: TURN_MS })
      ;(inner.lastElementChild as HTMLElement | null)?.animate(SHINE, { duration: TURN_MS, easing: "linear" })
      turn.onfinish = turn.oncancel = () => turning.delete(inner)
    }
    const paint = () => {
      frame = 0
      const t = `translate3d(${x}px, ${y}px, 0)`
      if (glow) glow.style.transform = t
      if (spot) spot.style.transform = t
    }
    const fine = (e: PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen"
    const move = (e: PointerEvent) => {
      if (!fine(e)) return
      const r = rows.getBoundingClientRect()
      x = e.clientX - r.left
      y = e.clientY - r.top
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const over = (e: PointerEvent) => {
      if (fine(e)) flip((e.target as Element).closest("[data-tile]"))
    }
    const down = (e: PointerEvent) => {
      if (!fine(e)) flip((e.target as Element).closest("[data-tile]"))
    }
    const enter = (e: PointerEvent) => {
      if (!fine(e)) return
      move(e)
      rows.setAttribute("data-lit", "")
    }
    const leave = () => rows.removeAttribute("data-lit")

    rows.addEventListener("pointermove", move, { passive: true })
    rows.addEventListener("pointerover", over, { passive: true })
    rows.addEventListener("pointerdown", down, { passive: true })
    rows.addEventListener("pointerenter", enter, { passive: true })
    rows.addEventListener("pointerleave", leave, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      rows.removeEventListener("pointermove", move)
      rows.removeEventListener("pointerover", over)
      rows.removeEventListener("pointerdown", down)
      rows.removeEventListener("pointerenter", enter)
      rows.removeEventListener("pointerleave", leave)
    }
  }, [reduced])

  return (
    <section
      ref={ref}
      id="integrations"
      aria-labelledby="integrations-title"
      className={`${m.root} ${s.clip} bg-white py-[clamp(72px,9vw,128px)] text-[#18181b]`}
    >
      <div className="mx-auto max-w-[1400px] px-[var(--landing-gutter,22px)]">
        <div className="mb-10 max-w-[880px] sm:mb-14">
          <StoryHeading id="integrations-title" text="Connect your favorite apps" accent={["favorite", "apps"]} />
        </div>
      </div>

      <div ref={rowsRef} className={`${s.rows} ${m.reveal}`}>
        <span className={s.glow} data-glow="" aria-hidden="true" />
        {ROWS.map((row, r) => (
          <div key={r} className={`${s.row} ${r % 2 ? s.reverse : ""}`}>
            <div className={`${s.track} ${m.loop}`} style={{ "--dur": row.dur } as CSSProperties}>
              {[0, 1, 2, 3].flatMap((copy) => row.apps.map((app) => <Tile key={`${copy}-${app.name}`} app={app} copy={copy > 0} />))}
            </div>
          </div>
        ))}
        <span className={s.spot} data-spot="" aria-hidden="true" />
      </div>
    </section>
  )
}
