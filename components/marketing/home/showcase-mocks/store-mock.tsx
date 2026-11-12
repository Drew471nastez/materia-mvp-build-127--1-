import { ArrowRight, Check, ChevronDown, Download, Heart, Lock, Menu, Play, Search, ShoppingBag, Star, User } from "lucide-react"
import { Pic, StatusBar, u } from "./frame"

/*
  Three fictional storefronts, each with its own name, mark, palette and type:
    Hollow Pines   — an Oregon folk band's merch store (physical products)
    Gridline       — a designer's Notion/Figma template shop (digital products)
    Brush & Bloom  — a watercolor teacher's course site (courses)
  Desktop pages are drawn at 1040 design px, phone pages at 390.
*/
export type StoreBrand = "hollow" | "gridline" | "bloom"

const Stars = ({ n = 5 }: { n?: number }) => (
  <span className="sm-stars">
    {Array.from({ length: n }, (_, i) => (
      <Star key={i} fill="currentColor" strokeWidth={0} />
    ))}
  </span>
)

/* ----------------------------------------------------------------- Hollow Pines */
const HOLLOW_PRODUCTS = [
  { n: "hp-hoodie", name: "Pinewood Heavyweight Hoodie", price: "$68", tag: "Bestseller", dots: ["#8c8f8a", "#2d3a2f", "#e9e3d6"] },
  { n: "hp-tee", name: "Long Winter Tour Tee", price: "$34", tag: "", dots: ["#151515", "#efe9de"] },
  { n: "hp-cap", name: "Trailhead Dad Cap", price: "$28", tag: "Low stock", dots: ["#f1efea", "#2d3a2f"] },
  { n: "hp-crew", name: "Campfire Crewneck", price: "$58", tag: "", dots: ["#f4f2ee", "#b5532b"] },
]

