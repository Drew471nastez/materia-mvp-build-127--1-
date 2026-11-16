"use client"

/*
  HOME SECTION 10: YOUR AUDIENCE BELONGS TO YOU.

  Landing round 5, the owner: "I don't like it. Make it more simple,
  different structure, more clean", one compact picture, much shorter, and
  nothing that glitches, flashes or stutters while the page scrolls past.

  So the section is two columns:
  - the words: the heading (no subheading, wave 13) and short lines with a
    hairline between them;
  - one picture: Contacts as the app draws it (app/(storelib)/app/contacts).

  Landing round 9, the owner: "make it even better, more clean, more
  smooth", "this section has too much text", "it looks like just text", the
  picture "is too much text and complex", and "when I reach the section with
  the scroll it appears glitchy, bumpy, stuttery".

  - The picture is one idea: the list, and a new person joining it at the
    top every few seconds. A header with the count and Export CSV, four big
    rows (a face, a name, the door they came in by:
    lib/contacts/contact-source.ts), and under them the five email platforms
    Storelib syncs today (lib/integrations/catalog), in their own marks.
  - ONE strip moves, by transform, on the compositor: the rows slide down
    one row and rest, on one CSS clock that loops without a seam (the strip
    ends on the people it began with). A soft wash under the top row fades
    as each person lands (opacity). It plays only while the section is on
    screen and the tab is visible (data-live, set by one
    IntersectionObserver), and under reduced motion it stands still.

  LANDING ROUND 14, THE OWNER: the picture becomes a sequence that plays by
  itself: the contacts (about 3s), then "synced" (contacts coming in from a
  form, a checkout and an import, each turning Synced), then an email being
  sent to a segment, then a carousel of the email layouts, each in the
  creator's own logo and color. A step every ~5s; a tap, click, swipe or drag
  stays on what the visitor chose and lets them swipe between the steps and
  the layouts; the autoplay picks up again after a pause (AUDIENCE_IDLE_MS).

  - Everything shown is real. The layouts are the composer's five
    (lib/email-campaigns/starters.ts STARTERS: Letter, Announcement, New
    product, Newsletter, Sale), with the words those starters write where
    they fit ("20% off until Sunday", THANKYOU20, "Shop the sale", "Find out
    more", "View product", the {{first_name}} greeting). The look is the
    sent email's (lib/email-campaigns/template.ts): the grey ground, the logo
    over a white card with a hairline, the name and Unsubscribe under it, and
    the button in the brand's color (lib/email-campaigns/brand.ts). The
    segment is "Bought something" (segments.ts describeRules), the send says
    "Getting ready to send", "Sending to 2,318 people" and "Sent to 2,318
    people" as the send status does (components/email/compose/send-status),
    the doors are Contacts' (a OnePage form, a checkout whose buyer ticked
    "Email me news and offers", an import, the website form), and Klaviyo syncs every 15 minutes
    (lib/integrations/marketing/sync-server: the cron's quarter hour).
  - The words beside the picture are the steps: four lines, the hairline
    over the one in turn filling as it plays (one Web Animation, transform
    only, and its end is the clock: no timer in JavaScript while it plays).
    A line is a button.
  - No React render per step: a step writes a few attributes on the layers
    already in the page (data-on, data-was, data-o, data-step), as the world
    map does. Panes cross by opacity and a short slide; the layouts move as a
    stack by transform; every loop in a pane runs only while that pane is in
    turn and the section is on screen.
  - The card never changes size: its height is the contacts' rows plus the
    head and the foot, in CSS, and every pane fills it.
  - Reduced motion: no autoplay and no movement; the lines and a swipe still
    change the step.

  The example belongs to Hollow Pines, the fictional outdoor filmmaking
  channel the map below sells for. The faces are Unsplash photographs, 96px
  webp; the hoodie and the cap are the channel's own pictures.

  Landing round 7: the section sits in the page's one width (--home-edge
  and --home-max, app/globals.css), its heading set in by --home-head-inset.
*/

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react"
import { LIVE_AHEAD } from "./platform-motion"
import { StoryHeading } from "@/components/marketing/story-heading"
import { EMAIL_PLATFORMS } from "./email-platform-logos"
import m from "./platform.module.css"
import s from "./audience-ownership.module.css"

const IMG = "/home/audience/people"
const AUDIENCE = 18240

