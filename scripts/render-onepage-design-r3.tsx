/**
 * Round 3 (design options and block layouts): the harness for
 * scripts/check-onepage-design-r3.mjs.
 *
 *   ?weights   every family the Design tab offers, each weight option of the
 *              name and the bio drawn with the page's own type style
 *              (lib/onepage/header-style titleTypeStyle, bioTypeStyle) and
 *              the page's own font links (components/onepage/onepage-fonts)
 *   ?before    Inter from the stylesheet the page asked for before this
 *              round (400 to 700 only), the name at Bold and Heavy
 *   (else)     the live page's own component; the probe calls
 *              window.__r3Render(theme, blocks, preview) and waits for
 *              window.__r3Drawn. `preview` builds the page as the editor's
 *              preview frame does (publicOnePageFromDraft), else as /l/<slug>.
 */
import React from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePageFonts } from "@/components/onepage/onepage-fonts"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { ONEPAGE_FONTS, fontStack, realWeight } from "@/lib/onepage/fonts"
import { bioTypeStyle, titleTypeStyle } from "@/lib/onepage/header-style"
import { defaultSettings, defaultTheme, type OnePageBlock } from "@/lib/onepage/types"
import { publicOnePage, publicOnePageFromDraft } from "@/lib/onepage/public-shape"

const q = new URLSearchParams(location.search)
const root = createRoot(document.getElementById("app")!)
const TITLE = [400, 500, 700, 800]
const BIO = [400, 500, 700]

/** The options the Design tab offers for a family: one per weight the face really draws (components/onepage/tabs/design-tab TypeRows). */
const offered = (family: string, options: number[]) => {
  const seen = new Set<number>()
  return options.filter((w) => {
    const r = realWeight(family, w)
    if (seen.has(r)) return false
    seen.add(r)
    return true
  })
}

if (q.has("weights")) {
  const families = Object.keys(ONEPAGE_FONTS)
  ;(window as unknown as { __families: unknown }).__families = families.map((f) => ({ family: f, title: offered(f, TITLE), bio: offered(f, BIO) }))
  root.render(
    <div style={{ padding: 16, background: "#fff", color: "#111" }}>
      {families.map((family) => (
        <div key={family} style={{ marginBottom: 8 }}>
          <OnePageFonts theme={{ font_family: fontStack(family) }} />
          {TITLE.map((w) => (
            <h1 key={`t${w}`} className="font-bold" data-w-family={family} data-w-which="title" data-w-option={w} data-w-expected={realWeight(family, w)} style={{ fontFamily: fontStack(family), fontSize: 40, whiteSpace: "nowrap", margin: 0, ...titleTypeStyle({ font_family: fontStack(family), title_weight: w }) }}>
              <span>Satori Studio</span>
            </h1>
          ))}
          {BIO.map((w) => (
            <p key={`b${w}`} data-w-family={family} data-w-which="bio" data-w-option={w} data-w-expected={realWeight(family, w)} style={{ fontFamily: fontStack(family), fontSize: 24, whiteSpace: "nowrap", margin: 0, ...bioTypeStyle({ font_family: fontStack(family), bio_weight: w }) }}>
              <span>Prints, posters and a newsletter</span>
            </p>
          ))}
        </div>
      ))}
    </div>,
  )
} else if (q.has("before")) {
  root.render(
    <div style={{ padding: 16 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      {[700, 800].map((w) => (
        <h1 key={w} data-before={w} style={{ fontFamily: "'Inter', sans-serif", fontWeight: w, fontSize: 40, whiteSpace: "nowrap", margin: 0 }}>
          <span>Satori Studio</span>
        </h1>
      ))}
    </div>,
  )
} else {
  let caseNo = 0
  const row = (theme: Record<string, unknown>, blocks: OnePageBlock[]) => ({
    id: "op_r3",
    owner_id: "probe-user",
    slug: "satori",
    title: "Satori Studio",
    bio: "Prints, posters and a newsletter",
    avatar_url: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#c9a27e"/></svg>')}`,
    theme,
    published_theme: theme,
    settings: defaultSettings,
    social_links: {},
    draft_blocks: blocks,
    published_blocks: blocks,
    status: "published",
    seller_id: "seller_r3",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  })
  const render = (theme: string | Record<string, unknown>, blocks: OnePageBlock[], preview: boolean) => {
    const tpl = typeof theme === "string" ? THEME_TEMPLATES.find((x) => x.id === theme) : null
    const t = tpl ? { ...tpl.theme_config, template_id: tpl.id } : typeof theme === "string" ? {} : theme
    const r = row({ ...defaultTheme, ...t }, blocks) as never
    ;(window as unknown as { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = preview
    const shape = preview ? publicOnePageFromDraft(r) : publicOnePage(r, { source: "published" })
    const n = ++caseNo
    flushSync(() => root.render(<PublicOnePage key={n} onepage={shape as never} />))
    ;(window as unknown as { __r3Drawn: number }).__r3Drawn = n
    return n
  }
  Object.assign(window, { __r3Render: render, __r3Themes: THEME_TEMPLATES.map((t) => t.id) })
}
