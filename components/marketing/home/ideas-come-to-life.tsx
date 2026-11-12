"use client"

import { Pause, Play } from "lucide-react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { FRAME_CSS, MockFrame } from "./showcase-mocks/frame"
import { ONEPAGE_CSS } from "./showcase-mocks/onepage-mock"
import { COMMUNITY_CSS } from "./showcase-mocks/community-mock"
import {
  BUILDER_CSS,
  BUILDER_DURATION_MS,
  CommunityBuilderMock,
  OnePageEditorMock,
  WebsiteBuilderMock,
} from "./showcase-mocks/builder-mocks"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

export const IDEAS_HEADING = "See your ideas come to life."

export const IDEAS_TABS = [
  {
    id: "website",
    label: "Website",
    more: " builder",
    title: "Website builder",
    text: "Drag in a section, edit right on the page, publish when it feels right.",
    alt: "Storelib's website builder: a section tree on the left, the Brush & Bloom course site on the canvas, and section settings on the right, as a Testimonials section is dragged onto the page.",
    Mock: WebsiteBuilderMock,
  },
  {
    id: "onepage",
    label: "OnePage",
    more: " editor",
    title: "OnePage editor",
    text: "Change the whole look in one tap. Your links, products and blocks stay put.",
    alt: "Storelib's OnePage editor: the Theme panel beside a live phone preview of Maya Okafor's page, switching from the Linen theme to Midnight.",
    Mock: OnePageEditorMock,
  },
  {
    id: "community",
    label: "Community",
    more: " builder",
    title: "Community builder",
    text: "Write once and every member hears about it: posts, spaces, courses and events in one place.",
    alt: "Storelib's community builder for Kiln & Clay Collective: a new post is written and published, appears at the top of the feed, and 1,204 members are notified.",
    Mock: CommunityBuilderMock,
  },
] as const

