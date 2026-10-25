/**
 * ===========================================================================
 *  A SECTION STILL ON ITS WAY HOLDS BACK WHAT COMES AFTER IT, NOT THE PAGE
 * ===========================================================================
 * Every lazily fetched section is drawn inside its own <Suspense>
 * (components/website-builder/sections/lazy-section.tsx). React writes a
 * finished boundary out of place once the page before it passes about 12KB
 * (react-dom/server's progressiveChunkSize; on a published page the theme's
 * inline styles alone pass it): an empty <template id="B:n"> where the
 * section goes, the section at the end of the document, and a script that
 * moves it in a moment later, batched with the others. On six of seven live
 * front pages the phone painted that first state, the footer straight under
 * the hero, and then moved it a screen down: a layout shift of 0.49 to 0.56
 * (scripts/check-site-perf-r12.mjs, which names what moved).
 *
 * So, while a section's place is still that empty template, everything after
 * it is laid out but not shown. Nothing that is shown moves, and the page
 * above it paints as early as it did. Only where scripts run: without them
 * the script that moves the section in never runs, and the rest of the page
 * stays visible as before.
 */
/*
 * A safety net: if a section never arrives (a stream cut off, a timeout),
 * what follows it is shown anyway after 3 seconds, so a page can never stay
 * half hidden. The animation only runs while the rule matches; once the
 * section is moved in, the rule no longer applies and nothing animates.
 */
export const STREAMED_SECTIONS_CSS =
  '@keyframes sl-streamed-reveal{to{visibility:visible}}@media (scripting: enabled){[id^="section-"]:has(> template[id^="B:"]) ~ *{visibility:hidden;animation:sl-streamed-reveal 0s 3s forwards}}'
