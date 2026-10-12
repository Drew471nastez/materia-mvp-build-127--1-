/**
 * ===========================================================================
 *  ONE LAYOUT FOR EVERY EMAIL STORELIB SENDS
 * ===========================================================================
 * Two senders, one design:
 *
 *   storelib   Storelib writing to the people who use it: a team invite, a
 *              code, a password reset, a sale, a payout, a reminder. The
 *              Storelib mark and name on top, near black buttons.
 *   store      a store writing to its buyers: a receipt, an order, a
 *              shipment, a sign in code. The store's logo or picture and
 *              name on top, its accent on the button, Storelib nowhere loud.
 *
 * Every template builds its body from the blocks below (emailKit) and hands
 * it to emailDocument, so the type, the spacing, the button, the tables and
 * the footer are drawn by one piece of code. platformEmail is the short way
 * for a plain Storelib email (heading, a few lines, a button): it returns the
 * HTML and the plain text part together.
 *
 * What an inbox needs, and how each is done:
 *
 *   page        white, no grey frame and no card: the content is a column
 *               of 560px at most with the page's own margin around it.
 *   width       a fluid table up to 560px with a fixed 560px table around it
 *               for Outlook on Windows, which ignores max-width. A phone
 *               fits it with no media query; the query trims the margin,
 *               stacks two column blocks and widens the button.
 *   styles      inline. The <style> only adds dark mode and the phone rules.
 *   dark mode   color-scheme light dark, a dark palette for Apple Mail and
 *               Outlook.com ([data-ogsc]/[data-ogsb]). A dark button turns
 *               light on the dark page so it is still seen.
 *   button      a table cell with its own fill (every client, pictures off)
 *               and a VML roundrect for Outlook on Windows.
 *   preheader   hidden text after the body tag, padded so the inbox does not
 *               pull body text into the preview line.
 *   addresses   an email address in running text is split with spans, so
 *               Gmail does not turn it into a blue link (identity()).
 *   pictures    absolute https only, with width, height and alt; a missing
 *               picture is a letter tile, never a broken image.
 *
 * Pure: no database and no mailer, so tests and scripts draw exactly what is
 * sent. Every value is escaped here unless a function says it takes HTML.
 */
import { STORELIB_EMAIL_LOGO, STORELIB_LOGO_SHADOW, storelibAssetUrl } from "@/lib/brand/logo"
import { contrast, hexColor, textOn } from "@/lib/email-campaigns/brand"

export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

/** The near black every Storelib button is filled with. */
export const PLATFORM_ACCENT = "#1a1a2e"

/** The light palette, and the dark one the <style> swaps in. */
export const EMAIL_COLORS = {
  page: "#ffffff",
  ink: "#111827",
  text: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#e5e7eb",
  panel: "#f6f7f9",
  dark: { page: "#121214", ink: "#f4f4f5", text: "#d4d4d8", muted: "#a1a1aa", faint: "#8b8b94", line: "#2e2e35", panel: "#1d1d21" },
} as const

const K = EMAIL_COLORS