/** Section 4: pill tabs over large, live previews of Storelib's own builders. */
export function IdeasComeToLife() {
  const t = useAutoTabs(IDEAS_TABS.length)
  const active = IDEAS_TABS[t.index]
  return (
    <section
      ref={t.rootRef}
      className="ideas"
      data-story-section="ideas"
      data-ideas=""
      data-run={t.run || undefined}
      aria-labelledby="ideas-title"
    >
      <style>{FRAME_CSS + ONEPAGE_CSS + COMMUNITY_CSS + BUILDER_CSS + CSS}</style>
      <div className="ideas-in">
        <div className="ideas-head">
          <StoryHeading id="ideas-title" text={IDEAS_HEADING} accent={["life"]} dark />
          <p>Every Storelib builder shows you the real thing while you make it. No previews to refresh, no code, nothing to guess.</p>
        </div>
        <div className="ideas-controls">
          <div className="ideas-tabs" role="tablist" aria-label="Storelib builders">
            {IDEAS_TABS.map((tab, i) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`ideas-tab-${tab.id}`}
                aria-controls={`ideas-panel-${tab.id}`}
                aria-selected={i === t.index}
                tabIndex={i === t.index ? 0 : -1}
                className="ideas-tab"
                onClick={() => t.select(i)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                  e.preventDefault()
                  const to = (i + (e.key === "ArrowRight" ? 1 : -1) + IDEAS_TABS.length) % IDEAS_TABS.length
                  t.select(to)
                  document.getElementById(`ideas-tab-${IDEAS_TABS[to].id}`)?.focus()
                }}
              >
                {tab.label}
                <span className="ideas-more">{tab.more}</span>
                {i === t.index && t.playing && (
                  <span
                    key={t.index}
                    className="ideas-progress"
                    style={{ animationDuration: `${BUILDER_DURATION_MS}ms` }}
                    onAnimationEnd={t.advance}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
          {!t.reduce && (
            <button
              type="button"
              className="ideas-pause"
              aria-label={t.playing ? "Pause the tour" : "Play the tour"}
              onClick={() => t.setPlaying(!t.playing)}
            >
              {t.playing ? <Pause /> : <Play />}
            </button>
          )}
        </div>
        <div className="ideas-stage" {...t.hoverProps}>
          {IDEAS_TABS.map((tab, i) => {
            const state = t.states.get(i)
            if (!state) return null
            const { Mock } = tab
            return (
              <div
                key={tab.id}
                id={`ideas-panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`ideas-tab-${tab.id}`}
                aria-hidden={state !== "active" || undefined}
                className="ideas-panel"
                data-state={state}
                data-mock-live={(state === "active" && t.live) || undefined}
              >
                <MockFrame label={tab.alt} className="ideas-mock">
                  <Mock />
                </MockFrame>
              </div>
            )
          })}
        </div>
        <p className="ideas-caption" key={active.id}>
          <b>{active.title}.</b> {active.text}
        </p>
      </div>
    </section>
  )
}

const CSS = `
.ideas{position:relative;background:#000;color:#fafafa;border-radius:clamp(28px,4vw,56px);overflow:clip}
.ideas-in{max-width:1400px;margin:0 auto;padding:clamp(64px,8vw,120px) var(--landing-gutter,clamp(22px,6vw,96px))}
.ideas-head{max-width:880px}
.ideas-head .story-heading{font-size:clamp(36px,5vw,72px)}
.ideas-head p{max-width:56ch;margin:20px 0 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#a3a0ac;text-wrap:pretty}
.ideas-controls{display:flex;align-items:center;gap:10px;margin:clamp(32px,4vw,48px) 0 20px}
.ideas-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.ideas-tab{position:relative;height:44px;padding:0 20px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.72);font:500 15px/1 var(--font-inter),Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer;overflow:hidden;transition:background-color .35s cubic-bezier(.2,.7,.2,1),color .35s}
.ideas-tab:hover{color:#fff}
.ideas-tab[aria-selected="true"]{background:#fff;color:#0b0b0c}
.ideas-tab:focus-visible,.ideas-pause:focus-visible{outline:2px solid #bca3ff;outline-offset:3px}
.ideas-progress{position:absolute;left:20px;right:20px;bottom:7px;height:2px;border-radius:2px;background:linear-gradient(90deg,#7c3aed,#4f6bff);transform:scaleX(0);transform-origin:left;animation:ideas-progress linear both paused}
.ideas[data-run] .ideas-progress{animation-play-state:running}
@keyframes ideas-progress{to{transform:scaleX(1)}}
.ideas-pause{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;transition:background-color .2s}
.ideas-pause:hover{background:rgba(255,255,255,.16)}
.ideas-pause svg{width:16px;height:16px}
.ideas-stage{position:relative;display:grid;padding:clamp(14px,3.2vw,48px);border-radius:clamp(22px,2.6vw,32px);background:radial-gradient(70% 90% at 15% 0%,rgba(124,58,237,.42),transparent 70%),radial-gradient(60% 80% at 100% 100%,rgba(79,107,255,.34),transparent 70%),#0e0d14;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.ideas-panel{grid-area:1/1;border-radius:clamp(12px,1.4vw,16px);overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 30px 80px rgba(0,0,0,.5);transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .6s cubic-bezier(.2,.7,.2,1)}
.ideas-panel[data-state="active"]{z-index:2}
.ideas-panel[data-state="leaving"]{z-index:1}
.ideas-panel[data-state="next"]{z-index:0;opacity:0;visibility:hidden;transition:none}
.ideas-panel[data-state="active"]{animation:ideas-in .6s cubic-bezier(.2,.7,.2,1) both}
@keyframes ideas-in{from{opacity:0;transform:translate3d(0,14px,0) scale(.99)}}
.ideas-mock{aspect-ratio:16/10;background:#fff}
.ideas-caption{max-width:62ch;margin:22px 0 0;font-size:16px;line-height:1.55;color:#a3a0ac;animation:ideas-fade .5s ease both}
.ideas-caption b{color:#fafafa;font-weight:600}
@keyframes ideas-fade{from{opacity:0}}
@media(max-width:767px){
  .ideas{border-radius:28px}
  .ideas-head .story-heading{font-size:clamp(32px,9vw,40px)}
  .ideas-more{display:none}
  .ideas-tab{padding:0 16px;font-size:14px}
  .ideas-progress{left:16px;right:16px}
  .ideas-mock{aspect-ratio:11/16}
  .ideas-stage{padding:12px}
}
@media(max-width:380px){.ideas-tab{padding:0 13px}}
@media(prefers-reduced-motion:reduce){.ideas-panel,.ideas-caption{animation:none!important;transition:none!important}}
`
