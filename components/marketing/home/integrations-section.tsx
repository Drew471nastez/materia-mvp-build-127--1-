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

  Marks: Simple Icons through the trimmed generated set
  (components/icons/brand-icons.generated.ts, one import per icon), or the
  service's own file in /public/integrations when Simple Icons has none.

  Three rows drift past, alternating direction, and stop under a pointer.
  Each row is its set four times over, so half the track (the distance one
  loop travels) is wider than a 2,300px window and no gap ever shows.
  A tile turns over on hover, or on a tap on a phone, to say in one line
  what it does. Off screen, under reduced motion, the rows stand still.
*/

import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import {
  SiApplepay,
  SiAftership,
  SiBrevo,
  SiGoogleads,
  SiGoogleanalytics,
  SiGooglecalendar,
  SiGooglepay,
  SiGoogletagmanager,
  SiKit,
  SiMeta,
  SiPinterest,
  SiPosthog,
  SiStripe,
  SiTiktok,
} from "@/components/icons/brand-icons.generated"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./integrations-section.module.css"

type App = {
  name: string
  does: string
  kind: string
  icon?: ComponentType<{ className?: string; color?: string }>
  color?: string
  logo?: string
}

const ROWS: Array<{ dur: string; apps: App[] }> = [
  {
    dur: "64s",
    apps: [
      { name: "Klaviyo", kind: "Email", does: "Subscribers, buyers and every order, synced as they happen.", logo: "/integrations/klaviyo.png" },
      { name: "Omnisend", kind: "Email", does: "Orders and subscribers for your Omnisend automations.", logo: "/integrations/omnisend.png" },
      { name: "Brevo", kind: "Email", does: "Subscribers and orders in Brevo, unsubscribes both ways.", icon: SiBrevo, color: "#0b996e" },
      { name: "MailerLite", kind: "Email", does: "Buyers and refunds arrive as MailerLite groups.", logo: "/integrations/mailerlite.svg" },
      { name: "Kit", kind: "Email", does: "Subscribers in Kit, buyers and refunds as tags.", icon: SiKit, color: "#18181b" },
      { name: "Meta Pixel", kind: "Ads", does: "Reach your visitors again on Facebook and Instagram.", icon: SiMeta, color: "#0866ff" },
      { name: "TikTok Pixel", kind: "Ads", does: "Measure and retarget your TikTok ads.", icon: SiTiktok, color: "#000000" },
      { name: "Pinterest Tag", kind: "Ads", does: "Build audiences from your visitors for Pinterest ads.", icon: SiPinterest, color: "#e60023" },
      { name: "Google Ads", kind: "Ads", does: "Count every sale as a Google Ads conversion.", icon: SiGoogleads, color: "#4285f4" },
    ],
  },
  {
    dur: "56s",
    apps: [
      { name: "Google Analytics", kind: "Analytics", does: "Every visit and purchase in your own GA4 property.", icon: SiGoogleanalytics, color: "#e37400" },
      { name: "Tag Manager", kind: "Analytics", does: "Run your own tags from one Google Tag Manager container.", icon: SiGoogletagmanager, color: "#246fdb" },
      { name: "Microsoft Clarity", kind: "Analytics", does: "Heatmaps and session recordings of your website.", logo: "/integrations/microsoft-clarity.png" },
      { name: "PostHog", kind: "Analytics", does: "Storelib's page views and sales, sent from the server.", icon: SiPosthog, color: "#f54e00" },
      { name: "Stripe", kind: "Payments", does: "Card payments at checkout and payouts to your bank.", icon: SiStripe, color: "#635bff" },
      { name: "Apple Pay", kind: "Payments", does: "One-tap checkout on iPhone, iPad and Mac.", icon: SiApplepay, color: "#000000" },
      { name: "Google Pay", kind: "Payments", does: "One-tap checkout on Android and in Chrome.", icon: SiGooglepay, color: "#3c4043" },
      { name: "Google Calendar", kind: "Bookings", does: "Busy times block bookings; new bookings land in your calendar.", icon: SiGooglecalendar, color: "#4285f4" },
    ],
  },
  {
    dur: "60s",
    apps: [
      { name: "Printful", kind: "Print on demand", does: "Shirts, mugs and prints made and shipped when they sell.", logo: "/integrations/printful.svg" },
      { name: "Printify", kind: "Print on demand", does: "Print on demand from a network of print partners.", logo: "/integrations/printify.png" },
      { name: "Gelato", kind: "Print on demand", does: "Printed close to your buyer, tracking back to the order.", logo: "/integrations/gelato.png" },
      { name: "CJ Dropshipping", kind: "Dropshipping", does: "A supplier's catalogue, shipped straight to your buyer.", logo: "/integrations/cj-dropshipping.png" },
      { name: "ShipStation", kind: "Shipping", does: "Paid orders go to ShipStation; tracking comes back.", logo: "/integrations/shipstation.png" },
      { name: "Shippo", kind: "Shipping", does: "Buy and print labels from the order page.", logo: "/integrations/shippo.png" },
      { name: "EasyPost", kind: "Shipping", does: "Live carrier rates and labels from the order page.", logo: "/integrations/easypost.png" },
      { name: "AfterShip", kind: "Shipping", does: "Follow every parcel with your own AfterShip account.", icon: SiAftership, color: "#ff6b2b" },
    ],
  },
]