/** The Storelib mark, 96px square with its corners in the file (Outlook ignores border-radius), drawn at 28px. */
export const EMAIL_LOGO_URL = storelibAssetUrl(STORELIB_EMAIL_LOGO)

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Plain words from a bit of HTML: tags gone, the common entities read back. */
export function plainOf(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/* ------------------------------------------------------------------------ */
/*  Who it is from                                                          */
/* ------------------------------------------------------------------------ */

export type EmailSender =
  | {
      kind: "storelib"
      /** Where the mark links to. storelib.com when left out. */
      homeUrl?: string | null
    }
  | {
      kind: "store"
      name: string
      /** An https picture. Left out draws a tile with the name's first letter. */
      pictureUrl?: string | null
      /** "logo" is drawn as uploaded, alone; "mark" as uploaded beside the name; "avatar" round beside the name. Default "logo". */
      picture?: "logo" | "mark" | "avatar"
      /** The store's accent (#rrggbb). Used on the button when it reads on white. */
      accent?: string | null
      /** Where the logo and the name link to. */
      url?: string | null
    }

export interface EmailTheme {
  /** The button's fill. */
  accent: string
  /** The words on the button. */
  onAccent: string
  /** True when the fill would vanish on the dark page, so dark mode turns the button light. */
  flip: boolean
}

/** The minimum a button's fill needs against the page to be seen as a button. */
const SEEN = 1.6

export function emailTheme(sender: EmailSender): EmailTheme {
  const chosen = sender.kind === "store" ? hexColor(sender.accent) : null
  const accent = chosen && contrast(chosen, K.page) >= SEEN ? chosen : PLATFORM_ACCENT
  return { accent, onAccent: textOn(accent), flip: contrast(accent, K.dark.page) < 2.2 }
}

function https(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  return /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length <= 2048 ? u : null
}

function homeOf(sender: { homeUrl?: string | null }): string {
  return https(sender.homeUrl ?? null) ?? "https://storelib.com/"
}

function initial(name: string): string {
  return (Array.from(name.trim())[0] || "S").toUpperCase()
}

/* ------------------------------------------------------------------------ */
/*  Blocks                                                                   */
/* ------------------------------------------------------------------------ */

export interface EmailLink {
  label: string
  url: string
}

export interface EmailFact {
  label: string
  value: string
}

export interface EmailItem {
  title: string
  /** A second line: the variant, "Qty 2", the maker. */
  detail?: string | null
  /** A third, red line: "Refunded". */
  warning?: string | null
  /** Right aligned: "$32.00". Null leaves the column out. */
  amount?: string | null
  /** An absolute https picture already sized for an inbox. Null draws the letter tile. */
  imageUrl?: string | null
}

export interface EmailMoneyRow {
  label: string
  value: string
  strong?: boolean
  /** A green line ("You saved $10.00") or a muted one. */
  tone?: "muted" | "good"
}

export type NoticeTone = "neutral" | "warn" | "danger" | "good"

/** The drawn size of a picture beside an item. */
export const ITEM_PX = 56

/**
 * Every block is one table row, <tr><td>...</td></tr>, with its own space
 * under it, so a template is a list of blocks and emailDocument puts them in
 * the column. The space is padding on the cell, which every client draws.
 */
function row(inner: string, below = 16, cls = ""): string {
  return `<tr><td${cls ? ` class="${cls}"` : ""} style="padding:0 0 ${below}px 0;">${inner}</td></tr>`
}

const P = (size: number, line: number, color: string, extra = "") => `margin:0;font-family:${EMAIL_FONT};font-size:${size}px;line-height:${line}px;color:${color};${extra}`

/** The VML button for Outlook on Windows and the table cell button for everyone else. */
function buttonHtml(t: EmailTheme, label: string, url: string): string {
  const href = esc(url)
  const words = esc(label)
  const width = Math.max(160, Math.round(label.length * 8.5 + 52))
  const flip = t.flip ? " e-btn-flip" : ""
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="22%" stroke="f" fillcolor="${t.accent}">
<w:anchorlock/>
<center style="color:${t.onAccent};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${words}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" class="e-btn-wrap" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
<tr><td class="e-btn${flip}" align="center" bgcolor="${t.accent}" style="background-color:${t.accent};border-radius:10px;">
<a class="e-btn-a${flip}" href="${href}" target="_blank" style="display:inline-block;padding:13px 24px;border-radius:10px;font-family:${EMAIL_FONT};font-size:15px;line-height:20px;font-weight:600;color:${t.onAccent};text-decoration:none;">${words}</a>
</td></tr>
</table>
<!--<![endif]-->`
}

function linkHtml(label: string, url: string, cls = "e-link"): string {
  return `<a class="${cls}" href="${esc(url)}" target="_blank" style="color:${K.ink};text-decoration:underline;text-underline-offset:2px;">${esc(label)}</a>`
}

/**
 * AN EMAIL ADDRESS THAT STAYS TEXT. Gmail turns anything shaped like an
 * address into a blue link; split at the @ and the dots with spans it no
 * longer matches the pattern, and copying it still gives the address.
 * Already escaped; drop it into running HTML.
 */
export function identity(email: string, strong = true): string {
  const e = String(email ?? "").trim()
  const parts = esc(e)
    .split(/(@|\.)/)
    .map((p) => (p === "@" || p === "." ? `<span style="color:inherit;text-decoration:none;">${p}</span>` : p))
    .join("")
  return `<span class="e-ink" style="color:${K.ink};text-decoration:none;${strong ? "font-weight:600;" : ""}">${parts}</span>`
}

export interface EmailKit {
  theme: EmailTheme
  /** The big line. A small label above it ("Action needed") is optional. */
  heading(text: string, opts?: { label?: string | null; labelColor?: string; sub?: string | null }): string
  /** A paragraph of plain text. */
  text(text: string, opts?: { below?: number }): string
  /** A paragraph of trusted HTML (already escaped). */
  html(html: string, opts?: { below?: number; muted?: boolean }): string
  /** A small grey line. */
  small(text: string, opts?: { below?: number }): string
  /** A small grey line of trusted HTML. */
  smallHtml(html: string, opts?: { below?: number }): string
  /** The one primary button, with an optional quiet link beside it ("or Visit our store"). */
  button(label: string, url: string, opts?: { secondary?: EmailLink | null; below?: number }): string
  /** A quiet text link on its own line. */
  link(label: string, url: string, opts?: { below?: number; prefix?: string }): string
  /** "Button not working?" with the address written out. */
  fallback(url: string): string
  /** Label and value rows. */
  facts(rows: EmailFact[], opts?: { below?: number; labelWidth?: string }): string
  /** One thing the email is about: a picture, a name and a line under it, in a light box. */
  media(m: { title: string; subtitle?: string | null; imageUrl?: string | null; round?: boolean }): string
  /** Order lines: picture, title, detail and amount. */
  items(lines: EmailItem[], opts?: { below?: number; ruleTop?: boolean; pictures?: boolean }): string
  /** Money rows under the items, the strong one set off by a line. */
  totals(rows: EmailMoneyRow[], opts?: { below?: number }): string
  /** A one time code, large, on a light panel. */
  code(code: string, caption?: string | null): string
  /** A boxed note. `text` is plain; `html` is trusted. */
  notice(n: { title?: string | null; text?: string | null; html?: string | null; tone?: NoticeTone; link?: EmailLink | null }): string
  /** Somebody's own words, set off by a line on the left. */
  quote(text: string, by?: string | null): string
  /** A small bold label over a few lines of trusted HTML: an address, a note from the store. */
  labeled(label: string, html: string, opts?: { below?: number }): string
  /** A small heading over a part of the email, with a line above it. */
  section(title: string): string
  /** Two columns of a label and lines (trusted HTML), one column on a phone. */
  columns(cells: { label: string; html: string }[]): string
  /** Where a parcel is: four steps, the done ones in ink. */
  steps(labels: string[], at: number): string
  /** The carrier, the tracking number and a Track link. */
  tracking(carrier: string | null, number: string | null, url: string | null): string
  /** Five linked stars and a line under them. */
  stars(links: EmailLink[], label: string): string
  /** A thin line. */
  divider(): string
  /** Space. */
  space(px: number): string
  /** A row of trusted HTML. */
  raw(html: string, below?: number): string
}

export function emailKit(sender: EmailSender): EmailKit {
  const t = emailTheme(sender)
  const kit: EmailKit = {
    theme: t,
    heading(text, opts = {}) {
      const label = opts.label
        ? `<p class="e-label" style="${P(13, 18, opts.labelColor ?? K.muted, "font-weight:600;margin:0 0 8px 0;")}">${esc(opts.label)}</p>`
        : ""
      const sub = opts.sub ? `<p class="e-muted" style="${P(14, 20, K.muted, "margin:6px 0 0 0;")}">${esc(opts.sub)}</p>` : ""
      return row(`${label}<h1 class="e-h1 e-ink" style="${P(24, 32, K.ink, "font-weight:700;letter-spacing:-0.4px;")}">${esc(text)}</h1>${sub}`, 16)
    },
    text(text, opts = {}) {
      return row(`<p class="e-text" style="${P(16, 26, K.text)}">${esc(text).replace(/\n/g, "<br>")}</p>`, opts.below ?? 16)
    },
    html(html, opts = {}) {
      return opts.muted
        ? row(`<p class="e-muted" style="${P(14, 22, K.muted)}">${html}</p>`, opts.below ?? 16)
        : row(`<p class="e-text" style="${P(16, 26, K.text)}">${html}</p>`, opts.below ?? 16)
    },
    small(text, opts = {}) {
      return row(`<p class="e-muted" style="${P(13, 20, K.muted)}">${esc(text)}</p>`, opts.below ?? 12)
    },
    smallHtml(html, opts = {}) {
      return row(`<p class="e-muted" style="${P(13, 20, K.muted)}">${html}</p>`, opts.below ?? 12)
    },
    button(label, url, opts = {}) {
      const second = opts.secondary
        ? `<td class="e-col e-btn-side" style="padding:0 0 0 16px;vertical-align:middle;"><p class="e-muted" style="${P(14, 20, K.muted)}">or ${linkHtml(opts.secondary.label, opts.secondary.url)}</p></td>`
        : ""
      const inner = second
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="e-btn-row"><tr><td class="e-col" style="vertical-align:middle;">${buttonHtml(t, label, url)}</td>${second}</tr></table>`
        : buttonHtml(t, label, url)
      return row(inner, opts.below ?? 24, "e-btn-cell")
    },
    link(label, url, opts = {}) {
      return row(`<p class="e-muted" style="${P(14, 20, K.muted)}">${opts.prefix ? `${esc(opts.prefix)} ` : ""}${linkHtml(label, url)}</p>`, opts.below ?? 16)
    },
    fallback(url) {
      return row(
        `<p class="e-muted" style="${P(13, 20, K.muted)}">Button not working? Paste this link into your browser:</p><p class="e-muted" style="${P(13, 20, K.muted, "margin:2px 0 0 0;word-break:break-all;")}"><a class="e-link" href="${esc(url)}" target="_blank" style="color:${K.muted};text-decoration:underline;">${esc(url)}</a></p>`,
        16,
      )
    },
    facts(rows, opts = {}) {
      if (!rows.length) return ""
      const lw = opts.labelWidth ?? "40%"
      const body = rows
        .map((f, i) => {
          const rule = i > 0 ? `border-top:1px solid ${K.line};` : ""
          return `<tr>
<td class="e-muted e-line" valign="top" style="padding:10px 12px 10px 0;${rule}width:${lw};${P(14, 20, K.muted)}">${esc(f.label)}</td>
<td class="e-ink e-line" valign="top" align="right" style="padding:10px 0;${rule}${P(14, 20, K.ink, "font-weight:600;text-align:right;word-break:break-word;")}">${/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(f.value.trim()) ? identity(f.value) : esc(f.value)}</td>
</tr>`
        })
        .join("\n")
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-line" style="width:100%;border-top:1px solid ${K.line};border-bottom:1px solid ${K.line};">${body}</table>`,
        opts.below ?? 20,
      )
    },
    media(m) {
      const px = 48
      const src = https(m.imageUrl)
      const radius = m.round ? px / 2 : 10
      const pic = src
        ? `<img class="e-thumb" src="${esc(src)}" alt="${esc(m.title)}" width="${px}" height="${px}" style="display:block;width:${px}px;height:${px}px;object-fit:cover;border:0;border-radius:${radius}px;background-color:${K.line};">`
        : tile(m.title, px, radius, t)
      const sub = m.subtitle ? `<p class="e-muted" style="${P(14, 20, K.muted, "margin:2px 0 0 0;")}">${esc(m.subtitle)}</p>` : ""
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-panel" bgcolor="${K.panel}" style="width:100%;background-color:${K.panel};border-radius:12px;border-collapse:separate;">
<tr><td width="${px}" valign="middle" style="width:${px}px;padding:14px 0 14px 16px;">${pic}</td>
<td valign="middle" style="padding:14px 16px 14px 14px;"><p class="e-ink" style="${P(16, 22, K.ink, "font-weight:600;word-break:break-word;")}">${esc(m.title)}</p>${sub}</td></tr>
</table>`,
        20,
      )
    },
    items(lines, opts = {}) {
      if (!lines.length) return ""
      const anyAmount = lines.some((l) => l.amount)
      const body = lines
        .map((l, i) => {
          const rule = i > 0 || opts.ruleTop ? `border-top:1px solid ${K.line};` : ""
          const src = https(l.imageUrl)
          const pic = opts.pictures === false
            ? ""
            : src
            ? `<img class="e-thumb" src="${esc(src)}" alt="${esc(l.title)}" width="${ITEM_PX}" height="${ITEM_PX}" style="display:block;width:${ITEM_PX}px;height:${ITEM_PX}px;object-fit:cover;border:1px solid ${K.line};border-radius:10px;background-color:${K.panel};">`
            : tile(l.title, ITEM_PX, 10, null)
          const detail = l.detail ? `<p class="e-muted" style="${P(13, 19, K.muted, "margin:2px 0 0 0;")}">${esc(l.detail)}</p>` : ""
          const warning = l.warning ? `<p style="${P(13, 19, "#b91c1c", "margin:2px 0 0 0;")}">${esc(l.warning)}</p>` : ""
          const amount = anyAmount
            ? `<td class="e-ink e-line" valign="top" align="right" style="padding:14px 0 14px 12px;${rule}${P(15, 21, K.ink, "font-weight:600;text-align:right;white-space:nowrap;")}">${esc(l.amount ?? "")}</td>`
            : ""
          return `<tr>
${opts.pictures === false ? "" : `<td class="e-line" width="${ITEM_PX + 14}" valign="top" style="width:${ITEM_PX + 14}px;padding:14px 14px 14px 0;${rule}">${pic}</td>`}
<td class="e-line" valign="top" style="padding:14px 0;${rule}"><p class="e-ink" style="${P(15, 21, K.ink, "font-weight:600;word-break:break-word;")}">${esc(l.title)}</p>${detail}${warning}</td>
${amount}
</tr>`
        })
        .join("\n")
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${body}</table>`, opts.below ?? 4)
    },
    totals(rows, opts = {}) {
      if (!rows.length) return ""
      const body = rows
        .map((r, i) => {
          const divide = r.strong && i > 0
          const top = divide ? `border-top:1px solid ${K.line};` : ""
          const pad = divide ? "12px 0 4px" : i === 0 ? "12px 0 3px" : "3px 0"
          const color = r.tone === "good" ? "#047857" : r.strong ? K.ink : K.muted
          const cls = r.tone === "good" ? "e-good" : r.strong ? "e-ink" : "e-muted"
          const weight = r.strong ? "font-weight:700;" : ""
          const size = r.strong ? 16 : 14
          return `<tr>
