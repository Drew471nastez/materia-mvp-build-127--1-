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
import { useState, type FormEvent } from "react"
import { Facebook, Instagram, Twitter, Youtube } from "lucide-react"
import { cn } from "@/lib/utils"
import { subscribeToCreator } from "@/lib/website-builder/subscribe-client"
import { useStorefront } from "../../theme/storefront-context"
import { themeSocials } from "../../theme/ThemeSocials"
import { cleanMenus } from "@/lib/storelib-theme/values"
import {
  DEFAULT_FOOTER_COLUMNS,
  PAYMENT_METHODS,
  fillFooterTokens,
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

const COLUMNS: Record<string, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-1 @[560px]:grid-cols-2",
  "3": "grid-cols-2 @[760px]:grid-cols-3",
  "4": "grid-cols-2 @[760px]:grid-cols-4",
}

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
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-[13px] outline-none"
          style={{ borderColor: divider, background: "transparent", color: textColor }}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-md px-3 py-2 text-[13px] font-semibold disabled:opacity-60"
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

/** TikTok is not in lucide, so it is drawn rather than left out. */
function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 3a5.6 5.6 0 0 0 4.2 4.1v2.8a8.3 8.3 0 0 1-4.2-1.3v5.9a5.7 5.7 0 1 1-5.7-5.7c.3 0 .5 0 .8.1v2.9a2.8 2.8 0 1 0 2 2.7V3h2.9Z" />
    </svg>
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

  /* Menus from Theme settings › Menus come first, then the footer's own columns. */
  const menus = cleanMenus(t.menus)
  const menuColumns = [
    footerMenuColumn(str(s.menu), str(s.menu_heading), menus),
    footerMenuColumn(str(s.menu_2), str(s.menu_2_heading), menus),
  ].filter((col): col is FooterColumn => col !== null)
  const defaults = wantsDefaultColumns(bool(s.show_default_links, true), menuColumns, blockColumns, loose)
    ? DEFAULT_FOOTER_COLUMNS
    : []
  const columns = [...menuColumns, ...defaults, ...blockColumns]
  const linkedUrls = [...columns.flatMap((col) => col.links), ...loose].map((l) => l.url)

  /*
    THE FOOTER'S OWN SOCIAL LINKS AND THE STORE'S, together. The store's live
    in Theme settings › Social, ten platforms and a "Show icons in footer"
    toggle; a link typed into the footer wins for its platform.
  */
  const own = [
    { key: "social_instagram", url: str(s.social_instagram), Icon: Instagram, label: "Instagram" },
    { key: "social_twitter", url: str(s.social_twitter), Icon: Twitter, label: "X" },
    { key: "social_facebook", url: str(s.social_facebook), Icon: Facebook, label: "Facebook" },
    { key: "social_tiktok", url: str(s.social_tiktok), Icon: TikTok, label: "TikTok" },
    { key: "social_youtube", url: str(s.social_youtube), Icon: Youtube, label: "YouTube" },
  ].filter((p) => !!p.url)
  const ownKeys = new Set<string>(own.map((p) => p.key))
  const fromTheme = t.social_show_in_footer !== false ? themeSocials(theme).filter((p) => !ownKeys.has(p.key)) : []
  const socials = [...own, ...fromTheme]

  const showSocial = bool(s.show_social, true) && socials.length > 0
  const showNewsletter = bool(s.show_newsletter)
  const showPolicies = bool(s.show_policies, true)
  const showPayments = bool(s.show_payment_icons)
  const logo = str(s.logo_url)

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
        className="px-5 @[560px]:px-8 mx-auto"
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 48, 32) }}
        data-footer-layout={centered ? "centered" : "columns"}
      >
        <div
          className={cn(
            "flex flex-col gap-10",
            centered
              ? "items-center text-center"
              : (columns.length > 0 || showNewsletter) && "@[760px]:flex-row @[760px]:justify-between",
          )}
        >
          <div className={cn("max-w-xs", centered && "flex flex-col items-center")} data-footer-brand>
            {logo ? (
              <img
                src={logo}
                alt={brand}
                className="mb-3 h-8 w-auto object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="mb-1 text-[15px] font-bold" style={{ color: headingColor }}>
                {brand}
              </div>
            )}
            {!!s.tagline && (
              <p className="text-[13px] leading-relaxed" style={{ color: textColor }}>
                {str(s.tagline)}
              </p>
            )}
            {showSocial && (
              <div className="mt-4 flex flex-wrap items-center gap-3" data-footer-social>
                {socials.map(({ key, url, Icon, label }) => (
                  <a
                    key={key}
                    href={url}
                    aria-label={label}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="transition-opacity hover:opacity-70"
                    style={{ color: accent }}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {columns.length > 0 && (
            <nav
              aria-label="Footer"
              className={cn(
                "grid gap-8",
                centered ? "w-full max-w-2xl grid-cols-2 @[760px]:grid-flow-col @[760px]:auto-cols-fr" : (COLUMNS[str(s.columns, "3")] ?? COLUMNS["3"]),
              )}
              data-footer-columns
            >
              {columns.map((column) => (
                <div key={column.id} className="min-w-0">
                  {!!column.heading && (
                    <div
                      className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: headingColor }}
                    >
                      {column.heading}
                    </div>
                  )}
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {column.links.map((link) => (
                      <li key={link.id}>
                        <a
                          href={link.url}
                          className="text-[13px] transition-opacity hover:opacity-70"
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
          )}

          {showNewsletter && (
            <div className="w-full max-w-xs" data-footer-newsletter>
              <div className="mb-1 text-[13px] font-semibold" style={{ color: headingColor }}>
                {str(s.newsletter_heading, "Stay in the loop")}
              </div>
              {!!s.newsletter_subtext && (
                <p className="mb-3 text-[12px]" style={{ color: textColor }}>
                  {str(s.newsletter_subtext)}
                </p>
              )}
              <FooterSignup
                buttonText={str(s.newsletter_button_text, "Join")}
                textColor={textColor}
                divider={divider}
                accent={accent}
                buttonTextColor={c.primary_btn_text}
              />
            </div>
          )}
        </div>

        {loose.length > 0 && (
          <div className={cn("mt-8 flex flex-wrap items-center gap-4", centered && "justify-center")}>
            {loose.map((link) => (
              <a
                key={link.id}
                href={link.url}
                className="text-[13px] transition-opacity hover:opacity-70"
                style={{ color: linkColor }}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {showPayments && (
          <ul
            aria-label="Payment methods"
            className={cn("m-0 mt-8 flex list-none flex-wrap items-center gap-2 p-0", centered && "justify-center")}
            data-footer-payments
          >
            {PAYMENT_METHODS.map((m) => (
              <li key={m.id}>
                <PaymentBadge id={m.id} label={m.label} color={textColor} border={divider} />
              </li>
            ))}
          </ul>
        )}

        {/*
          THE BOTTOM LINE IS A ROW OF TWO, not a sentence with a button in it.
          The copyright on the left; on the right the policies and "Cookie
          preferences", same size, same colour, same baseline, and under the
          copyright (still left aligned, like the rest of this footer) when
          the two do not fit on one line.
        */}
        <div
          className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t pt-5 text-[12px] leading-5"
          data-footer-bottom
          style={{ borderColor: divider, color: textColor, justifyContent: centered ? "center" : undefined, textAlign: centered ? "center" : undefined }}
        >
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
      </footer>
    </SectionWrapper>
  )
}

export default FooterSection
