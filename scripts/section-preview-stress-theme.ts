/**
 * A store theme built to break the Add a section previews, for
 * scripts/check-section-preview-stress.mjs.
 *
 * 157 sections, the shape of the owner's imported theme: heroes and banners
 * with negative margins, announcement bars and marquees fixed to the top of
 * the window or wider than it, countdowns that animate, sections whose
 * children are placed far outside them, sticky bars, sections styled from the
 * body's classes, a font that arrives late and pictures with no size that
 * arrive later still. Every section prints its own revision (`rev N`) so the
 * probe can tell a stale picture from a current one after a push.
 *
 * The theme is converted the way an import is (lib/storelib-theme/shopify/convert.ts).
 */
import JSZip from "jszip"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"

export const SECTION_COUNT = 157

/** One kind of section: its name stem, its markup and its own style. */
type Kind = { stem: string; markup: (n: number, rev: number) => string; style: (n: number) => string }

const img = (n: number, w = 1200, h = 600) => `<img src="/img/${n}-${w}x${h}.svg" alt="">`

const KINDS: Kind[] = [
  {
    stem: "Hero banner",
    markup: (n, rev) => `<div class="hb hb-${n}"><div class="hb__media">${img(n, 1600, 700 + (n % 5) * 60)}</div><div class="hb__text"><p class="eyebrow">New collection</p><h1>Bold style. Big season. rev ${rev}</h1><a class="btn">Shop now</a></div></div>`,
    style: (n) => `.hb-${n}{position:relative;margin:-${40 + (n % 4) * 20}px 0 -${30 + (n % 3) * 30}px;min-height:${60 + (n % 3) * 10}vh;background:#f3f3f3}.hb-${n} .hb__media img{width:100%;display:block}.hb-${n} .hb__text{position:absolute;left:8%;top:30%;}.hb-${n} .hb__text h1{font-size:${48 + n % 20}px;margin:0 0 -${n % 30}px}`,
  },
  {
    stem: "Announcement bar",
    markup: (n, rev) => `<div class="ab ab-${n}"><p>Free shipping on orders over $99. rev ${rev}</p><button class="ab__x">x</button></div>`,
    style: (n) => `.ab-${n}{position:fixed;top:0;left:0;width:100vw;height:${40 + n % 3 * 8}px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;z-index:999999}.ab-${n} .ab__x{position:absolute;right:12px}`,
  },
  {
    stem: "Countdown timer",
    markup: (n, rev) => `{{ 'marketing-sections.css' | asset_url | stylesheet_tag }}<div class="cd cd-${n}"><p>Last call! Save 50% sitewide. Ends in</p><div class="cd__digits"><span>00</span><span>00</span><span>00</span></div><a class="btn">Shop now</a><small>rev ${rev}</small></div>`,
    style: (n) => `@keyframes cd-pulse-${n}{from{transform:translateY(-300px) scale(2)}to{transform:translateY(300px) scale(.5)}}.cd-${n}{padding:30px;text-align:center;animation:cd-pulse-${n} 1.2s infinite alternate!important;transform:translateY(-120px)}.cd-${n} .cd__digits span{display:inline-block;font-size:42px;margin:0 6px}`,
  },
  {
    stem: "Marquee",
    markup: (n, rev) => `<div class="mq mq-${n}"><div class="mq__track">${Array.from({ length: 8 }, () => `<span>50% OFF EVERYTHING SHOP AND SAVE</span><span>FREE SHIPPING ON ORDERS OVER $99</span>`).join("")}<span>rev ${rev}</span></div></div>`,
    style: (n) => `@keyframes mq-${n}{to{transform:translateX(-50%)}}.mq-${n}{overflow:visible;white-space:nowrap;padding:14px 0;border-block:1px solid #ddd;position:relative;left:-30vw;width:200vw}.mq-${n} .mq__track{display:inline-block;animation:mq-${n} 9s linear infinite!important}.mq-${n} span{margin:0 24px;font-weight:700}`,
  },
  {
    stem: "Image with text",
    markup: (n, rev) => `<div class="iwt iwt-${n}"><div class="iwt__media">${img(n, 800, 500 + (n % 7) * 40)}</div><div class="iwt__text"><h2>Spotlight on this season's bestseller rev ${rev}</h2><p>Discover what everyone is talking about.</p><a class="btn">Shop now</a></div><div class="iwt__badge">NEW</div></div>`,
    style: (n) => `.iwt-${n}{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:60px 5%;position:relative}.iwt-${n} img{width:100%;display:block}.iwt-${n} .iwt__badge{position:absolute;top:-${60 + n % 40}px;left:-${20 + n % 30}px;background:#ffd;padding:10px 20px;transform:rotate(-8deg) scale(1.6)}`,
  },
  {
    stem: "Sticky promo",
    markup: (n, rev) => `<div class="sp sp-${n}"><div class="sp__bar">Complimentary shipping over $400. rev ${rev}</div><div class="sp__body"><h2>Best product in town.</h2><p>Benefit one. Benefit two. Benefit three.</p></div></div>`,
    style: (n) => `.sp-${n}{position:relative;padding:0 0 80px}.sp-${n} .sp__bar{position:sticky;top:0;background:#000;color:#fff;padding:12px;text-align:center;z-index:50}.sp-${n} .sp__body{padding:40px 8%;height:${200 + n % 5 * 40}px}`,
  },
  {
    stem: "Testimonial",
    markup: (n, rev) => `<div class="ts ts-${n}"><blockquote>"Wear it your way. I love it." rev ${rev}</blockquote><cite>Customer ${n}</cite><div class="ts__glow"></div></div>`,
    style: (n) => `.ts-${n}{padding:50px 10%;text-align:center}.ts-${n} .ts__glow{position:absolute;inset:-400px;background:radial-gradient(circle,rgba(255,0,200,.35),transparent 60%);pointer-events:none}`,
  },
  {
    stem: "FAQ",
    markup: (n, rev) => `<div class="fq fq-${n}">${Array.from({ length: 3 + (n % 4) }, (_, i) => `<details open><summary>Question ${i + 1}</summary><p>An answer that is a few words long. rev ${rev}</p></details>`).join("")}</div>`,
    style: (n) => `.fq-${n}{padding:40px 12%}.fq-${n} details{border-bottom:1px solid #ddd;padding:12px 0}`,
  },
  {
    stem: "Featured product",
    markup: (n, rev) => `<div class="fp fp-${n}"><div class="fp__img">${img(n, 600, 600)}</div><div class="fp__info"><h3>Add to cart and checkout rev ${rev}</h3><button>Add to cart</button></div></div>`,
    style: (n) => `body.template-index .fp-${n}{display:flex;gap:30px;padding:${30 + n % 4 * 10}px 6%}body:not(.template-index) .fp-${n}{display:none}.fp-${n} img{width:${280 + n % 3 * 40}px}`,
  },
  {
    stem: "Logo list",
    markup: (n, rev) => `<div class="ll ll-${n}">${Array.from({ length: 6 }, (_, i) => `<span class="ll__logo">Brand ${i}</span>`).join("")}<span>rev ${rev}</span></div>`,
    style: (n) => `.ll-${n}{display:flex;justify-content:space-around;padding:30px 0;transform:scale(${1 + (n % 3) * 0.15});transform-origin:0 0}.ll-${n} .ll__logo{font-size:22px;opacity:.6}`,
  },
  {
    stem: "Slideshow",
    markup: (n, rev) => `<div class="ss ss-${n}"><div class="ss__slides">${[0, 1, 2].map((i) => `<div class="ss__slide">${img(n * 10 + i, 1400, 600)}<h2>Slide ${i + 1} rev ${rev}</h2></div>`).join("")}</div><button class="ss__pause">Pause gallery</button></div>`,
    style: (n) => `.ss-${n}{position:relative;overflow:hidden}.ss-${n} .ss__slides{display:flex;width:300%}.ss-${n} .ss__slide{width:33.333%;position:relative}.ss-${n} img{width:100%;display:block}.ss-${n} .ss__slide h2{position:absolute;left:10%;bottom:10%}.ss-${n} .ss__pause{position:fixed;bottom:20px;right:20px;z-index:2147483647}`,
  },
  {
    stem: "Newsletter",
    markup: (n, rev) => `<div class="nl nl-${n}"><h2>Join the list rev ${rev}</h2><form><input type="email" placeholder="Email" autofocus><button>Subscribe</button></form></div>`,
    style: (n) => `.nl-${n}{padding:60px 0;text-align:center;margin-top:-${n % 50}px;margin-bottom:${n % 70}px}`,
  },
  {
    stem: "Video banner",
    markup: (n, rev) => `<div class="vb vb-${n}"><div class="vb__frame"></div><h2>Real moments rev ${rev}</h2></div>`,
    style: (n) => `.vb-${n}{position:relative;height:100vh;max-height:${500 + n % 4 * 50}px}.vb-${n} .vb__frame{position:absolute;inset:0;background:#ccc;border-radius:40px;transform:translateY(${n % 2 ? -1 : 1}${60 + n % 40}px)}.vb-${n} h2{position:absolute;top:50%;width:100%;text-align:center}`,
  },
  {
    stem: "Rich text",
    markup: (n, rev) => `<div class="rt rt-${n}"><h2 class="rt__h">Wear it your way, every day of the week rev ${rev}</h2><p>${"Words that wrap differently once the font has loaded. ".repeat(2 + (n % 5))}</p></div>`,
    style: (n) => `.rt-${n}{padding:40px 10%;font-family:LateFont,serif}.rt-${n} .rt__h{font-size:${40 + n % 12}px}`,
  },
  {
    stem: "Promotion banner",
    markup: (n, rev) => `{{ 'marketing-sections.css' | asset_url | stylesheet_tag }}<div class="pb pb-${n}"><div class="pb__inner"><h2>Promotion ${n} rev ${rev}</h2><a class="btn">Shop now</a></div><div class="pb__overlay"></div></div>`,
    style: (n) => `.pb-${n}{position:relative;height:${300 + n % 6 * 30}px;background:#eef;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 80px #f0f)}.pb-${n} .pb__overlay{position:absolute;left:0;right:0;top:100%;height:600px;background:repeating-linear-gradient(45deg,#f0f3,#f0f3 10px,transparent 10px,transparent 20px)}`,
  },
  {
    stem: "Collage",
    markup: (n, rev) => `<div class="cl cl-${n}">${[0, 1, 2, 3].map((i) => `<div class="cl__item">${img(n * 7 + i, 500, 300 + i * 100)}</div>`).join("")}<p>rev ${rev}</p></div>`,
    style: (n) => `.cl-${n}{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:30px 4%}.cl-${n} img{width:100%;display:block}`,
  },
]

