"use client"

/**
 * ===========================================================================
 *  YOUR AI TOOLS WORK HERE TOO (home, after Connect your favorite apps)
 * ===========================================================================
 * The owner, landing round: a white section with one dark rounded card, the
 * marks of the AI tools people already use on the left with a short line and
 * a button, and on the right a terminal where an agent builds a Storelib site
 * through its tools.
 *
 * WHAT IT SAYS IS WHAT STORELIB DOES. A creator connects Claude Code, Codex
 * or any MCP client (Cursor, GitHub Copilot) to one site from Website
 * settings › Connections (lib/agent-access/setup-commands, mcp.storelib.com).
 * The terminal calls the real tools by their real names (lib/agent-access/mcp:
 * storelib_read_project, storelib_create_page, storelib_create_section,
 * storelib_create_safe_patch, storelib_update_styles, storelib_run_tests,
 * storelib_run_preview), and it ends where a connection ends: every change is
 * a draft, and the creator publishes (an agent cannot). The button goes to
 * the page that explains it, /developers/ai, at "Connect an agent directly".
 *
 * THE MARKS are each company's published single colour mark (Simple Icons,
 * as components/website-builder/connection-marks draws Claude's and
 * OpenAI's), drawn inline so they stay sharp at any size. Claude keeps its
 * own orange; the rest are white on the card.
 *
 * THE TERMINAL IS ALL CSS. Every line is in the markup from the start, so the
 * box never changes size; each line fades and rises in on its own keyframes
 * (opacity and transform only, written below from SCRIPT), the prompt is
 * typed by a cover that steps aside (a transform), and the whole run loops
 * on one clock. It runs only while the card is on screen and the tab is
 * visible (data-live, set by one IntersectionObserver), and under reduced
 * motion it is drawn finished and still.
 *
 * LANDING ROUND 5, THE OWNER: "like how it was before, not with the page
 * preview. Just the code terminal." This is the card as it was before round
 * 4 (commit 971429ade), keeping two round 4 details that have nothing to do
 * with the preview: the terminal starts about a quarter written (every
 * animation shares a negative delay, AI_TOOLS_START_S), and its words
 * cannot be selected.
 *
 * LANDING ROUND 7, THE OWNER: every section as wide as the showcase under
 * the hero. The card sits in the page's one width (--home-edge and
 * --home-max, app/globals.css), its edges on the showcase's.
 *
 * LANDING ROUND 9, THE OWNER: "on mobile devices the terminal's height is
 * too big; reduce it a little" and the line under the heading "has too much
 * text; reduce it by 35%". Under 640px the terminal leaves out one tool call
 * and its answer (the lines marked `phone: false`) and its lines sit a
 * little closer (line height 1.62, was 1.75): 16 lines, not 18. The lines
 * after the gap get their own keyframes there (ait-m*), 1.2s earlier, so
 * the run keeps its beat. The line is 12 words, was 22.
 */
import type { CSSProperties } from "react"
import type { SectionStyle } from "./lazy-section"
import Link from "next/link"
import { useEffect, useRef } from "react"
import { StoryHeading } from "../story-heading"
import { LIVE_AHEAD } from "./platform-motion"

/** One run of the terminal, in seconds, then it starts again. */
const LOOP_S = 16
/** How long a line takes to fade in. */
const IN_S = 0.32
/**
 * Where the clock stands when the card first comes on screen (landing round
 * 4, the owner: the terminal starts about a quarter written, not empty).
 * Every animation shares this negative delay, so the run stays in step.
 */
export const AI_TOOLS_START_S = 3.7

type Kind = "prompt" | "say" | "call" | "ok" | "done" | "rest"
interface Line {
  kind: Kind
  text: string
  /** When it appears, in seconds from the start of the run. */
  at: number
  /** false: left out under 640px, where the terminal is shorter (landing round 9). */
  phone?: false
}

const PROMPT = "Make a homepage for my print shop"
const TYPED_S = 1.7

