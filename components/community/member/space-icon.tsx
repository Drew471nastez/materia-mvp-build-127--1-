"use client"

/**
 * A space's icon: the emoji the creator chose, or one of the few line icons
 * a space can name (the defaults are messages-square, megaphone and hand).
 * Anything else is a plain hash.
 */
import { BookOpen, Hand, Hash, Lightbulb, Megaphone, MessageCircle, MessagesSquare, Sparkles, Trophy } from "lucide-react"

const ICONS = {
  "messages-square": MessagesSquare,
  "message-circle": MessageCircle,
  megaphone: Megaphone,
  hand: Hand,
  "book-open": BookOpen,
  lightbulb: Lightbulb,
  sparkles: Sparkles,
  trophy: Trophy,
} as const

export function SpaceIcon({ icon, kind, className = "h-[17px] w-[17px]" }: { icon: string | null; kind?: string; className?: string }) {
  const value = (icon || "").trim()
  if (value && !/^[a-z0-9-]+$/i.test(value)) {
    return (
      <span aria-hidden className="inline-flex w-[18px] justify-center text-[15px] leading-none">
        {Array.from(value).slice(0, 2).join("")}
      </span>
    )
  }
  const Icon = ICONS[value as keyof typeof ICONS] ?? (kind === "chat" ? MessageCircle : kind === "announcements" ? Megaphone : Hash)
  return <Icon aria-hidden className={className} strokeWidth={1.75} />
}