function sectionLiquid(kind: Kind, n: number, rev: number): string {
  const name = `${kind.stem} ${n}`
  return `<style>${kind.style(n)}</style>
${kind.markup(n, rev)}
{% schema %}
${JSON.stringify({ name, settings: [{ type: "text", id: "heading", label: "Heading", default: name }], presets: [{ name }] })}
{% endschema %}
`
}

export const sectionFile = (n: number) => `sections/stress-${n}.liquid`

/** The theme's own stylesheet: a few rules that reach every section and the page. */
export function themeCss(rev: number): string {
  return `@font-face{font-family:LateFont;src:url(/font/late.woff2) format("woff2");font-display:swap}
body{font-family:LateFont,Georgia,serif;color:#1d1d29;margin:0;position:relative}
html.js body.template-index{overflow-y:scroll!important}
.shopify-section{position:relative}
.btn{display:inline-block;background:#000;color:#fff;padding:12px 18px}
h1,h2{line-height:1.1}
/* rev ${rev} */
body.template-index .shopify-section:nth-child(odd){padding-top:${rev % 2 ? 4 : 0}px}
`
}

/**
 * A section pack's shared stylesheet, linked by the promotion and countdown
 * sections only. Like many packs it says things about the whole page: room
 * under a fixed bar, the page's <main>, every heading.
 */