/** What the agent does, in order: the creator's ask, then the tools it calls and what each answered. */
export const AI_TOOLS_SCRIPT: readonly Line[] = [
  { kind: "prompt", text: PROMPT, at: 0 },
  { kind: "say", text: "Reading your site first.", at: 2.1 },
  { kind: "call", text: "storelib_read_project()", at: 2.8 },
  { kind: "ok", text: "2 pages, 8 products, 1 theme", at: 3.3 },
  { kind: "call", text: 'storelib_create_page("Home")', at: 4 },
  { kind: "ok", text: "/home, with header and footer", at: 4.5 },
  { kind: "call", text: "storelib_create_section(hero)", at: 5.2 },
  { kind: "ok", text: "checked and saved as a draft", at: 5.7 },
  { kind: "call", text: "storelib_create_safe_patch(3 ops)", at: 6.4 },
  { kind: "ok", text: "products, story, newsletter", at: 6.9 },
  { kind: "call", text: "storelib_update_styles(theme)", at: 7.6, phone: false },
  { kind: "ok", text: "cream background, ink buttons", at: 8.1, phone: false },
  { kind: "call", text: "storelib_run_tests(home)", at: 8.8 },
  { kind: "ok", text: "contrast and limits pass", at: 9.3 },
  { kind: "call", text: "storelib_run_preview(home)", at: 10 },
  { kind: "ok", text: "preview ready at 390 and 1440", at: 10.5 },
  { kind: "done", text: "Home is a draft, ready to publish.", at: 11.3 },
  { kind: "rest", text: "", at: 11.9 },
]

const pct = (s: number) => `${Math.min(100, (s / LOOP_S) * 100).toFixed(2)}%`

/**
 * Each line's own keyframes: hidden until its moment, in over IN_S, held,
 * and out with the rest just before the run starts again.
 */
function lineKeyframes(i: number, at: number, name = `ait-l${i}`) {
  const hide = "opacity:0;transform:translate3d(0,5px,0)"
  const show = "opacity:1;transform:translate3d(0,0,0)"
  const start = at === 0 ? "" : `0%,${pct(at)}{${hide}}`
  const first = at === 0 ? `0%,95.5%{${show}}` : `${pct(at + IN_S)},95.5%{${show}}`
  return `@keyframes ${name}{${start}${first}98.5%,100%{opacity:0;transform:translate3d(0,0,0)}}`
}

/** The lines a phone leaves out, and how much earlier each line after them appears there. */
const PHONE_FIRST = AI_TOOLS_SCRIPT.findIndex((l) => l.phone === false)
const PHONE_LAST = AI_TOOLS_SCRIPT.map((l) => l.phone === false).lastIndexOf(true)
const PHONE_EARLIER_S = AI_TOOLS_SCRIPT[PHONE_LAST + 1].at - AI_TOOLS_SCRIPT[PHONE_FIRST].at
/** How many lines the terminal shows under 640px. */
export const AI_TOOLS_PHONE_LINES = AI_TOOLS_SCRIPT.filter((l) => l.phone !== false).length
const PHONE_CSS = AI_TOOLS_SCRIPT.map((l, i) => (i > PHONE_LAST ? `  .ait-l${i}{animation-name:ait-m${i}}\n  ${lineKeyframes(i, +(l.at - PHONE_EARLIER_S).toFixed(2), `ait-m${i}`)}` : "")).filter(Boolean).join("\n")

