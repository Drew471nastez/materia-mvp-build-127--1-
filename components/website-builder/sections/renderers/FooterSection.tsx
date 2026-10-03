"use client"

/**
 * ===========================================================================
 *  THE FOOTER
 * ===========================================================================
 * Nineteen of its twenty-six controls did nothing, the worst in the library.
 * The logo image, the tagline, the whole newsletter block, all five social
 * links, every colour, the column count, the content width and the padding
 * were declared, shown in the panel, set by the presets, and ignored.
 *
 * WORSE THAN IGNORED: the schema declares TWO block types, `footer_column`
 * (a column heading) and `footer_link`. The renderer treated every block as a
 * link, so the preset's three column headings rendered as three empty links in
 * a flat row, and the columns the footer was designed around did not exist.
 *
 * A STANDARD FOOTER NOW, on every page of every site: the brand, link
 * columns (menus, the footer's own columns, or Shop and Help when it has
 * none), the store's social icons, an optional sign-up, optional payment
 * icons, and a bottom line with the copyright, the policies and cookie
 * preferences. The rules behind each part are in
 * lib/website-builder/footer-settings.ts.
 */

import { openCookiePreferences } from "@/lib/consent/client"
import { useState, type CSSProperties, type FormEvent } from "react"
import { cn } from "@/lib/utils"
import { subscribeToCreator } from "@/lib/website-builder/subscribe-client"
import { useStorefront } from "../../theme/storefront-context"
import { SocialIconRow } from "../../theme/ThemeSocials"
import { socialLinks } from "@/lib/website-builder/social-links"
import { cleanMenus } from "@/lib/storelib-theme/values"
import {
  DEFAULT_FOOTER_COLUMNS,
  PAYMENT_METHODS,
  fillFooterTokens,
  footerContactLinks,
  footerGrid,
  footerLayout,
  footerMenuColumn,
  footerPolicyLinks,
  wantsDefaultColumns,
  type FooterColumn,
  type FooterLink,
} from "@/lib/website-builder/footer-settings"
import {
  bool,
  maxWidth,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps,
} from "../_shared"

/**
 * ===========================================================================
 *  THE FOOTER'S SIGN-UP BOX
 * ===========================================================================
 * It called `preventDefault()` and stopped. A visitor typed their address,
 * pressed Join, and nothing happened: no message, no sign-up, nothing
 * recorded anywhere. The comment beside it said the dedicated newsletter
 * section was what collected addresses, which is true and no help to someone
 * who used the box in front of them.
 *
 * It goes to the creator's Subscribers now, through the same client as every
 * other sign-up on a site. Its own component so the footer, which is large
 * and stateless, does not grow hooks.
 */
function FooterSignup({
  buttonText,
  textColor,
  divider,
  accent,
  buttonTextColor,
}: {
  buttonText: string
  textColor: string
  divider: string
  accent: string
  buttonTextColor: string
}) {
  const { creatorId, inEditor } = useStorefront()
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // The canvas is not a place to join a mailing list.
    if (inEditor) {
      setState("done")
      setMessage("Sign-ups go to Subscribers on your live site.")
      return
    }
    /* Nobody to send it to. Saying thanks here would be saying it was kept. */
    if (!creatorId) {
      setState("error")
      setMessage("Sign-ups are not available on this page.")
      return
    }
    const email = String(new FormData(e.currentTarget).get("email") ?? "")
    setState("sending")
    const result = await subscribeToCreator({ creatorId, email, placement: "footer" })
    if (result.ok === false) {
      setState("error")
      setMessage(result.error)
    } else {
      setState("done")
      setMessage("Thanks, you're on the list.")
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="text-[13px]" style={{ color: textColor }}>
        {message}
      </p>
    )
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-label="Email address"
          placeholder="you@example.com"
          /* 16px on a phone, or iOS zooms the page when the field takes focus. */
          className="h-10 min-w-0 flex-1 rounded-md border px-3 text-[16px] outline-none @[640px]:text-[14px]"
          style={{ borderColor: divider, background: "transparent", color: textColor }}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="h-10 shrink-0 rounded-md px-4 text-[14px] font-semibold disabled:opacity-60"
          style={{ background: accent, color: buttonTextColor }}
        >
          {buttonText}
        </button>
      </div>
      {state === "error" && (
        <p role="alert" className="text-[12px]" style={{ color: textColor }}>
          {message}
        </p>
      )}
    </form>
  )
}