/** Every app shown, for tests: names and the files they use. */
export const PLATFORM_INTEGRATION_APPS = ROWS.flatMap((r) => r.apps.map((a) => ({ name: a.name, logo: a.logo ?? null })))

function Tile({ app, flipped, onFlip, copy }: { app: App; flipped: boolean; onFlip: () => void; copy: boolean }) {
  const Icon = app.icon
  return (
    <button
      type="button"
      className={s.tile}
      aria-pressed={flipped}
      aria-label={copy ? undefined : `${app.name}: ${app.does}`}
      aria-hidden={copy || undefined}
      tabIndex={copy ? -1 : undefined}
      data-copy={copy ? "" : undefined}
      onClick={onFlip}
    >
      <span className={s.inner}>
        <span className={`${s.face} ${s.front}`}>
          {Icon ? (
            <Icon className="h-[42px] w-[42px] sm:h-[48px] sm:w-[48px]" color={app.color} />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={app.logo}
              alt=""
              width={52}
              height={52}
              loading="lazy"
              decoding="async"
              className="h-[44px] w-[44px] rounded-[12px] object-contain sm:h-[52px] sm:w-[52px]"
            />
          )}
          <span className="max-w-[90%] truncate text-[11.5px] font-medium text-[#3f3d46] sm:text-[12px]">{app.name}</span>
        </span>
        <span className={`${s.face} ${s.back}`}>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/70">{app.kind}</span>
          <span className="mt-1 text-[11.5px] font-medium leading-[1.3] sm:text-[12.5px]">{app.does}</span>
        </span>
      </span>
    </button>
  )
}

export function IntegrationsSection() {
  const ref = useRef<HTMLElement>(null)
  usePlatformSection(ref)
  const [flipped, setFlipped] = useState<string | null>(null)
  /* A tapped tile turns back by itself after a while, and the row moves on. */
  useEffect(() => {
    if (!flipped) return
    const id = window.setTimeout(() => setFlipped(null), 4500)
    return () => window.clearTimeout(id)
  }, [flipped])
  const count = ROWS.reduce((n, r) => n + r.apps.length, 0)
  return (
    <section
      ref={ref}
      id="integrations"
      aria-labelledby="integrations-title"
      className={`${m.root} overflow-hidden bg-[#0b0b0c] py-[clamp(72px,9vw,128px)] text-white`}
    >
      <div className="mx-auto max-w-[1400px] px-[var(--landing-gutter,22px)]">
        <div className="mb-10 grid gap-6 sm:mb-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-[880px]">
            <StoryHeading id="integrations-title" text="Connect your favorite apps" accent={["favorite", "apps"]} dark />
            <p className="mt-5 max-w-[58ch] text-[clamp(16px,1.4vw,19px)] leading-[1.6] text-[#a3a0ac]">
              Email, ads, analytics, payments, printing and shipping. Paste a key, pick a list, and Storelib keeps the two in step.
            </p>
          </div>
          <p className="text-[14px] text-white/50">
            <span className="text-white">{count} apps</span> · hover or tap a tile to see what it does
          </p>
        </div>
      </div>

      <div className={`${s.rows} ${m.reveal}`}>
        {ROWS.map((row, r) => {
          const held = row.apps.some((a) => a.name === flipped)
          return (
            <div key={r} className={`${s.row} ${r % 2 ? s.reverse : ""}`} data-held={held ? "" : undefined}>
              <div className={`${s.track} ${m.loop}`} style={{ "--dur": row.dur } as CSSProperties}>
                {[0, 1, 2, 3].flatMap((copy) =>
                  row.apps.map((app) => (
                    <Tile
                      key={`${copy}-${app.name}`}
                      app={app}
                      copy={copy > 0}
                      flipped={flipped === app.name}
                      onFlip={() => setFlipped((f) => (f === app.name ? null : app.name))}
                    />
                  )),
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