const AI_CSS = `
.ait-wrap,[data-landing-story] .ait>.ait-wrap{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin:0 auto;padding:0 var(--home-edge,clamp(20px,5.15vw,84px))}
.ait-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(32px,4vw,56px);align-items:center;padding:clamp(26px,4.4vw,64px);border-radius:clamp(21px,2.4vw,31px);background:#0e0d12;background-image:linear-gradient(125deg,#0d0c10 0%,#100e16 46%,#1b1430 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 30px 60px -40px rgba(24,16,48,.55);color:#fff;overflow:hidden}
.ait-copy{min-width:0}
.ait-marks{display:flex;align-items:center;gap:clamp(16px,1.6vw,22px);margin:0 0 clamp(22px,2.4vw,30px);padding:0;list-style:none}
.ait-marks li{display:flex}
.ait-marks svg{display:block;width:clamp(24px,2.1vw,30px);height:clamp(24px,2.1vw,30px)}
.ait-card .ait-h{font-size:clamp(34px,4.1vw,60px)}
.ait-lede{max-width:40ch;margin:clamp(16px,1.6vw,22px) 0 0;font-size:clamp(16px,1.3vw,18px);line-height:1.6;color:#b9b6c3;text-wrap:pretty}
.ait-cta{display:inline-flex;align-items:center;gap:8px;height:50px;margin-top:clamp(24px,2.6vw,34px);padding:0 24px;border-radius:999px;background:#fff;color:#0b0b0c;font-size:15.5px;font-weight:600;transition:background-color .2s}
.ait-cta:hover{background:#ede9fe}
.ait-cta:focus-visible{outline:2px solid #bca3ff;outline-offset:3px}
.ait-cta svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.ait-cta:hover svg{transform:translateX(3px)}
.ait-term{--term-bg:#09080c;min-width:0;pointer-events:none;-webkit-user-select:none;user-select:none;border-radius:13px;background:var(--term-bg);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 24px 50px -30px rgba(0,0,0,.7);overflow:hidden}
.ait-bar{display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-bottom:1px solid rgba(255,255,255,.06)}
.ait-bar i{width:10px;height:10px;border-radius:50%;background:#2e2c35}
.ait-bar span{margin-left:8px;font:500 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#6f6c79}
.ait-body{padding:16px 18px 20px;font:13px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;color:#d6d4dd;white-space:pre-wrap;overflow-wrap:anywhere}
.ait-line{display:flex;gap:1ch;min-height:1.75em;animation-duration:${LOOP_S}s;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(.2,.7,.2,1);animation-fill-mode:both;animation-play-state:paused}
.ait-line>b{flex:none;font-weight:400}
.ait-line>span{min-width:0}
.ait-prompt>b{color:#bca3ff}
.ait-prompt{color:#fafafa}
.ait-say{margin-top:6px}
.ait-say>b,.ait-done>b{color:#e4e4e7}
.ait-call{color:#c9bdfb}
.ait-call>b{color:#8b5cf6}
.ait-ok{padding-left:2ch;color:#8f8c99}
.ait-ok>b{color:#7dd3a8}
.ait-done{margin-top:6px;color:#fafafa}
.ait-rest>b{color:#bca3ff}
.ait-typed{position:relative;display:inline-block;overflow:hidden;vertical-align:top}
.ait-cover{position:absolute;inset:0 -2px 0 0;background:var(--term-bg);animation:ait-type ${LOOP_S}s steps(${PROMPT.length},end) infinite both paused}
.ait-cover::before,.ait-caret{content:"";position:absolute;left:0;top:.28em;width:.56em;height:1.2em;background:#e4e4e7}
.ait-caret{position:relative;display:inline-block;top:.28em;vertical-align:top;margin-top:0;animation:ait-blink 1.1s steps(1,end) infinite paused}
@keyframes ait-type{0%{transform:translate3d(0,0,0)}${pct(TYPED_S)},100%{transform:translate3d(100%,0,0)}}
@keyframes ait-blink{0%{opacity:1}50%{opacity:0}}
.ait-line,.ait-cover{animation-delay:-${AI_TOOLS_START_S}s}
.ait-term[data-live] .ait-line,.ait-term[data-live] .ait-cover,.ait-term[data-live] .ait-caret{animation-play-state:running}
${AI_TOOLS_SCRIPT.map((l, i) => `.ait-l${i}{animation-name:ait-l${i}}\n${lineKeyframes(i, l.at)}`).join("\n")}
@media (min-width:1024px){
  .ait-card{grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr)}
}
@media (max-width:639px){
  .ait-body{padding:12px 14px 14px;font-size:11.5px;line-height:1.62}
  .ait-line{min-height:1.62em}
  .ait-nophone{display:none}
  .ait-bar{height:32px}
${PHONE_CSS}
  .ait-cta{align-self:stretch;justify-content:center;width:100%}
}
@media (prefers-reduced-motion:reduce){
  .ait-line{animation:none!important;opacity:1;transform:none}
  .ait-cover{display:none}
  .ait-caret{animation:none!important}
  .ait-cta,.ait-cta svg{transition:none}
}
`