<td class="${cls} e-line" style="padding:${pad};${top}${P(size, 22, color, weight)}">${esc(r.label)}</td>
<td class="${r.tone === "good" ? "e-good" : "e-ink"} e-line" align="right" style="padding:${pad};${top}${P(size, 22, r.tone === "good" ? "#047857" : K.ink, `${weight}text-align:right;white-space:nowrap;`)}">${esc(r.value)}</td>
</tr>`
        })
        .join("\n")
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-line" style="width:100%;border-top:1px solid ${K.line};">${body}</table>`,
        opts.below ?? 24,
      )
    },
    code(code, caption) {
      const cap = caption ? `<p class="e-muted" style="${P(13, 20, K.muted, "margin:10px 0 0 0;")}">${esc(caption)}</p>` : ""
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-panel" bgcolor="${K.panel}" style="width:100%;background-color:${K.panel};border-radius:12px;border-collapse:separate;">
<tr><td align="center" style="padding:22px 16px;"><p class="e-ink e-code" style="margin:0;font-family:${MONO};font-size:34px;line-height:40px;font-weight:700;letter-spacing:8px;color:${K.ink};-webkit-user-select:all;user-select:all;">${esc(code)}</p>${cap}</td></tr>
</table>`,
        20,
      )
    },
    notice(n) {
      const tone = n.tone ?? "neutral"
      const palette = {
        neutral: { bg: K.panel, line: K.panel, title: K.ink, text: K.text, cls: "e-panel" },
        warn: { bg: "#fffbeb", line: "#fde68a", title: "#92400e", text: "#92400e", cls: "e-warn" },
        danger: { bg: "#fef2f2", line: "#fecaca", title: "#991b1b", text: "#991b1b", cls: "e-danger" },
        good: { bg: "#ecfdf5", line: "#a7f3d0", title: "#065f46", text: "#065f46", cls: "e-goodbox" },
      }[tone]
      const title = n.title ? `<p class="e-ntitle" style="${P(14, 21, palette.title, "font-weight:600;margin:0 0 2px 0;")}">${esc(n.title)}</p>` : ""
      const body = n.html ?? (n.text ? esc(n.text).replace(/\n/g, "<br>") : "")
      const text = body ? `<p class="e-ntext" style="${P(14, 21, palette.text)}">${body}</p>` : ""
      const link = n.link ? `<p style="${P(14, 21, palette.text, "margin:8px 0 0 0;font-weight:600;")}">${linkHtml(n.link.label, n.link.url)}</p>` : ""
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="${palette.cls}" bgcolor="${palette.bg}" style="width:100%;background-color:${palette.bg};border:1px solid ${palette.line};border-radius:12px;border-collapse:separate;">
<tr><td style="padding:14px 16px;">${title}${text}${link}</td></tr>
</table>`,
        20,
      )
    },
    quote(text, by) {
      const who = by ? `<p class="e-muted" style="${P(13, 19, K.muted, "margin:8px 0 0 0;")}">${esc(by)}</p>` : ""
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="e-line" style="border-left:3px solid ${K.line};padding:2px 0 2px 16px;"><p class="e-text" style="${P(15, 24, K.text, "white-space:pre-wrap;word-break:break-word;")}">${esc(text)}</p>${who}</td></tr></table>`,
        20,
      )
    },
    labeled(label, html, opts = {}) {
      return row(`<p class="e-ink" style="${P(13, 19, K.ink, "font-weight:600;margin:0 0 4px 0;")}">${esc(label)}</p><p class="e-text" style="${P(14, 21, K.text)}">${html}</p>`, opts.below ?? 20)
    },
    section(title) {
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="e-line" style="border-top:1px solid ${K.line};padding:24px 0 0 0;"><p class="e-ink" style="${P(15, 22, K.ink, "font-weight:600;")}">${esc(title)}</p></td></tr></table>`,
        4,
      )
    },
    columns(cells) {
      if (!cells.length) return ""
      const cell = (c: { label: string; html: string }, right: boolean) =>
        `<td class="e-col" width="50%" valign="top" style="width:50%;padding:12px ${right ? 0 : 12}px 0 0;vertical-align:top;"><p class="e-ink" style="${P(13, 19, K.ink, "font-weight:600;margin:0 0 4px 0;")}">${esc(c.label)}</p><p class="e-text" style="${P(14, 21, K.text)}">${c.html}</p></td>`
      const rows: string[] = []
      for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cell(cells[i], false)}${cells[i + 1] ? cell(cells[i + 1], true) : '<td class="e-col" width="50%" style="width:50%;"></td>'}</tr>`)
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${rows.join("")}</table>`, 20)
    },
    steps(labels, at) {
      const cells = labels
        .map((label, i) => {
          const done = i <= at
          return `<td class="e-step" width="${Math.floor(100 / labels.length)}%" valign="top" style="padding:0 ${i < labels.length - 1 ? 4 : 0}px 0 0;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="${done ? (t.flip ? "e-flipbar" : "e-bar-on") : "e-bar"}" height="4" bgcolor="${done ? t.accent : K.line}" style="height:4px;line-height:4px;font-size:0;background-color:${done ? t.accent : K.line};border-radius:2px;">&nbsp;</td></tr></table><p class="${done ? "e-ink" : "e-faint"}" style="${P(12, 16, done ? K.ink : K.faint, `margin:8px 0 0 0;${i === at ? "font-weight:600;" : ""}`)}">${esc(label)}</p></td>`
        })
        .join("")
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${cells}</tr></table>`, 20)
    },
    tracking(carrier, number, url) {
      if (!number && !url) return ""
      const num = number ? `<p class="e-ink" style="margin:2px 0 0 0;font-family:${MONO};font-size:15px;line-height:22px;font-weight:600;color:${K.ink};word-break:break-all;">${esc(number)}</p>` : ""
      const track = url ? `<td align="right" valign="middle" style="padding:14px 16px;white-space:nowrap;"><p style="${P(14, 20, K.ink, "font-weight:600;")}">${linkHtml("Track", url)}</p></td>` : ""
      return row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-panel" bgcolor="${K.panel}" style="width:100%;background-color:${K.panel};border-radius:12px;border-collapse:separate;"><tr><td valign="middle" style="padding:14px 16px;"><p class="e-muted" style="${P(13, 18, K.muted)}">${esc(carrier || "Tracking number")}</p>${num}</td>${track}</tr></table>`,
        20,
      )
    },
    stars(links, label) {
      if (links.length !== 5) return ""
      const cells = links
        .map(
          (l) =>
            `<td align="center" style="padding:0 2px;"><a href="${esc(l.url)}" target="_blank" title="${esc(l.label)}" aria-label="${esc(l.label)}" style="display:block;width:44px;height:44px;font-family:${EMAIL_FONT};font-size:34px;line-height:44px;color:#f5a524;text-decoration:none;">&#9733;</a></td>`,
        )
        .join("")
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 0 -2px;"><tr>${cells}</tr></table><p class="e-muted" style="${P(13, 19, K.muted, "margin:6px 0 0 0;")}">${esc(label)}</p>`, 24)
    },
    divider() {
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="e-line" style="border-top:1px solid ${K.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`, 20)
    },
    space(px) {
      return `<tr><td style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</td></tr>`
    },
    raw(html, below = 16) {
      return row(html, below)
    },
  }
  return kit
}

