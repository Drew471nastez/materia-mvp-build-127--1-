"use client"

/*
  HOME SECTION 10: YOUR AUDIENCE BELONGS TO YOU.

  Landing round 5, the owner: "I don't like it. Make it more simple,
  different structure, more clean", one compact picture, much shorter, and
  nothing that glitches, flashes or stutters while the page scrolls past.

  So the section is two columns and nothing moves in it:
  - the words: the heading (no subheading, wave 13) and three short rows
    with a hairline between them (email from Storelib, sync to an email platform, take the
    list with you);
  - one picture: Contacts as the app draws it (app/(storelib)/app/contacts),
    a header with the count and Export CSV, five people and the door each
    came in by (lib/contacts/contact-source.ts: OnePage, Checkout, Website,
    a free download), and under them the five email platforms Storelib
    syncs today (lib/integrations/catalog), in their own marks.

  No timers, no loops, no reveal, no hooks: it is drawn once, as it is, so
  there is nothing to animate behind the sheet that rises over it and
  nothing to repaint while it scrolls. The example list belongs to Hollow
  Pines, the fictional outdoor filmmaking channel the map below sells for.
*/

import { StoryHeading } from "@/components/marketing/story-heading"
import { EMAIL_PLATFORMS } from "./email-platform-logos"
import m from "./platform.module.css"
import s from "./audience-ownership.module.css"

const IMG = "/home/audience/people"
const AUDIENCE = 18240

/** The newest contacts, as Contacts lists them: a name, an address, the door they came in by and when. */
export const AUDIENCE_PEOPLE = [
  { name: "Sofia Marín", email: "sofia.marin@gmail.com", via: "OnePage", from: "Instagram", when: "2m", photo: "sofia" },
  { name: "Jonah Reyes", email: "jonah.reyes@outlook.com", via: "Checkout", from: "Ridge hoodie", when: "9m", photo: "jonah" },
  { name: "Aiko Tanaka", email: "aiko.tanaka@icloud.com", via: "Free download", from: "Trail map pack", when: "24m", photo: "aiko" },
  { name: "Liam O'Connor", email: "liam.oc@gmail.com", via: "Website", from: "Footer form", when: "1h", photo: "liam" },
  { name: "Priya Nair", email: "priya.nair@yahoo.com", via: "Checkout", from: "Pines LUT pack", when: "2h", photo: "priya" },
] as const

/** The three rows beside the picture. */
const POINTS = [
  { title: "One list from every sign-up", text: "Forms, checkouts and free downloads all add to it. Email it from Storelib, with opens and clicks counted." },
  { title: "Already on an email platform?", text: "Sync with Klaviyo, Omnisend, Brevo, MailerLite or Kit. Unsubscribes come back." },
  { title: "Download every contact, any time", text: "Names, emails, tags and where each person came from, as a CSV. No lock-in: if you ever leave, your list leaves with you." },
]

const n = (v: number) => v.toLocaleString("en-US")

function Contacts() {
  return (
    <div className={s.mock} role="img" aria-label={`Contacts: ${n(AUDIENCE)} people, the newest from a OnePage, a checkout, a free download and the website, with Export CSV and sync to Klaviyo, Omnisend, Brevo, MailerLite and Kit.`}>
      <div className={s.bar} aria-hidden="true">
        <div className="min-w-0">
          <div className={s.barTitle}>Contacts</div>
          <div className={s.barCount}>
            <span className="tabular-nums">{n(AUDIENCE)}</span> people · <span className={s.up}>+312 this week</span>
          </div>
        </div>
        <span className={s.export}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Export CSV
        </span>
      </div>
      <ul className={s.rows} aria-hidden="true">
        {AUDIENCE_PEOPLE.map((p) => (
          <li key={p.photo} className={s.row}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/${p.photo}.webp`} alt="" width={36} height={36} loading="lazy" decoding="async" className={s.face} />
            <span className="min-w-0">
              <span className={s.name}>{p.name}</span>
              <span className={s.email}>{p.email}</span>
            </span>
            <span className={s.source}>
              <span className={s.via}>{p.via}</span>
              <span className={s.from}>{p.from}</span>
            </span>
            <span className={s.when}>{p.when}</span>
          </li>
        ))}
      </ul>
      <div className={s.sync} aria-hidden="true">
        <span className={s.syncLabel}>Synced with</span>
        <span className={s.marks}>
          {EMAIL_PLATFORMS.map(({ name, Logo }) => (
            <span key={name} className={s.mark} title={name}>
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
    <section id="audience-ownership" aria-labelledby="audience-ownership-title" className={`${m.root} bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]`}>
      <div className={`${s.grid} mx-auto max-w-[1400px] px-[var(--landing-gutter,22px)]`}>
        <div className={s.words}>
          <StoryHeading id="audience-ownership-title" text="Your audience belongs to you." accent={["belongs", "to", "you"]} />
          <ul className={s.points}>
            {POINTS.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <Contacts />
      </div>
    </section>
  )
}