/** The newest contacts, as Contacts lists them: a name and the door they came in by. */
export const AUDIENCE_PEOPLE = [
  { name: "Niamh Byrne", via: "OnePage", photo: "niamh" },
  { name: "Kofi Boateng", via: "Checkout", photo: "kofi" },
  { name: "Minh Tran", via: "Free download", photo: "minh" },
  { name: "Rachel Moore", via: "Website", photo: "rachel" },
  { name: "Henrik Dahl", via: "Checkout", photo: "henrik" },
] as const

/**
 * The four steps the picture plays, each with the line beside it and how long
 * it stays (landing round 14: the contacts about 3s, then about 5s each). The
 * layouts stay LAYOUT_MS each, and their line fills over all five.
 */
export const AUDIENCE_STEPS = [
  { id: "contacts", line: "Download every contact, any time", ms: 3000 },
  { id: "synced", line: "Syncs with your email platform", ms: 5000 },
  { id: "send", line: "Email everyone, or a segment", ms: 5000 },
  { id: "layouts", line: "Layouts in your logo and colors", ms: 0 },
] as const

/** The lines beside the picture: the steps. */
export const AUDIENCE_POINTS = AUDIENCE_STEPS.map((step) => step.line)

/** How many rows the list shows (four at every width since round 14: the card is tall enough for an email). */
export const AUDIENCE_ROWS = 4

/** How long one layout stays in front. */
export const LAYOUT_MS = 3000
/** After a tap, click or swipe, how long the picture waits on the visitor's choice before it plays again. */
export const AUDIENCE_IDLE_MS = 7000

/** The sent email's look, per layout: the composer's five (lib/email-campaigns/starters.ts), each in a brand color a creator might pick. */
export const AUDIENCE_LAYOUTS = [
  { id: "announcement", name: "Announcement", accent: "#2f5d50" },
  { id: "product", name: "New product", accent: "#b4532a" },
  { id: "newsletter", name: "Newsletter", accent: "#1a1a2e" },
  { id: "sale", name: "Sale", accent: "#9f1d35" },
  { id: "letter", name: "Letter", accent: "#2d4f8a" },
] as const

/** Every frame of the sequence in order: a step, and for the layouts which one is in front. */
export const AUDIENCE_FRAMES: ReadonlyArray<{ step: number; t: number; ms: number }> = [
  { step: 0, t: 0, ms: AUDIENCE_STEPS[0].ms },
  { step: 1, t: 0, ms: AUDIENCE_STEPS[1].ms },
  { step: 2, t: 0, ms: AUDIENCE_STEPS[2].ms },
  ...AUDIENCE_LAYOUTS.map((_, t) => ({ step: 3, t, ms: LAYOUT_MS })),
]

/*
  The strip: the five people, then the first four again, so the loop ends
  on the picture it began with and starts over without a seam. It starts
  five rows up and comes down one row at a time (aud-roll in the stylesheet).
*/
const STRIP = [...AUDIENCE_PEOPLE, ...AUDIENCE_PEOPLE.slice(0, AUDIENCE_ROWS)]

const n = (v: number) => v.toLocaleString("en-US")
const SEGMENT = 2318

/** A layout's place in the stack for the one in front: 0 in front, -1 and 1 beside it, the rest behind (-2 to 2 for five). */
export function layoutOffset(k: number, front: number): number {
  const len = AUDIENCE_LAYOUTS.length
  const o = (((k - front) % len) + len) % len
  return o > len / 2 ? o - len : o
}

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  )
}

/** Hollow Pines' logo as a creator would upload it: two pines on a tile in the brand color, and the name. */
function PinesLogo({ accent }: { accent: string }) {
  return (
    <span className={s.logo}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <rect width="20" height="20" rx="5" fill={accent} />
        <path d="M7 4.5 3.6 15h6.8zM13.4 7.2 10.8 15h5.2z" fill="#fff" />
      </svg>
      Hollow Pines
    </span>
  )
}

/** One email as it arrives: the grey ground, the logo over a white card, the name and Unsubscribe under it. */
function Mail({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <span className={s.mail} style={{ "--accent": accent } as CSSProperties}>
      <PinesLogo accent={accent} />
      <span className={s.mailCard}>{children}</span>
      <span className={s.mailFoot}>Hollow Pines · Unsubscribe</span>
    </span>
  )
}