/** A square or round tile with a letter, drawn with a table cell so it is there with pictures off. */
function tile(name: string, px: number, radius: number, t: EmailTheme | null): string {
  const bg = t ? t.accent : K.panel
  const fg = t ? t.onAccent : K.faint
  const cls = t ? "e-tile-accent" : "e-tile"
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td class="${cls}" width="${px}" height="${px}" align="center" valign="middle" bgcolor="${bg}" style="width:${px}px;height:${px}px;background-color:${bg};border-radius:${radius}px;font-family:${EMAIL_FONT};font-size:${Math.round(px * 0.4)}px;line-height:${px}px;font-weight:700;color:${fg};text-align:center;">${esc(initial(name))}</td></tr></table>`
}

/* ------------------------------------------------------------------------ */
/*  The document                                                             */
/* ------------------------------------------------------------------------ */

export interface EmailFooter {
  /** Lines of trusted HTML, first in the footer: how to reach the store. */
  lines?: string[]
  /** Why the reader got this, one sentence, plain. */
  reason?: string | null
  /** Small links in one row: Notification settings, Unsubscribe. */
  links?: EmailLink[]
  /** The legal line: who sells, their address and tax number. Plain. */
  legal?: string | null
}

export interface EmailDocumentInput {
  sender: EmailSender
  subject: string
  /** The inbox's preview line. */
  preview: string
  /** The blocks, from emailKit. */
  rows: string | string[]
  /** Small text at the right of the header: "Order #1042" over the date. */
  aside?: { title: string; sub?: string | null } | null
  footer?: EmailFooter
}

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors],.e-body a[href^="tel"],.e-body a[href^="sms"]{color:inherit!important;text-decoration:none!important;}
@media only screen and (max-width:480px){
.e-outer{padding:28px 20px 36px!important;}
.e-h1{font-size:22px!important;line-height:30px!important;}
.e-btn-wrap{width:100%!important;}
.e-btn-a{display:block!important;}
.e-btn-row{width:100%!important;}
.e-col{display:block!important;width:100%!important;box-sizing:border-box!important;padding-right:0!important;}
.e-btn-side{padding:12px 0 0 0!important;}
.e-step p{font-size:11px!important;}
}
@media (prefers-color-scheme: dark){
.e-bg{background-color:${K.dark.page}!important;}
.e-ink,.e-h1,.e-mark{color:${K.dark.ink}!important;}
.e-text{color:${K.dark.text}!important;}
.e-muted,.e-foot,.e-foot a{color:${K.dark.muted}!important;}
.e-faint{color:${K.dark.faint}!important;}
.e-link{color:${K.dark.ink}!important;}
.e-line{border-color:${K.dark.line}!important;}
.e-panel{background-color:${K.dark.panel}!important;border-color:${K.dark.panel}!important;}
.e-thumb{border-color:${K.dark.line}!important;}
.e-tile{background-color:${K.dark.panel}!important;color:${K.dark.muted}!important;}
.e-bar{background-color:${K.dark.line}!important;}
.e-good{color:#34d399!important;}
.e-warn,.e-danger,.e-goodbox{background-color:${K.dark.panel}!important;border-color:${K.dark.line}!important;}
.e-warn .e-ntitle,.e-warn .e-ntext{color:#fcd34d!important;}
.e-danger .e-ntitle,.e-danger .e-ntext{color:#fca5a5!important;}
.e-goodbox .e-ntitle,.e-goodbox .e-ntext{color:#6ee7b7!important;}
.e-btn-flip{background-color:#f4f4f5!important;}
a.e-btn-flip{color:#121214!important;}
.e-flipbar{background-color:#f4f4f5!important;}
}
[data-ogsb] .e-bg{background-color:${K.dark.page}!important;}
[data-ogsc] .e-ink,[data-ogsc] .e-h1,[data-ogsc] .e-mark{color:${K.dark.ink}!important;}
[data-ogsc] .e-text{color:${K.dark.text}!important;}
[data-ogsc] .e-muted,[data-ogsc] .e-foot,[data-ogsc] .e-foot a{color:${K.dark.muted}!important;}
[data-ogsc] .e-link{color:${K.dark.ink}!important;}
[data-ogsb] .e-panel{background-color:${K.dark.panel}!important;}
[data-ogsb] .e-tile{background-color:${K.dark.panel}!important;}
[data-ogsb] .e-btn-flip{background-color:#f4f4f5!important;}
[data-ogsc] a.e-btn-flip{color:#121214!important;}`

function preheader(text: string): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 160)
  if (!t) return ""
  return `<div class="e-preheader" style="display:none;font-size:1px;color:${K.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(t)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`
}

