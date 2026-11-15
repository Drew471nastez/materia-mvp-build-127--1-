"use client"

/*
  HOME SECTION 10: YOUR AUDIENCE BELONGS TO YOU.

  Landing round 5, the owner: "I don't like it. Make it more simple,
  different structure, more clean", one compact picture, much shorter, and
  nothing that glitches, flashes or stutters while the page scrolls past.

  So the section is two columns:
  - the words: the heading (no subheading, wave 13) and three short lines
    with a hairline between them (one list, synced to an email platform,
    yours to download);
  - one picture: Contacts as the app draws it (app/(storelib)/app/contacts).

  Landing round 9, the owner: "make it even better, more clean, more
  smooth", "this section has too much text", "it looks like just text", the
  picture "is too much text and complex", and "when I reach the section with
  the scroll it appears glitchy, bumpy, stuttery".

  - The words are three lines of a few words each (15 words, were 62).
  - The picture is one idea: the list, and a new person joining it at the
    top every few seconds. A header with the count and Export CSV, four big
    rows (a face, a name, the door they came in by:
    lib/contacts/contact-source.ts), and under them the five email platforms
    Storelib syncs today (lib/integrations/catalog), in their own marks. The
    growth chart, the export file, the three scene names and the email
    addresses are gone.
  - What moved it before: three stacked scenes cross fading, a cover sliding
    off a chart, a hairline filling for 3.4s, five marks staggering in, and
    an interval turning the scenes that started the moment the section came
    on screen, in the same frames as the heading inking in. Now ONE strip
    moves, by transform, on the compositor: the rows slide down one row and
    rest, on one CSS clock that loops without a seam (the strip ends on the
    people it began with). A soft wash under the top row fades as each
    person lands (opacity). No timer, no React state, nothing written after
    the first draw. It waits 1.4s after the section comes on screen before
    the first move, plays only while the section is on screen and the tab is
    visible (data-live, set by one IntersectionObserver), and under reduced motion it stands still.
  - Nothing changes size: the list is a box of a fixed height (rows x row
    height, both in CSS), and every face has its width and height.

  The faces are Unsplash photographs of five different people (not the
  portraits used elsewhere on the page), 96px webp. The example list
  belongs to Hollow Pines, the fictional outdoor filmmaking channel the map
  below sells for.

  Landing round 7: the section sits in the page's one width (--home-edge
  and --home-max, app/globals.css), its heading set in by --home-head-inset.
*/

import { useEffect, useRef } from "react"
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

/** The three lines beside the picture. */
export const AUDIENCE_POINTS = ["One list from every sign-up", "Syncs with your email platform", "Download every contact, any time"] as const

/** How many rows the list shows at most (four from 640px, three under it: audience-ownership.module.css). */
export const AUDIENCE_ROWS = 4

/*
  The strip: the five people, then the first four again, so the loop ends
  on the picture it began with and starts over without a seam. It starts
  five rows up and comes down one row at a time (aud-roll in the stylesheet).
*/
const STRIP = [...AUDIENCE_PEOPLE, ...AUDIENCE_PEOPLE.slice(0, AUDIENCE_ROWS)]

const n = (v: number) => v.toLocaleString("en-US")

function Contacts() {
  const root = useRef<HTMLDivElement>(null)
  /* The strip runs only while the card is on screen and the tab is visible: one attribute, no React state, so coming on screen renders nothing. */
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === "undefined") return
    let seen = false
    const apply = () => {
      if (seen && !document.hidden) el.setAttribute("data-live", "")
      else el.removeAttribute("data-live")
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        seen = entry.isIntersecting
        apply()
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [])
  return (
    <div
      ref={root}
      className={`${m.root} ${s.mock}`}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/${p.photo}.webp`} alt="" width={44} height={44} decoding="async" className={s.face} />
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

export function AudienceOwnership() {
  return (
    <section id="audience-ownership" aria-labelledby="audience-ownership-title" className="bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]">
      <div className={`${s.grid} home-wrap`}>
        <div className={s.words}>
          <StoryHeading id="audience-ownership-title" text="Your audience belongs to you." accent={["belongs", "to", "you"]} />
          <ul className={s.points}>
            {AUDIENCE_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <Contacts />
      </div>
    </section>
  )
}