/** The five layouts, written the way a creator fills a starter in. */
function LayoutBody({ id }: { id: (typeof AUDIENCE_LAYOUTS)[number]["id"] }) {
  switch (id) {
    case "announcement":
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/audience/ridge-hoodie-hero.webp" alt="" width={640} height={380} className={s.mailHero} loading="lazy" />
          <b className={s.mailH}>New film on Friday</b>
          <span className={s.mailP}>Hi Niamh, Above the fog goes live at 9am. Three mornings on the ridge, waiting for the light.</span>
          <span className={s.mailBtn}>Find out more</span>
        </>
      )
    case "product":
      return (
        <>
          <b className={s.mailH}>Just released</b>
          <span className={s.mailP}>Hi Kofi, the cap we wore on every shoot this summer.</span>
          <span className={s.mailProduct}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/sell-map/trail-cap.webp" alt="" width={240} height={300} loading="lazy" />
            <span>
              <b>Trail cap</b>
              <span>$28.00</span>
              <i className={s.mailBtnSm}>View product</i>
            </span>
          </span>
        </>
      )
    case "newsletter":
      return (
        <>
          <b className={s.mailH}>This month</b>
          <span className={s.mailP}>Hi Rachel, here is what happened and what is coming next.</span>
          <hr className={s.mailRule} />
          <b className={s.mailH3}>Behind the shots</b>
          <span className={s.mailP}>How we kept the drone steady in thick fog.</span>
          <b className={s.mailH3}>Next: the drone course</b>
          <span className={s.mailP}>Six lessons. Out in May.</span>
        </>
      )
    case "sale":
      return (
        <span className={s.mailCenter}>
          <b className={s.mailH}>20% off everything</b>
          <span className={s.mailP}>
            Until Sunday at midnight. Use the code <b>THANKYOU20</b> at checkout.
          </span>
          <span className={s.mailBtn}>Shop the sale</span>
          <span className={s.mailNote}>One code per order.</span>
        </span>
      )
    case "letter":
      return (
        <>
          <span className={s.mailP}>Hi Minh,</span>
          <span className={s.mailP}>Thanks for watching the new film. I read every reply, so tell me what you want to see next.</span>
          <span className={s.mailP}>
            The full cut is <u className={s.mailLink}>on the channel</u>.
          </span>
          <span className={s.mailP}>
            Thanks for reading,
            <br />
            Hollow Pines
          </span>
        </>
      )
  }
}