function header(sender: EmailSender, theme: EmailTheme, aside: EmailDocumentInput["aside"]): string {
  let left: string
  if (sender.kind === "storelib") {
    const home = esc(homeOf(sender))
    left = `<a href="${home}" target="_blank" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img class="e-logo" src="${esc(EMAIL_LOGO_URL)}" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0;outline:none;border-radius:7px;box-shadow:${STORELIB_LOGO_SHADOW};"></td>
<td class="e-mark" style="vertical-align:middle;padding-left:10px;font-family:${EMAIL_FONT};font-size:17px;line-height:24px;font-weight:700;letter-spacing:-0.2px;color:${K.ink};">Storelib</td>
</tr></table></a>`
  } else {
    const name = sender.name.trim() || "Store"
    const pic = https(sender.pictureUrl)
    const url = https(sender.url)
    const mark =
      pic && (sender.picture ?? "logo") === "logo"
        ? `<img class="e-store-logo" src="${esc(pic)}" alt="${esc(name)}" height="36" style="display:block;height:36px;width:auto;max-width:180px;border:0;outline:none;">`
        : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;">${
            pic && sender.picture === "mark"
              ? `<img class="e-store-logo" src="${esc(pic)}" alt="" height="36" style="display:block;height:36px;width:auto;max-width:120px;border:0;outline:none;border-radius:8px;">`
              : pic
                ? `<img class="e-avatar" src="${esc(pic)}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:18px;object-fit:cover;border:0;background-color:${K.line};">`
                : tile(name, 36, 10, theme)
          }</td><td class="e-mark" style="vertical-align:middle;padding-left:10px;font-family:${EMAIL_FONT};font-size:16px;line-height:22px;font-weight:700;color:${K.ink};">${esc(name)}</td></tr></table>`
    left = url ? `<a href="${esc(url)}" target="_blank" style="text-decoration:none;color:${K.ink};">${mark}</a>` : mark
  }
  const right = aside
    ? `<td align="right" valign="middle" style="vertical-align:middle;padding-left:12px;white-space:nowrap;"><p class="e-ink" style="${P(13, 18, K.ink, "font-weight:600;text-align:right;")}">${esc(aside.title)}</p>${
        aside.sub ? `<p class="e-muted" style="${P(12, 18, K.muted, "text-align:right;")}">${esc(aside.sub)}</p>` : ""
      }</td>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td valign="middle" style="vertical-align:middle;">${left}</td>${right}</tr></table>`
}

function footerHtml(sender: EmailSender, f: EmailFooter | undefined): string {
  const parts: string[] = []
  const line = (html: string, size = 13) => `<p class="e-foot" style="${P(size, size === 13 ? 20 : 18, K.muted, "margin:0 0 8px 0;")}">${html}</p>`
  for (const l of f?.lines ?? []) if (l) parts.push(line(l))
  if (f?.reason) parts.push(line(esc(f.reason)))
  const links = (f?.links ?? []).filter((l) => l.url)
  if (links.length) {
    parts.push(
      line(links.map((l) => `<a href="${esc(l.url)}" target="_blank" style="color:${K.muted};text-decoration:underline;">${esc(l.label)}</a>`).join(` &nbsp;&middot;&nbsp; `)),
    )
  }
  if (f?.legal) parts.push(line(esc(f.legal), 12))
  if (sender.kind === "storelib") parts.push(line(`<a href="${esc(homeOf(sender))}" target="_blank" style="color:${K.muted};text-decoration:none;font-weight:600;">Storelib</a>`, 12))
  return parts.join("\n")
}

/** The whole email as one HTML document. */
export function emailDocument(input: EmailDocumentInput): string {
  const theme = emailTheme(input.sender)
  const rows = Array.isArray(input.rows) ? input.rows.filter(Boolean).join("\n") : input.rows
  const foot = footerHtml(input.sender, input.footer)
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(input.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${STYLE}
</style>
</head>
<body class="e-bg" style="margin:0;padding:0;background-color:${K.page};word-spacing:normal;" bgcolor="${K.page}">
${preheader(input.preview)}
<div role="article" aria-roledescription="email" aria-label="${esc(input.subject)}" lang="en" class="e-bg" style="background-color:${K.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-bg" bgcolor="${K.page}" style="width:100%;background-color:${K.page};">
<tr><td align="center" class="e-outer" style="padding:40px 24px 48px;">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-body" style="width:100%;max-width:560px;margin:0 auto;">
<tr><td style="padding:0 0 32px 0;">${header(input.sender, theme, input.aside)}</td></tr>
<tr><td style="font-family:${EMAIL_FONT};word-break:break-word;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${rows}
</table>
</td></tr>
<tr><td style="padding:16px 0 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="e-line" style="border-top:1px solid ${K.line};padding:24px 0 0 0;">
${foot}
</td></tr></table>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`
}

