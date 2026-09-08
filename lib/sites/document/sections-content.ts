/**
 * THE SECTIONS THAT MAKE A SITE MORE THAN A LANDING PAGE.
 *
 * ===========================================================================
 *  WHY THIS FILE EXISTS
 * ===========================================================================
 * The original library held six sections: navbar, hero, features, testimonials,
 * cta, footer. That is not a general vocabulary — it is the vocabulary of a
 * single marketing page, and a model can only build what it has words for. Ask
 * for a barber shop and the best it could do was a hero and three feature
 * cards, because there was no way to express a price list, an opening-hours
 * table, a gallery, or a way to get in touch.
 *
 * So every generation came out as one long landing page, and no amount of
 * prompting fixed it: the instruction "build several pages" has nowhere to put
 * the second page's content.
 *
 * These are the sections a real small-business site is made of. With them, an
 * About page is a richtext plus a team, a Services page is a services list plus
 * a pricing table plus an faq, and a Contact page is a form plus hours plus a
 * map link — each a page that has a reason to exist rather than filler.
 *
 * ===========================================================================
 *  THE RULES EVERY SECTION HERE FOLLOWS
 * ===========================================================================
 * 1. PADDING ON THE SECTION, never a margin on the outermost child. A first
 *    child's top margin escapes its parent and leaves a strip of page showing
 *    above a section that has a background. That is the single most common way
 *    a generated site looks broken, and it is designed out here rather than
 *    corrected later.
 *
 * 2. NO COLOUR LITERALS. Everything reads a CSS custom property, so "make the
 *    whole site warmer" stays a handful of theme writes instead of an edit to
 *    every component.
 *
 * 3. IT WORKS WITHOUT A BACKEND. There is no server behind a generated site, so
 *    a form that POSTs somewhere is a form that silently loses what somebody
 *    typed. The contact form composes a mailto: instead — which actually
 *    delivers — and the FAQ uses <details>, which opens without a line of JS.
 *
 * 4. EMPTY IS INVISIBLE. Every optional prop renders nothing when unset rather
 *    than rendering an empty heading or a stray gap.
 */

import type { SectionSpec } from "./schema"

/* ========================================================================== */
/*  SERVICES — a priced list. The backbone of every trade and salon site.     */
/* ========================================================================== */

