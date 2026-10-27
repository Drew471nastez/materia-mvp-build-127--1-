/**
 * The page's side of a section script asking for another section
 * (scripts/check-section-scroll-bridge.mjs): the product's own
 * SectionSandboxProvider and useSectionScript, a page root with a sticky
 * header and tall sections, and two sections whose scripts ask, one with
 * storelib.scrollToSection and one with storelib.navigate("/#section-…").
 * ?editor=1 draws it in a canvas scroller (#wb-preview-root), as the
 * builder does; otherwise the window scrolls, as the live page.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { SectionSandboxProvider, useSectionScript } from "@/components/website-builder/sections/section-sandbox"

const editor = new URLSearchParams(location.search).has("editor")
const ASK = `(function (root, settings, blocks, theme, page, storelib) {
  root.querySelector("[data-ask]").addEventListener("click", function () { storelib.scrollToSection(settings.to); });
  var nav = root.querySelector("[data-nav]");
  if (nav) nav.addEventListener("click", function () { storelib.navigate && storelib.navigate(settings.path); });
})`

function Section({ id, height, script, settings, caps }: { id: string; height: number; script?: boolean; settings?: Record<string, unknown>; caps?: string[] }) {
  const [el, setEl] = React.useState<HTMLElement | null>(null)
  /* One markup for the page and for the script's copy of it (the guest walks the same elements). */
  const markup = `<div><h2 style="margin:0">${id}</h2>${script ? '<button data-ask="">ask</button>' : ""}${script && settings?.path ? '<button data-nav="">nav</button>' : ""}</div>`
  const section = React.useMemo(() => (script ? { id, html: markup, bundle: ASK, settings: settings ?? {}, blocks: [], theme: {}, page: {}, capabilities: caps ?? [] } : null), [id, script, settings, caps, markup])
  useSectionScript(section, el)
  return (
    <div data-section="" data-section-box="" data-section-key={id} data-anchor={`section-${id}`} id={editor ? `wb-section-${id}` : `section-${id}`} style={{ height, borderTop: "1px solid #ddd" }}>
      <div ref={setEl} dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  )
}

function Page() {
  const page = (
    <div data-storelib-theme="">
      <div data-section="" data-chrome="" style={{ position: "sticky", top: 0, height: 64, background: "#fff", zIndex: 2 }}>header</div>
      <Section id="intro" height={300} script settings={{ to: "benefits" }} />
      <Section id="gallery" height={1400} />
      <Section id="benefits" height={500} />
      <Section id="faq" height={300} script settings={{ to: "nope_not_here", path: "/#section-benefits" }} caps={["navigation"]} />
      <Section id="evil" height={300} script settings={{ to: "x\"]),body{display:none}/*" }} />
      <Section id="tail" height={1600} />
    </div>
  )
  return (
    <SectionSandboxProvider inEditor={editor}>
      {editor ? <div id="wb-preview-root" style={{ position: "fixed", inset: 0, overflowY: "auto" }}>{page}</div> : page}
    </SectionSandboxProvider>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