/* ------------------------------------------------------------------------ */
/*  Plain text                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The plain text part: blocks joined by a blank line, nulls left out, and a
 * footer after "--". Every link written out by whoever builds the blocks.
 */
export function emailText(blocks: (string | null | undefined | false)[], footer: (string | null | undefined | false)[] = []): string {
  const body = blocks.filter((b): b is string => typeof b === "string" && b.trim() !== "").map((b) => b.replace(/\s+$/g, ""))
  const foot = footer.filter((b): b is string => typeof b === "string" && b.trim() !== "")
  return [...body, ...(foot.length ? [["--", ...foot].join("\n")] : [])].join("\n\n") + "\n"
}

/* ------------------------------------------------------------------------ */
/*  A plain Storelib email, the short way                                    */
/* ------------------------------------------------------------------------ */

export interface PlatformEmailInput {
  subject: string
  /** The inbox's preview line. The first paragraph when left out. */
  preview?: string | null
  heading: string
  /** A small label above the heading: "Security notice". */
  label?: string | null
  labelColor?: string
  /** Optional: something the email is about (a store, a product), drawn as a small card under the heading. */
  media?: { title: string; subtitle?: string | null; imageUrl?: string | null; round?: boolean } | null
  /**
   * The words. A string is a plain paragraph; { html, text } is a paragraph
   * with trusted markup (an identity() address, a bold name) and its plain
   * text twin for the text part.
   */
  paragraphs: (string | { html: string; text: string })[]
  code?: { value: string; caption?: string | null } | null
  facts?: EmailFact[] | null
  /** Paragraphs after the quote, code, facts and notice, just before the button. */
  closing?: (string | { html: string; text: string })[]
  /** Somebody's own message, quoted. */
  quote?: { text: string; by?: string | null } | null
  action?: EmailLink | null
  /** Write the button's address out under it, for a link someone may need to paste. Default: true when there is an action. */
  fallback?: boolean
  /** A quiet link under the button. */
  secondary?: EmailLink | null
  notice?: { title?: string | null; text: string; tone?: NoticeTone; link?: EmailLink | null } | null
  /** A small grey line at the end: "The link works for 7 days." */
  note?: string | null
  /** Why the reader got this. */
  reason?: string | null
  footerLinks?: EmailLink[]
  homeUrl?: string | null
}