export function AiToolsSection() {
  const term = useRef<HTMLDivElement>(null)

  /* Run the terminal only while it is on screen and the tab is visible. */
  useEffect(() => {
    const el = term.current
    if (!el || typeof IntersectionObserver === "undefined") return
    let seen = false
    const apply = () => {
      if (seen && !document.hidden) el.setAttribute("data-live", "")
      else el.removeAttribute("data-live")
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        seen = entry.isIntersecting
        apply()
      },
      /* Wave 17: running a screen before it arrives (it started once a share of it was on screen): it came in paused, and on an iPhone its moving parts were drawn frames after the rest. */
      { rootMargin: LIVE_AHEAD },
    )
    io.observe(el)
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [])

  return (
    <section className="ait" data-story-section="ai-tools" aria-labelledby="ait-title">
      <style href="w13-ai-tools" precedence="default">
        {AI_CSS}
      </style>
      <div className="ait-wrap">
        <div className="ait-card">
          <div className="ait-copy">
            <ul className="ait-marks" aria-label="Works with Claude, ChatGPT and Codex, Cursor and GitHub Copilot">
              {MARKS.map((m) => (
                <li key={m.name} title={m.name}>
                  <svg viewBox="0 0 24 24" fill={m.color} aria-hidden="true">
                    <path d={m.d} />
                  </svg>
                </li>
              ))}
            </ul>
            <StoryHeading id="ait-title" text="Your AI tools work here too" accent={["AI"]} dark className="ait-h" />
            <p className="ait-lede">Connect Claude Code, Codex or Cursor. Changes stay drafts until you publish.</p>
            <Link href="/developers/ai#connect-an-agent-directly" className="ait-cta">
              See how to connect
              <svg aria-hidden viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10h12M11 5l5 5-5 5" />
              </svg>
            </Link>
          </div>

          <div ref={term} className="ait-term" role="img" aria-label="An agent in a terminal builds a Storelib homepage: it reads the site, creates the page and its sections, sets the theme, runs the checks and leaves it as a draft to publish.">
            <div className="ait-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>claude · print-shop</span>
            </div>
            <div className="ait-body" aria-hidden="true">
              {AI_TOOLS_SCRIPT.map((l, i) => (
                <div key={i} className={`ait-line ait-${l.kind} ait-l${i}${l.phone === false ? " ait-nophone" : ""}`} style={{ "--i": i } as CSSProperties}>
                  <b>{GLYPH[l.kind]}</b>
                  {l.kind === "prompt" ? (
                    <span className="ait-typed">
                      {l.text}
                      <span className="ait-cover" />
                    </span>
                  ) : l.kind === "rest" ? (
                    <span className="ait-caret" />
                  ) : (
                    <span>{l.text}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const GLYPH: Record<Kind, string> = { prompt: "›", say: "●", call: "●", ok: "✓", done: "●", rest: "›" }

/** Each company's published single colour mark (Simple Icons), in a 24 unit box. */
const MARKS: { name: string; color: string; d: string }[] = [
  { name: "Claude", color: "#D97757", d: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" },
  { name: "ChatGPT and Codex", color: "#ffffff", d: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" },
  { name: "Cursor", color: "#ffffff", d: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" },
  { name: "GitHub Copilot", color: "#ffffff", d: "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" },
]

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const AI_TOOLS_STYLES: readonly SectionStyle[] = [{ href: "w13-ai-tools", precedence: "default", css: AI_CSS }]
