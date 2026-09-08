"use client"

/**
 * ===========================================================================
 *  THE FOOTER
 * ===========================================================================
 * Nineteen of its twenty-six controls did nothing — the worst in the library.
 * The logo image, the tagline, the whole newsletter block, all five social
 * links, every colour, the column count, the content width and the padding
 * were declared, shown in the panel, set by the presets, and ignored.
 *
 * WORSE THAN IGNORED: the schema declares TWO block types, `footer_column`
 * (a column heading) and `footer_link`. The renderer treated every block as a
 * link, so the preset's three column headings rendered as three empty links in
 * a flat row, and the columns the footer was designed around did not exist.
 */

import { Facebook, Instagram, Twitter, Youtube } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  bool,
  maxWidth,
  resolveScheme,
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

/** TikTok is not in lucide, so it is drawn rather than left out. */
function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 3a5.6 5.6 0 0 0 4.2 4.1v2.8a8.3 8.3 0 0 1-4.2-1.3v5.9a5.7 5.7 0 1 1-5.7-5.7c.3 0 .5 0 .8.1v2.9a2.8 2.8 0 1 0 2 2.7V3h2.9Z" />
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
  const s = section.settings
  // Footers default to the "dark" scheme when no scheme is explicitly set.
  const schemeKey = typeof s.color_scheme === "string" ? s.color_scheme : "dark"
  const c = resolveScheme(theme, schemeKey)

  const bg = str(s.bg_color) || c.bg
  const headingColor = str(s.heading_color) || c.heading
  const textColor = str(s.text_color) || c.paragraph
  const accent = str(s.accent_color) || c.primary_btn_bg
  const divider = str(s.divider_color) || c.inset_border
  const linkColor = str(s.text_color) || c.footer_link
  const blocks = section.blocks ?? []

  /**
   * COLUMNS ARE A STREAM, not a nesting. `footer_column` opens a column and
   * every `footer_link` after it belongs to that column until the next one —
   * which is how the block list in the sidebar reads top to bottom, so the
   * order somebody drags things into is the order they come out in.
   */
  const columns: { id: string; heading: string; links: { id: string; label: string; url: string }[] }[] = []
  const loose: { id: string; label: string; url: string }[] = []
  for (const block of blocks) {
    if (block.type === "footer_column") {
      columns.push({ id: block.id, heading: str(block.settings.heading), links: [] })
    } else {
      const link = {
        id: block.id,
        label: str(block.settings.label),
        url: str(block.settings.url, "#"),
      }
      if (columns.length > 0) columns[columns.length - 1].links.push(link)
      else loose.push(link)
    }
  }

  const socials = [
    { url: str(s.social_instagram), Icon: Instagram, label: "Instagram" },
    { url: str(s.social_twitter), Icon: Twitter, label: "X" },
    { url: str(s.social_facebook), Icon: Facebook, label: "Facebook" },
    { url: str(s.social_tiktok), Icon: TikTok, label: "TikTok" },
    { url: str(s.social_youtube), Icon: Youtube, label: "YouTube" },
  ].filter((x) => !!x.url)

  const showSocial = bool(s.show_social, true) && socials.length > 0
  const showNewsletter = bool(s.show_newsletter)
  const logo = str(s.logo_url)

  return (
    <SectionWrapper
      bgColor={bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      canvasRoundedBottomPx={canvasRoundedBottomPx}
    >
      <div
        className="px-8 mx-auto"
        style={{ maxWidth: maxWidth(s.max_width), ...sectionPadding(s, 48, 32) }}
      >
        <div
          className={cn(
            "flex flex-col gap-10",
            (columns.length > 0 || showNewsletter) && "@[760px]:flex-row @[760px]:justify-between",
          )}
        >
          <div className="max-w-xs">
            {logo ? (
              <img
                src={logo}
                alt={str(s.logo_text, theme.brand_name ?? "")}
                className="mb-3 h-8 w-auto object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="mb-1 text-[15px] font-bold" style={{ color: headingColor }}>
                {str(s.logo_text, theme.brand_name ?? "My Store")}
              </div>
            )}
            {!!s.tagline && (
              <p className="text-[13px] leading-relaxed" style={{ color: textColor }}>
                {str(s.tagline)}
              </p>
            )}
            {showSocial && (
              <div className="mt-4 flex items-center gap-3">
                {socials.map(({ url, Icon, label }) => (
                  <a
                    key={label}
                    href={url}
                    aria-label={label}
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
            <div className={cn("grid gap-8", COLUMNS[str(s.columns, "3")] ?? COLUMNS["3"])}>
              {columns.map((column) => (
                <div key={column.id}>
                  {!!column.heading && (
                    <div
                      className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: headingColor }}
                    >
                      {column.heading}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {column.links.map((link) => (
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
                </div>
              ))}
            </div>
          )}

          {showNewsletter && (
            <div className="max-w-xs">
              <div className="mb-1 text-[13px] font-semibold" style={{ color: headingColor }}>
                {str(s.newsletter_heading, "Stay in the loop")}
              </div>
              {!!s.newsletter_subtext && (
                <p className="mb-3 text-[12px]" style={{ color: textColor }}>
                  {str(s.newsletter_subtext)}
                </p>
              )}
              <form
                className="flex gap-2"
                // The editor canvas is not a place to submit anything, and on
                // a live page the section has no endpoint of its own — the
                // dedicated newsletter section is what collects addresses.
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-md border px-3 py-2 text-[13px] outline-none"
                  style={{ borderColor: divider, background: "transparent", color: textColor }}
                />
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-[13px] font-semibold"
                  style={{ background: accent, color: c.primary_btn_text }}
                >
                  {str(s.newsletter_button_text, "Join")}
                </button>
              </form>
            </div>
          )}
        </div>

        {loose.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-4">
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

        <div
          className="mt-8 border-t pt-5 text-[12px]"
          style={{ borderColor: divider, color: textColor }}
        >
          {str(s.copyright, `© ${new Date().getFullYear()} ${str(s.logo_text, theme.brand_name ?? "My Store")}`)}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default FooterSection
