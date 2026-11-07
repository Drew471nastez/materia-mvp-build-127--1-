/**
 * ===========================================================================
 *  THE ONEPAGE'S BLOCK ICONS: ONE SET, DRAWN FOR IT
 * ===========================================================================
 * The blocks list and the Add block sheet used whatever lucide icon was
 * nearest: a share arrow for Social Icons, a stack of layers for Group, the
 * same page for a PDF, a menu and a Google Doc, and a coloured brand mark
 * beside a grey one. These are drawn for the OnePage on one 24px grid: one
 * stroke (1.6), round ends and joins, no fills, so every row reads at the
 * same weight. They take `currentColor`; the tile they sit on (BlockTile)
 * is the soft grey square the rest of Storelib uses, with the icon in the
 * near black of the page's text.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export type GlyphProps = { className?: string; style?: React.CSSProperties }
export type Glyph = React.ComponentType<GlyphProps>

function glyph(name: string, body: React.ReactNode): Glyph {
  const G = ({ className, style }: GlyphProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      data-glyph={name}
      className={className}
      style={style}
    >
      {body}
    </svg>
  )
  G.displayName = `Glyph(${name})`
  return G
}

export const GlyphLink = glyph("link", (
  <>
    <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-.8.8" />
    <path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l.8-.8" />
  </>
))

/** The profile at the top: a face in a card. */
export const GlyphHeader = glyph("header", (
  <>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5" />
    <circle cx="12" cy="10" r="2.6" />
    <path d="M7.6 17.2a4.9 4.9 0 0 1 8.8 0" />
  </>
))

/** A row of round icons. */
export const GlyphSocial = glyph("social", (
  <>
    <circle cx="5.5" cy="12" r="2.25" />
    <circle cx="12" cy="12" r="2.25" />
    <circle cx="18.5" cy="12" r="2.25" />
  </>
))

/** Cards held together. */
export const GlyphGroup = glyph("group", (
  <>
    <rect x="4" y="9" width="16" height="11" rx="3" />
    <path d="M6.5 6h11" />
    <path d="M9 3.25h6" />
  </>
))

/** A price tag. */
export const GlyphProduct = glyph("product", (
  <>
    <path d="M3.75 12.4V5.75a2 2 0 0 1 2-2h6.65l7.85 7.85a2 2 0 0 1 0 2.83l-5.82 5.82a2 2 0 0 1-2.83 0z" />
    <circle cx="8.25" cy="8.25" r="1.35" />
  </>
))

/** An open book. */
export const GlyphCourse = glyph("course", (
  <>
    <path d="M12 6.6C10.4 5.2 8 4.6 4 4.6v13.1c4 0 6.4.6 8 2 1.6-1.4 4-2 8-2V4.6c-4 0-6.4.6-8 2z" />
    <path d="M12 6.6v13.1" />
  </>
))

/** A day with a booking in it. */
export const GlyphBooking = glyph("booking", (
  <>
    <rect x="4" y="5.25" width="16" height="15" rx="3.25" />
    <path d="M8.25 3.25v4" />
    <path d="M15.75 3.25v4" />
    <path d="M4 10.25h16" />
    <path d="m9.5 15.1 1.8 1.75 3.3-3.4" />
  </>
))

export const GlyphEmail = glyph("email", (
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
    <path d="m4.75 8 7.25 5.25L19.25 8" />
  </>
))

/** A speech bubble with lines: a message to the creator. */
export const GlyphContact = glyph("contact", (
  <>
    <path d="M5.25 4.75h13.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H11l-4.75 3.5v-3.5h-1a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2z" />
    <path d="M8 9.5h8" />
    <path d="M8 12.75h5" />
  </>
))

/** Quotation marks. */
export const GlyphTestimonials = glyph("testimonials", (
  <>
    <path d="M5 17.5c2.6-.6 4.25-2.6 4.25-5.5V7H5v5h4.25" />
    <path d="M14.75 17.5c2.6-.6 4.25-2.6 4.25-5.5V7h-4.25v5H19" />
  </>
))

/** Lines of a paragraph. */
export const GlyphText = glyph("text", (
  <>
    <path d="M5 6.5h14" />
    <path d="M5 11h14" />
    <path d="M5 15.5h14" />
    <path d="M5 20h8" />
  </>
))

/** A bold title line over a lighter one. */
export const GlyphHeading = glyph("heading", (
  <>
    <path d="M6 5v9" />
    <path d="M14 5v9" />
    <path d="M6 9.5h8" />
    <path d="M5 19h14" />
  </>
))

export const GlyphImage = glyph("image", (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.25 17.5 4.6-4.5 3.4 3.3 2.5-2.4 4.95 4.7" />
  </>
))

export const GlyphVideo = glyph("video", (
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="3.5" />
    <path d="M10.4 9.6v4.8l4.1-2.4z" />
  </>
))

/** Two notes on a beam. */
export const GlyphMusic = glyph("music", (
  <>
    <path d="M9 17.75V6.5l10-2v11" />
    <circle cx="6.75" cy="17.75" r="2.25" />
    <circle cx="16.75" cy="15.5" r="2.25" />
  </>
))

