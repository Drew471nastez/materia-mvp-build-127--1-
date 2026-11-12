import type { ReactNode } from "react"
import { MOTION_STYLE_PRECEDENCE } from "./use-motion-gate"

/**
 * A status pill with a living dot: two pulse rings breathe out from it and a
 * tiny satellite orbits it. Pure CSS keyframes on transform and opacity, no
 * JavaScript, so it can sit in a server component. Inside the landing story
 * (data-story-continuous) it pauses offscreen and in background tabs; reduced
 * motion leaves the dot still.
 */
export function OrbitBadge({
  children,
  tone = "light",
  color = "violet",
  className = "",
}: {
  children: ReactNode
  tone?: "light" | "dark" | "glass"
  color?: "violet" | "green" | "red"
  className?: string
}) {
  return (
    <span className={`ob-root ${className}`} data-tone={tone} data-color={color}>
      <style href="w12-orbit-badge" precedence={MOTION_STYLE_PRECEDENCE}>{ORBIT_BADGE_CSS}</style>
      <span className="ob-core" aria-hidden="true">
        <span className="ob-ring" data-story-continuous="" />
        <span className="ob-ring ob-ring-late" data-story-continuous="" />
        <span className="ob-orbit" data-story-continuous="">
          <span className="ob-sat" />
        </span>
        <span className="ob-dot" />
      </span>
      <span className="ob-label">{children}</span>
    </span>
  )
}

export const ORBIT_BADGE_CSS = `
.ob-root{--ob-c:#7c3aed;--ob-bg:#fff;--ob-ink:#18181b;--ob-line:rgba(24,24,27,.08);display:inline-flex;align-items:center;gap:9px;padding:7px 13px 7px 9px;border-radius:999px;background:var(--ob-bg);color:var(--ob-ink);box-shadow:0 0 0 1px var(--ob-line),0 8px 24px -12px rgba(24,24,27,.28);font-size:12.5px;font-weight:500;line-height:1.2;white-space:nowrap}
.ob-root[data-tone="dark"]{--ob-bg:#151517;--ob-ink:#f4f4f5;--ob-line:rgba(255,255,255,.1)}
.ob-root[data-tone="glass"]{--ob-bg:rgba(12,12,14,.55);--ob-ink:#fff;--ob-line:rgba(255,255,255,.16);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.ob-root[data-color="green"]{--ob-c:#16a34a}
.ob-root[data-color="red"]{--ob-c:#ef4444}
.ob-core{position:relative;display:inline-block;width:14px;height:14px;flex:none}
.ob-dot{position:absolute;inset:3px;border-radius:999px;background:var(--ob-c)}
.ob-ring{position:absolute;inset:3px;border-radius:999px;background:var(--ob-c);opacity:0;animation:ob-pulse 2.4s cubic-bezier(.2,.7,.3,1) infinite}
.ob-ring-late{animation-delay:1.2s}
.ob-orbit{position:absolute;inset:-3px;animation:ob-spin 3.6s linear infinite}
.ob-sat{position:absolute;top:0;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:999px;background:var(--ob-c);opacity:.75}
@keyframes ob-pulse{0%{transform:scale(1);opacity:.45}100%{transform:scale(2.9);opacity:0}}
@keyframes ob-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.ob-ring,.ob-orbit{animation:none!important}.ob-ring{opacity:0}}
`