export function marketingCss(rev: number): string {
  return `body.template-index{margin-top:${40 + (rev % 3) * 6}px!important}
#MainContent{padding-top:${48 + (rev % 2) * 10}px}
h2{letter-spacing:.02em;font-size:${34 + (rev % 4)}px}
.shopify-section{scroll-margin-top:80px}
`
}

export function sectionSource(n: number, rev: number): string {
  return sectionLiquid(KINDS[n % KINDS.length], n, rev)
}

export async function stressTheme(count = SECTION_COUNT) {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", `<!doctype html>
<html lang="en" class="no-js">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>{{ page_title }}</title>
    {{ content_for_header }}
    {{ 'stress.css' | asset_url | stylesheet_tag }}
  </head>
  <body class="template-{{ template.name }} page-loaded">
    <main id="MainContent" class="content-for-layout" role="main">{{ content_for_layout }}</main>
  </body>
</html>
`)
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Preview Stress", theme_version: "1.0.0", theme_author: "Storelib tests" }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
  zip.file("locales/en.default.json", "{}")
  zip.file("assets/stress.css", themeCss(0))
  zip.file("assets/marketing-sections.css", marketingCss(0))
  for (let n = 0; n < count; n++) zip.file(sectionFile(n), sectionSource(n, 0))
  zip.file("templates/index.json", JSON.stringify({ sections: { a: { type: "stress-0", settings: {} } }, order: ["a"] }))
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error((r as { error: string }).error)
  const t = r.theme
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:")))
  return { sources, files, settings: t.settings }
}