/** A gap: a dashed line. */
export const GlyphDivider = glyph("divider", (
  <>
    <path d="M3.75 12h3" />
    <path d="M10.5 12h3" />
    <path d="M17.25 12h3" />
    <path d="M7 6.5h10" opacity=".45" />
    <path d="M7 17.5h10" opacity=".45" />
  </>
))

/** A page with a folded corner. */
export const GlyphDocument = glyph("document", (
  <>
    <path d="M7 3.5h6.75L18.5 8.25V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
    <path d="M13.5 3.75v4.75h4.75" />
    <path d="M8.75 13h6.5" />
    <path d="M8.75 16.5h4.25" />
  </>
))

/** A fork and a knife. */
export const GlyphMenu = glyph("menu", (
  <>
    <path d="M7.75 3.5v17" />
    <path d="M5 3.5v4.25a2.75 2.75 0 0 0 5.5 0V3.5" />
    <path d="M17.5 20.5v-17c-2.1 1.1-3.25 3.5-3.25 6.75 0 1.9 1.1 3 3.25 3" />
  </>
))

export const GlyphMap = glyph("map", (
  <>
    <path d="M12 20.75s-6.5-5.4-6.5-10.75a6.5 6.5 0 0 1 13 0c0 5.35-6.5 10.75-6.5 10.75z" />
    <circle cx="12" cy="10" r="2.35" />
  </>
))

export const GlyphFaq = glyph("faq", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 0 1 4.85.85c0 1.7-2.45 2.1-2.45 3.6" />
    <path d="M12 16.9v.01" />
  </>
))

export const GlyphCountdown = glyph("countdown", (
  <>
    <circle cx="12" cy="13.5" r="7" />
    <path d="M12 10v3.5l2.25 1.6" />
    <path d="M10 3.5h4" />
    <path d="M12 3.5v3" />
  </>
))

/** A plug: a service of the creator's own, connected. */
export const GlyphIntegration = glyph("integration", (
  <>
    <path d="M9 3.5v4" />
    <path d="M15 3.5v4" />
    <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z" />
    <path d="M12 16v4.5" />
  </>
))

/** Two arrows turning: signups kept in step with an email tool. */
export const GlyphSync = glyph("sync", (
  <>
    <path d="M19.5 9.5A7.75 7.75 0 0 0 5.6 7.4L4.5 8.75" />
    <path d="M4.5 4.75v4h4" />
    <path d="M4.5 14.5a7.75 7.75 0 0 0 13.9 2.1l1.1-1.35" />
    <path d="M19.5 19.25v-4h-4" />
  </>
))

/** A link with a store front: the creator's own shop elsewhere. */
export const GlyphStore = glyph("store", (
  <>
    <path d="M4.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V9.5" />
    <path d="M3.5 9.25 5.4 4.5h13.2l1.9 4.75a2.6 2.6 0 0 1-4.25 2.1 2.6 2.6 0 0 1-4.25 0 2.6 2.6 0 0 1-4.25 0 2.6 2.6 0 0 1-4.25-2.1z" />
    <path d="M10 20.5v-4.75h4v4.75" />
  </>
))

/** A microphone: a podcast. */
export const GlyphPodcast = glyph("podcast", (
  <>
    <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
    <path d="M5.75 11a6.25 6.25 0 0 0 12.5 0" />
    <path d="M12 17.25v3.25" />
  </>
))

/** A chat bubble: a message app. */
export const GlyphChat = glyph("chat", (
  <>
    <path d="M12 20.25a8.25 8.25 0 1 0-7.3-4.4L3.75 20.25l4.4-.95A8.2 8.2 0 0 0 12 20.25z" />
  </>
))

/**
 * THE TILE A BLOCK'S ICON SITS ON, the same in the list and in the sheet: a
 * soft grey square, the icon in near black at the centre.
 */
export function BlockTile({ icon: Icon, size = "md", className, children }: { icon?: Glyph | null; size?: "sm" | "md" | "lg"; className?: string; children?: React.ReactNode }) {
  const box = size === "sm" ? "h-8 w-8 rounded-[9px]" : size === "lg" ? "h-11 w-11 rounded-[12px]" : "h-10 w-10 rounded-[11px]"
  const mark = size === "sm" ? "h-[17px] w-[17px]" : size === "lg" ? "h-[21px] w-[21px]" : "h-5 w-5"
  return (
    <span data-block-tile="" className={cn("grid shrink-0 place-items-center bg-[#f2f2f4] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(17,17,19,0.04)]", box, className)}>
      {children ?? (Icon ? <Icon className={mark} /> : null)}
    </span>
  )
}

/* ─── Round AL: the app blocks' own glyphs, and the round tile ────────── */

/** A price tag: an affiliate product. */
export const GlyphTag = glyph("tag", (
  <>
    <path d="M3.75 12.6V5.25a1.5 1.5 0 0 1 1.5-1.5h7.35l7.65 7.65a1.5 1.5 0 0 1 0 2.1l-6.15 6.15a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8.25" cy="8.25" r="1.35" />
  </>
))