/** Step 1: Contacts as the app draws it, a new person joining at the top. */
function ContactsPane() {
  return (
    <div
      className={s.pane}
      data-pane="0"
      data-on=""
      role="img"
      aria-label={`Contacts: ${n(AUDIENCE)} people, synced with Klaviyo, Omnisend, Brevo, MailerLite and Kit, with an Export CSV button. New people join from a OnePage, a checkout, a free download and the website.`}
    >
      <div className={s.head} aria-hidden="true">
        <div className="min-w-0">
          <div className={s.headTitle}>Contacts</div>
          <div className={s.headCount}>
            <span className="tabular-nums">{n(AUDIENCE)}</span> people
          </div>
        </div>
        <span className={s.export}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Export CSV
        </span>
      </div>
      <div className={s.window} aria-hidden="true">
        <span className={s.fresh} />
        <ul className={s.track}>
          {STRIP.map((p, i) => (
            <li key={i} className={s.row}>
              {/* Wave 17: decoded as drawn (not: Safari drew a face blank until it was decoded, again after letting it go). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/${p.photo}.webp`} alt="" width={44} height={44} className={s.face} />
              <span className={s.name}>{p.name}</span>
              <span className={s.via}>{p.via}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={s.foot} aria-hidden="true">
        <span className={s.footLabel}>Synced with</span>
        <span className={s.marks}>
          {EMAIL_PLATFORMS.map(({ name, Logo }) => (
            <span key={name} className={s.mark}>
              <Logo className="block h-full w-full" />
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

/** Step 2: people coming in by four doors, each turning Synced on Klaviyo. */
const SYNC_IN = [
  { who: "Niamh Byrne", door: "OnePage form", face: "niamh" },
  { who: "Kofi Boateng", door: "Checkout", face: "kofi" },
  { who: "1,204 contacts", door: "Imported from a CSV file", face: null },
  { who: "Rachel Moore", door: "Website form", face: "rachel" },
] as const

function SyncedPane() {
  const [klaviyo, ...others] = EMAIL_PLATFORMS
  return (
    <div className={s.pane} data-pane="1" role="img" aria-label="Klaviyo, connected and synced every 15 minutes: Niamh Byrne from a OnePage form, Kofi Boateng from a checkout, 1,204 contacts imported from a CSV file and Rachel Moore from the website form, each synced.">
      <div className={s.head} aria-hidden="true">
        <div className={s.headWho}>
          <span className={s.markLg}>
            <klaviyo.Logo className="block h-full w-full" />
          </span>
          <div className="min-w-0">
            <div className={s.headTitle}>Klaviyo</div>
            <div className={s.headCount}>Syncs every 15 minutes</div>
          </div>
        </div>
        <span className={s.status}>
          <span className={s.syncing}>Syncing</span>
          <span className={s.synced}>
            <Check /> Synced
          </span>
        </span>
      </div>
      <div className={s.ins} aria-hidden="true">
        {SYNC_IN.map((r, i) => (
          <div key={r.who} className={s.line} style={{ "--i": i } as CSSProperties}>
            {r.face ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`${IMG}/${r.face}.webp`} alt="" width={40} height={40} className={s.face} loading="lazy" />
            ) : (
              <span className={s.file}>CSV</span>
            )}
            <span className="min-w-0">
              <span className={s.name}>{r.who}</span>
              <span className={s.door}>{r.door}</span>
            </span>
            <span className={s.state}>
              <span className={s.syncing}>Syncing</span>
              <span className={s.synced}>
                <Check /> Synced
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className={s.foot} aria-hidden="true">
        <span className={s.footLabel}>Also syncs with</span>
        <span className={s.marks}>
          {others.map(({ name, Logo }) => (
            <span key={name} className={s.mark}>
              <Logo className="block h-full w-full" />
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

/** Step 3: an email to a segment, sent. */
function SendPane() {
  return (
    <div className={s.pane} data-pane="2" role="img" aria-label={`A new email, 20% off until Sunday, to the segment Bought something: ${n(SEGMENT)} people. Sent to ${n(SEGMENT)} people.`}>
      <div className={s.head} aria-hidden="true">
        <div className="min-w-0">
          <div className={s.headTitle}>New email</div>
          <div className={s.headCount}>Sale layout</div>
        </div>
        <span className={s.send}>
          <span className={s.sendA}>Send</span>
          <span className={s.sendB}>Sending</span>
          <span className={s.sendC}>
            <Check /> Sent
          </span>
        </span>
      </div>
      <div className={s.fields} aria-hidden="true">
        <div className={s.field}>
          <span className={s.fieldKey}>To</span>
          <span className={s.fieldVal}>
            Bought something <span className={s.muted}>· {n(SEGMENT)} people</span>
          </span>
        </div>
        <div className={s.field}>
          <span className={s.fieldKey}>Subject</span>
          <span className={s.fieldVal}>20% off until Sunday</span>
        </div>
        <div className={s.preview}>
          <Mail accent={AUDIENCE_LAYOUTS[3].accent}>
            <LayoutBody id="sale" />
          </Mail>
        </div>
      </div>
      <div className={s.foot} aria-hidden="true">
        <span className={s.sendState}>
          <span className={s.sendA}>Getting ready to send</span>
          <span className={s.sendB}>Sending to {n(SEGMENT)} people</span>
          <span className={s.sendC}>
            <Check /> Sent to {n(SEGMENT)} people
          </span>
        </span>
        <span className={s.meter}>
          <i />
        </span>
      </div>
    </div>
  )
}

/** Step 4: the five layouts, one in front, in the brand's logo and color. */
function LayoutsPane() {
  return (
    <div className={s.pane} data-pane="3" role="img" aria-label={`Email layouts, each in the creator's own logo and color: ${AUDIENCE_LAYOUTS.map((l) => l.name).join(", ")}.`}>
      <div className={s.head} aria-hidden="true">
        <div className="min-w-0">
          <div className={s.headTitle}>Layouts</div>
          <div className={s.headCount}>Your logo and color</div>
        </div>
        <span className={s.swatches}>
          {AUDIENCE_LAYOUTS.map((l) => (
            <i key={l.id} style={{ background: l.accent }} />
          ))}
          <b data-ring="" />
        </span>
      </div>
      <div className={s.layouts} aria-hidden="true">
        <div className={s.deckFit}>
          <div className={s.deck} data-deck="">
            {AUDIENCE_LAYOUTS.map((l, k) => (
              <span key={l.id} className={s.tpl} data-t={k} data-o={layoutOffset(k, 0)}>
                <Mail accent={l.accent}>
                  <LayoutBody id={l.id} />
                </Mail>
              </span>
            ))}
          </div>
        </div>
        <span className={s.names}>
          {AUDIENCE_LAYOUTS.map((l, k) => (
            <span key={l.id} data-nm={k} data-on={k === 0 ? "" : undefined}>
              {l.name}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

/**
 * THE SEQUENCE. One frame at a time (AUDIENCE_FRAMES); a frame's end is the
 * end of one Web Animation, the hairline over its step's line filling by
 * transform. A turn writes attributes, never renders.
 */
function useSequence(section: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = section.current
    const mock = root?.querySelector<HTMLElement>("[data-aud-mock]")
    if (!root || !mock) return
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const all = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel))
    const panes = all("[data-pane]")
    const steps = all("[data-step-btn]")
    const bars = all("[data-bar]")
    const cards = all("[data-t]")
    const ring = root.querySelector<HTMLElement>("[data-ring]")
    const names = all("[data-nm]")
    const deck = mock.querySelector<HTMLElement>("[data-deck]")
    const put = (node: HTMLElement, name: string, value: string | null) => {
      if (node.getAttribute(name) === value) return
      if (value === null) node.removeAttribute(name)
      else node.setAttribute(name, value)
    }
    const num = (node: HTMLElement, name: string) => Number(node.getAttribute(name))

    let frame = 0
    let live = false
    let held = false
    let clock: Animation | null = null
    let idle: ReturnType<typeof setTimeout> | null = null

    const stop = () => {
      clock?.cancel()
      clock = null
    }
    const start = () => {
      stop()
      if (reduce || held || !live) return
      const f = AUDIENCE_FRAMES[frame]
      const bar = bars.find((b) => num(b, "data-bar") === f.step)
      if (!bar || typeof bar.animate !== "function") return
      const share = f.step === 3 ? AUDIENCE_LAYOUTS.length : 1
      clock = bar.animate([{ transform: `scaleX(${f.t / share})` }, { transform: `scaleX(${(f.t + 1) / share})` }], { duration: f.ms, easing: "linear", fill: "forwards" })
      clock.onfinish = () => go(frame + 1, 1, false)
    }
    const go = (to: number, dir: 1 | -1, byHand: boolean) => {
      const len = AUDIENCE_FRAMES.length
      const next = ((to % len) + len) % len
      const was = AUDIENCE_FRAMES[frame]
      const f = AUDIENCE_FRAMES[next]
      frame = next
      put(mock, "data-dir", dir === 1 ? null : "prev")
      put(mock, "data-step", String(f.step))
      for (const p of panes) {
        const k = num(p, "data-pane")
        put(p, "data-on", k === f.step ? "" : null)
        put(p, "data-was", k === was.step && k !== f.step ? "" : null)
      }
      for (const b of steps) {
        const k = num(b, "data-step-btn")
        put(b, "data-on", k === f.step ? "" : null)
        put(b, "aria-pressed", String(k === f.step))
      }
      for (const c of cards) put(c, "data-o", String(layoutOffset(num(c, "data-t"), f.t)))
      ring?.style.setProperty("--k", String(f.t))
      for (const x of names) put(x, "data-on", num(x, "data-nm") === f.t ? "" : null)
      if (byHand) hold()
      else start()
    }
    /* The visitor chose: stay there, and play again after a while without a touch. */
    const hold = () => {
      held = true
      stop()
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => {
        held = false
        idle = null
        start()
      }, AUDIENCE_IDLE_MS)
    }
    const setLive = (on: boolean) => {
      live = on
      put(mock, "data-live", null)
      if (on) mock.setAttribute("data-live", "")
      if (!clock) start()
      else if (on) clock.play()
      else clock.pause()
    }

    /* The lines beside the picture choose a step. */
    const onStep = (e: Event) => {
      const k = Number((e.currentTarget as HTMLElement).getAttribute("data-step-btn"))
      const first = AUDIENCE_FRAMES.findIndex((f) => f.step === k)
      go(first, first >= frame ? 1 : -1, true)
    }
    for (const b of steps) b.addEventListener("click", onStep)

    /* A swipe or drag on the picture: the panes follow the finger a little, the layouts follow it whole. */
    let x0 = 0
    let y0 = 0
    let t0 = 0
    let dx = 0
    let id: number | null = null
    let dragging = false
    const mover = () => (AUDIENCE_FRAMES[frame].step === 3 ? deck : panes.find((p) => p.hasAttribute("data-on"))) ?? null
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      id = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      t0 = performance.now()
      dx = 0
      dragging = false
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      const mx = e.clientX - x0
      const my = e.clientY - y0
      if (!dragging) {
        if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my)) return
        dragging = true
        mock.setPointerCapture?.(e.pointerId)
        put(mock, "data-drag", "")
        hold()
      }
      dx = mx
      const el = mover()
      if (el) el.style.transform = `translate3d(${el === deck ? dx : dx * 0.4}px,0,0)`
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      const el = mover()
      if (el) el.style.transform = ""
      put(mock, "data-drag", null)
      if (dragging) {
        dragging = false
        const fast = Math.abs(dx) / Math.max(1, performance.now() - t0) > 0.35
        if (Math.abs(dx) > 48 || (fast && Math.abs(dx) > 16)) go(frame + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, true)
        return
      }
      /* A tap: on a layout beside the front one, that layout; anywhere else, stay on this. */
      if (e.type !== "pointerup") return
      /* The panes never take the pointer (their pointer-events would restyle everything in them on each turn), so the layout under a tap is found by where it is: read only on a tap. */
      if (AUDIENCE_FRAMES[frame].step === 3) {
        const front = AUDIENCE_FRAMES[frame].t
        const hit = (c: HTMLElement) => {
          const r = c.getBoundingClientRect()
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        }
        const inFront = cards.some((c) => num(c, "data-t") === front && hit(c))
        const card = inFront ? undefined : cards.find((c) => Math.abs(layoutOffset(num(c, "data-t"), front)) === 1 && hit(c))
        if (card) {
          const t = num(card, "data-t")
          return go(AUDIENCE_FRAMES.findIndex((f) => f.step === 3 && f.t === t), layoutOffset(t, front) > 0 ? 1 : -1, true)
        }
      }
      hold()
    }
    mock.addEventListener("pointerdown", onDown)
    mock.addEventListener("pointermove", onMove)
    mock.addEventListener("pointerup", onUp)
    mock.addEventListener("pointercancel", onUp)

    /* It plays only while on screen (a screen ahead, wave 17) and while the tab is visible. */
    let seen = false
    const apply = () => setLive(seen && !document.hidden)
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              seen = entry.isIntersecting
              apply()
            },
            { rootMargin: LIVE_AHEAD },
          )
    io?.observe(mock)
    document.addEventListener("visibilitychange", apply)
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", apply)
      for (const b of steps) b.removeEventListener("click", onStep)
      mock.removeEventListener("pointerdown", onDown)
      mock.removeEventListener("pointermove", onMove)
      mock.removeEventListener("pointerup", onUp)
      mock.removeEventListener("pointercancel", onUp)
      if (idle) clearTimeout(idle)
      stop()
    }
  }, [section])
}

export function AudienceOwnership() {
  const ref = useRef<HTMLElement>(null)
  useSequence(ref)
  return (
    <section ref={ref} id="audience-ownership" aria-labelledby="audience-ownership-title" className="bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]">
      <div className={`${s.grid} home-wrap`}>
        <div className={s.words}>
          <StoryHeading id="audience-ownership-title" text="Your audience belongs to you." accent={["belongs", "to", "you"]} />
          <ul className={s.points}>
            {AUDIENCE_STEPS.map((step, k) => (
              <li key={step.id}>
                <button type="button" className={s.pointBtn} data-step-btn={k} data-on={k === 0 ? "" : undefined} aria-pressed={k === 0}>
                  <i className={s.bar} data-bar={k} aria-hidden="true" />
                  {step.line}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className={`${m.root} ${s.mock}`} data-aud-mock="" data-step="0">
          <div className={s.panes}>
            <ContactsPane />
            <SyncedPane />
            <SendPane />
            <LayoutsPane />
          </div>
        </div>
      </div>
    </section>
  )
}
