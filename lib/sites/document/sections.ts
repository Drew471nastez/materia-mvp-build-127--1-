/**
 * The native sections: what the editor can lay out and the agent can address
 * without writing a line of code.
 *
 * Each one is an ORDINARY REACT COMPONENT, written by hand and copied into the
 * project unchanged. Nothing here is generated, which is what keeps the Code
 * tab honest — a creator who opens `src/sections/Hero.tsx` reads the file a
 * developer would have written, and the agent can edit it when a request
 * genuinely needs more than a prop.
 *
 * The `props` map beside each one is the whole contract. The editor renders a
 * control per entry, the agent writes through the same entries, and the
 * renderer serialises them into JSX. Adding a control to a section is adding a
 * line here — not a change in three places that can disagree.
 *
 * Everything visual reads from CSS custom properties rather than a literal, so
 * "make the whole site feel more premium" is a handful of theme writes instead
 * of an edit to every component.
 */

import type { SectionSpec } from "./schema"

const NAV: SectionSpec = {
  type: "navbar",
  label: "Navigation",
  purpose: "The bar across the top: wordmark, links, one action.",
  component: "Navbar",
  props: {
    brand: { kind: "text", label: "Brand", fallback: "Storelib" },
    links: {
      kind: "list",
      label: "Links",
      fallback: [],
      maxItems: 6,
      item: {
        label: { kind: "text", label: "Label", fallback: "Link" },
        href: { kind: "url", label: "Link to", fallback: "#" },
      },
    },
    actionLabel: { kind: "text", label: "Button", fallback: "" },
    actionHref: { kind: "url", label: "Button link", fallback: "#" },
    sticky: { kind: "boolean", label: "Stick to the top", fallback: true },
  },
  file: {
    path: "src/sections/Navbar.tsx",
    source: `interface NavLink {
  label: string
  href: string
}

export default function Navbar({
  brand,
  links = [],
  actionLabel,
  actionHref,
  sticky = true,
}: {
  brand: string
  links?: NavLink[]
  actionLabel?: string
  actionHref?: string
  sticky?: boolean
}) {
  return (
    <header className={sticky ? "nav nav--sticky" : "nav"}>
      <div className="container nav__inner">
        <a className="nav__brand" href="#">
          {brand}
        </a>
        {links.length > 0 && (
          <nav className="nav__links">
            {links.map((link) => (
              <a key={link.href + link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        )}
        {actionLabel ? (
          <a className="button button--sm" href={actionHref}>
            {actionLabel}
          </a>
        ) : (
          <span />
        )}
      </div>
    </header>
  )
}
`,
  },
}

const HERO: SectionSpec = {
  type: "hero",
  label: "Hero",
  purpose: "The first screen: what this is, who it is for, and one action.",
  component: "Hero",
  props: {
    eyebrow: { kind: "text", label: "Eyebrow", fallback: "" },
    heading: { kind: "text", label: "Heading", fallback: "A heading that says what this is" },
    subheading: {
      kind: "longtext",
      label: "Subheading",
      fallback: "One sentence explaining who it is for and why it is worth their time.",
    },
    primaryLabel: { kind: "text", label: "Button", fallback: "Get started" },
    primaryHref: { kind: "url", label: "Button link", fallback: "#" },
    secondaryLabel: { kind: "text", label: "Second button", fallback: "" },
    secondaryHref: { kind: "url", label: "Second button link", fallback: "#" },
    image: { kind: "image", label: "Image", fallback: "" },
    layout: { kind: "select", label: "Layout", fallback: "split", options: ["split", "centered"] },
    background: { kind: "color", label: "Background", fallback: "" },
    textColor: { kind: "color", label: "Text colour", fallback: "" },
  },
  file: {
    path: "src/sections/Hero.tsx",
    source: `export default function Hero({
  eyebrow,
  heading,
  subheading,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  image,
  layout = "split",
  background,
  textColor,
}: {
  eyebrow?: string
  heading: string
  subheading?: string
  primaryLabel?: string
  primaryHref?: string
  secondaryLabel?: string
  secondaryHref?: string
  image?: string
  layout?: "split" | "centered"
  background?: string
  textColor?: string
}) {
  const centered = layout === "centered" || !image

  return (
    <section className="section" style={{ background: background || undefined, color: textColor || undefined }}>
      <div className={centered ? "container hero hero--centered" : "container hero hero--split"}>
        <div className="hero__copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="hero__heading">{heading}</h1>
          {subheading ? <p className="hero__sub">{subheading}</p> : null}
          {(primaryLabel || secondaryLabel) && (
            <div className="hero__actions">
              {primaryLabel ? (
                <a className="button" href={primaryHref}>
                  {primaryLabel}
                </a>
              ) : null}
              {secondaryLabel ? (
                <a className="button button--ghost" href={secondaryHref}>
                  {secondaryLabel}
                </a>
              ) : null}
            </div>
          )}
        </div>
        {image && !centered ? (
          <div className="hero__media">
            <img src={image} alt="" />
          </div>
        ) : null}
      </div>
    </section>
  )
}
`,
  },
}

