/**
 * A member link's icon (round 26): the lucide mark for each name a link may
 * carry (lib/communities/member-links.ts MEMBER_LINK_ICONS), drawn by the
 * Page editor's list and by the member side's shortcuts. A link with no icon
 * draws the plain link mark where a mark is wanted, or nothing.
 */
import { BookOpen, Calendar, FileText, Gift, Globe, GraduationCap, Headphones, Link2, MessageCircle, ShoppingBag, Star, Video, type LucideIcon } from "lucide-react"
import type { MemberLinkIcon as IconName } from "@/lib/communities/member-links"

export const MEMBER_LINK_ICON: Record<IconName, LucideIcon> = {
  link: Link2,
  globe: Globe,
  "shopping-bag": ShoppingBag,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  calendar: Calendar,
  video: Video,
  "file-text": FileText,
  "message-circle": MessageCircle,
  headphones: Headphones,
  gift: Gift,
  star: Star,
}

export function MemberLinkIcon({ name, className, fallback = true }: { name: IconName | null; className?: string; /** Draw the plain link mark when the link has none. */ fallback?: boolean }) {
  const Icon = name ? MEMBER_LINK_ICON[name] : fallback ? Link2 : null
  if (!Icon) return null
  return <Icon aria-hidden className={className} strokeWidth={2} />
}