/**
 * THE POLICIES, listed from the site's own pages. Its own component because
 * it reads which pages the site has, and the footer itself stays stateless.
 */
function FooterPolicies({
  alreadyLinked,
  includeContact,
  linkColor,
}: {
  alreadyLinked: string[]
  includeContact: boolean
  linkColor: string
}) {
  const { pages } = useStorefront()
  const links = footerPolicyLinks({ pageKeys: pages, alreadyLinked, includeContact })
  return (
    <>
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          className="underline-offset-2 hover:underline"
          style={{ color: linkColor }}
          data-footer-policy
        >
          {link.label}
        </a>
      ))}
    </>
  )
}

/**
 * THE CARDS AND WALLETS, drawn as small neutral badges. Not the networks'
 * artwork: a badge in the footer's own colours sits on any background.
 */
function PaymentBadge({ id, label, color, border }: { id: string; label: string; color: string; border: string }) {
  const word: Record<string, string> = {
    visa: "VISA",
    amex: "AMEX",
    apple_pay: "Apple Pay",
    google_pay: "G Pay",
  }
  return (
    <svg
      viewBox="0 0 48 30"
      width="40"
      height="25"
      role="img"
      aria-label={label}
      className="shrink-0"
      style={{ color }}
    >
      <title>{label}</title>
      <rect x="0.5" y="0.5" width="47" height="29" rx="4" fill="none" stroke={border} />
      {id === "mastercard" ? (
        <>
          <circle cx="20" cy="15" r="7.5" fill="#eb001b" />
          <circle cx="28" cy="15" r="7.5" fill="#f79e1b" fillOpacity="0.9" />
        </>
      ) : (
        <text
          x="24"
          y="19"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="system-ui, sans-serif"
          fontWeight="700"
          fontSize={id === "apple_pay" ? 8 : 10}
          fontStyle={id === "visa" ? "italic" : "normal"}
        >
          {word[id] ?? label}
        </text>
      )}
    </svg>
  )
}

