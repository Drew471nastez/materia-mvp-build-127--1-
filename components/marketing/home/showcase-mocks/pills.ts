/*
  THE SHOWCASE PILLS (wave 13, the owner): light, smooth, clean, a Polaris-like
  light grey. A grey track, each tab a 44px pill; the chosen one is white with
  a hairline and a soft bevel under it. No progress bar or loading line in
  them: autoplay runs on .smk-clock, an invisible CSS animation beside them
  (use-auto-tabs.ts), paused unless the section sets data-run.
  Shared by sections 4 (ideas) and 6 (business), added to <head> once.
*/
export const PILLS_CSS = `
.smk-pills{display:inline-flex;gap:2px;max-width:100%;padding:4px;border-radius:999px;background:#f1f1f1;box-shadow:inset 0 0 0 1px #e6e6e6}
.smk-pill{position:relative;flex:none;height:44px;padding:0 20px;border:0;border-radius:999px;background:transparent;color:#616161;font:500 15px/1 var(--font-inter,Inter),Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .2s ease,color .2s ease,box-shadow .2s ease}
.smk-pill:hover{background:#e7e7e7;color:#303030}
.smk-pill[aria-selected="true"]{background:#fff;color:#303030;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 1px 1px rgba(0,0,0,.06),inset 0 -1px 0 rgba(0,0,0,.07)}
.smk-pill:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
.smk-clock{position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none}
.smk-clock[data-on]{animation:smk-clock 1s linear both paused}
@keyframes smk-clock{to{opacity:0}}
@media(max-width:767px){.smk-pill{padding:0 16px;font-size:14px}}
@media(max-width:380px){.smk-pill{padding:0 13px}}
@media(prefers-reduced-motion:reduce){.smk-pill{transition:none}}
`