const SERVICES: SectionSpec = {
  type: "services",
  label: "Services & prices",
  purpose: "A list of what you offer with prices beside it. For salons, trades, studios, clinics, menus.",
  component: "Services",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "Services" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    items: {
      kind: "list",
      label: "Services",
      fallback: [],
      maxItems: 14,
      item: {
        name: { kind: "text", label: "Name", fallback: "A service" },
        description: { kind: "text", label: "Description", fallback: "" },
        price: { kind: "text", label: "Price", fallback: "" },
        duration: { kind: "text", label: "Takes", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Services.tsx",
    source: `interface Service {
  name: string
  description?: string
  price?: string
  duration?: string
}

export default function Services({
  heading,
  intro,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  items?: Service[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <ul className="services">
          {items.map((item, index) => (
            <li className="services__row" key={item.name + index}>
              <div className="services__main">
                <span className="services__name">{item.name}</span>
                {item.description && <span className="services__desc">{item.description}</span>}
              </div>
              <div className="services__meta">
                {item.duration && <span className="services__duration">{item.duration}</span>}
                {item.price && <span className="services__price">{item.price}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  PRICING — tiers. Different from services: a choice, not a menu.           */
/* ========================================================================== */

const PRICING: SectionSpec = {
  type: "pricing",
  label: "Pricing tiers",
  purpose: "Two to four plans side by side, one of them highlighted. For anything sold as a package.",
  component: "Pricing",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "Pricing" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    tiers: {
      kind: "list",
      label: "Tiers",
      fallback: [],
      maxItems: 4,
      item: {
        name: { kind: "text", label: "Name", fallback: "Plan" },
        price: { kind: "text", label: "Price", fallback: "" },
        period: { kind: "text", label: "Per", fallback: "" },
        description: { kind: "text", label: "Description", fallback: "" },
        features: { kind: "text", label: "Included (one per line)", fallback: "" },
        actionLabel: { kind: "text", label: "Button", fallback: "" },
        actionHref: { kind: "url", label: "Button link", fallback: "#" },
        featured: { kind: "boolean", label: "Highlight this one", fallback: false },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Pricing.tsx",
    source: `interface Tier {
  name: string
  price?: string
  period?: string
  description?: string
  /** One per line. Kept as text so the editor stays a single textarea. */
  features?: string
  actionLabel?: string
  actionHref?: string
  featured?: boolean
}

export default function Pricing({
  heading,
  intro,
  tiers = [],
  background,
}: {
  heading?: string
  intro?: string
  tiers?: Tier[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <div className="grid pricing" style={{ gridTemplateColumns: \`repeat(\${Math.max(tiers.length, 1)}, minmax(0, 1fr))\` }}>
          {tiers.map((tier, index) => {
            const lines = (tier.features ?? "")
              .split("\\n")
              .map((line) => line.trim())
              .filter(Boolean)
            return (
              <div className={tier.featured ? "card pricing__tier pricing__tier--featured" : "card pricing__tier"} key={tier.name + index}>
                <span className="pricing__name">{tier.name}</span>
                {tier.price && (
                  <p className="pricing__price">
                    {tier.price}
                    {tier.period && <span className="pricing__period">{tier.period}</span>}
                  </p>
                )}
                {tier.description && <p className="card__body">{tier.description}</p>}
                {lines.length > 0 && (
                  <ul className="pricing__features">
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {tier.actionLabel && (
                  <a className={tier.featured ? "button pricing__action" : "button button--ghost pricing__action"} href={tier.actionHref}>
                    {tier.actionLabel}
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  FAQ — <details>, so it opens with no JavaScript at all.                   */
/* ========================================================================== */

const FAQ: SectionSpec = {
  type: "faq",
  label: "FAQ",
  purpose: "Questions and answers that open and close. Good on a services, pricing or contact page.",
  component: "Faq",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "Frequently asked" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    items: {
      kind: "list",
      label: "Questions",
      fallback: [],
      maxItems: 12,
      item: {
        question: { kind: "text", label: "Question", fallback: "A question" },
        answer: { kind: "longtext", label: "Answer", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Faq.tsx",
    source: `interface Item {
  question: string
  answer?: string
}

export default function Faq({
  heading,
  intro,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  items?: Item[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container container--narrow">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <div className="faq">
          {items.map((item, index) => (
            /* <details> opens and closes with no JavaScript, which is the
               whole reason to use it: a generated site has no bundle to rely
               on beyond React, and an accordion is not worth one. */
            <details className="faq__item" key={item.question + index}>
              <summary className="faq__question">{item.question}</summary>
              {item.answer && <p className="faq__answer">{item.answer}</p>}
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  GALLERY — pictures. For anything whose selling point is how it looks.     */
/* ========================================================================== */

const GALLERY: SectionSpec = {
  type: "gallery",
  label: "Gallery",
  purpose: "A grid of photographs. For work, interiors, food, portfolios — anything sold by looking at it.",
  component: "Gallery",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    columns: { kind: "number", label: "Columns", fallback: 3, min: 2, max: 4 },
    items: {
      kind: "list",
      label: "Images",
      fallback: [],
      maxItems: 12,
      item: {
        image: { kind: "image", label: "Image", fallback: "" },
        caption: { kind: "text", label: "Caption", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Gallery.tsx",
    source: `interface Shot {
  image: string
  caption?: string
}

export default function Gallery({
  heading,
  intro,
  columns = 3,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  columns?: number
  items?: Shot[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <div className="grid gallery" style={{ gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\` }}>
          {items.map((shot, index) => (
            <figure className="gallery__item" key={shot.image + index}>
              {/* alt falls back to the caption, and to empty rather than to a
                  filename — a screen reader reading out a URL is worse than
                  a decorative image it can skip. */}
              <img src={shot.image} alt={shot.caption ?? ""} loading="lazy" />
              {shot.caption && <figcaption>{shot.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  TEAM — the people. What turns a generic site into a specific business.    */
/* ========================================================================== */

const TEAM: SectionSpec = {
  type: "team",
  label: "Team",
  purpose: "The people, with photos and roles. Belongs on an About page.",
  component: "Team",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "The team" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    columns: { kind: "number", label: "Columns", fallback: 3, min: 2, max: 4 },
    items: {
      kind: "list",
      label: "People",
      fallback: [],
      maxItems: 12,
      item: {
        name: { kind: "text", label: "Name", fallback: "Name" },
        role: { kind: "text", label: "Role", fallback: "" },
        image: { kind: "image", label: "Photo", fallback: "" },
        bio: { kind: "longtext", label: "Bio", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Team.tsx",
    source: `interface Person {
  name: string
  role?: string
  image?: string
  bio?: string
}

export default function Team({
  heading,
  intro,
  columns = 3,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  columns?: number
  items?: Person[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <div className="grid team" style={{ gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\` }}>
          {items.map((person, index) => (
            <div className="team__person" key={person.name + index}>
              {person.image && <img className="team__photo" src={person.image} alt={person.name} loading="lazy" />}
              <span className="team__name">{person.name}</span>
              {person.role && <span className="team__role">{person.role}</span>}
              {person.bio && <p className="card__body">{person.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  STATS — numbers. Cheap credibility, and it reads as substance.            */
/* ========================================================================== */

const STATS: SectionSpec = {
  type: "stats",
  label: "Numbers",
  purpose: "A row of figures with labels: years open, clients served, rating.",
  component: "Stats",
  props: {
    items: {
      kind: "list",
      label: "Numbers",
      fallback: [],
      maxItems: 4,
      item: {
        value: { kind: "text", label: "Number", fallback: "0" },
        label: { kind: "text", label: "Label", fallback: "Label" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Stats.tsx",
    source: `interface Stat {
  value: string
  label: string
}

export default function Stats({ items = [], background }: { items?: Stat[]; background?: string }) {
  return (
    <section className="section section--tight" style={background ? { background } : undefined}>
      <div className="container">
        <div className="stats" style={{ gridTemplateColumns: \`repeat(\${Math.max(items.length, 1)}, minmax(0, 1fr))\` }}>
          {items.map((stat, index) => (
            <div className="stats__item" key={stat.label + index}>
              <span className="stats__value">{stat.value}</span>
              <span className="stats__label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  STEPS — how it works. Turns a service into something understood.          */
/* ========================================================================== */

const STEPS: SectionSpec = {
  type: "steps",
  label: "How it works",
  purpose: "Numbered steps through a process: book, come in, get it done.",
  component: "Steps",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "How it works" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    items: {
      kind: "list",
      label: "Steps",
      fallback: [],
      maxItems: 6,
      item: {
        title: { kind: "text", label: "Title", fallback: "A step" },
        body: { kind: "longtext", label: "Body", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Steps.tsx",
    source: `interface Step {
  title: string
  body?: string
}

export default function Steps({
  heading,
  intro,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  items?: Step[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <ol className="steps">
          {items.map((step, index) => (
            <li className="steps__item" key={step.title + index}>
              <span className="steps__number">{index + 1}</span>
              <div>
                <span className="steps__title">{step.title}</span>
                {step.body && <p className="card__body">{step.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  HOURS — when you are open, and where you are.                            */
/* ========================================================================== */

const HOURS: SectionSpec = {
  type: "hours",
  label: "Hours & location",
  purpose: "Opening times, the address, and a link that opens a map. For any business with a door.",
  component: "Hours",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "Find us" },
    address: { kind: "longtext", label: "Address", fallback: "" },
    phone: { kind: "text", label: "Phone", fallback: "" },
    email: { kind: "text", label: "Email", fallback: "" },
    rows: {
      kind: "list",
      label: "Opening hours",
      fallback: [],
      maxItems: 7,
      item: {
        day: { kind: "text", label: "Day", fallback: "Monday" },
        hours: { kind: "text", label: "Hours", fallback: "Closed" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Hours.tsx",
    source: `interface Row {
  day: string
  hours: string
}

export default function Hours({
  heading,
  address,
  phone,
  email,
  rows = [],
  background,
}: {
  heading?: string
  address?: string
  phone?: string
  email?: string
  rows?: Row[]
  background?: string
}) {
  /* A search URL rather than an embedded map: an iframe from a map provider
     needs an API key the creator does not have, and a dead embed is worse
     than a link that always works. */
  const mapHref = address ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address) : ""

  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        <div className="hours">
          <div className="hours__where">
            {address && <p className="hours__address">{address}</p>}
            {mapHref && (
              <a className="button button--ghost button--sm" href={mapHref} target="_blank" rel="noreferrer">
                Open in maps
              </a>
            )}
            <div className="hours__contact">
              {phone && <a href={"tel:" + phone.replace(/[^+\\d]/g, "")}>{phone}</a>}
              {email && <a href={"mailto:" + email}>{email}</a>}
            </div>
          </div>
          {rows.length > 0 && (
            <table className="hours__table">
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.day + index}>
                    <th scope="row">{row.day}</th>
                    <td>{row.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  CONTACT — a form that actually delivers, with no server behind it.       */
/* ========================================================================== */

const CONTACT: SectionSpec = {
  type: "contact",
  label: "Contact form",
  purpose: "A form for getting in touch. Opens the visitor's mail app addressed to you — no server needed.",
  component: "Contact",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "Get in touch" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    email: { kind: "text", label: "Your email address", fallback: "" },
    buttonLabel: { kind: "text", label: "Button", fallback: "Send message" },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Contact.tsx",
    source: `import { useState } from "react"

export default function Contact({
  heading,
  intro,
  email,
  buttonLabel = "Send message",
  background,
}: {
  heading?: string
  intro?: string
  email?: string
  buttonLabel?: string
  background?: string
}) {
  const [name, setName] = useState("")
  const [from, setFrom] = useState("")
  const [message, setMessage] = useState("")

  /*
   * A generated site has no server, so a form that POSTs anywhere is a form
   * that silently loses what somebody typed — the worst outcome available,
   * because it looks like it worked. This composes a mailto: instead: the
   * visitor's own mail app opens, pre-filled and addressed, and they press
   * send. It is not fashionable and it always arrives.
   */
  function submit(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (!email) return
    const subject = encodeURIComponent("Website enquiry from " + (name || "a visitor"))
    const body = encodeURIComponent(message + "\\n\\n— " + name + (from ? " (" + from + ")" : ""))
    window.location.href = "mailto:" + email + "?subject=" + subject + "&body=" + body
  }

  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container container--narrow">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <form className="form" onSubmit={submit}>
          <label className="form__field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="form__field">
            <span>Your email</span>
            <input type="email" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="form__field">
            <span>Message</span>
            <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required />
          </label>
          <button className="button" type="submit">
            {buttonLabel}
          </button>
          {!email && <p className="form__note">Add an email address to this section so messages have somewhere to go.</p>}
        </form>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  RICHTEXT — prose. What an About or Terms page is actually made of.        */
/* ========================================================================== */

const RICHTEXT: SectionSpec = {
  type: "richtext",
  label: "Text block",
  purpose: "A heading and paragraphs. The body of an About, Story, Terms or Privacy page.",
  component: "RichText",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "" },
    body: {
      kind: "longtext",
      label: "Text (blank line between paragraphs)",
      fallback: "",
    },
    align: { kind: "select", label: "Align", fallback: "left", options: ["left", "center"] },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/RichText.tsx",
    source: `export default function RichText({
  heading,
  body = "",
  align = "left",
  background,
}: {
  heading?: string
  body?: string
  align?: string
  background?: string
}) {
  const paragraphs = body
    .split(/\\n\\s*\\n/)
    .map((part) => part.trim())
    .filter(Boolean)

  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className={align === "center" ? "container container--narrow prose prose--center" : "container container--narrow prose"}>
        {heading && <h2 className="section__heading">{heading}</h2>}
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  LOGOS — the strip of names that says other people trust this.            */
/* ========================================================================== */

const LOGOS: SectionSpec = {
  type: "logos",
  label: "Logo strip",
  purpose: "A quiet row of client, brand or partner logos.",
  component: "Logos",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "" },
    items: {
      kind: "list",
      label: "Logos",
      fallback: [],
      maxItems: 8,
      item: {
        image: { kind: "image", label: "Logo", fallback: "" },
        name: { kind: "text", label: "Name", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Logos.tsx",
    source: `interface Logo {
  image?: string
  name?: string
}

export default function Logos({
  heading,
  items = [],
  background,
}: {
  heading?: string
  items?: Logo[]
  background?: string
}) {
  return (
    <section className="section section--tight" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <p className="logos__heading">{heading}</p>}
        <div className="logos">
          {items.map((logo, index) =>
            /* A name with no image renders as a wordmark rather than as a
               broken image icon, which is what a half-filled list produces. */
            logo.image ? (
              <img key={index} src={logo.image} alt={logo.name ?? ""} loading="lazy" />
            ) : logo.name ? (
              <span className="logos__word" key={index}>
                {logo.name}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  CARDS — a linked grid. A blog index, a portfolio, a set of locations.    */
/* ========================================================================== */

const CARDS: SectionSpec = {
  type: "cards",
  label: "Linked cards",
  purpose: "A grid of cards with images that link somewhere. Blog index, portfolio, locations, categories.",
  component: "Cards",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    columns: { kind: "number", label: "Columns", fallback: 3, min: 2, max: 4 },
    items: {
      kind: "list",
      label: "Cards",
      fallback: [],
      maxItems: 12,
      item: {
        title: { kind: "text", label: "Title", fallback: "A card" },
        body: { kind: "longtext", label: "Body", fallback: "" },
        image: { kind: "image", label: "Image", fallback: "" },
        href: { kind: "url", label: "Links to", fallback: "" },
        meta: { kind: "text", label: "Small print", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Cards.tsx",
    source: `interface Card {
  title: string
  body?: string
  image?: string
  href?: string
  meta?: string
}

export default function Cards({
  heading,
  intro,
  columns = 3,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  columns?: number
  items?: Card[]
  background?: string
}) {
  return (
    <section className="section" style={background ? { background } : undefined}>
      <div className="container">
        {heading && <h2 className="section__heading">{heading}</h2>}
        {intro && <p className="section__intro">{intro}</p>}
        <div className="grid" style={{ gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\` }}>
          {items.map((card, index) => {
            const inner = (
              <>
                {card.image && <img className="cards__image" src={card.image} alt="" loading="lazy" />}
                {card.meta && <span className="cards__meta">{card.meta}</span>}
                <span className="card__title">{card.title}</span>
                {card.body && <p className="card__body">{card.body}</p>}
              </>
            )
            /* A card with nowhere to go is a div, not an <a href="">. An
               empty href navigates to the current page, which reads as the
               site being broken. */
            return card.href ? (
              <a className="card cards__card cards__card--link" href={card.href} key={card.title + index}>
                {inner}
              </a>
            ) : (
              <div className="card cards__card" key={card.title + index}>
                {inner}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
`,
  },
}

/* ========================================================================== */
/*  BANNER — one slim line across the top. Offers, notices, opening times.   */
/* ========================================================================== */

const BANNER: SectionSpec = {
  type: "banner",
  label: "Announcement bar",
  purpose: "One slim line above the navigation: an offer, a notice, a holiday closure.",
  component: "Banner",
  props: {
    text: { kind: "text", label: "Text", fallback: "" },
    actionLabel: { kind: "text", label: "Link text", fallback: "" },
    actionHref: { kind: "url", label: "Link to", fallback: "#" },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Banner.tsx",
    source: `export default function Banner({
  text,
  actionLabel,
  actionHref,
  background,
}: {
  text?: string
  actionLabel?: string
  actionHref?: string
  background?: string
}) {
  if (!text && !actionLabel) return null
  return (
    <div className="banner" style={background ? { background } : undefined}>
      <div className="container banner__inner">
        {text && <span>{text}</span>}
        {actionLabel && (
          <a className="banner__action" href={actionHref}>
            {actionLabel}
          </a>
        )}
      </div>
    </div>
  )
}
`,
  },
}

/**
 * Exported as a list rather than a map: `sections.ts` owns the registry, and
 * two files both claiming to be "the sections" is exactly the second source of
 * truth the schema's opening comment argues against.
 */
export const CONTENT_SECTIONS: SectionSpec[] = [
  BANNER,
  SERVICES,
  PRICING,
  FAQ,
  GALLERY,
  TEAM,
  STATS,
  STEPS,
  HOURS,
  CONTACT,
  RICHTEXT,
  LOGOS,
  CARDS,
]