function HollowDesktop() {
  return (
    <div className="hp">
      <div className="hp-ann">Free US shipping over $75 · Long Winter tour merch ships Oct 28</div>
      <nav className="hp-nav">
        <span className="hp-links">
          <b>Shop</b>
          <span>Tour</span>
          <span>Music</span>
          <span>Journal</span>
        </span>
        <span className="hp-mark">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 5 13h4l-3 5h12l-3-5h4z" fill="currentColor" />
            <rect x="11" y="18" width="2" height="4" fill="currentColor" />
          </svg>
          HOLLOW PINES
        </span>
        <span className="hp-icons">
          <Search />
          <User />
          <span className="hp-cart">
            <ShoppingBag />
            <i>2</i>
          </span>
        </span>
      </nav>
      <header className="hp-hero">
        <Pic n="hp-hero" w={1200} h={640} />
        <div className="hp-hero-copy">
          <p className="hp-eyebrow">The Long Winter collection</p>
          <h3>Made for cold mornings and long drives.</h3>
          <span className="hp-btn">Shop the collection</span>
        </div>
      </header>
      <div className="hp-row">
        <h4>New arrivals</h4>
        <span>
          View all <ArrowRight />
        </span>
      </div>
      <div className="hp-grid">
        {HOLLOW_PRODUCTS.map((p) => (
          <div className="hp-card" key={p.n}>
            <div className="hp-img">
              <Pic n={p.n} w={480} h={600} />
              {p.tag && <em>{p.tag}</em>}
            </div>
            <p className="hp-name">{p.name}</p>
            <p className="hp-price">{p.price}</p>
            <span className="hp-dots">
              {p.dots.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HollowMobile() {
  return (
    <div className="hp hpm">
      <StatusBar />
      <nav className="hpm-nav">
        <Menu />
        <span className="hp-mark">HOLLOW PINES</span>
        <span className="hp-cart">
          <ShoppingBag />
          <i>2</i>
        </span>
      </nav>
      <div className="hpm-img">
        <Pic n="hp-hoodie" w={640} h={800} />
        <span className="hpm-fav">
          <Heart />
        </span>
        <span className="hpm-pager">
          <i className="on" />
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="hpm-body">
        <div className="hpm-title">
          <h3>Pinewood Heavyweight Hoodie</h3>
          <p>$68</p>
        </div>
        <p className="hpm-rate">
          <Stars /> 4.9 · 312 reviews
        </p>
        <p className="hpm-label">
          Color <b>Fog grey</b>
        </p>
        <div className="hpm-swatches">
          <i className="on" style={{ background: "#8c8f8a" }} />
          <i style={{ background: "#2d3a2f" }} />
          <i style={{ background: "#e9e3d6" }} />
        </div>
        <p className="hpm-label">
          Size <b>M</b>
          <span>Size guide</span>
        </p>
        <div className="hpm-sizes">
          {["XS", "S", "M", "L", "XL"].map((s) => (
            <span key={s} className={s === "M" ? "on" : s === "XS" ? "out" : ""}>
              {s}
            </span>
          ))}
        </div>
        <span className="hpm-add">Add to cart · $68</span>
        <span className="hpm-buy">Buy now</span>
        <p className="hpm-note">Ships in 1–2 business days · Free returns</p>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Gridline */
const GL_PRODUCTS = [
  { n: "gl-grad", name: "Second Brain OS", kind: "Notion", price: "$29", sold: "2.4k sold" },
  { n: "gl-sketch", name: "Pitch Deck Kit", kind: "Figma", price: "$49", sold: "1.1k sold" },
  { n: "gl-desk", name: "Freelance CRM", kind: "Notion", price: "$19", sold: "3.8k sold" },
]

function GridMark() {
  return (
    <span className="gl-mark">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** A tiny Notion-like dashboard, drawn rather than photographed. */
function NotionCover({ big = false }: { big?: boolean }) {
  return (
    <div className={`gl-cover${big ? " big" : ""}`}>
      <div className="gl-win">
        <div className="gl-win-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="gl-win-body">
          <p className="gl-win-h">Second Brain</p>
          <div className="gl-win-cols">
            {["Projects", "Areas", "Resources"].map((c, i) => (
              <div key={c}>
                <b>{c}</b>
                <span style={{ width: `${78 - i * 12}%` }} />
                <span style={{ width: `${56 + i * 10}%` }} />
                <span style={{ width: `${66 - i * 6}%` }} />
              </div>
            ))}
          </div>
          <div className="gl-win-bars">
            <span style={{ width: "72%" }} />
            <span style={{ width: "48%" }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function GridlineDesktop() {
  return (
    <div className="gl">
      <nav className="gl-nav">
        <span className="gl-logo">
          <GridMark /> gridline
        </span>
        <span className="gl-links">
          <b>Templates</b>
          <span>UI kits</span>
          <span>Fonts</span>
          <span>Freebies</span>
        </span>
        <span className="gl-cta">All-access · $149</span>
      </nav>
      <header className="gl-hero">
        <div>
          <p className="gl-eyebrow">
            <i /> New: Second Brain OS 3.0
          </p>
          <h3>Systems for people who ship.</h3>
          <p className="gl-sub">Notion, Figma and Framer templates used by 18,000+ designers, freelancers and founders.</p>
          <span className="gl-btns">
            <span className="gl-btn">Browse templates</span>
            <span className="gl-btn ghost">Free starter kit</span>
          </span>
          <span className="gl-proof">
            <span className="gl-faces">
              <Pic n="av-c" w={96} h={96} />
              <Pic n="av-e" w={96} h={96} />
              <Pic n="av-h" w={96} h={96} />
            </span>
            <Stars /> 4.9 from 3,200+ reviews
          </span>
        </div>
        <NotionCover big />
      </header>
      <div className="gl-row">
        <h4>Bestsellers</h4>
        <span>
          See all 46 <ArrowRight />
        </span>
      </div>
      <div className="gl-grid">
        {GL_PRODUCTS.map((p, i) => (
          <div className="gl-card" key={p.n}>
            <div className="gl-img">
              <Pic n={p.n} w={640} h={480} />
              {i === 0 && <NotionCover />}
              <em>{p.kind}</em>
            </div>
            <div className="gl-meta">
              <p>{p.name}</p>
              <b>{p.price}</b>
            </div>
            <p className="gl-small">
              <Download /> Instant download · {p.sold}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function GridlineMobile() {
  return (
    <div className="gl glm">
      <StatusBar />
      <nav className="glm-nav">
        <span className="gl-logo">
          <GridMark /> gridline
        </span>
        <ShoppingBag />
      </nav>
      <div className="glm-cover">
        <NotionCover big />
      </div>
      <div className="glm-body">
        <p className="glm-kind">Notion template · v3.0</p>
        <h3>Second Brain OS</h3>
        <p className="glm-rate">
          <Stars /> 4.9 · 1,286 ratings
        </p>
        <p className="glm-price">
          $29 <s>$39</s> <em>Launch week</em>
        </p>
        <ul>
          {["12 linked databases, PARA ready", "Weekly review and goals dashboard", "38-min video walkthrough", "Free lifetime updates"].map((t) => (
            <li key={t}>
              <Check /> {t}
            </li>
          ))}
        </ul>
        <span className="glm-buy">Buy now · $29</span>
        <p className="glm-note">
          <Lock /> Secure checkout · Instant download
        </p>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Brush & Bloom */
const BB_MODULES = [
  { n: "bb-brush", t: "Module 1", h: "Brushes, paper and mixing greens", l: "6 lessons · 48 min" },
  { n: "bb-table", t: "Module 2", h: "Loose petals in three strokes", l: "8 lessons · 1h 12m" },
  { n: "bb-bouquet", t: "Module 3", h: "Composing a full bouquet", l: "9 lessons · 1h 31m" },
]

function BloomDesktop() {
  return (
    <div className="bb">
      <nav className="bb-nav">
        <span className="bb-logo">Brush &amp; Bloom</span>
        <span className="bb-links">
          <b>Courses</b>
          <span>Live workshops</span>
          <span>Paint kits</span>
          <span>Journal</span>
        </span>
        <span className="bb-right">
          <span>Log in</span>
          <span className="bb-btn sm">Enroll</span>
        </span>
      </nav>
      <header className="bb-hero">
        <div className="bb-copy">
          <p className="bb-eyebrow">Online course · Beginner friendly</p>
          <h3>
            Loose florals,
            <br />
            <i>in 21 days.</i>
          </h3>
          <p className="bb-sub">Elena Marsh’s watercolor course: 42 short lessons, printable tracing sheets and a private studio community.</p>
          <span className="bb-actions">
            <span className="bb-btn">Enroll · $129</span>
            <span className="bb-link">
              <Play fill="currentColor" strokeWidth={0} /> Watch lesson 1 free
            </span>
          </span>
          <p className="bb-rate">
            <Stars /> <b>4.9</b> from 2,140 students
          </p>
        </div>
        <div className="bb-media">
          <Pic n="bb-hero" w={1200} h={700} />
          <span className="bb-play">
            <Play fill="currentColor" strokeWidth={0} />
          </span>
          <span className="bb-chip">Lesson 1 · Mixing greens · 12:40</span>
        </div>
      </header>
      <div className="bb-mods">
        {BB_MODULES.map((m) => (
          <div className="bb-mod" key={m.t}>
            <div className="bb-mod-img">
              <Pic n={m.n} w={640} h={480} />
            </div>
            <div>
              <p className="bb-mod-t">{m.t}</p>
              <p className="bb-mod-h">{m.h}</p>
              <p className="bb-mod-l">{m.l}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BloomMobile() {
  return (
    <div className="bb bbm">
      <StatusBar />
      <nav className="bbm-nav">
        <Menu />
        <span className="bb-logo">Brush &amp; Bloom</span>
        <User />
      </nav>
      <div className="bbm-video">
        <Pic n="bb-hero" w={1200} h={700} />
        <span className="bb-play">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <span className="bbm-time">Preview · 2:14</span>
      </div>
      <div className="bbm-body">
        <h3>Loose Florals in 21 Days</h3>
        <p className="bbm-by">
          <Pic n="av-o" w={160} h={160} /> with <b>Elena Marsh</b>
        </p>
        <div className="bbm-stats">
          <span>
            <b>42</b>lessons
          </span>
          <span>
            <b>6h 20m</b>of video
          </span>
          <span>
            <b>4.9</b>2,140 ratings
          </span>
        </div>
        <p className="bbm-h">Curriculum</p>
        {[
          ["Brushes, paper and mixing greens", "6 lessons", true],
          ["Loose petals in three strokes", "8 lessons", false],
          ["Leaves, stems and negative space", "7 lessons", false],
          ["Composing a full bouquet", "9 lessons", false],
        ].map(([t, l, free]) => (
          <div className="bbm-row" key={t as string}>
            <span className="bbm-ico">{free ? <Play fill="currentColor" strokeWidth={0} /> : <Lock />}</span>
            <span>
              <b>{t}</b>
              <i>
                {l}
                {free ? " · Free preview" : ""}
              </i>
            </span>
            <ChevronDown />
          </div>
        ))}
        <span className="bbm-buy">Enroll now · $129</span>
        <p className="bbm-note">Lifetime access · 30-day refund</p>
      </div>
    </div>
  )
}

export function StoreDesktop({ brand }: { brand: StoreBrand }) {
  return brand === "hollow" ? <HollowDesktop /> : brand === "gridline" ? <GridlineDesktop /> : <BloomDesktop />
}

export function StoreMobile({ brand }: { brand: StoreBrand }) {
  return brand === "hollow" ? <HollowMobile /> : brand === "gridline" ? <GridlineMobile /> : <BloomMobile />
}

const SERIF = `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif`

export const STORE_CSS = u(`
.sm-stars{display:inline-flex;gap:1u;color:#f5a524;vertical-align:-1u}
.sm-stars svg{width:12u;height:12u}

.hp{height:100%;background:#f3eee3;color:#1f2a22;font-family:"DM Sans",var(--font-inter),Inter,sans-serif}
.hp-ann{height:30u;display:flex;align-items:center;justify-content:center;background:#1f2a22;color:#efe7d6;font-size:11.5u;letter-spacing:.02em}
.hp-nav{height:62u;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 36u;border-bottom:1u solid rgba(31,42,34,.12)}
.hp-links{display:flex;gap:26u;font-size:13.5u}
.hp-links b{font-weight:600;border-bottom:1.5u solid currentColor;padding-bottom:2u}
.hp-mark{display:flex;align-items:center;gap:8u;font-family:Montserrat,var(--font-inter),sans-serif;font-weight:700;font-size:17u;letter-spacing:.24em}
.hp-mark svg{width:20u;height:20u;color:#b5532b}
.hp-icons{display:flex;justify-content:flex-end;gap:20u}
.hp-icons svg,.hpm-nav svg{width:19u;height:19u;stroke-width:1.7}
.hp-cart{position:relative;display:flex}
.hp-cart i{position:absolute;right:-7u;top:-6u;min-width:15u;height:15u;border-radius:9u;background:#b5532b;color:#fff;font-size:9.5u;font-style:normal;font-weight:700;display:grid;place-items:center}
.hp-hero{position:relative;height:300u;margin:18u 36u 0;border-radius:14u;overflow:hidden}
.hp-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,22,16,.78),rgba(14,22,16,.25) 55%,transparent)}
.hp-hero-copy{position:absolute;z-index:1;left:44u;bottom:44u;max-width:430u;color:#f6f1e6}
.hp-eyebrow{font-size:11.5u;letter-spacing:.18em;text-transform:uppercase;opacity:.85;margin-bottom:12u!important}
.hp-hero h3{font-family:Montserrat,sans-serif;font-size:38u;line-height:1.08;font-weight:600;letter-spacing:-.02em}
.hp-btn{display:inline-flex;margin-top:22u;padding:12u 22u;border-radius:999u;background:#f3eee3;color:#1f2a22;font-size:13.5u;font-weight:600}
.hp-row{display:flex;justify-content:space-between;align-items:baseline;padding:26u 36u 14u}
.hp-row h4{font-family:Montserrat,sans-serif;font-size:19u;font-weight:600;letter-spacing:-.01em}
.hp-row span{display:flex;align-items:center;gap:6u;font-size:13u;font-weight:500}
.hp-row svg{width:14u;height:14u}
.hp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18u;padding:0 36u}
.hp-img{position:relative;aspect-ratio:4/5;border-radius:10u;overflow:hidden;background:#e7e1d5}
.hp-img em{position:absolute;left:10u;top:10u;padding:4u 9u;border-radius:999u;background:#fffdf8;font-size:10.5u;font-style:normal;font-weight:600}
.hp-name{margin-top:10u!important;font-size:13.5u;font-weight:500}
.hp-price{font-size:13u;opacity:.75}
.hp-dots{display:flex;gap:5u;margin-top:7u}
.hp-dots i{width:11u;height:11u;border-radius:50%;box-shadow:inset 0 0 0 1u rgba(0,0,0,.15)}

.hpm{background:#f8f5ee}
.hpm-nav{height:50u;display:flex;align-items:center;justify-content:space-between;padding:0 18u}
.hpm-nav .hp-mark{font-size:14.5u}
.hpm-img{position:relative;height:410u;margin:0 12u;border-radius:16u;overflow:hidden}
.hpm-fav{position:absolute;right:12u;top:12u;width:36u;height:36u;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center}
.hpm-fav svg{width:17u;height:17u}
.hpm-pager{position:absolute;left:0;right:0;bottom:12u;display:flex;justify-content:center;gap:6u}
.hpm-pager i{width:6u;height:6u;border-radius:3u;background:rgba(255,255,255,.55)}
.hpm-pager i.on{width:18u;background:#fff}
.hpm-body{padding:16u 20u 0}
.hpm-title{display:flex;justify-content:space-between;gap:12u;align-items:flex-start}
.hpm-title h3{font-family:Montserrat,sans-serif;font-size:19u;line-height:1.2;font-weight:600;letter-spacing:-.01em}
.hpm-title p{font-size:18u;font-weight:600}
.hpm-rate{display:flex;align-items:center;gap:6u;margin-top:6u!important;font-size:12.5u;opacity:.8}
.hpm-label{display:flex;gap:6u;margin-top:16u!important;font-size:12.5u;opacity:.75}
.hpm-label b{font-weight:600;opacity:1}
.hpm-label span{margin-left:auto;text-decoration:underline}
.hpm-swatches{display:flex;gap:10u;margin-top:8u}
.hpm-swatches i{width:28u;height:28u;border-radius:50%;box-shadow:inset 0 0 0 1u rgba(0,0,0,.12)}
.hpm-swatches i.on{box-shadow:0 0 0 2u #f8f5ee,0 0 0 3.5u #1f2a22}
.hpm-sizes{display:grid;grid-template-columns:repeat(5,1fr);gap:7u;margin-top:8u}
.hpm-sizes span{height:40u;border-radius:10u;border:1u solid rgba(31,42,34,.2);display:grid;place-items:center;font-size:13u;font-weight:500;background:#fff}
.hpm-sizes span.on{background:#1f2a22;color:#fff;border-color:#1f2a22}
.hpm-sizes span.out{opacity:.4;text-decoration:line-through}
.hpm-add,.hpm-buy{display:flex;height:50u;margin-top:16u;border-radius:999u;background:#1f2a22;color:#f8f5ee;align-items:center;justify-content:center;font-size:15u;font-weight:600}
.hpm-buy{margin-top:8u;background:#b5532b}
.hpm-note{margin-top:10u!important;text-align:center;font-size:11.5u;opacity:.65}

.gl{height:100%;background:#f6f6f2;color:#111;font-family:"Space Grotesk",var(--font-inter),sans-serif}
.gl-nav{height:62u;display:flex;align-items:center;gap:36u;padding:0 40u}
.gl-logo{display:flex;align-items:center;gap:8u;font-size:19u;font-weight:700;letter-spacing:-.03em}
.gl-mark{display:grid;grid-template-columns:1fr 1fr;gap:2u;width:20u;height:20u}
.gl-mark i{border-radius:2.5u;background:#111}
.gl-mark i:nth-child(2){background:#3b5bff}
.gl-links{display:flex;gap:24u;font-size:13.5u;color:#55554f}
.gl-links b{color:#111;font-weight:600}
.gl-cta{margin-left:auto;padding:9u 16u;border-radius:9u;background:#111;color:#fff;font-size:13u;font-weight:600}
.gl-hero{display:grid;grid-template-columns:1fr 1.05fr;gap:40u;align-items:center;padding:22u 40u 8u}
.gl-eyebrow{display:inline-flex;align-items:center;gap:8u;padding:5u 11u;border:1u solid #deded6;border-radius:999u;background:#fff;font-size:12u;font-weight:500}
.gl-eyebrow i{width:7u;height:7u;border-radius:50%;background:#3b5bff}
.gl-hero h3{margin-top:16u!important;font-size:46u;line-height:1;font-weight:600;letter-spacing:-.045em}
.gl-sub{margin-top:14u!important;font-size:15u;line-height:1.5;color:#55554f;max-width:390u}
.gl-btns{display:flex;gap:10u;margin-top:22u}
.gl-btn{padding:12u 18u;border-radius:10u;background:#3b5bff;color:#fff;font-size:14u;font-weight:600}
.gl-btn.ghost{background:#fff;color:#111;box-shadow:inset 0 0 0 1u #deded6}
.gl-proof{display:flex;align-items:center;gap:8u;margin-top:20u;font-size:12.5u;color:#55554f}
.gl-faces{display:flex}
.gl-faces img{width:26u;height:26u;border-radius:50%;border:2u solid #f6f6f2;margin-left:-7u}
.gl-faces img:first-child{margin-left:0}
.gl-cover{position:absolute;inset:0;display:grid;place-items:center;padding:12%;background:linear-gradient(140deg,#3b5bff 0%,#8f6bff 55%,#ffb58a 100%)}
.gl-cover.big{position:relative;height:290u;border-radius:18u;padding:34u 40u}
.gl-win{width:100%;border-radius:8u;background:#fff;box-shadow:0 12u 30u rgba(17,17,40,.25);overflow:hidden;font-family:var(--font-inter),Inter,sans-serif}
.gl-win-bar{display:flex;gap:4u;padding:7u 9u;border-bottom:1u solid #eee}
.gl-win-bar i{width:7u;height:7u;border-radius:50%;background:#e3e3e3}
.gl-win-body{padding:10u 12u 12u}
.gl-cover:not(.big) .gl-win-body{padding:6u 8u 8u}
.gl-win-h{font-size:15u;font-weight:700;letter-spacing:-.02em}
.gl-cover:not(.big) .gl-win-h{font-size:9u}
.gl-win-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:8u;margin-top:9u}
.gl-win-cols div{padding:7u;border-radius:6u;background:#f6f6f4;display:grid;gap:5u}
.gl-win-cols b{font-size:10u;font-weight:600}
.gl-cover:not(.big) .gl-win-cols{gap:4u;margin-top:5u}
.gl-cover:not(.big) .gl-win-cols div{padding:4u;gap:3u}
.gl-cover:not(.big) .gl-win-cols b{font-size:6u}
.gl-win-cols span,.gl-win-bars span{display:block;height:5u;border-radius:3u;background:#dcdcd6}
.gl-win-bars{display:grid;gap:6u;margin-top:10u}
.gl-win-bars span:first-child{background:#3b5bff}
.gl-row{display:flex;justify-content:space-between;align-items:baseline;padding:24u 40u 12u}
.gl-row h4{font-size:19u;font-weight:600;letter-spacing:-.02em}
.gl-row span{display:flex;align-items:center;gap:5u;font-size:13u;color:#55554f}
.gl-row svg{width:14u;height:14u}
.gl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18u;padding:0 40u}
.gl-card{border-radius:14u;background:#fff;box-shadow:inset 0 0 0 1u #e7e7e0;padding:8u 8u 12u}
.gl-img{position:relative;aspect-ratio:4/3;border-radius:9u;overflow:hidden}
.gl-img em{position:absolute;z-index:1;left:9u;top:9u;padding:3u 8u;border-radius:6u;background:#fff;font-size:10.5u;font-style:normal;font-weight:600}
.gl-meta{display:flex;justify-content:space-between;padding:10u 4u 0;font-size:14u;font-weight:600}
.gl-small{display:flex;align-items:center;gap:5u;padding:3u 4u 0;font-size:11.5u;color:#6b6b63}
.gl-small svg{width:12u;height:12u}

.glm{background:#f6f6f2}
.glm-nav{height:50u;display:flex;align-items:center;justify-content:space-between;padding:0 18u}
.glm-nav svg{width:19u;height:19u}
.glm-cover{padding:4u 14u 0}
.glm-cover .gl-cover.big{height:250u;padding:26u 24u}
.glm-body{padding:16u 20u}
.glm-kind{font-size:12u;color:#6b6b63}
.glm-body h3{margin-top:4u!important;font-size:26u;font-weight:600;letter-spacing:-.04em}
.glm-rate{display:flex;align-items:center;gap:6u;margin-top:6u!important;font-size:12.5u;color:#55554f}
.glm-price{display:flex;align-items:center;gap:8u;margin-top:12u!important;font-size:22u;font-weight:700}
.glm-price s{font-size:15u;font-weight:400;color:#8a8a82}
.glm-price em{padding:3u 8u;border-radius:6u;background:#e5e9ff;color:#2a45d8;font-size:11u;font-style:normal;font-weight:600}
.glm-body ul{list-style:none;margin:14u 0 0;padding:0;display:grid;gap:9u}
.glm-body li{display:flex;align-items:center;gap:9u;font-size:13.5u}
.glm-body li svg{width:15u;height:15u;padding:2u;border-radius:50%;background:#111;color:#fff;stroke-width:3}
.glm-buy{display:flex;height:50u;margin-top:18u;border-radius:12u;background:#3b5bff;color:#fff;align-items:center;justify-content:center;font-size:15u;font-weight:600}
.glm-note{display:flex;justify-content:center;align-items:center;gap:5u;margin-top:10u!important;font-size:11.5u;color:#6b6b63}
.glm-note svg{width:12u;height:12u}

.bb{height:100%;background:#faf6f0;color:#2b2a26;font-family:"Plus Jakarta Sans",var(--font-inter),sans-serif}
.bb-nav{height:64u;display:flex;align-items:center;gap:34u;padding:0 40u;border-bottom:1u solid #ece4d8}
.bb-logo{font-family:${SERIF};font-style:italic;font-size:22u;letter-spacing:-.01em;color:#3f4f3d}
.bb-links{display:flex;gap:24u;font-size:13.5u;color:#6d675c}
.bb-links b{color:#2b2a26;font-weight:600}
.bb-right{margin-left:auto;display:flex;align-items:center;gap:18u;font-size:13.5u}
.bb-btn{display:inline-flex;padding:13u 22u;border-radius:999u;background:#3f4f3d;color:#faf6f0;font-size:14u;font-weight:600}
.bb-btn.sm{padding:9u 16u;font-size:13u}
.bb-hero{display:grid;grid-template-columns:.92fr 1fr;gap:38u;align-items:center;padding:30u 40u 6u}
.bb-eyebrow{font-size:12u;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#c46f4f}
.bb-hero h3{margin-top:12u!important;font-family:${SERIF};font-weight:400;font-size:50u;line-height:1.02;letter-spacing:-.02em}
.bb-hero h3 i{color:#5b6e58}
.bb-sub{margin-top:14u!important;font-size:14.5u;line-height:1.55;color:#6d675c;max-width:380u}
.bb-actions{display:flex;align-items:center;gap:18u;margin-top:22u}
.bb-link{display:flex;align-items:center;gap:7u;font-size:13.5u;font-weight:600}
.bb-link svg{width:13u;height:13u}
.bb-rate{display:flex;align-items:center;gap:6u;margin-top:18u!important;font-size:12.5u;color:#6d675c}
.bb-rate b{color:#2b2a26}
.bb-media{position:relative;height:350u;border-radius:18u 18u 140u 18u;overflow:hidden}
.bb-play{position:absolute;left:50%;top:50%;width:58u;height:58u;margin:-29u 0 0 -29u;border-radius:50%;background:rgba(250,246,240,.92);color:#3f4f3d;display:grid;place-items:center;box-shadow:0 8u 24u rgba(0,0,0,.18)}
.bb-play svg{width:20u;height:20u;margin-left:3u}
.bb-chip{position:absolute;left:14u;bottom:14u;padding:7u 12u;border-radius:999u;background:rgba(43,42,38,.72);color:#fff;font-size:11.5u;font-weight:500;backdrop-filter:blur(6px)}
.bb-mods{display:grid;grid-template-columns:repeat(3,1fr);gap:16u;padding:28u 40u 0}
.bb-mod{display:flex;gap:12u;align-items:center;padding:10u;border-radius:14u;background:#fff;box-shadow:inset 0 0 0 1u #ece4d8}
.bb-mod-img{flex:none;width:76u;height:64u;border-radius:9u;overflow:hidden}
.bb-mod-t{font-size:10.5u;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c46f4f}
.bb-mod-h{font-size:13.5u;font-weight:600;line-height:1.3;margin-top:2u!important}
.bb-mod-l{font-size:11.5u;color:#8a8376;margin-top:3u!important}

.bbm{background:#faf6f0}
.bbm-nav{height:50u;display:flex;align-items:center;justify-content:space-between;padding:0 18u}
.bbm-nav svg{width:19u;height:19u}
.bbm-nav .bb-logo{font-size:19u}
.bbm-video{position:relative;height:214u;margin:0 12u;border-radius:16u;overflow:hidden}
.bbm-time{position:absolute;right:10u;bottom:10u;padding:4u 9u;border-radius:6u;background:rgba(0,0,0,.6);color:#fff;font-size:11u;font-weight:600}
.bbm-body{padding:16u 20u}
.bbm-body h3{font-family:${SERIF};font-weight:400;font-size:26u;line-height:1.1;letter-spacing:-.01em}
.bbm-by{display:flex;align-items:center;gap:7u;margin-top:9u!important;font-size:13u;color:#6d675c}
.bbm-by img{width:24u;height:24u;border-radius:50%}
.bbm-by b{color:#2b2a26;font-weight:600}
.bbm-stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14u;padding:10u 0;border-block:1u solid #ece4d8}
.bbm-stats span{display:grid;font-size:11u;color:#8a8376;text-align:center}
.bbm-stats b{font-size:15u;color:#2b2a26}
.bbm-h{margin-top:14u!important;font-size:14u;font-weight:700}
.bbm-row{display:flex;align-items:center;gap:10u;padding:9u 0;border-bottom:1u solid #f0e9de}
.bbm-row>svg{width:15u;height:15u;margin-left:auto;color:#8a8376}
.bbm-ico{width:30u;height:30u;border-radius:9u;background:#eef1ea;color:#3f4f3d;display:grid;place-items:center}
.bbm-ico svg{width:13u;height:13u}
.bbm-row b{display:block;font-size:12.5u;font-weight:600}
.bbm-row i{font-size:11u;font-style:normal;color:#8a8376}
.bbm-buy{display:flex;height:50u;margin-top:16u;border-radius:999u;background:#3f4f3d;color:#faf6f0;align-items:center;justify-content:center;font-size:15u;font-weight:600}
.bbm-note{margin-top:9u!important;text-align:center;font-size:11.5u;color:#8a8376}
`)