const FEATURES: SectionSpec = {
  type: "features",
  label: "Features",
  purpose: "Three to six things this does, each a heading and a line.",
  component: "Features",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "" },
    intro: { kind: "longtext", label: "Intro", fallback: "" },
    columns: { kind: "number", label: "Columns", fallback: 3, min: 2, max: 4 },
    items: {
      kind: "list",
      label: "Items",
      fallback: [],
      maxItems: 8,
      item: {
        title: { kind: "text", label: "Title", fallback: "A thing it does" },
        body: { kind: "longtext", label: "Body", fallback: "One line on why that matters." },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Features.tsx",
    source: `interface Item {
  title: string
  body: string
}

export default function Features({
  heading,
  intro,
  columns = 3,
  items = [],
  background,
}: {
  heading?: string
  intro?: string
  columns?: number
  items?: Item[]
  background?: string
}) {
  return (
    <section className="section" style={{ background: background || undefined }}>
      <div className="container">
        {heading ? <h2 className="section__heading">{heading}</h2> : null}
        {intro ? <p className="section__intro">{intro}</p> : null}
        <div className="grid" style={{ gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\` }}>
          {items.map((item) => (
            <div key={item.title} className="card">
              <h3 className="card__title">{item.title}</h3>
              <p className="card__body">{item.body}</p>
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

const TESTIMONIALS: SectionSpec = {
  type: "testimonials",
  label: "Testimonials",
  purpose: "What people say, with a name attached.",
  component: "Testimonials",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "" },
    items: {
      kind: "list",
      label: "Quotes",
      fallback: [],
      maxItems: 9,
      item: {
        quote: { kind: "longtext", label: "Quote", fallback: "" },
        name: { kind: "text", label: "Name", fallback: "" },
        detail: { kind: "text", label: "Role or company", fallback: "" },
      },
    },
    background: { kind: "color", label: "Background", fallback: "" },
  },
  file: {
    path: "src/sections/Testimonials.tsx",
    source: `interface Quote {
  quote: string
  name: string
  detail?: string
}

export default function Testimonials({
  heading,
  items = [],
  background,
}: {
  heading?: string
  items?: Quote[]
  background?: string
}) {
  return (
    <section className="section" style={{ background: background || undefined }}>
      <div className="container">
        {heading ? <h2 className="section__heading">{heading}</h2> : null}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {items.map((item) => (
            <figure key={item.name + item.quote.slice(0, 12)} className="card quote">
              <blockquote>{item.quote}</blockquote>
              <figcaption>
                <strong>{item.name}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </figcaption>
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

const CTA: SectionSpec = {
  type: "cta",
  label: "Call to action",
  purpose: "One line and one button, near the end of the page.",
  component: "Cta",
  props: {
    heading: { kind: "text", label: "Heading", fallback: "Ready when you are" },
    body: { kind: "longtext", label: "Body", fallback: "" },
    buttonLabel: { kind: "text", label: "Button", fallback: "Get started" },
    buttonHref: { kind: "url", label: "Button link", fallback: "#" },
    background: { kind: "color", label: "Background", fallback: "" },
    textColor: { kind: "color", label: "Text colour", fallback: "" },
  },
  file: {
    path: "src/sections/Cta.tsx",
    source: `export default function Cta({
  heading,
  body,
  buttonLabel,
  buttonHref,
  background,
  textColor,
}: {
  heading: string
  body?: string
  buttonLabel?: string
  buttonHref?: string
  background?: string
  textColor?: string
}) {
  return (
    <section className="section" style={{ background: background || undefined, color: textColor || undefined }}>
      <div className="container cta">
        <div>
          <h2 className="section__heading">{heading}</h2>
          {body ? <p className="section__intro">{body}</p> : null}
        </div>
        {buttonLabel ? (
          <a className="button" href={buttonHref}>
            {buttonLabel}
          </a>
        ) : null}
      </div>
    </section>
  )
}
`,
  },
}

const FOOTER: SectionSpec = {
  type: "footer",
  label: "Footer",
  purpose: "The last row: who this is, and anything legally required.",
  component: "Footer",
  props: {
    brand: { kind: "text", label: "Brand", fallback: "Storelib" },
    note: { kind: "text", label: "Note", fallback: "" },
    links: {
      kind: "list",
      label: "Links",
      fallback: [],
      maxItems: 8,
      item: {
        label: { kind: "text", label: "Label", fallback: "Link" },
        href: { kind: "url", label: "Link to", fallback: "#" },
      },
    },
  },
  file: {
    path: "src/sections/Footer.tsx",
    source: `interface FooterLink {
  label: string
  href: string
}

export default function Footer({
  brand,
  note,
  links = [],
}: {
  brand: string
  note?: string
  links?: FooterLink[]
}) {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <p className="footer__brand">
          {brand}
          {note ? <span className="footer__note">{note}</span> : null}
        </p>
        {links.length > 0 && (
          <nav className="footer__links">
            {links.map((link) => (
              <a key={link.href + link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </footer>
  )
}
`,
  },
}

/** Every native section, by type. A closed set the agent chooses from. */
export const SECTIONS: Record<string, SectionSpec> = Object.fromEntries(
  [NAV, HERO, FEATURES, TESTIMONIALS, CTA, FOOTER].map((spec) => [spec.type, spec]),
)

export function sectionSpec(type: string): SectionSpec | null {
  return SECTIONS[type] ?? null
}

/** What the agent is shown so it can choose without reading component source. */
export function describeSections(): string {
  return Object.values(SECTIONS)
    .map((spec) => {
      const props = Object.entries(spec.props)
        .map(([name, p]) => `${name}: ${p.kind}${p.options ? ` (${p.options.join(" | ")})` : ""}`)
        .join(", ")
      return `  ${spec.type} — ${spec.purpose}\n      ${props}`
    })
    .join("\n")
}
