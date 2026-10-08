/**
 * ===========================================================================
 *  THE SITE'S INTRO, AND HOW ONE PAGE HANDS OVER TO THE NEXT
 * ===========================================================================
 * Theme settings › Animations. Two things a creator can switch on for their
 * live site:
 *
 * THE INTRO. A screen in the site's own colour with their mark on it: a
 * video, a GIF or picture, or their logo (the store name in type when there
 * is none). It plays, then lifts away. Once per visit, or on every page load.
 * A tap skips it.
 *
 * Pages are cached and shared by every visitor, so whether this visitor has
 * already seen it is decided in the browser, by the small script drawn just
 * before the screen: it runs as the page is read, before the first paint,
 * and marks <html> with data-sl-intro. The screen is display:none until that
 * mark says otherwise, so a page whose script never ran shows no intro rather
 * than one stuck on top of it.
 *
 * PAGE TRANSITIONS. Links between a site's pages are ordinary page loads, so
 * the handover is the browser's own view transition between documents
 * (@view-transition), which both pages opt into because both are drawn here.
 * A browser without it simply loads the next page.
 *
 * Neither is drawn in the builder's canvas or the cover screenshot: ThemePage
 * draws this only when the page has a creator and is not in the editor.
 * Visitors who ask for less motion get the intro without movement, and a
 * plain page change.
 */
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s]+\)|[a-z]+)$/i
const MEDIA = /^(https:\/\/|\/(?!\/))[^"'<>\s]+$/i

const INTRO_STYLES = ["fade", "grow", "rise", "reveal"] as const
const PAGE_TRANSITIONS = ["none", "fade", "slide", "rise"] as const

function pick<T extends readonly string[]>(value: unknown, list: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? value : fallback
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

function media(value: unknown): string {
  return typeof value === "string" && MEDIA.test(value.trim()) ? value.trim() : ""
}

export interface IntroSettings {
  enabled: boolean
  video: string
  image: string
  name: string
  background: string
  style: (typeof INTRO_STYLES)[number]
  duration: number
  size: number
  repeat: "session" | "always"
}

/** What the Animations group says about the intro, checked, since theme settings arrive unvalidated. */
export function introSettings(theme: ThemeSettingsValues): IntroSettings {
  const t = theme as Record<string, unknown>
  const background = typeof t.intro_background === "string" && COLOUR.test(t.intro_background.trim()) ? t.intro_background.trim() : "#ffffff"
  return {
    enabled: t.intro_enabled === true,
    video: media(t.intro_video),
    /* Their own picture or GIF, else the logo from Logo and brand. */
    image: media(t.intro_image) || media(t.logo_url),
    name: typeof t.brand_name === "string" ? t.brand_name.trim().slice(0, 60) : "",
    background,
    style: pick(t.intro_style, INTRO_STYLES, "grow"),
    duration: clamp(t.intro_duration, 800, 6000, 1800),
    size: clamp(t.intro_size, 60, 480, 160),
    repeat: t.intro_repeat === "always" ? "always" : "session",
  }
}

/** The page transition from the Animations group, or null for none. */
export function pageTransition(theme: ThemeSettingsValues): { kind: Exclude<(typeof PAGE_TRANSITIONS)[number], "none">; ms: number } | null {
  const t = theme as Record<string, unknown>
  const kind = pick(t.page_transition, PAGE_TRANSITIONS, "none")
  if (kind === "none") return null
  return { kind, ms: clamp(t.page_transition_duration, 150, 800, 300) }
}

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)"
const OUT_MS = 450

/** Ink that reads on the intro's background: near white on a dark one, the page's ink on a light one. */
function inkOn(background: string): string {
  const hex = background.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return "var(--theme-text,#0f172a)"
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4 ? "#ffffff" : "#0f172a"
}

function introCss(s: IntroSettings): string {
  const arrive = Math.round(s.duration * 0.5)
  const leave = s.style === "reveal"
    ? `html[data-sl-intro="out"] .sl-intro{translate:0 -100%;transition:translate ${OUT_MS}ms cubic-bezier(0.7,0,0.2,1)}`
    : `html[data-sl-intro="out"] .sl-intro{opacity:0;transition:opacity ${OUT_MS}ms ease}`
  return [
    `.sl-intro{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:${s.background};cursor:pointer}`,
    `html[data-sl-intro="on"] .sl-intro,html[data-sl-intro="out"] .sl-intro{display:flex}`,
    `html[data-sl-intro="on"]{overflow:hidden}`,
    leave,
    `.sl-intro__mark{display:block;width:${s.size}px;max-width:72vw;max-height:72vh;height:auto;object-fit:contain;animation:sl-intro-${s.style} ${arrive}ms ${EASE} both}`,
    `.sl-intro__name{margin:0;padding:0 24px;font-weight:700;font-size:clamp(28px,6vw,56px);line-height:1.1;font-family:var(--theme-font-heading,ui-sans-serif),ui-sans-serif,system-ui,sans-serif;letter-spacing:-0.02em;text-align:center;color:${inkOn(s.background)};animation:sl-intro-${s.style} ${arrive}ms ${EASE} both}`,
    `@keyframes sl-intro-fade{from{opacity:0}to{opacity:1}}`,
    `@keyframes sl-intro-grow{from{opacity:0;scale:0.82}to{opacity:1;scale:1}}`,
    `@keyframes sl-intro-rise{from{opacity:0;translate:0 28px}to{opacity:1;translate:0 0}}`,
    `@keyframes sl-intro-reveal{from{opacity:0;scale:0.94}to{opacity:1;scale:1}}`,
    `@media (prefers-reduced-motion: reduce){.sl-intro__mark,.sl-intro__name{animation:none}html[data-sl-intro="out"] .sl-intro{translate:none;opacity:0;transition:opacity 150ms linear}}`,
  ].join("\n")
}

/**
 * Before the first paint: seen already this visit (and once per visit asked
 * for), nothing; otherwise the screen, which leaves after its time, when a
 * video ends, or on a tap.
 */
function introScript(s: IntroSettings, key: string): string {
  const k = JSON.stringify(`sl-intro:${key}`)
  return `(function(){var d=document.documentElement;try{if(${s.repeat === "session"}&&sessionStorage.getItem(${k})){d.setAttribute("data-sl-intro","done");return}sessionStorage.setItem(${k},"1")}catch(e){}d.setAttribute("data-sl-intro","on");var gone=false;function done(){if(gone)return;gone=true;d.setAttribute("data-sl-intro","out");setTimeout(function(){d.setAttribute("data-sl-intro","done")},${OUT_MS + 50})}setTimeout(done,${s.video ? s.duration + 4000 : s.duration});document.addEventListener("DOMContentLoaded",function(){var el=document.querySelector(".sl-intro");if(!el)return;el.addEventListener("click",done);var v=el.querySelector("video");if(v){v.addEventListener("ended",done);v.addEventListener("error",done)}})})();`
}

function transitionCss(t: { kind: "fade" | "slide" | "rise"; ms: number }): string {
  const timing = `animation-duration:${t.ms}ms;animation-timing-function:${EASE}`
  const motion =
    t.kind === "slide"
      ? `::view-transition-old(root){animation-name:sl-page-out-side}::view-transition-new(root){animation-name:sl-page-in-side}@keyframes sl-page-out-side{to{opacity:0;translate:-4% 0}}@keyframes sl-page-in-side{from{opacity:0;translate:4% 0}}`
      : t.kind === "rise"
        ? `::view-transition-old(root){animation-name:sl-page-out-fade}::view-transition-new(root){animation-name:sl-page-in-rise}@keyframes sl-page-out-fade{to{opacity:0}}@keyframes sl-page-in-rise{from{opacity:0;translate:0 18px}}`
        : ""
  return [
    `@view-transition{navigation:auto}`,
    `::view-transition-old(root),::view-transition-new(root){${timing}}`,
    motion,
    `@media (prefers-reduced-motion: reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}`,
  ].join("\n")
}

/** The intro screen and the page transition for a live page. Nothing when neither is on. */
export function SiteIntro({ theme, siteKey }: { theme: ThemeSettingsValues; siteKey: string }) {
  const intro = introSettings(theme)
  const transition = pageTransition(theme)
  if (!intro.enabled && !transition) return null
  const key = siteKey.replace(/[^\w-]/g, "").slice(0, 64) || "site"
  return (
    <>
      {transition ? <style dangerouslySetInnerHTML={{ __html: transitionCss(transition) }} /> : null}
      {intro.enabled ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: introCss(intro) }} />
          <script dangerouslySetInnerHTML={{ __html: introScript(intro, key) }} />
          <div className="sl-intro" aria-hidden="true" data-sl-intro-screen="">
            {intro.video ? (
              <video className="sl-intro__mark" src={intro.video} autoPlay muted playsInline preload="auto" />
            ) : intro.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sl-intro__mark" src={intro.image} alt="" decoding="sync" fetchPriority="high" />
            ) : intro.name ? (
              <p className="sl-intro__name">{intro.name}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  )
}