/** An open hand under a coin: tips. */
export const GlyphTip = glyph("tip", (
  <>
    <circle cx="14.5" cy="6.25" r="2.5" />
    <path d="M3.75 15.5h2.5l3.6-1.6a2 2 0 0 1 1.8.1l2.1 1.2a1.2 1.2 0 0 1-.6 2.25H10" />
    <path d="M13 17.45h3.2l3.4-2.6a1.3 1.3 0 0 1 1.65 2l-3.9 3.15a2 2 0 0 1-1.25.45H6.25l-2.5-.75" />
  </>
))

/** A phone: a mobile app. */
export const GlyphPhone = glyph("phone", (
  <>
    <rect x="6.75" y="2.75" width="10.5" height="18.5" rx="2.6" />
    <path d="M10.75 18h2.5" />
  </>
))

/** A ticket: events and tours. */
export const GlyphTicket = glyph("ticket", (
  <>
    <path d="M3.75 8.25a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5h10.5A1.5 1.5 0 0 1 18.75 6v.75a1.5 1.5 0 0 0 1.5 1.5v7.5a1.5 1.5 0 0 0-1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H6.75A1.5 1.5 0 0 1 5.25 18v-.75a1.5 1.5 0 0 0-1.5-1.5z" />
    <path d="M14.25 4.5v15" strokeDasharray="1.6 2.2" />
  </>
))

/** Three bars: stats. */
export const GlyphStats = glyph("stats", (
  <>
    <path d="M5.25 19.5v-6" />
    <path d="M12 19.5v-15" />
    <path d="M18.75 19.5v-9.75" />
  </>
))

/** Options, one chosen: a poll. */
export const GlyphPoll = glyph("poll", (
  <>
    <rect x="3.75" y="4.5" width="16.5" height="4.5" rx="2.25" />
    <rect x="3.75" y="15" width="10.5" height="4.5" rx="2.25" />
    <path d="M6.25 6.75h7" />
  </>
))

/** A card with a face: contact details. */
export const GlyphContactCard = glyph("contact-card", (
  <>
    <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3" />
    <circle cx="8.75" cy="11" r="2.1" />
    <path d="M5.75 16.25a3.4 3.4 0 0 1 6 0" />
    <path d="M14.5 10h3.75M14.5 13.5h2.5" />
  </>
))

/** A cloud with an arrow down: a digital product. */
export const GlyphDownload = glyph("download", (
  <>
    <path d="M7.5 17.25H6.75a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.6 1.46 3.75 3.75 0 0 1-.25 7.5h-.75" />
    <path d="M12 11.25v8.25m-3-3 3 3 3-3" />
  </>
))

/** A box: a product that ships. */
export const GlyphBox = glyph("box", (
  <>
    <path d="M12 3 20.25 7.5v9L12 21 3.75 16.5v-9z" />
    <path d="M3.75 7.5 12 12l8.25-4.5M12 12v9" />
  </>
))

/** Two people: a community or a group chat. */
export const GlyphPeople = glyph("people", (
  <>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.75 19a5.25 5.25 0 0 1 10.5 0" />
    <path d="M15.5 5.75a3 3 0 0 1 0 5.5M17.25 14.25a5.25 5.25 0 0 1 3 4.75" />
  </>
))

/** A star in a circle: a membership. */
export const GlyphStar = glyph("star", (
  <>
    <path d="m12 3.75 2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.55 7 19.2l.95-5.6L3.9 9.65l5.6-.8z" />
  </>
))

/** Two fields and a button: a form. */
export const GlyphForm = glyph("form", (
  <>
    <rect x="4.5" y="3.75" width="15" height="4.5" rx="1.5" />
    <rect x="4.5" y="10.25" width="15" height="4.5" rx="1.5" />
    <path d="M4.5 19.25h7" />
  </>
))

/** Lines and a button under them: text and a button. */
export const GlyphTextButton = glyph("text-button", (
  <>
    <path d="M4.5 5.25h15M4.5 9h10.5" />
    <rect x="4.5" y="13.5" width="15" height="5.25" rx="2.6" />
  </>
))

/* The app blocks' marks that are ours, not a company's (lib/onepage/app-blocks APP_PROVIDERS mark). */
export const APP_GLYPHS: Record<string, Glyph> = {
  tag: GlyphTag,
  tip: GlyphTip,
  phone: GlyphPhone,
  ticket: GlyphTicket,
  stats: GlyphStats,
  poll: GlyphPoll,
  contact: GlyphContactCard,
  mail: GlyphEmail,
  text: GlyphTextButton,
}

/**
 * ROUND AL, THE ADD BLOCK SHEET'S ROUND TILE (the owner: "I don't like that
 * they're light gray ... more colour and different with the specific
 * icons", and Linktree's list as the picture). A circle filled with the
 * entry's own colour and its mark on it, in white or near black, whichever
 * reads (`ink`). `size` is the circle's diameter.
 */
export function RoundTile({ color, ink, size = 44, children, className, style }: { color: string; ink: string; size?: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      data-round-tile=""
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background: color, color: ink, ...style }}
    >
      {children}
    </span>
  )
}
