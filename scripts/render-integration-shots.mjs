/**
 * ===========================================================================
 *  THE PICTURES IN AN APP'S GALLERY (r24)
 * ===========================================================================
 * The owner: an integration's gallery is its one YouTube video and two
 * pictures "of the inside of that app as connected to Storelib", drawn by
 * us as clean HTML and rendered to images.
 *
 * Each picture is a plain, believable view of the provider's own app the way
 * it looks once a Storelib store is connected: Mailchimp's audience with the
 * contacts Storelib added, Printful's orders from the store, Google Tag
 * Manager's tags, Google Ads' purchase conversion. Drawn in a neutral frame
 * of our own (Inter, a light sidebar, the provider's accent colour on the
 * active item and its primary button), with the provider's mark only where
 * the app already shows it (public/integrations), and nothing else of theirs:
 * no copied screens, no other logos, no illustrations. The data is a sample
 * store's (Mara Lind Studio), small and plausible.
 *
 * Rendered in headless Chromium at 960 by 540 CSS pixels, twice the pixels,
 * then written as WebP at 1280, 960 and 640 wide to
 * public/integrations/shots/<id>-<view>-<width>.webp. The list of pictures
 * and their alt text is lib/integrations/shots.ts; tests/integrations-r24
 * checks that every one it names is here at every width.
 *
 *   node scripts/render-integration-shots.mjs            all of them
 *   ONLY=mailchimp,printful node scripts/render-integration-shots.mjs
 *   PREVIEW=dir  also writes each one's HTML there, to look at
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const OUT = join(root, "public/integrations/shots")
const WIDTHS = [1280, 960, 640]
mkdirSync(OUT, { recursive: true })

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const logo = (file) => {
  const p = join(root, "public/integrations", file)
  const type = file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : "image/jpeg"
  return `data:${type};base64,${readFileSync(p).toString("base64")}`
}

/* ---------- cells ---------- */
const TONES = {
  green: ["#ecfdf3", "#067647"],
  amber: ["#fffaeb", "#b54708"],
  blue: ["#eff8ff", "#175cd3"],
  gray: ["#f2f4f7", "#344054"],
  red: ["#fef3f2", "#b42318"],
  violet: ["#f4f3ff", "#5925dc"],
}
function cell(c) {
  if (c == null) return ""
  if (typeof c === "string" || typeof c === "number") return esc(c)
  if (c.badge) {
    const [bg, fg] = TONES[c.tone || "gray"]
    return `<span class="badge" style="background:${bg};color:${fg}"><i style="background:${fg}"></i>${esc(c.badge)}</span>`
  }
  if (c.tag) return (Array.isArray(c.tag) ? c.tag : [c.tag]).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")
  if (c.person) {
    const ini = c.person.split(" ").map((w) => w[0]).join("").slice(0, 2)
    return `<span class="person"><span class="av" style="background:${c.hue || "#e4e7ec"}">${esc(ini)}</span><span><b>${esc(c.person)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</span></span>`
  }
  if (c.mono) return `<span class="mono">${esc(c.mono)}</span>`
  if (c.muted) return `<span class="muted">${esc(c.muted)}</span>`
  if (c.strong) return `<b>${esc(c.strong)}</b>`
  if (c.link) return `<span class="lnk">${esc(c.link)}</span>`
  if (c.check) return `<span class="chk">&#10003;</span> ${esc(c.check)}`
  if (c.swatch) return `<span class="person"><span class="sw" style="background:${c.swatch}"></span><b>${esc(c.label)}</b></span>`
  return esc(c.text ?? "")
}

/* ---------- product art: flat shapes, no illustration ---------- */
function art(kind, color, tint = "#f3f4f6") {
  const c = color
  const s = {
    tee: `<path d="M38 22 L52 16 Q60 24 68 16 L82 22 L94 36 L84 44 L80 40 L80 96 L40 96 L40 40 L36 44 L26 36 Z" fill="${c}"/>`,
    hoodie: `<path d="M40 24 Q60 6 80 24 L94 40 L86 48 L82 44 L82 98 L38 98 L38 44 L34 48 L26 40 Z" fill="${c}"/><path d="M50 22 Q60 34 70 22" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="3"/><rect x="48" y="70" width="24" height="12" rx="3" fill="rgba(0,0,0,.12)"/>`,
    poster: `<rect x="34" y="14" width="52" height="72" rx="2" fill="#fff" stroke="#e5e7eb"/><rect x="40" y="20" width="40" height="44" fill="${c}"/><circle cx="68" cy="32" r="6" fill="rgba(255,255,255,.75)"/><path d="M40 64 L54 46 L64 56 L72 48 L80 58 L80 64 Z" fill="rgba(0,0,0,.22)"/><rect x="40" y="70" width="26" height="3" rx="1.5" fill="#d0d5dd"/><rect x="40" y="76" width="16" height="3" rx="1.5" fill="#e4e7ec"/>`,
    frame: `<rect x="30" y="12" width="60" height="78" rx="2" fill="#2b2b2b"/><rect x="36" y="18" width="48" height="66" fill="#fff"/><rect x="42" y="24" width="36" height="46" fill="${c}"/><path d="M42 70 L54 52 L62 60 L70 50 L78 60 L78 70 Z" fill="rgba(0,0,0,.2)"/>`,
    mug: `<rect x="34" y="30" width="44" height="52" rx="6" fill="#fff" stroke="#d0d5dd" stroke-width="2"/><path d="M78 42 Q94 42 94 56 Q94 70 78 70" fill="none" stroke="#d0d5dd" stroke-width="6"/><rect x="42" y="44" width="28" height="22" rx="3" fill="${c}"/>`,
    tote: `<path d="M46 34 Q46 16 60 16 Q74 16 74 34" fill="none" stroke="#c9b99a" stroke-width="4"/><rect x="32" y="32" width="56" height="62" rx="3" fill="#e9dfcc"/><circle cx="60" cy="62" r="13" fill="${c}"/>`,
    cards: `<rect x="30" y="26" width="46" height="62" rx="3" fill="#fff" stroke="#e5e7eb" transform="rotate(-8 53 57)"/><rect x="44" y="22" width="46" height="62" rx="3" fill="#fff" stroke="#e5e7eb"/><rect x="50" y="28" width="34" height="34" fill="${c}"/><rect x="50" y="68" width="22" height="3" rx="1.5" fill="#d0d5dd"/>`,
    case: `<rect x="44" y="12" width="34" height="76" rx="8" fill="${c}"/><rect x="50" y="18" width="12" height="16" rx="4" fill="rgba(0,0,0,.25)"/>`,
    bottle: `<rect x="50" y="12" width="20" height="10" rx="2" fill="#98a2b3"/><rect x="44" y="22" width="32" height="70" rx="8" fill="${c}"/><rect x="48" y="44" width="24" height="18" rx="2" fill="rgba(255,255,255,.7)"/>`,
    lamp: `<path d="M44 20 L76 20 L86 48 L34 48 Z" fill="${c}"/><rect x="58" y="48" width="4" height="34" fill="#98a2b3"/><rect x="44" y="82" width="32" height="6" rx="3" fill="#667085"/>`,
  }[kind]
  return `<svg viewBox="0 0 120 104" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="background:${tint}">${s}</svg>`
}

