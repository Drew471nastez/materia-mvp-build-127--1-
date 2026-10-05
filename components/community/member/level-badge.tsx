import type { HTMLAttributes } from "react"

/**
 * A member's level on their face when the community counts points (gamification).
 * A small squared mark on the avatar's rim: white, a hairline, soft shadow, not a
 * heavy ink disc.
 */
export function LevelBadge({
  level,
  size = "sm",
  className = "",
  ...rest
}: { level: number; size?: "sm" | "md"; className?: string } & HTMLAttributes<HTMLSpanElement>) {
  const box =
    size === "md"
      ? "absolute -bottom-0.5 -right-0.5 h-[19px] min-w-[19px] px-1 text-[10.5px]"
      : "absolute -bottom-px -right-px h-[15px] min-w-[15px] px-0.5 text-[9px]"
  return (
    <span
      {...rest}
      className={`pointer-events-none flex items-center justify-center rounded-[5px] border border-[#e3e5e9]/90 bg-white/95 font-semibold tabular-nums leading-none text-[#4b5563] shadow-[0_1px_2px_rgba(16,24,40,0.07)] ring-2 ring-white backdrop-blur-[3px] supports-[backdrop-filter]:bg-white/90 ${box} ${className}`}
      aria-label={rest["aria-label"] ?? `Level ${level}`}
      data-level-badge=""
    >
      {level}
    </span>
  )
}