export function FooterSection({
  section,
  theme,
  isEditing,
  isSelected,
  onClick,
  canvasRoundedBottomPx,
}: SectionProps) {
  const t = theme as Record<string, unknown>
  const brand = str(section.settings.logo_text).trim() || theme.brand_name || "My Store"
  /*
    {{ date.year }} and {{ shop.name }} filled in the footer's own words, so
    the canvas shows what the live site shows. The live site has already
    filled them on the server; see lib/website-builder/footer-settings.ts.
  */
  const year = new Date().getFullYear()
  const s: Record<string, unknown> = { ...section.settings }
  for (const key of ["copyright", "tagline", "newsletter_heading", "newsletter_subtext"]) {
    if (typeof s[key] === "string") s[key] = fillFooterTokens(s[key] as string, { year, shopName: brand })
  }
  // Footers default to the "dark" scheme when no scheme is explicitly set.
  const schemeKey = typeof s.color_scheme === "string" ? s.color_scheme : "dark"
  /* With the footer's own Advanced colors, which resolveScheme left out. */
  const c = sectionColors({ ...section, settings: { ...s, color_scheme: schemeKey } }, theme)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.heading_color) || c.heading
  const textColor = str(s.text_color) || c.paragraph
  const accent = str(s.accent_color) || c.primary_btn_bg
  const divider = str(s.divider_color) || c.inset_border
  const linkColor = str(s.text_color) || c.footer_link
  const blocks = section.blocks ?? []
  const centered = footerLayout(s.layout) === "centered"

  /**
   * COLUMNS ARE A STREAM, not a nesting. `footer_column` opens a column and
   * every `footer_link` after it belongs to that column until the next one,
   * which is how the block list in the sidebar reads top to bottom, so the
   * order somebody drags things into is the order they come out in.
   */
  const blockColumns: FooterColumn[] = []
  const loose: FooterLink[] = []
  for (const block of blocks) {
    if (block.type === "footer_column") {
      blockColumns.push({ id: block.id, heading: str(block.settings.heading), links: [] })
    } else {
      const link = {
        id: block.id,
        label: str(block.settings.label),
        url: str(block.settings.url, "#"),
      }
      if (blockColumns.length > 0) blockColumns[blockColumns.length - 1].links.push(link)
      else loose.push(link)
    }
  }

  /* Menus from Website settings › Menus come first, then the footer's own columns. */
  const menus = cleanMenus(t.menus)
  const menuColumns = [
    footerMenuColumn(str(s.menu), str(s.menu_heading), menus),
    footerMenuColumn(str(s.menu_2), str(s.menu_2_heading), menus),
  ].filter((col): col is FooterColumn => col !== null)
  const defaults = wantsDefaultColumns(bool(s.show_default_links, true), menuColumns, blockColumns, loose)
    ? DEFAULT_FOOTER_COLUMNS
    : []
  /* And a Contact column when the creator gave an email or a phone number. */
  const contact = footerContactLinks(s.contact_email, s.contact_phone)
  const contactColumn: FooterColumn[] = contact.length > 0
    ? [{ id: "fcontact", heading: str(s.contact_heading, "Contact"), links: contact }]
    : []
  const columns = [...menuColumns, ...defaults, ...blockColumns, ...contactColumn]
  const linkedUrls = [...columns.flatMap((col) => col.links), ...loose].map((l) => l.url)

  /*
    THE FOOTER'S OWN SOCIAL LINKS AND THE STORE'S, together. The store's live
    in Theme settings › Social links, with a "Show icons in footer" toggle; a
    link typed into the footer wins for its platform and shows whatever that
    toggle says. Which addresses count is lib/website-builder/social-links.ts.
  */
  const socials = socialLinks(t.social_show_in_footer !== false ? t : {}, s)

  const showSocial = bool(s.show_social, true) && socials.length > 0
  /* On unless turned off: a footer is where a visitor looks for the sign-up. */
  const showNewsletter = bool(s.show_newsletter, true)
  const showPolicies = bool(s.show_policies, true)
  const showPayments = bool(s.show_payment_icons)
  const logo = str(s.logo_url)
  const grid = footerGrid({ linkColumns: columns.length, columnsSetting: s.columns, newsletter: showNewsletter })

  const heading = "mb-3 text-[13px] font-semibold leading-5"

  const brandBlock = (
    <div
      className={cn("min-w-0", centered && "flex flex-col items-center")}
      data-footer-brand
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={brand}
          className="block h-8 w-auto max-w-[180px] object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="text-[16px] font-bold leading-6" style={{ color: headingColor }}>
          {brand}
        </div>
      )}
      {!!s.tagline && (
        <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed" style={{ color: textColor }}>
          {str(s.tagline)}
        </p>
      )}
      {showSocial && (
        <SocialIconRow
          links={socials}
          size={18}
          className={cn("m-0 mt-4 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0", centered && "justify-center")}
          linkClassName="flex h-6 w-6 items-center justify-center transition-opacity hover:opacity-70"
          linkStyle={{ color: headingColor }}
        />
      )}
    </div>
  )

  const navBlock = columns.length > 0 ? (
    <nav
      aria-label="Footer"
      className={cn(
        "grid min-w-0 gap-x-8 gap-y-8",
        /* Two to a row on a phone (one when there is only one), then side by side. */
        grid.navTracks > 1 ? "grid-cols-2" : "grid-cols-1",
        "@[640px]:grid-cols-[repeat(var(--footer-nav-medium),minmax(0,1fr))]",
        "@[1000px]:grid-cols-[repeat(var(--footer-nav-wide),minmax(0,1fr))]",
        centered && "w-full max-w-3xl justify-items-center text-center",
      )}
      style={{
        "--footer-nav-medium": String(Math.max(1, grid.navTracksMedium)),
        "--footer-nav-wide": String(Math.max(1, grid.navTracks)),
      } as CSSProperties}
      data-footer-columns
    >
      {columns.map((column) => (
        <div key={column.id} className="min-w-0">
          {!!column.heading && (
            <div className={heading} style={{ color: headingColor }}>
              {column.heading}
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {column.links.map((link) => (
              <li key={link.id} className="min-w-0">
                <a
                  href={link.url}
                  className="break-words text-[14px] leading-5 transition-opacity hover:opacity-70"
                  style={{ color: linkColor }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  ) : null

  const newsletterBlock = showNewsletter ? (
    <div className={cn("min-w-0", centered && "w-full max-w-sm")} data-footer-newsletter>
      <div className={heading} style={{ color: headingColor }}>
        {str(s.newsletter_heading, "Stay in the loop")}
      </div>
      {!!s.newsletter_subtext && (
        <p className="-mt-1 mb-3 text-[13px] leading-5" style={{ color: textColor }}>
          {str(s.newsletter_subtext)}
        </p>
      )}
      <FooterSignup
        buttonText={str(s.newsletter_button_text, "Subscribe")}
        textColor={textColor}
        divider={divider}
        accent={accent}
        buttonTextColor={c.primary_btn_text}
      />
    </div>
  ) : null

  return (
    <SectionWrapper
      isChrome
      bgColor={bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      canvasRoundedBottomPx={canvasRoundedBottomPx}
    >
      <footer
        className="mx-auto px-5 @[640px]:px-8"
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 48, 28) }}
        data-footer-layout={centered ? "centered" : "columns"}
      >
        {centered ? (
          <div className="flex flex-col items-center gap-8 text-center" data-footer-top>
            {brandBlock}
            {navBlock}
            {newsletterBlock}
          </div>
        ) : (
          /*
            THE GRID: lib/website-builder/footer-settings.ts (footerGrid) says
            how wide each part is at each width. Container queries, so the
            phone preview in the editor lays it out as a phone does.
          */
          <div
            className={cn(
              "grid grid-cols-1 gap-x-10 gap-y-9",
              "@[640px]:grid-cols-[var(--footer-medium)]",
              "@[1000px]:grid-cols-[var(--footer-wide)]",
            )}
            style={{ "--footer-medium": grid.medium, "--footer-wide": grid.wide } as CSSProperties}
            data-footer-top
          >
            {brandBlock}
            {navBlock && (
              <div
                className={cn(
                  "min-w-0",
                  /* Under brand and newsletter at medium widths, beside them from 1000px. */
                  grid.navOwnRowAtMedium && "@[640px]:order-3 @[640px]:col-span-full @[1000px]:order-none @[1000px]:col-auto",
                )}
              >
                {navBlock}
              </div>
            )}
            {newsletterBlock}
          </div>
        )}

        {loose.length > 0 && (
          <div className={cn("mt-8 flex flex-wrap items-center gap-x-5 gap-y-2", centered && "justify-center")}>
            {loose.map((link) => (
              <a
                key={link.id}
                href={link.url}
                className="text-[14px] transition-opacity hover:opacity-70"
                style={{ color: linkColor }}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/*
          THE BOTTOM LINE: the copyright, the policies and "Cookie
          preferences" at one size, colour and baseline, and the payment
          icons at the end of the row when they are on. It wraps rather than
          stacking on a phone, left aligned like the rest of this footer.
        */}
        <div
          className={cn(
            "mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-5 text-[12px] leading-5",
            centered ? "justify-center text-center" : "justify-between",
          )}
          data-footer-bottom
          style={{ borderColor: divider, color: textColor }}
        >
          <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1", centered && "justify-center")}>
            <span>{str(s.copyright, `© ${year} ${brand}`)}</span>
            <nav aria-label="Policies" className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-1", centered && "justify-center")}>
              {showPolicies && (
                <FooterPolicies
                  alreadyLinked={linkedUrls}
                  includeContact={bool(s.show_contact_link, true)}
                  linkColor={textColor}
                />
              )}
              {/* How a visitor changes their cookie choice later: as easy as making it. */}
              <button
                type="button"
                onClick={() => openCookiePreferences()}
                className="cursor-pointer border-0 bg-transparent p-0 text-left underline-offset-2 hover:underline"
                style={{ color: textColor }}
                data-cookie-preferences
              >
                Cookie preferences
              </button>
            </nav>
          </div>
          {showPayments && (
            <ul
              aria-label="Payment methods"
              className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0"
              data-footer-payments
            >
              {PAYMENT_METHODS.map((m) => (
                <li key={m.id} className="flex">
                  <PaymentBadge id={m.id} label={m.label} color={textColor} border={divider} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </footer>
    </SectionWrapper>
  )
}

export default FooterSection