/** A Storelib email from a few plain pieces: the HTML and the plain text part, drawn together. */
export function platformEmail(input: PlatformEmailInput): { subject: string; html: string; text: string } {
  const k = emailKit({ kind: "storelib", homeUrl: input.homeUrl })
  const paraHtml = (p: PlatformEmailInput["paragraphs"][number]) => (typeof p === "string" ? k.text(p) : k.html(p.html))
  const paraText = (p: PlatformEmailInput["paragraphs"][number]) => (typeof p === "string" ? p : p.text)
  const first = input.paragraphs[0]
  const preview = input.preview ?? (first ? paraText(first) : input.heading)
  const showFallback = input.action ? input.fallback !== false : false
  const rows = [
    k.heading(input.heading, { label: input.label, labelColor: input.labelColor }),
    input.media ? k.media(input.media) : "",
    ...input.paragraphs.map(paraHtml),
    input.quote ? k.quote(input.quote.text, input.quote.by) : "",
    input.code ? k.code(input.code.value, input.code.caption) : "",
    input.facts?.length ? k.facts(input.facts) : "",
    input.notice ? k.notice(input.notice) : "",
    ...(input.closing ?? []).map(paraHtml),
    input.action ? k.button(input.action.label, input.action.url) : "",
    input.secondary ? k.link(input.secondary.label, input.secondary.url) : "",
    showFallback && input.action ? k.fallback(input.action.url) : "",
    input.note ? k.small(input.note) : "",
  ]
  const html = emailDocument({
    sender: { kind: "storelib", homeUrl: input.homeUrl },
    subject: input.subject,
    preview,
    rows,
    footer: { reason: input.reason, links: input.footerLinks },
  })
  const text = emailText(
    [
      input.label ? `${input.label}: ${input.heading}` : input.heading,
      input.media ? [input.media.title, input.media.subtitle].filter(Boolean).join("\n") : null,
      ...input.paragraphs.map(paraText),
      input.quote ? `${input.quote.text}${input.quote.by ? `\n${input.quote.by}` : ""}` : null,
      input.code ? [input.code.value, input.code.caption].filter(Boolean).join("\n") : null,
      input.facts?.length ? input.facts.map((f) => `${f.label}: ${f.value}`).join("\n") : null,
      input.notice ? [input.notice.title, input.notice.text, input.notice.link ? `${input.notice.link.label}: ${input.notice.link.url}` : null].filter(Boolean).join("\n") : null,
      ...(input.closing ?? []).map(paraText),
      input.action ? `${input.action.label}:\n${input.action.url}` : null,
      input.secondary ? `${input.secondary.label}: ${input.secondary.url.replace(/^mailto:/, "")}` : null,
      input.note,
    ],
    ["Storelib", input.reason, ...(input.footerLinks ?? []).map((l) => `${l.label}: ${l.url}`)],
  )
  return { subject: input.subject, html, text }
}
