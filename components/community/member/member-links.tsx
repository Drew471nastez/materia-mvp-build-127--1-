"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY'S MEMBER LINKS, AS SHORTCUTS (round 26)
 * ===========================================================================
 * Up to four links the creator keeps for members (lib/communities/
 * member-link-view.ts), drawn as quiet lines of text, not buttons:
 *
 *   column  the left column on a computer, under the community card and
 *           its faces (shell-frame.tsx)
 *   menu    the account menu opened from the member's own picture in the
 *           bar, under their name, where the left column is not shown (a
 *           tablet: from 768px to 1023px)
 *   sheet   the same, in the phone's account sheet, under their name
 *
 * A path (a course, a product, a page in the community) opens here and its
 * own page decides who may see it; any other address opens in a new tab.
 * A press is counted (once per member, link and day) by a beacon that does
 * not hold the link up: navigator.sendBeacon, else a keepalive fetch.
 *
 * The links only ever reach this from the member frame's server read
 * (lib/communities/server/member-shortcuts.ts), for a member or staff.
 */
import Link from "next/link"
import { ArrowUpRight, BookOpen, Calendar, FileText, Gift, Globe, GraduationCap, Headphones, Heart, Link2, Mail, MessageCircle, Music, Package, PlayCircle, ShoppingBag, Star, Ticket, Users, Video, type LucideIcon } from "lucide-react"
import { memberLinkClickPath, type MemberLinkView } from "@/lib/communities/member-link-view"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"

/** The icons a link may carry, by name. A name not here (or none) draws the plain link mark when another link has an icon, so the words still line up. */
const ICONS: Record<string, LucideIcon> = {
  link: Link2,
  "link-2": Link2,
  globe: Globe,
  "shopping-bag": ShoppingBag,
  package: Package,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  calendar: Calendar,
  video: Video,
  "play-circle": PlayCircle,
  "file-text": FileText,
  "message-circle": MessageCircle,
  mail: Mail,
  music: Music,
  headphones: Headphones,
  users: Users,
  heart: Heart,
  star: Star,
  gift: Gift,
  ticket: Ticket,
}

/** Tell the server about a press without holding up the link: a beacon, else a keepalive fetch, never awaited. */
export function countMemberLinkPress(communityId: string, linkId: string): void {
  const url = memberLinkClickPath(communityId, linkId)
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, new Blob(["{}"], { type: "application/json" }))) return
  } catch {
    /* Fall through to fetch. */
  }
  try {
    void fetch(url, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined)
  } catch {
    /* A press that could not be counted still opens its link. */
  }
}

const ROW: Record<MemberLinksVariant, string> = {
  column: "h-8 gap-2.5 rounded-lg px-2.5 text-[13.5px]",
  menu: "h-9 gap-2.5 rounded-lg px-3 text-[13.5px]",
  sheet: "min-h-[40px] gap-3 rounded-xl px-3 text-[15px]",
}

export type MemberLinksVariant = "column" | "menu" | "sheet"

export function MemberLinks({ communityId, links, variant, onPick, className }: { communityId: string; links: MemberLinkView[]; variant: MemberLinksVariant; /** After a press (the menu or the sheet closes). */ onPick?: () => void; className?: string }) {
  if (links.length === 0) return null
  const anyIcon = links.some((l) => l.icon && ICONS[l.icon])
  const menu = variant === "menu"
  return (
    <nav aria-label={tt("Community links")} className={cn("min-w-0", className)} data-member-links={variant}>
      {variant === "column" ? <p className="px-2.5 pb-1 text-[12px] font-medium leading-5 text-[#6b7280]">{tt("Links")}</p> : null}
      <ul className="flex flex-col" role={menu ? "none" : undefined}>
        {links.map((l) => {
          const Icon = (l.icon && ICONS[l.icon]) || Link2
          const row = cn(
            "group/member-link flex w-full min-w-0 items-center text-[#4b5563] outline-none transition-colors duration-150 hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:bg-[#f1f2f4] focus-visible:text-[#1a1a2e] active:bg-[#f1f2f4] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
            ROW[variant],
          )
          const inner = (
            <>
              {anyIcon ? <Icon aria-hidden className={cn("shrink-0 text-[#6b7280]", variant === "sheet" ? "h-[18px] w-[18px]" : "h-[15px] w-[15px]")} strokeWidth={1.8} /> : null}
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              {l.external ? (
                <>
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#6b7280] opacity-70 transition-opacity duration-150 group-hover/member-link:opacity-100" strokeWidth={1.8} />
                  <span className="sr-only"> ({tt("opens in a new tab")})</span>
                </>
              ) : null}
            </>
          )
          const press = () => {
            countMemberLinkPress(communityId, l.id)
            onPick?.()
          }
          return (
            <li key={l.id} className="min-w-0" role={menu ? "none" : undefined}>
              {l.external ? (
                <a href={l.href} target="_blank" rel="noopener noreferrer" onClick={press} role={menu ? "menuitem" : undefined} className={row} data-member-link={l.id} data-native-nav="">
                  {inner}
                </a>
              ) : (
                <Link href={l.href} onClick={press} role={menu ? "menuitem" : undefined} className={row} data-member-link={l.id}>
                  {inner}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