/* ---------- the frame every picture is drawn in ---------- */
function frame(app, view, body) {
  const a = app.accent
  const dark = app.side === "dark"
  const nav = app.nav
    .map((n) => `<div class="nav ${n === view.nav ? "on" : ""}"><span class="dot"></span>${esc(n)}</div>`)
    .join("")
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:960px;height:540px;overflow:hidden}
body{font-family:Inter,system-ui,sans-serif;font-size:12.5px;color:#1d2939;background:#fff;-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss01"}
.app{display:grid;grid-template-columns:${app.navWidth || 176}px 1fr;grid-template-rows:46px 1fr;width:960px;height:540px}
.top{grid-column:1/3;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid #eaecf0;background:${dark ? app.topBg || "#1e1f22" : "#fff"};color:${dark ? "#f2f4f7" : "#101828"}}
.top img{width:24px;height:24px;border-radius:6px;object-fit:contain}
.top .name{font-weight:650;font-size:14px;letter-spacing:-.01em}
.top .crumb{color:${dark ? "#98a2b3" : "#667085"};font-size:12.5px;display:flex;align-items:center;gap:8px}
.top .crumb:before{content:"";width:1px;height:16px;background:${dark ? "#3f4147" : "#e4e7ec"};margin:0 4px}
.top .sp{flex:1}
.top .search{width:220px;height:28px;border-radius:7px;background:${dark ? "#2b2d31" : "#f2f4f7"};color:#98a2b3;display:flex;align-items:center;padding:0 10px;font-size:12px}
.top .me{width:28px;height:28px;border-radius:50%;background:#d6bbfb;color:#42307d;font-weight:650;font-size:11px;display:flex;align-items:center;justify-content:center}
.side{background:${dark ? app.sideBg || "#2b2d31" : "#fafafa"};border-right:1px solid ${dark ? "#1e1f22" : "#eaecf0"};padding:14px 10px;display:flex;flex-direction:column;gap:2px}
.nav{display:flex;align-items:center;gap:9px;height:31px;padding:0 10px;border-radius:7px;color:${dark ? "#b5bac1" : "#475467"};font-weight:500}
.nav .dot{width:14px;height:14px;border-radius:4px;border:1.6px solid currentColor;opacity:.55}
.nav.on{background:${dark ? "rgba(255,255,255,.08)" : app.navOn || "color-mix(in srgb," + a + " 13%, #fff)"};color:${dark ? "#fff" : app.navOnInk || "#101828"};font-weight:600}
.nav.on .dot{opacity:1;border-color:${dark ? "#fff" : a};background:color-mix(in srgb,${a} 25%, transparent)}
.side .foot{margin-top:auto;font-size:11px;color:${dark ? "#80848e" : "#98a2b3"};padding:0 10px}
.main{padding:20px 24px;overflow:hidden;background:${dark ? app.mainBg || "#313338" : "#fff"};color:${dark ? "#dbdee1" : "#1d2939"}}
.head{display:flex;align-items:flex-end;gap:12px;margin-bottom:14px}
.head h1{font-size:19px;font-weight:650;letter-spacing:-.015em;color:${dark ? "#f2f3f5" : "#101828"}}
.head p{color:${dark ? "#949ba4" : "#667085"};margin-top:3px}
.head .sp{flex:1}
.btn{height:30px;padding:0 12px;border-radius:7px;font-weight:600;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn.pri{background:${app.button || a};color:${app.buttonInk || "#fff"}}
.btn.sec{border:1px solid ${dark ? "#4e5058" : "#d0d5dd"};color:${dark ? "#dbdee1" : "#344054"};background:${dark ? "transparent" : "#fff"}}
.tabs{display:flex;gap:18px;border-bottom:1px solid ${dark ? "#3f4147" : "#eaecf0"};margin-bottom:12px}
.tabs span{padding:0 1px 9px;color:${dark ? "#949ba4" : "#667085"};font-weight:500}
.tabs span.on{color:${dark ? "#fff" : "#101828"};font-weight:600;box-shadow:inset 0 -2px 0 ${app.tabInk || a}}
.chips{display:flex;gap:8px;margin-bottom:12px}
.chip{height:26px;padding:0 10px;border:1px solid ${dark ? "#4e5058" : "#d0d5dd"};border-radius:6px;display:inline-flex;align-items:center;color:${dark ? "#b5bac1" : "#344054"};font-weight:500;font-size:12px}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid ${dark ? "#3f4147" : "#eaecf0"};border-radius:10px;overflow:hidden}
th{background:${dark ? "#2b2d31" : "#f9fafb"};color:${dark ? "#949ba4" : "#667085"};font-weight:500;font-size:11.5px;text-align:left;padding:9px 12px;border-bottom:1px solid ${dark ? "#3f4147" : "#eaecf0"};white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid ${dark ? "#3f4147" : "#f2f4f7"};white-space:nowrap;vertical-align:middle}
tr:last-child td{border-bottom:0}
td:has(.tag + .tag){white-space:normal;line-height:2}
td.r,th.r{text-align:right}
.badge{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px 0 8px;border-radius:999px;font-size:11.5px;font-weight:600}
.badge i{width:6px;height:6px;border-radius:50%}
.tag{display:inline-flex;align-items:center;height:21px;padding:0 8px;border-radius:5px;background:${dark ? "#3f4147" : "#f2f4f7"};color:${dark ? "#dbdee1" : "#344054"};font-size:11.5px;font-weight:500}
.person{display:inline-flex;align-items:center;gap:9px}
.person b{font-weight:600;color:${dark ? "#f2f3f5" : "#101828"};display:block}
.person small{display:block;color:${dark ? "#949ba4" : "#667085"};font-size:11.5px;margin-top:1px}
.av{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:650;color:#344054;flex:none}
.sw{width:12px;height:12px;border-radius:50%;flex:none}
.mono{font-family:"DejaVu Sans Mono",ui-monospace,monospace;font-size:11.5px;color:${dark ? "#dbdee1" : "#344054"}}
.muted{color:${dark ? "#949ba4" : "#667085"}}
.lnk{color:${app.link || "#175cd3"};font-weight:500}
.chk{color:#079455;font-weight:700}
.card{border:1px solid ${dark ? "#3f4147" : "#eaecf0"};border-radius:10px;background:${dark ? "#2b2d31" : "#fff"}}
.stats{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:12px;margin-bottom:14px}
.stat{padding:12px 14px}
.stat small{color:#667085;font-weight:500}
.stat b{display:block;font-size:20px;font-weight:650;letter-spacing:-.02em;margin-top:4px;color:#101828}
.stat em{font-style:normal;color:#667085;font-size:11.5px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.prod{overflow:hidden}
.prod .pic{height:150px;border-bottom:1px solid #eaecf0}
.prod .tx{padding:10px 12px}
.prod .tx b{display:block;font-weight:600;color:#101828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prod .tx small{display:block;color:#667085;margin:2px 0 8px}
.two{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start}
.flow{display:flex;flex-direction:column;align-items:center;gap:0;padding-top:4px}
.step{width:330px;padding:11px 13px;display:flex;gap:11px;align-items:flex-start}
.step .ic{width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
.step b{display:block;font-weight:600;color:#101828}
.step small{display:block;color:#667085;margin-top:2px;line-height:1.4}
.step.sel{box-shadow:0 0 0 2px ${a}}
.line{width:2px;height:16px;background:#d0d5dd}
.kv{padding:14px 16px}
.kv h3{font-size:13px;font-weight:650;color:#101828;margin-bottom:8px}
.kv div{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #f2f4f7}
.kv div:first-of-type{border-top:0}
.kv span{color:#667085}
.kv b{font-weight:550;color:#101828;text-align:right}
.tl{padding:14px 16px}
.ev{display:grid;grid-template-columns:18px 1fr auto;gap:10px;padding:0 0 14px;position:relative}
.ev .pt{width:12px;height:12px;border-radius:50%;border:2px solid #d0d5dd;background:#fff;margin-top:2px;z-index:1}
.ev.done .pt{border-color:${a};background:${a}}
.ev:not(:last-child):after{content:"";position:absolute;left:5px;top:14px;bottom:0;width:2px;background:#eaecf0}
.ev b{font-weight:600;color:#101828;display:block}
.ev small{color:#667085}
.ev time{color:#667085;font-size:11.5px}
.nodes{position:relative;height:300px;border-radius:12px;background:radial-gradient(#e4e7ec 1px,transparent 1px) 0 0/16px 16px,#fbfbfc;border:1px solid #eaecf0;display:flex;align-items:center;justify-content:center;gap:56px}
.node{display:flex;flex-direction:column;align-items:center;gap:8px;position:relative}
.node .o{width:74px;height:74px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;box-shadow:0 6px 14px -6px rgba(16,24,40,.35)}
.node b{font-weight:600;color:#101828}
.node small{color:#667085;margin-top:-6px}
.node:not(:last-child):after{content:"";position:absolute;left:84px;top:36px;width:44px;height:2px;background:repeating-linear-gradient(90deg,#98a2b3 0 6px,transparent 6px 10px)}
.zap{display:flex;flex-direction:column;align-items:center}
.zstep{width:360px;padding:12px 14px}
.zstep .k{font-size:11px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:.04em}
.zstep .row{display:flex;gap:10px;align-items:center;margin-top:6px}
.zstep .ic{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px}
.zstep b{font-weight:600;color:#101828}
.zstep small{display:block;color:#667085}
.split{display:grid;grid-template-columns:210px minmax(0,1fr);gap:14px;align-items:start}
.list .it{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #f2f4f7}
.list .it:first-child{border-top:0}
.list .it.on{background:color-mix(in srgb,${a} 9%,#fff)}
.list .n{width:20px;color:#98a2b3;font-size:11px;text-align:right}
.list b{font-weight:600;color:#101828}
.list small{display:block;color:#667085;font-size:11.5px}
.bars{display:flex;align-items:flex-end;gap:5px;height:76px;padding:0 4px}
.bars i{flex:1;border-radius:3px 3px 0 0;background:color-mix(in srgb,${app.chart || a} 80%,#fff)}
.sect{font-size:12px;font-weight:600;color:#344054;margin:0 0 8px}
.code{font-family:"DejaVu Sans Mono",monospace;font-size:11.5px;background:#f9fafb;border:1px solid #eaecf0;border-radius:8px;padding:10px 12px;line-height:1.7;color:#344054;white-space:pre;overflow:hidden}
</style></head><body><div class="app">
<div class="top"><img src="${app.logo}" alt=""><span class="name">${esc(app.name)}</span><span class="crumb">${esc(view.crumb || "Mara Lind Studio")}</span><span class="sp"></span><span class="search">Search</span><span class="me">ML</span></div>
<div class="side">${nav}<div class="foot">${esc(app.foot || "Mara Lind Studio")}</div></div>
<div class="main">${body}</div>
</div></body></html>`
}

/* ---------- the views ---------- */
const head = (title, sub, actions = "") => `<div class="head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div><span class="sp"></span>${actions}</div>`
const btn = (label, kind = "pri") => `<span class="btn ${kind}">${esc(label)}</span>`
const tabs = (list, on = 0) => `<div class="tabs">${list.map((t, i) => `<span class="${i === on ? "on" : ""}">${esc(t)}</span>`).join("")}</div>`
const chips = (list) => `<div class="chips">${list.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>`
const table = (cols, rows) =>
  `<table><thead><tr>${cols.map((c) => `<th class="${c.r ? "r" : ""}" style="${c.w ? `width:${c.w}px` : ""}">${esc(c.h ?? c)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${cols[i]?.r ? "r" : ""}">${cell(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`
const kv = (title, rows) => `<div class="card kv"><h3>${esc(title)}</h3>${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${typeof v === "object" ? cell(v) : esc(v)}</b></div>`).join("")}</div>`
const flow = (steps, sel = -1) =>
  `<div class="flow">${steps
    .map((s, i) => `${i ? '<div class="line"></div>' : ""}<div class="card step ${i === sel ? "sel" : ""}"><span class="ic" style="background:${s.bg};color:${s.ink || "#fff"}">${s.icon}</span><span><b>${esc(s.label)}</b>${s.detail ? `<small>${esc(s.detail)}</small>` : ""}</span></div>`)
    .join("")}</div>`
const grid = (items) =>
  `<div class="grid">${items
    .map((p) => `<div class="card prod"><div class="pic">${art(p.art, p.color, p.tint)}</div><div class="tx"><b>${esc(p.name)}</b><small>${esc(p.meta)}</small>${cell(p.badge)}</div></div>`)
    .join("")}</div>`
const timeline = (events) => `<div class="card tl">${events.map((e) => `<div class="ev ${e.done ? "done" : ""}"><span class="pt"></span><span><b>${esc(e.label)}</b><small>${esc(e.place || "")}</small></span><time>${esc(e.t)}</time></div>`).join("")}</div>`
const stats = (list) => `<div class="stats" style="--n:${list.length}">${list.map((s) => `<div class="card stat"><small>${esc(s.label)}</small><b>${esc(s.value)}</b>${s.note ? `<em>${esc(s.note)}</em>` : ""}</div>`).join("")}</div>`

/* The sample store's people, shared by every picture so the set reads as one store. */
const P = [
  { n: "Ana Petrović", e: "ana.petrovic@example.com", h: "#fde2e4" },
  { n: "Jonas Weber", e: "jonas.w@example.com", h: "#dbeafe" },
  { n: "Lucía Romero", e: "lucia.romero@example.com", h: "#dcfce7" },
  { n: "Sam Okafor", e: "sam.okafor@example.com", h: "#fef3c7" },
  { n: "Mei Tanaka", e: "mei.tanaka@example.com", h: "#ede9fe" },
  { n: "Tom Hughes", e: "tom.hughes@example.com", h: "#e0f2fe" },
  { n: "Ines Duarte", e: "ines.duarte@example.com", h: "#fce7f3" },
]
const person = (i, withMail = true) => ({ person: P[i].n, sub: withMail ? P[i].e : undefined, hue: P[i].h })

/* Orders, one list for every app that receives them. */
const ORDERS = [
  ["#1048", 0, "Harbour print, A3", "Nov 22"],
  ["#1047", 1, "Tide tee, M", "Nov 22"],
  ["#1046", 2, "Harbour print, A2", "Nov 21"],
  ["#1045", 3, "Lighthouse mug", "Nov 21"],
  ["#1044", 4, "Tide tee, S", "Nov 20"],
  ["#1043", 5, "Dune tote bag", "Nov 19"],
]

/* Line icons, drawn here: a bolt for what starts it, a clock for a wait, an envelope for an email. */
const svg = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const ICON = {
  trigger: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  wait: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  email: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
}

/* ---- the families ---- */
function emailAudience(app, o) {
  return {
    nav: o.nav,
    body:
      head(o.title, o.sub, btn(o.add || "Add contacts", "sec") + " " + btn(o.cta || "Create campaign")) +
      tabs(o.tabs || ["All contacts", "Segments", "Tags", "Signup forms"]) +
      chips(o.chips || ["Source: Storelib", "Subscribed", "Last 30 days"]) +
      table(
        [{ h: "Contact" }, { h: o.tagHead || "Tags" }, { h: "Source" }, { h: "Status" }, { h: "Added", r: true }],
        [0, 1, 2, 3, 4, 6].map((i, k) => [person(i), { tag: o.tags[k % o.tags.length] }, { muted: o.source || "Storelib" }, { badge: k === 4 ? "Unsubscribed" : "Subscribed", tone: k === 4 ? "gray" : "green" }, { muted: ["Nov 22", "Nov 22", "Nov 21", "Nov 20", "Nov 18", "Nov 17"][k] }]),
      ),
  }
}
function emailFlow(app, o) {
  const a = app.accent
  return {
    nav: o.nav,
    body:
      head(o.title, o.sub, btn("Preview", "sec") + " " + btn(o.cta || "Turn on")) +
      `<div class="two"><div>${flow(o.steps.map((s) => ({ ...s, bg: s.kind === "trigger" ? app.accent : s.kind === "wait" ? "#f2f4f7" : "#f4f3ff", ink: s.kind === "trigger" ? app.buttonInk || "#fff" : s.kind === "wait" ? "#475467" : "#5925dc", icon: ICON[s.kind] })), 0)}</div>${kv(o.panelTitle || "Trigger", o.panel)}</div>`,
  }
}
function podOrders(app, o) {
  return {
    nav: o.nav,
    body:
      head(o.title || "Orders", o.sub || "Orders from Mara Lind Studio, sent by Storelib", btn(o.cta || "New order")) +
      tabs(o.tabs || ["All", "Pending", "In production", "Shipped"]) +
      table(
        [{ h: "Order" }, { h: "Customer" }, { h: "Items" }, { h: "Store" }, { h: "Status" }, { h: "Date", r: true }],
        ORDERS.map(([no, p, item, d], k) => [{ strong: no }, person(p, false), item, { tag: "Storelib" }, o.status[k], { muted: d }]),
      ),
  }
}
function podProducts(app, o) {
  return {
    nav: o.nav,
    body: head(o.title, o.sub, btn("Add product")) + chips(o.chips || ["Store: Mara Lind Studio", "Synced with Storelib"]) + grid(o.items),
  }
}
function shipQueue(app, o) {
  return {
    nav: o.nav,
    body:
      head(o.title, o.sub, btn("Create labels")) +
      tabs(o.tabs, o.tabOn || 0) +
      table(
        [{ h: "Order" }, { h: "Recipient" }, { h: "Item" }, { h: "Weight", r: true }, { h: o.svcHead || "Service" }, { h: "Store" }],
        ORDERS.slice(0, 6).map(([no, p, item], k) => [{ strong: no }, person(p, false), item, { muted: ["0.4 kg", "0.3 kg", "0.6 kg", "0.5 kg", "0.3 kg", "0.4 kg"][k] }, o.services[k % o.services.length], { tag: "Storelib" }]),
      ),
  }
}
function eventsTable(app, o) {
  return {
    nav: o.nav,
    body:
      head(o.title, o.sub, o.cta ? btn(o.cta, "sec") : "") +
      (o.stats ? stats(o.stats) : "") +
      (o.tabs ? tabs(o.tabs, o.tabOn || 0) : "") +
      table(o.cols, o.rows),
  }
}

/* ---------- the apps ---------- */
const STORE = "storelib.com/maralind"
const APPS = {
  mailchimp: {
    name: "Mailchimp", logo: "mailchimp.svg", accent: "#ffe01b", button: "#1a1a1a", buttonInk: "#fff", tabInk: "#1a1a1a", navOn: "#fff6bf",
    nav: ["Campaigns", "Automations", "Audience", "Content", "Analytics", "Integrations"],
    views: {
      audience: (app) => emailAudience(app, { nav: "Audience", title: "All contacts", sub: "Mara Lind Studio audience", tags: [["OnePage signup"]], source: "API", cta: "Create campaign", chips: ["Tag: OnePage signup", "Subscribed", "Last 30 days"] }),
      journey: (app) => emailFlow(app, {
        nav: "Automations", title: "Welcome new subscribers", sub: "Customer journey, on", cta: "Edit journey",
        steps: [
          { kind: "trigger", label: "Contact tagged OnePage signup", detail: "Added from Storelib as they sign up" },
          { kind: "email", label: "Send email: Thanks for signing up", detail: "Subject: Welcome to Mara Lind Studio" },
          { kind: "wait", label: "Wait 2 days" },
          { kind: "email", label: "Send email: New in the shop", detail: "Harbour prints and the Tide tee" },
        ],
        panel: [["Starting point", "Tag added"], ["Tag", { tag: "OnePage signup" }], ["Audience", "Mara Lind Studio"], ["Contacts in journey", "214"], ["Status", { badge: "Sending", tone: "green" }]],
      }),
    },
  },
  klaviyo: {
    name: "Klaviyo", logo: "klaviyo.png", accent: "#232426", tabInk: "#232426", navOn: "#eeeeee",
    nav: ["Home", "Campaigns", "Flows", "Sign-up forms", "Audience", "Analytics"],
    views: {
      profiles: (app) => emailAudience(app, { nav: "Audience", title: "Storelib customers", sub: "List, 6 most recent profiles", tabs: ["Profiles", "Segments", "Lists"], chips: ["Source: Storelib", "Email consent: subscribed"], tagHead: "Last event", tags: [["Placed Order"], ["Subscribed to List"], ["Placed Order"]], source: "Storelib", add: "Import", cta: "Create segment" }),
      flow: (app) => emailFlow(app, {
        nav: "Flows", title: "Thank you after an order", sub: "Flow, live", cta: "Update actions",
        steps: [
          { kind: "trigger", label: "Placed Order", detail: "Metric sent by Storelib with each paid order" },
          { kind: "email", label: "Email: Thank you, {{ first_name }}", detail: "Sent at once" },
          { kind: "wait", label: "Time delay: 7 days" },
          { kind: "email", label: "Email: How is your print?", detail: "Asks for a review" },
        ],
        panelTitle: "Trigger", panel: [["Metric", "Placed Order"], ["From", "Storelib API"], ["Flow filters", "None"], ["Profiles in flow", "86"], ["Status", { badge: "Live", tone: "green" }]],
      }),
    },
  },
  omnisend: {
    name: "Omnisend", logo: "omnisend.png", accent: "#1d1d1d", tabInk: "#1d1d1d", navOn: "#eeeeee",
    nav: ["Dashboard", "Campaigns", "Automation", "Audience", "Forms", "Reports"],
    views: {
      contacts: (app) => emailAudience(app, { nav: "Audience", title: "Contacts", sub: "Everyone Storelib has added", tabs: ["All contacts", "Segments", "Tags"], tags: [["source: Storelib"], ["source: Storelib", "buyer"], ["source: Storelib"]], source: "Storelib", add: "Import contacts", cta: "Create segment" }),
      automation: (app) => emailFlow(app, {
        nav: "Automation", title: "Order follow up", sub: "Automation, live", cta: "Save",
        steps: [
          { kind: "trigger", label: "Placed order", detail: "Event from Storelib" },
          { kind: "email", label: "Email: Your order is on its way to us", detail: "Sent at once" },
          { kind: "wait", label: "Wait 5 days" },
          { kind: "email", label: "Email: Something to go with it?" },
        ],
        panel: [["Trigger", "Placed order"], ["Source", "Storelib"], ["Audience", "All contacts"], ["Started", "112"], ["Status", { badge: "Live", tone: "green" }]],
      }),
    },
  },
  brevo: {
    name: "Brevo", logo: "brevo.svg", accent: "#0b996e",
    nav: ["Campaigns", "Automations", "Contacts", "Templates", "Statistics"],
    views: {
      contacts: (app) => emailAudience(app, { nav: "Contacts", title: "Contacts", sub: "List: Storelib subscribers", tabs: ["Contacts", "Lists", "Segments", "Forms"], tagHead: "Lists", tags: [["Storelib subscribers"], ["Storelib subscribers", "Buyers"], ["Storelib subscribers"]], source: "Storelib", add: "Import contacts", cta: "Create a campaign" }),
      workflow: (app) => emailFlow(app, {
        nav: "Automations", title: "Welcome series", sub: "Workflow, active", cta: "Activate",
        steps: [
          { kind: "trigger", label: "Contact added to a list", detail: "List: Storelib subscribers" },
          { kind: "email", label: "Send an email: Welcome", detail: "Template #12" },
          { kind: "wait", label: "Wait 3 days" },
          { kind: "email", label: "Send an email: Our best sellers", detail: "Skipped once order_placed arrives" },
        ],
        panel: [["Entry point", "Added to a list"], ["List", "Storelib subscribers"], ["Exit on event", "order_placed"], ["Contacts in workflow", "57"], ["Status", { badge: "Active", tone: "green" }]],
      }),
    },
  },
  mailerlite: {
    name: "MailerLite", logo: "mailerlite.svg", accent: "#09c269",
    nav: ["Dashboard", "Subscribers", "Campaigns", "Automation", "Forms", "Sites"],
    views: {
      subscribers: (app) => emailAudience(app, { nav: "Subscribers", title: "Subscribers", sub: "Group: Storelib buyers", chips: ["Group: Storelib buyers", "Active"], tabs: ["All subscribers", "Segments", "Groups", "Fields"], tagHead: "Groups", tags: [["Storelib buyers"], ["Storelib buyers", "Newsletter"], ["Storelib buyers"]], source: "API", add: "Import", cta: "Add subscriber" }),
      automation: (app) => emailFlow(app, {
        nav: "Automation", title: "New Storelib buyer", sub: "Automation, active", cta: "Edit",
        steps: [
          { kind: "trigger", label: "When subscriber joins a group", detail: "Group: Storelib buyers" },
          { kind: "email", label: "Email: Welcome to the studio" },
          { kind: "wait", label: "Delay: 1 day" },
          { kind: "email", label: "Email: How the prints are made" },
        ],
        panel: [["Trigger", "Joins a group"], ["Group", "Storelib buyers"], ["Completed", "61"], ["Status", { badge: "Active", tone: "green" }]],
      }),
    },
  },
  kit: {
    name: "Kit", logo: "kit.svg", accent: "#fb6970",
    nav: ["Grow", "Subscribers", "Send", "Automate", "Earn", "Learn"],
    views: {
      subscribers: (app) => emailAudience(app, { nav: "Subscribers", title: "Subscribers", sub: "Filtered by tag", chips: ["Tag: Storelib buyer", "Confirmed"], tabs: ["All", "Tags", "Segments"], tags: [["Storelib buyer"], ["Storelib buyer", "Prints"], ["Storelib buyer"]], source: "Storelib", add: "Import", cta: "Add subscribers" }),
      sequence: (app) => emailFlow(app, {
        nav: "Automate", title: "Buyer welcome", sub: "Visual automation, live", cta: "Live",
        steps: [
          { kind: "trigger", label: "Tag added: Storelib buyer", detail: "Added by Storelib after a sale" },
          { kind: "email", label: "Sequence: Thanks for buying", detail: "3 emails" },
          { kind: "wait", label: "Wait 14 days" },
          { kind: "email", label: "Email: First look at new prints" },
        ],
        panel: [["Event", "Tag added"], ["Tag", { tag: "Storelib buyer" }], ["Subscribers here", "38"], ["Status", { badge: "Live", tone: "green" }]],
      }),
    },
  },
  printful: {
    name: "Printful", logo: "printful.svg", accent: "#2c2c2c", tabInk: "#2c2c2c", navOn: "#efefef",
    nav: ["Dashboard", "Stores", "Orders", "Product templates", "File library", "Billing"],
    views: {
      orders: (app) => podOrders(app, { nav: "Orders", status: [{ badge: "Pending", tone: "amber" }, { badge: "In production", tone: "blue" }, { badge: "In production", tone: "blue" }, { badge: "Fulfilled", tone: "green" }, { badge: "Fulfilled", tone: "green" }, { badge: "Fulfilled", tone: "green" }], tabs: ["All", "Draft", "Pending", "In production", "Fulfilled"], cta: "Create order" }),
      products: (app) => podProducts(app, { nav: "Stores", title: "Mara Lind Studio", sub: "Store connected through Storelib, 4 products synced", items: [
        { name: "Harbour print", meta: "Enhanced matte paper poster", art: "poster", color: "#7fa7c9", badge: { badge: "Synced", tone: "green" } },
        { name: "Tide tee", meta: "Unisex staple t-shirt", art: "tee", color: "#2f4858", badge: { badge: "Synced", tone: "green" } },
        { name: "Lighthouse mug", meta: "White glossy mug", art: "mug", color: "#e07a5f", badge: { badge: "Synced", tone: "green" } },
        { name: "Dune tote bag", meta: "Eco tote bag", art: "tote", color: "#c38d5e", badge: { badge: "Synced", tone: "green" } },
      ] }),
    },
  },
  printify: {
    name: "Printify", logo: "printify.png", accent: "#39b75d",
    nav: ["My products", "Orders", "Catalog", "Stores", "Analytics", "Settings"],
    views: {
      orders: (app) => podOrders(app, { nav: "Orders", status: [{ badge: "On hold", tone: "amber" }, { badge: "Sent to production", tone: "blue" }, { badge: "In production", tone: "blue" }, { badge: "Shipped", tone: "green" }, { badge: "Shipped", tone: "green" }, { badge: "Delivered", tone: "green" }], tabs: ["All", "On hold", "In production", "Shipped"], cta: "Create order" }),
      products: (app) => podProducts(app, { nav: "My products", title: "My products", sub: "Mara Lind Studio, published to Storelib", items: [
        { name: "Tide tee", meta: "Unisex Jersey Short Sleeve", art: "tee", color: "#3d5a80", badge: { badge: "Published", tone: "green" } },
        { name: "Harbour hoodie", meta: "Unisex Heavy Blend Hoodie", art: "hoodie", color: "#6b8f71", badge: { badge: "Published", tone: "green" } },
        { name: "Lighthouse mug", meta: "Ceramic Mug 11oz", art: "mug", color: "#e07a5f", badge: { badge: "Published", tone: "green" } },
        { name: "Dune phone case", meta: "Tough case", art: "case", color: "#c38d5e", badge: { badge: "Draft", tone: "gray" } },
      ] }),
    },
  },
  gelato: {
    name: "Gelato", logo: "gelato.png", accent: "#0b2e4e", tabInk: "#0b2e4e", navOn: "#e8eef5",
    nav: ["Home", "Products", "Orders", "Stores", "Brand", "Account"],
    views: {
      orders: (app) => podOrders(app, { nav: "Orders", status: [{ badge: "Created", tone: "gray" }, { badge: "Printed", tone: "blue" }, { badge: "In transit", tone: "blue" }, { badge: "Delivered", tone: "green" }, { badge: "Delivered", tone: "green" }, { badge: "Delivered", tone: "green" }], tabs: ["All orders", "In progress", "Delivered", "Cancelled"], cta: "Create order" }),
      products: (app) => podProducts(app, { nav: "Products", title: "Products", sub: "Mara Lind Studio, connected to Storelib", items: [
        { name: "Harbour print", meta: "Premium matte poster, A3", art: "poster", color: "#7fa7c9", badge: { badge: "Connected", tone: "green" } },
        { name: "Harbour print, framed", meta: "Wooden frame, black", art: "frame", color: "#7fa7c9", badge: { badge: "Connected", tone: "green" } },
        { name: "Sea notes cards", meta: "Folded greeting cards", art: "cards", color: "#e9c46a", badge: { badge: "Connected", tone: "green" } },
        { name: "Tide tee", meta: "Classic unisex t-shirt", art: "tee", color: "#2f4858", badge: { badge: "Connected", tone: "green" } },
      ] }),
    },
  },
  "cj-dropshipping": {
    name: "CJdropshipping", logo: "cj-dropshipping.png", accent: "#f25c05",
    nav: ["Dashboard", "Products", "Orders", "Stores", "Logistics", "Wallet"],
    views: {
      orders: (app) => ({
        nav: "Orders",
        body: head("Store orders", "Orders Storelib sent from Mara Lind Studio", btn("Pay selected")) + tabs(["Awaiting payment", "Processing", "Dispatched", "Completed"], 1) +
          table([{ h: "CJ order" }, { h: "Store order" }, { h: "Product" }, { h: "Logistics" }, { h: "Status" }, { h: "Tracking" }], [
            [{ mono: "CJ2611220481" }, { strong: "#1048" }, "Ceramic table lamp", "CJPacket", { badge: "Processing", tone: "blue" }, { muted: "Not yet" }],
            [{ mono: "CJ2611220477" }, { strong: "#1047" }, "Glass water bottle", "CJPacket", { badge: "Processing", tone: "blue" }, { muted: "Not yet" }],
            [{ mono: "CJ2611210452" }, { strong: "#1046" }, "Linen cushion cover", "YunExpress", { badge: "Dispatched", tone: "green" }, { mono: "YT2611210452" }],
            [{ mono: "CJ2611210449" }, { strong: "#1045" }, "Ceramic table lamp", "CJPacket", { badge: "Dispatched", tone: "green" }, { mono: "CJ0118837720" }],
            [{ mono: "CJ2611200431" }, { strong: "#1044" }, "Glass water bottle", "YunExpress", { badge: "Completed", tone: "gray" }, { mono: "YT2611200431" }],
          ]),
      }),
      products: (app) => podProducts(app, { nav: "Products", title: "Connected products", sub: "Listed in your Storelib store", chips: ["Store: Mara Lind Studio", "Connected"], items: [
        { name: "Ceramic table lamp", meta: "Warehouse: CN, US", art: "lamp", color: "#e9c46a", badge: { badge: "Connected", tone: "green" } },
        { name: "Glass water bottle", meta: "Warehouse: CN", art: "bottle", color: "#8ecae6", badge: { badge: "Connected", tone: "green" } },
        { name: "Linen tote", meta: "Warehouse: CN, DE", art: "tote", color: "#a3b18a", badge: { badge: "Connected", tone: "green" } },
        { name: "Ceramic mug", meta: "Warehouse: US", art: "mug", color: "#bc6c25", badge: { badge: "Pending", tone: "amber" } },
      ] }),
    },
  },
  shipstation: {
    name: "ShipStation", logo: "shipstation.png", accent: "#84c225", button: "#4f7a12",
    nav: ["Orders", "Shipments", "Products", "Customers", "Insights", "Settings"],
    views: {
      orders: (app) => shipQueue(app, { nav: "Orders", title: "Awaiting shipment", sub: "Store: Mara Lind Studio (Storelib)", tabs: ["Awaiting payment", "On hold", "Awaiting shipment", "Shipped"], tabOn: 2, services: ["USPS Ground Advantage", "USPS Priority Mail", "UPS Ground"] }),
      shipped: (app) => eventsTable(app, {
        nav: "Shipments", title: "Shipped", sub: "Tracking goes back to each Storelib order", tabs: ["Awaiting shipment", "Shipped", "Cancelled"], tabOn: 1,
        cols: [{ h: "Order" }, { h: "Recipient" }, { h: "Carrier" }, { h: "Tracking number" }, { h: "Ship date" }, { h: "Store" }],
        rows: ORDERS.slice(0, 6).map(([no, p], k) => [{ strong: no }, person(p, false), ["USPS", "USPS", "UPS", "USPS", "UPS", "USPS"][k], { mono: ["9400 1112 0255 0187 62", "9400 1112 0255 0187 31", "1Z 999 AA1 0123 4567", "9400 1112 0255 0186 98", "1Z 999 AA1 0123 4521", "9400 1112 0255 0186 44"][k] }, { muted: ["Nov 22", "Nov 22", "Nov 21", "Nov 21", "Nov 20", "Nov 19"][k] }, { tag: "Storelib" }]),
      }),
    },
  },
  shippo: {
    name: "Shippo", logo: "shippo.png", accent: "#1fa463",
    nav: ["Orders", "Shipments", "Returns", "Tracking", "Reports", "Settings"],
    views: {
      orders: (app) => shipQueue(app, { nav: "Orders", title: "Orders", sub: "Imported from Storelib", tabs: ["Unfulfilled", "Fulfilled", "All"], svcHead: "Cheapest rate", services: ["USPS Ground Advantage", "UPS Ground Saver", "USPS Priority Mail"] }),
      rates: (app) => ({
        nav: "Shipments",
        body: head("Create label", "Order #1048 from Storelib, to Ana Petrović", btn("Buy label")) +
          `<div class="two"><div>${table([{ h: "Service" }, { h: "Estimated delivery" }, { h: "Rate", r: true }], [
            [{ check: "USPS Ground Advantage" }, "2 to 5 business days", { strong: "$4.85" }],
            ["UPS Ground Saver", "2 to 5 business days", "$5.42"],
            ["USPS Priority Mail", "1 to 3 business days", "$8.10"],
            ["UPS Ground", "1 to 5 business days", "$9.37"],
            ["USPS Priority Mail Express", "1 to 2 business days", "$29.95"],
          ])}</div>${kv("Package", [["Order", "#1048"], ["Item", "Harbour print, A3"], ["Parcel", "Tube, 0.4 kg"], ["From", "Portland, OR"], ["To", "Austin, TX"], ["Address", { badge: "Validated", tone: "green" }]])}</div>`,
      }),
    },
  },
  easypost: {
    name: "EasyPost", logo: "easypost.png", accent: "#2d5bff",
    nav: ["Dashboard", "Shipments", "Trackers", "Addresses", "Reports", "API keys"],
    views: {
      shipments: (app) => eventsTable(app, {
        nav: "Shipments", title: "Shipments", sub: "Labels bought from Storelib orders", tabs: ["All", "Purchased", "Returns"],
        cols: [{ h: "Shipment" }, { h: "Reference" }, { h: "To" }, { h: "Carrier, service" }, { h: "Status" }, { h: "Created", r: true }],
        rows: ORDERS.slice(0, 6).map(([no, p], k) => [{ mono: `shp_${["8c1f", "7a2e", "6d90", "5b44", "4e17", "3f02"][k]}…` }, { strong: no }, person(p, false), ["USPS, GroundAdvantage", "USPS, Priority", "UPS, Ground", "USPS, GroundAdvantage", "USPS, GroundAdvantage", "UPS, Ground"][k], [{ badge: "Pre transit", tone: "gray" }, { badge: "In transit", tone: "blue" }, { badge: "In transit", tone: "blue" }, { badge: "Delivered", tone: "green" }, { badge: "Delivered", tone: "green" }, { badge: "Delivered", tone: "green" }][k], { muted: ["Nov 22", "Nov 22", "Nov 21", "Nov 21", "Nov 20", "Nov 19"][k] }]),
      }),
      tracker: (app) => ({
        nav: "Trackers",
        body: head("Tracker for #1047", "USPS Priority Mail, 9400 1112 0255 0187 31", btn("Copy tracking link", "sec")) +
          `<div class="two"><div>${timeline([
            { label: "Out for delivery", place: "Chicago, IL", t: "Nov 24, 8:12", done: true },
            { label: "Arrived at post office", place: "Chicago, IL", t: "Nov 24, 5:40", done: true },
            { label: "In transit", place: "Regional facility, Indianapolis, IN", t: "Nov 23, 21:05", done: true },
            { label: "Accepted by carrier", place: "Portland, OR", t: "Nov 22, 16:30", done: true },
            { label: "Label created", place: "From Storelib order #1047", t: "Nov 22, 11:02", done: true },
          ])}</div>${kv("Tracker", [["Status", { badge: "Out for delivery", tone: "blue" }], ["Carrier", "USPS"], ["Est. delivery", "Nov 24"], ["Webhook", "storelib.com"], ["Storelib order", "#1047"]])}</div>`,
      }),
    },
  },
  aftership: {
    name: "AfterShip", logo: "aftership.svg", accent: "#ff6b2b",
    nav: ["Shipments", "Notifications", "Tracking page", "Analytics", "Apps", "Settings"],
    views: {
      shipments: (app) => eventsTable(app, {
        nav: "Shipments", title: "Shipments", sub: "Followed for Storelib orders", tabs: ["All", "In transit", "Out for delivery", "Delivered", "Exception"],
        cols: [{ h: "Tracking number" }, { h: "Order" }, { h: "Customer" }, { h: "Courier" }, { h: "Status" }, { h: "Last update", r: true }],
        rows: ORDERS.slice(0, 6).map(([no, p], k) => [{ mono: ["9400111202550187", "1Z999AA101234567", "9400111202550186", "JJD0002249317750", "9400111202550144", "1Z999AA101234521"][k] }, { strong: no }, person(p, false), ["USPS", "UPS", "USPS", "DHL", "USPS", "UPS"][k], [{ badge: "In transit", tone: "blue" }, { badge: "Out for delivery", tone: "violet" }, { badge: "In transit", tone: "blue" }, { badge: "Delivered", tone: "green" }, { badge: "Delivered", tone: "green" }, { badge: "Exception", tone: "red" }][k], { muted: ["2 h ago", "4 h ago", "6 h ago", "Nov 21", "Nov 20", "Nov 20"][k] }]),
      }),
      detail: (app) => ({
        nav: "Shipments",
        body: head("UPS 1Z999AA101234567", "Order #1047 from Storelib, Jonas Weber", btn("Notify customer", "sec")) +
          `<div class="two"><div>${timeline([
            { label: "Out for delivery", place: "Berlin, DE", t: "Nov 24, 07:48", done: true },
            { label: "Arrived at facility", place: "Berlin, DE", t: "Nov 23, 22:10", done: true },
            { label: "Departed facility", place: "Cologne, DE", t: "Nov 23, 09:31", done: true },
            { label: "Shipment information received", place: "Label created", t: "Nov 22, 14:02", done: true },
          ])}</div>${kv("Shipment", [["Status", { badge: "Out for delivery", tone: "violet" }], ["Courier", "UPS"], ["Expected", "Today"], ["Emails sent", "3"], ["Storelib order", "#1047"]])}</div>`,
      }),
    },
  },
  "google-analytics": {
    name: "Google Analytics", logo: "google-analytics.svg", accent: "#e8710a", chart: "#1a73e8", link: "#1a73e8", button: "#1a73e8", tabInk: "#1a73e8", navOn: "#e8f0fe", navOnInk: "#174ea6",
    nav: ["Home", "Reports", "Explore", "Advertising", "Admin"],
    views: {
      events: (app) => eventsTable(app, {
        nav: "Reports", title: "Events", sub: "Mara Lind Studio, web stream: storelib.com", cta: "Last 28 days",
        stats: [{ label: "Event count", value: "18,406" }, { label: "Total users", value: "2,913" }, { label: "Purchases", value: "126" }],
        cols: [{ h: "Event name" }, { h: "Event count", r: true }, { h: "Total users", r: true }, { h: "Event count per user", r: true }, { h: "Sent by" }],
        rows: [["page_view", "11,820", "2,913", "4.06", { tag: "Storelib" }], ["view_item", "3,402", "1,488", "2.29", { tag: "Storelib" }], ["add_to_cart", "611", "402", "1.52", { tag: "Storelib" }], ["begin_checkout", "247", "203", "1.22", { tag: "Storelib" }], ["purchase", "126", "119", "1.06", { tag: "Storelib" }]].map((r) => [{ link: r[0] }, ...r.slice(1)]),
      }),
      purchases: (app) => eventsTable(app, {
        nav: "Reports", title: "Ecommerce purchases", sub: "Monetisation, last 28 days", cta: "Compare",
        cols: [{ h: "Item name" }, { h: "Items viewed", r: true }, { h: "Items added to cart", r: true }, { h: "Items purchased", r: true }, { h: "Item revenue", r: true }],
        rows: [["Harbour print, A3", "1,204", "212", "48", "$1,632.00"], ["Tide tee", "887", "164", "31", "$899.00"], ["Harbour print, A2", "642", "98", "22", "$1,078.00"], ["Lighthouse mug", "418", "71", "16", "$288.00"], ["Dune tote bag", "301", "49", "9", "$198.00"]],
      }),
    },
  },
  "google-tag-manager": {
    name: "Tag Manager", logo: "google-tag-manager.svg", accent: "#1a73e8", link: "#1a73e8", navOn: "#e8f0fe", navOnInk: "#174ea6", crumb: "storelib.com, GTM-K7Q2XW",
    nav: ["Overview", "Tags", "Triggers", "Variables", "Folders", "Templates"],
    views: {
      tags: (app) => eventsTable(app, {
        nav: "Tags", title: "Tags", sub: "Workspace: Default", cta: "New",
        cols: [{ h: "Name" }, { h: "Type" }, { h: "Firing triggers" }, { h: "Last edited", r: true }],
        rows: [
          [{ link: "GA4 Configuration" }, "Google Tag", { tag: "All Pages" }, { muted: "3 days ago" }],
          [{ link: "GA4 Event, purchase" }, "Google Analytics: GA4 Event", { tag: "purchase" }, { muted: "3 days ago" }],
          [{ link: "GA4 Event, add_to_cart" }, "Google Analytics: GA4 Event", { tag: "add_to_cart" }, { muted: "3 days ago" }],
          [{ link: "Google Ads, Purchase" }, "Google Ads Conversion Tracking", { tag: "purchase" }, { muted: "2 days ago" }],
          [{ link: "Conversion Linker" }, "Conversion Linker", { tag: "All Pages" }, { muted: "2 days ago" }],
          [{ link: "Meta Pixel, base" }, "Custom HTML", { tag: "All Pages" }, { muted: "1 day ago" }],
        ],
      }),
      preview: (app) => ({
        nav: "Overview", crumb: "Tag Assistant, storelib.com/maralind",
        body: head("Tag Assistant", "Connected to storelib.com/maralind/checkout/done", btn("Finish", "sec")) +
          `<div class="split"><div class="card list">${[["Consent Initialization"], ["Initialization"], ["Container Loaded"], ["page_view"], ["view_item"], ["add_to_cart"], ["begin_checkout"], ["purchase", 1]].map(([n, on], i) => `<div class="it ${on ? "on" : ""}"><span class="n">${i + 1}</span><b>${esc(n)}</b></div>`).join("")}</div><div><p class="sect">Tags fired on purchase</p>${table([{ h: "Tag" }, { h: "Type" }, { h: "Status" }], [[{ strong: "GA4 Event, purchase" }, "GA4 Event", { badge: "Succeeded", tone: "green" }], [{ strong: "Google Ads, Purchase" }, "Google Ads Conversion", { badge: "Succeeded", tone: "green" }], [{ strong: "Conversion Linker" }, "Conversion Linker", { badge: "Succeeded", tone: "green" }]])}<p class="sect" style="margin-top:14px">Data layer, sent by Storelib</p><div class="code">{ event: "purchase", transaction_id: "1048",
  ecommerce: { transaction_id: "1048",
    value: 34, currency: "USD" } }</div></div></div>`,
      }),
    },
  },
  "google-ads": {
    name: "Google Ads", logo: "google-ads.svg", accent: "#1a73e8", link: "#1a73e8", navOn: "#e8f0fe", navOnInk: "#174ea6",
    nav: ["Overview", "Campaigns", "Goals", "Tools", "Billing", "Admin"],
    views: {
      conversions: (app) => eventsTable(app, {
        nav: "Goals", title: "Conversions summary", sub: "Mara Lind Studio, last 30 days", cta: "New conversion action",
        cols: [{ h: "Conversion action" }, { h: "Source" }, { h: "Status" }, { h: "Conversions", r: true }, { h: "Conv. value", r: true }],
        rows: [
          [{ link: "Purchase (storelib.com)" }, "Website", { badge: "Active", tone: "green" }, "41", "$1,394.00"],
          [{ link: "Calls from ads" }, "Ad call", { badge: "Active", tone: "green" }, "6", "n/a"],
          [{ link: "Page view" }, "Website", { badge: "Inactive", tone: "gray" }, "0", "n/a"],
        ],
      }),
      action: (app) => ({
        nav: "Goals",
        body: head("Purchase (storelib.com)", "Conversion action", btn("Edit settings", "sec")) +
          `<div class="two"><div>${kv("Details", [["Goal and action optimisation", "Purchase, primary action"], ["Value", "Use different values for each conversion"], ["Count", "Every"], ["Click-through conversion window", "30 days"], ["Attribution", "Data-driven"], ["Conversion label", { mono: "AW-11498273/pQ7xC" }]])}</div>${kv("Tag setup", [["Google tag", "Installed"], ["Installed with", "Storelib"], ["Fires on", "Order confirmation"], ["Status", { badge: "Recording conversions", tone: "green" }]])}</div>`,
      }),
    },
  },
  "meta-pixel": {
    name: "Events Manager", logo: "meta.svg", accent: "#0866ff", link: "#0866ff", crumb: "Mara Lind Studio pixel",
    nav: ["Overview", "Test events", "Diagnostics", "History", "Settings"],
    views: {
      overview: (app) => eventsTable(app, {
        nav: "Overview", title: "Mara Lind Studio pixel", sub: "Pixel ID 1149827736015542", cta: "Add events",
        cols: [{ h: "Event" }, { h: "Used by" }, { h: "Connection method" }, { h: "Total events", r: true }, { h: "Last received", r: true }],
        rows: [["PageView", "Ads", "Browser", "11,612", "1 minute ago"], ["ViewContent", "Ads", "Browser", "3,388", "4 minutes ago"], ["AddToCart", "Ads", "Browser", "604", "18 minutes ago"], ["InitiateCheckout", "Ads", "Browser", "244", "1 hour ago"], ["Purchase", "Ads", "Browser", "124", "2 hours ago"]].map((r) => [{ strong: r[0] }, r[1], { tag: r[2] }, r[3], { muted: r[4] }]),
      }),
      test: (app) => ({
        nav: "Test events",
        body: head("Test events", "Receiving events from storelib.com/maralind", btn("Clear activity", "sec")) +
          `<div class="two"><div>${table([{ h: "Event" }, { h: "Received from" }, { h: "Status" }], [[{ strong: "Purchase" }, "storelib.com/maralind/checkout/done", { badge: "Processed", tone: "green" }], [{ strong: "InitiateCheckout" }, "storelib.com/maralind/checkout", { badge: "Processed", tone: "green" }], [{ strong: "AddToCart" }, "storelib.com/maralind/harbour-print", { badge: "Processed", tone: "green" }], [{ strong: "ViewContent" }, "storelib.com/maralind/harbour-print", { badge: "Processed", tone: "green" }], [{ strong: "PageView" }, "storelib.com/maralind", { badge: "Processed", tone: "green" }]])}</div>${kv("Purchase parameters", [["value", "34.00"], ["currency", "USD"], ["content_ids", "harbour-print-a3"], ["content_type", "product"], ["num_items", "1"]])}</div>`,
      }),
    },
  },
  "tiktok-pixel": {
    name: "Events Manager", logo: "tiktok.svg", accent: "#fe2c55", link: "#fe2c55", crumb: "TikTok Ads Manager",
    nav: ["Data sources", "Events", "Test events", "Diagnostics", "Settings"],
    views: {
      events: (app) => eventsTable(app, {
        nav: "Events", title: "Mara Lind Studio", sub: "Web pixel, connected manually through Storelib", cta: "Manage events",
        cols: [{ h: "Event" }, { h: "Type" }, { h: "Method" }, { h: "Received, 7 days", r: true }, { h: "Status" }],
        rows: [["Page View", "Standard", "Pixel", "2,904"], ["View Content", "Standard", "Pixel", "846"], ["Add to Cart", "Standard", "Pixel", "151"], ["Initiate Checkout", "Standard", "Pixel", "61"], ["Complete Payment", "Standard", "Pixel", "31"]].map((r) => [{ strong: r[0] }, r[1], { tag: r[2] }, r[3], { badge: "Active", tone: "green" }]),
      }),
      test: (app) => ({
        nav: "Test events",
        body: head("Test events", "Open storelib.com/maralind to see events here", btn("Clear", "sec")) +
          `<div class="two"><div>${table([{ h: "Event" }, { h: "URL" }, { h: "Time", r: true }], [[{ strong: "Complete Payment" }, "/maralind/checkout/done", { muted: "14:02:41" }], [{ strong: "Initiate Checkout" }, "/maralind/checkout", { muted: "14:02:10" }], [{ strong: "Add to Cart" }, "/maralind/tide-tee", { muted: "14:01:52" }], [{ strong: "View Content" }, "/maralind/tide-tee", { muted: "14:01:40" }], [{ strong: "Page View" }, "/maralind", { muted: "14:01:31" }]])}</div>${kv("Complete Payment", [["value", "29.00"], ["currency", "USD"], ["content_id", "tide-tee-m"], ["Status", { badge: "Received", tone: "green" }]])}</div>`,
      }),
    },
  },
  "pinterest-tag": {
    name: "Pinterest Business", logo: "pinterest.svg", accent: "#e60023", link: "#e60023", button: "#e60023", crumb: "Conversions",
    nav: ["Overview", "Conversions", "Tag events", "Event history", "Audiences"],
    views: {
      tag: (app) => eventsTable(app, {
        nav: "Tag events", title: "Tag events", sub: "Tag ID 2613498857120, on storelib.com", cta: "Set up event",
        cols: [{ h: "Event" }, { h: "Source" }, { h: "Status" }, { h: "Events, 7 days", r: true }, { h: "Last fired", r: true }],
        rows: [["Page visit", "Tag", "Active", "2,611", "2 min ago"], ["Add to cart", "Tag", "Active", "143", "21 min ago"], ["Checkout", "Tag", "Active", "28", "2 h ago"], ["Lead", "Tag", "Active", "9", "1 day ago"]].map((r) => [{ strong: r[0] }, { tag: r[1] }, { badge: r[2], tone: r[2] === "Active" ? "green" : "gray" }, r[3], { muted: r[4] }]),
      }),
      history: (app) => ({
        nav: "Event history",
        body: head("Event history", "The latest events from storelib.com/maralind", btn("Export", "sec")) +
          `<div class="two"><div>${table([{ h: "Event" }, { h: "Page" }, { h: "Time", r: true }], [[{ strong: "checkout" }, "/maralind/checkout/done", { muted: "12:44" }], [{ strong: "addtocart" }, "/maralind/harbour-print", { muted: "12:41" }], [{ strong: "pagevisit" }, "/maralind/harbour-print", { muted: "12:40" }], [{ strong: "pagevisit" }, "/maralind", { muted: "12:39" }], [{ strong: "pagevisit" }, "/maralind/dune-tote", { muted: "12:31" }]])}</div>${kv("checkout", [["value", "34.00"], ["currency", "USD"], ["order_quantity", "1"], ["order_id", "1048"], ["Status", { badge: "Matched", tone: "green" }]])}</div>`,
      }),
    },
  },
  "microsoft-clarity": {
    name: "Clarity", logo: "microsoft-clarity.png", accent: "#0078d4", link: "#0078d4", crumb: "Mara Lind Studio",
    nav: ["Dashboard", "Recordings", "Heatmaps", "Insights", "Settings"],
    views: {
      dashboard: (app) => ({
        nav: "Dashboard",
        body: head("Dashboard", "storelib.com/maralind, last 3 days", btn("Filters", "sec")) +
          stats([{ label: "Sessions", value: "1,284" }, { label: "Pages per session", value: "3.1" }, { label: "Scroll depth", value: "58%" }, { label: "Active time", value: "1m 42s" }]) +
          `<div class="two"><div class="card kv"><h3>Popular pages</h3>${[["/maralind", "1,102"], ["/maralind/harbour-print", "486"], ["/maralind/tide-tee", "311"], ["/maralind/checkout", "149"]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>${kv("Behaviour", [["Dead clicks", "3.2%"], ["Rage clicks", "0.6%"], ["Quick backs", "4.1%"], ["Excessive scrolling", "1.4%"]])}</div>`,
      }),
      recordings: (app) => eventsTable(app, {
        nav: "Recordings", title: "Recordings", sub: "Sessions on storelib.com/maralind", cta: "Filters",
        cols: [{ h: "Entry page" }, { h: "Exit page" }, { h: "Pages", r: true }, { h: "Duration", r: true }, { h: "Device" }, { h: "When", r: true }],
        rows: [["/maralind", "/maralind/checkout/done", "6", "4m 12s", "Mobile", "12 min ago"], ["/maralind/harbour-print", "/maralind/harbour-print", "1", "0m 38s", "Desktop", "25 min ago"], ["/maralind", "/maralind/tide-tee", "3", "1m 51s", "Mobile", "41 min ago"], ["/maralind/dune-tote", "/maralind/checkout", "4", "2m 37s", "Mobile", "1 h ago"], ["/maralind", "/maralind", "1", "0m 12s", "Tablet", "1 h ago"], ["/maralind/tide-tee", "/maralind/checkout/done", "5", "3m 05s", "Desktop", "2 h ago"]].map((r) => [{ link: r[0] }, { muted: r[1] }, r[2], r[3], { tag: r[4] }, { muted: r[5] }]),
      }),
    },
  },
  calendly: {
    name: "Calendly", logo: "calendly.svg", accent: "#006bff", link: "#006bff",
    nav: ["Scheduling", "Meetings", "Availability", "Contacts", "Workflows", "Integrations & apps"],
    views: {
      meetings: (app) => eventsTable(app, {
        nav: "Meetings", title: "Meetings", sub: "Upcoming, sent to Storelib bookings as they are made", tabs: ["Upcoming", "Past", "Date range"],
        cols: [{ h: "When" }, { h: "Invitee" }, { h: "Event type" }, { h: "In Storelib" }],
        rows: [["Tue, Nov 25, 10:00", 0, "Portrait session, 60 min"], ["Tue, Nov 25, 14:30", 2, "Print consultation, 30 min"], ["Wed, Nov 26, 09:00", 3, "Portrait session, 60 min"], ["Thu, Nov 27, 11:00", 4, "Print consultation, 30 min"], ["Fri, Nov 28, 16:00", 6, "Studio visit, 45 min"]].map((r) => [{ strong: r[0] }, person(r[1]), r[2], { badge: "Booked", tone: "green" }]),
      }),
      webhooks: (app) => eventsTable(app, {
        nav: "Integrations & apps", title: "Webhook subscriptions", sub: "Added by Storelib when you connected Calendly", cta: "Docs",
        cols: [{ h: "Endpoint" }, { h: "Events" }, { h: "Scope" }, { h: "State" }],
        rows: [[{ mono: "storelib.com/api/bookings/external/hook/calendly/…" }, { tag: ["invitee.created", "invitee.canceled"] }, "User", { badge: "Active", tone: "green" }]],
      }),
    },
  },
  "cal-com": {
    name: "Cal.com", logo: "cal-com.svg", accent: "#111827", tabInk: "#111827", navOn: "#f3f4f6",
    nav: ["Event types", "Bookings", "Availability", "Apps", "Workflows", "Settings"],
    views: {
      bookings: (app) => eventsTable(app, {
        nav: "Bookings", title: "Bookings", sub: "See upcoming and past events booked through your links", tabs: ["Upcoming", "Unconfirmed", "Recurring", "Past", "Cancelled"],
        cols: [{ h: "When" }, { h: "Event" }, { h: "Attendee" }, { h: "In Storelib" }],
        rows: [["Tue 25 Nov, 10:00 to 11:00", "Portrait session", 0], ["Tue 25 Nov, 14:30 to 15:00", "Print consultation", 1], ["Wed 26 Nov, 09:00 to 10:00", "Portrait session", 5], ["Thu 27 Nov, 11:00 to 11:30", "Print consultation", 2], ["Fri 28 Nov, 16:00 to 16:45", "Studio visit", 3]].map((r) => [{ strong: r[0] }, r[1], person(r[2]), { badge: "Booked", tone: "green" }]),
      }),
      webhooks: (app) => ({
        nav: "Settings",
        body: head("Webhooks", "Settings, Developer", btn("New")) +
          table([{ h: "Subscriber URL" }, { h: "Event triggers" }, { h: "Status" }], [[{ mono: "storelib.com/api/bookings/external/hook/calcom/…" }, { tag: ["Booking created", "Booking rescheduled", "Booking cancelled"] }, { badge: "Enabled", tone: "green" }]]) +
          `<div style="margin-top:14px">${kv("Added by Storelib", [["Payload", "Default"], ["Secret", "Set"], ["Last delivery", { badge: "200 OK", tone: "green" }]])}</div>`,
      }),
    },
  },
  discord: {
    name: "Discord", logo: "discord.svg", accent: "#5865f2", side: "dark", crumb: "Mara Lind Studio, Server settings",
    nav: ["Overview", "Roles", "Emoji", "Integrations", "Members", "Invites"],
    views: {
      roles: (app) => ({
        nav: "Roles",
        body: head("Roles", "Use roles to group your server members and assign permissions.", btn("Create role")) +
          table([{ h: "Roles" }, { h: "Members", r: true }, { h: "Managed by" }], [[{ swatch: "#f0b232", label: "Members' circle" }, "42", { muted: "Given and taken back by Storelib" }], [{ swatch: "#5865f2", label: "Storelib" }, "1", { muted: "Bot role" }], [{ swatch: "#23a55a", label: "Moderators" }, "3", { muted: "You" }], [{ swatch: "#949ba4", label: "@everyone" }, "318", { muted: "Default" }]]),
      }),
      members: (app) => ({
        nav: "Members",
        body: head("Server members", "Showing members with Members' circle", btn("Prune", "sec")) +
          table([{ h: "Name" }, { h: "Member since" }, { h: "Joined Discord" }, { h: "Roles" }], [0, 1, 2, 3, 4, 6].map((i, k) => [person(i, false), { muted: ["Nov 22, 2026", "Nov 21, 2026", "Nov 18, 2026", "Nov 12, 2026", "Nov 03, 2026", "Oct 28, 2026"][k] }, { muted: ["2019", "2021", "2020", "2018", "2023", "2022"][k] }, { tag: ["Members' circle"] }])),
      }),
    },
  },
  zapier: {
    name: "Zapier", logo: "zapier.svg", accent: "#ff4f00",
    nav: ["Home", "Zaps", "Tables", "Interfaces", "Zap history", "Apps"],
    views: {
      zap: (app) => ({
        nav: "Zaps",
        body: head("New signup to a sheet", "Zap, on", btn("Publish")) +
          `<div class="zap">${[
            ["Trigger", "1. Catch Hook", "Webhooks by Zapier, event onepage.signup from Storelib", "#ff4f00", "W"],
            ["Action", "2. Create spreadsheet row", "Google Sheets", "#0f9d58", "G"],
            ["Action", "3. Send email", "Gmail", "#5f6368", "M"],
          ].map(([k, l, a, c, i], n) => `${n ? '<div class="line"></div>' : ""}<div class="card zstep"><div class="k">${k}</div><div class="row"><span class="ic" style="background:${c}">${i}</span><span><b>${esc(l)}</b><small>${esc(a)}</small></span></div></div>`).join("")}</div>`,
      }),
      history: (app) => eventsTable(app, {
        nav: "Zap history", title: "Zap history", sub: "New signup to a sheet", tabs: ["Zap runs", "Task usage"],
        cols: [{ h: "Status" }, { h: "Started" }, { h: "Trigger data" }, { h: "Steps", r: true }],
        rows: [[0, "Nov 22, 14:02"], [1, "Nov 22, 11:47"], [2, "Nov 21, 18:30"], [3, "Nov 21, 09:15"], [4, "Nov 20, 20:04"], [6, "Nov 20, 08:41"]].map(([i, t]) => [{ badge: "Success", tone: "green" }, { muted: t }, { mono: P[i].e }, "3"]),
      }),
    },
  },
  make: {
    name: "Make", logo: "make.svg", accent: "#6d00cc",
    nav: ["Scenarios", "Templates", "Connections", "Webhooks", "Data stores", "Organization"],
    views: {
      scenario: (app) => ({
        nav: "Scenarios",
        body: head("Storelib signups", "Scenario, every time data arrives", btn("Run once", "sec") + " " + btn("Save")) +
          `<div class="nodes">${[
            ["#c3207f", "W", "Webhooks", "Storelib signup"],
            ["#0f9d58", "G", "Google Sheets", "Add a row"],
            ["#4a154b", "#", "Slack", "Create a message"],
          ].map(([c, i, a, l]) => `<div class="node"><span class="o" style="background:${c}">${esc(i)}</span><b>${esc(a)}</b><small>${esc(l)}</small></div>`).join("")}</div>`,
      }),
      history: (app) => eventsTable(app, {
        nav: "Scenarios", title: "History", sub: "Storelib signups", tabs: ["Diagram", "History", "Incomplete executions"],
        cols: [{ h: "Date" }, { h: "Status" }, { h: "Duration", r: true }, { h: "Operations", r: true }, { h: "Data transfer", r: true }],
        rows: [["Nov 22, 14:02", "1.2 s", "3", "1.8 KB"], ["Nov 22, 11:47", "0.9 s", "3", "1.7 KB"], ["Nov 21, 18:30", "1.1 s", "3", "1.8 KB"], ["Nov 21, 09:15", "1.0 s", "3", "1.7 KB"], ["Nov 20, 20:04", "1.3 s", "3", "1.9 KB"], ["Nov 20, 08:41", "0.8 s", "3", "1.7 KB"]].map((r) => [{ muted: r[0] }, { badge: "Success", tone: "green" }, r[1], r[2], r[3]]),
      }),
    },
  },
}

/* ---------- render ---------- */
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const PREVIEW = process.env.PREVIEW || null
if (PREVIEW) mkdirSync(PREVIEW, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 2 })
  const sizes = []
  for (const [id, spec] of Object.entries(APPS)) {
    if (ONLY && !ONLY.includes(id)) continue
    const app = { ...spec, logo: logo(spec.logo) }
    for (const [view, draw] of Object.entries(spec.views)) {
      const v = draw(app)
      const html = frame(app, { nav: v.nav, crumb: v.crumb || spec.crumb }, v.body)
      if (PREVIEW) writeFileSync(join(PREVIEW, `${id}-${view}.html`), html)
      await page.setContent(html, { waitUntil: "load" })
      await page.evaluate(() => document.fonts.ready)
      const over = await page.evaluate(() => [...document.querySelectorAll(".main *")].filter((el) => el.getBoundingClientRect().right > 961 || el.getBoundingClientRect().bottom > 541).map((el) => el.className || el.tagName).slice(0, 3))
      if (over.length) console.log(`  ! ${id}-${view} runs past the frame:`, over)
      const png = await page.screenshot({ type: "png" })
      for (const w of WIDTHS) {
        const file = join(OUT, `${id}-${view}-${w}.webp`)
        const info = await sharp(png).resize({ width: w }).webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(file)
        sizes.push(info.size)
      }
      console.log(`  ${id}-${view}`)
    }
  }
  console.log(`\n${sizes.length} files, ${(sizes.reduce((a, b) => a + b, 0) / 1024).toFixed(0)} KB in all, largest ${(Math.max(...sizes) / 1024).toFixed(1)} KB`)
} finally {
  await browser.close()
}
