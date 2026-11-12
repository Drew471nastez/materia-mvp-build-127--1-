import { ArrowUpRight, Calendar, Instagram, Lock, Music2, Play, Youtube } from "lucide-react"
import { Pic, StatusBar, u } from "./frame"

/*
  Three fictional OnePage (link-in-bio) pages, drawn at 390 design px:
    Maya Okafor   — run coach, warm linen theme
    Lio Tanaka    — film photographer, dark theme
    Priya Raman   — plant-based cook ("Sol & Sage"), sage gradient theme
  `theme` lets the OnePage editor mock show the same page in another theme.
*/
export type OnePageBrand = "maya" | "lio" | "priya"
export type OnePageTheme = "linen" | "midnight" | "sage"

const Socials = () => (
  <div className="lp-socials">
    <Instagram />
    <Music2 />
    <Youtube />
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18 10 6l4 8 2-4 4 8" />
    </svg>
  </div>
)

function Maya() {
  return (
    <>
      <Pic n="av-maya" w={160} h={160} className="lp-avatar" />
      <h3 className="lp-name">Maya Okafor</h3>
      <p className="lp-bio">Run coach · 6 marathons · Brooklyn, NY. Training plans that fit real life.</p>
      <Socials />
      <div className="lp-product">
        <div className="lp-product-img">
          <Pic n="mr-run" w={640} h={400} />
          <em>Bestseller</em>
        </div>
        <div className="lp-product-row">
          <span>
            <b>16-Week Marathon Plan</b>
            <i>PDF + app sync · 1,920 runners</i>
          </span>
          <span className="lp-price">$39</span>
        </div>
      </div>
      <span className="lp-link">
        Join Saturday Run Club <i>Free</i>
      </span>
      <span className="lp-link">
        <Calendar /> Book a 1:1 gait review <i>$60</i>
      </span>
      <div className="lp-video">
        <Pic n="mr-race" w={640} h={400} />
        <span>
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <p>How I ran a 3:08 marathon · 12:41</p>
      </div>
      <div className="lp-sub">
        <b>Monday training notes</b>
        <span>
          <i>you@email.com</i>
          <em>Subscribe</em>
        </span>
      </div>
    </>
  )
}

function Lio() {
  return (
    <>
      <Pic n="av-lio" w={160} h={160} className="lp-avatar" />
      <h3 className="lp-name">Lio Tanaka</h3>
      <p className="lp-bio">35mm and medium format. Lisbon ⇄ Osaka. Presets, prints and portrait sessions.</p>
      <Socials />
      <div className="lp-gallery">
        <Pic n="lt-street" w={480} h={600} />
        <Pic n="lt-field" w={480} h={600} />
        <Pic n="lt-cam" w={480} h={480} />
      </div>
      <div className="lp-product lp-product-inline">
        <div className="lp-product-img">
          <Pic n="lt-field" w={480} h={600} />
        </div>
        <span>
          <b>Portra 400 Presets</b>
          <i>12 Lightroom presets · 4.9 ★</i>
        </span>
        <span className="lp-price">$24</span>
      </div>
      <span className="lp-link">
        Fine art prints, signed <ArrowUpRight />
      </span>
      <span className="lp-link">
        <Calendar /> Portrait session · Lisbon <i>From $180</i>
      </span>
      <span className="lp-link">
        <Lock /> Contact sheets, members only
      </span>
    </>
  )
}

function Priya() {
  return (
    <>
      <Pic n="av-priya" w={160} h={160} className="lp-avatar" />
      <h3 className="lp-name lp-serif">Sol &amp; Sage</h3>
      <p className="lp-bio">Priya Raman · plant-based weeknight cooking for busy people. New recipes every Sunday.</p>
      <Socials />
      <div className="lp-book">
        <div className="lp-book-cover">
          <small>Priya Raman</small>
          <b>Weeknight Green</b>
          <i>60 plant-based dinners</i>
        </div>
        <div className="lp-book-copy">
          <b>The cookbook</b>
          <i>PDF + printable shopping lists</i>
          <span className="lp-price">$18</span>
        </div>
      </div>
      <div className="lp-tiles">
        <div>
          <Pic n="ss-salad" w={480} h={480} />
          <p>Crispy chickpea bowl</p>
        </div>
        <div>
          <Pic n="ss-plate" w={480} h={480} />
          <p>Miso glazed salmon</p>
        </div>
      </div>
      <span className="lp-link">
        Free 7-day meal plan <i>Get it</i>
      </span>
      <span className="lp-link">
        <Calendar /> Live cooking class · Sun 5pm <i>$15</i>
      </span>
    </>
  )
}

const DEFAULT_THEME: Record<OnePageBrand, OnePageTheme> = { maya: "linen", lio: "midnight", priya: "sage" }

export function OnePagePhone({ brand, theme }: { brand: OnePageBrand; theme?: OnePageTheme }) {
  return (
    <div className={`lp lp-${brand}`} data-lp-theme={theme ?? DEFAULT_THEME[brand]}>
      <StatusBar />
      <div className="lp-col">{brand === "maya" ? <Maya /> : brand === "lio" ? <Lio /> : <Priya />}</div>
    </div>
  )
}

/** The same page on a desktop browser: centered column over a soft backdrop. */
export function OnePageDesktop({ brand }: { brand: OnePageBrand }) {
  return (
    <div className={`lpd lp-${brand}`} data-lp-theme={DEFAULT_THEME[brand]}>
      <div className="lpd-bar">
        <i />
        <i />
        <i />
        <span>storelib.com/{brand === "priya" ? "solandsage" : brand === "maya" ? "mayaruns" : "lio.film"}</span>
      </div>
      <div className="lpd-stage">
        <div className="lp lpd-col" data-lp-theme={DEFAULT_THEME[brand]}>
          <div className="lp-col">{brand === "maya" ? <Maya /> : brand === "lio" ? <Lio /> : <Priya />}</div>
        </div>
      </div>
    </div>
  )
}

const SERIF = `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif`

export const ONEPAGE_CSS = u(`
.lp{--bg:#f3ede4;--ink:#231f1a;--soft:rgba(35,31,26,.62);--card:#fffaf2;--line:rgba(35,31,26,.1);--accent:#e4572e;--on-accent:#fff;height:100%;background:var(--bg);color:var(--ink);font-family:"Space Grotesk",var(--font-inter,Inter),sans-serif}
.lp[data-lp-theme="midnight"]{--bg:#0f0f10;--ink:#efe7da;--soft:rgba(239,231,218,.62);--card:#1b1b1d;--line:rgba(239,231,218,.1);--accent:#efe7da;--on-accent:#111;font-family:"DM Sans",var(--font-inter,Inter),sans-serif}
.lp[data-lp-theme="sage"]{--bg:linear-gradient(180deg,#dbe5d2 0%,#f4efe4 62%);--ink:#24301f;--soft:rgba(36,48,31,.64);--card:rgba(255,255,255,.72);--line:rgba(36,48,31,.1);--accent:#3f5a35;--on-accent:#f4efe4;font-family:"Plus Jakarta Sans",var(--font-inter,Inter),sans-serif}
.lp-col{display:flex;flex-direction:column;align-items:center;gap:10u;padding:14u 20u 24u}
.lp-avatar{width:86u!important;height:86u!important;border-radius:50%;box-shadow:0 0 0 3u var(--card)}
.lp-name{margin-top:4u!important;font-size:22u;font-weight:700;letter-spacing:-.03em}
.lp-serif{font-family:${SERIF};font-weight:500;font-size:27u;letter-spacing:-.01em}
.lp-bio{max-width:300u;margin-top:-4u!important;text-align:center;font-size:13u;line-height:1.45;color:var(--soft)}
.lp-socials{display:flex;gap:18u;margin:2u 0 6u}
.lp-socials svg{width:19u;height:19u;stroke-width:1.8}
.lp-product{width:100%;border-radius:18u;background:var(--card);box-shadow:inset 0 0 0 1u var(--line);padding:7u}
.lp-product-img{position:relative;height:150u;border-radius:13u;overflow:hidden}
.lp-product-img em{position:absolute;left:9u;top:9u;padding:3u 9u;border-radius:999u;background:var(--accent);color:var(--on-accent);font-size:10.5u;font-style:normal;font-weight:700}
.lp-product-row{display:flex;align-items:center;justify-content:space-between;gap:10u;padding:9u 6u 4u}
.lp-product b,.lp-book b{display:block;font-size:14u;font-weight:700;letter-spacing:-.01em}
.lp-product i,.lp-book i{display:block;font-size:11.5u;font-style:normal;color:var(--soft)}
.lp-price{flex:none;padding:7u 12u;border-radius:999u;background:var(--accent);color:var(--on-accent);font-size:13u;font-weight:700}
.lp-product-inline{display:flex;align-items:center;gap:11u}
.lp-product-inline .lp-product-img{flex:none;width:52u;height:52u;border-radius:10u}
.lp-product-inline>span:nth-child(2){flex:1}
.lp-link{width:100%;min-height:50u;display:flex;align-items:center;justify-content:center;gap:8u;padding:0 16u;border-radius:14u;background:var(--card);box-shadow:inset 0 0 0 1u var(--line);font-size:14u;font-weight:600;position:relative}
.lp-link svg{width:16u;height:16u}
.lp-link i{position:absolute;right:14u;font-size:11.5u;font-style:normal;font-weight:600;color:var(--soft)}
.lp-video{position:relative;width:100%;height:150u;border-radius:16u;overflow:hidden;color:#fff}
.lp-video::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 45%,rgba(0,0,0,.6))}
.lp-video span{position:absolute;z-index:1;left:50%;top:42%;width:44u;height:44u;margin:-22u 0 0 -22u;border-radius:50%;background:rgba(255,255,255,.9);color:#111;display:grid;place-items:center}
.lp-video span svg{width:16u;height:16u;margin-left:2u}
.lp-video p{position:absolute;z-index:1;left:12u;bottom:10u;font-size:12.5u;font-weight:600}
.lp-sub{width:100%;padding:12u;border-radius:16u;background:var(--card);box-shadow:inset 0 0 0 1u var(--line)}
.lp-sub b{font-size:13.5u}
.lp-sub span{display:flex;gap:6u;margin-top:8u}
.lp-sub i{flex:1;padding:10u 12u;border-radius:10u;background:var(--bg);font-style:normal;font-size:12.5u;color:var(--soft);box-shadow:inset 0 0 0 1u var(--line)}
.lp-sub em{padding:10u 13u;border-radius:10u;background:var(--ink);color:var(--card);font-style:normal;font-size:12.5u;font-weight:700}
.lp-gallery{width:100%;display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:94u 94u;gap:6u}
.lp-gallery img{border-radius:12u}
.lp-gallery img:first-child{grid-row:span 2}
.lp-book{width:100%;display:flex;gap:14u;align-items:center;padding:10u;border-radius:18u;background:var(--card);box-shadow:inset 0 0 0 1u var(--line)}
.lp-book-cover{flex:none;width:96u;height:128u;padding:10u 9u;border-radius:4u 9u 9u 4u;background:linear-gradient(160deg,#3f5a35,#24301f);color:#f4efe4;display:flex;flex-direction:column;box-shadow:-3u 0 0 #2c3c26 inset,0 8u 18u rgba(36,48,31,.25)}
.lp-book-cover small{font-size:7.5u;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.lp-book-cover b{margin-top:auto;font-family:${SERIF};font-size:17u;line-height:1.02;font-weight:500}
.lp-book-cover i{margin-top:5u;font-size:8u!important;color:rgba(244,239,228,.75)!important}
.lp-book-copy{display:grid;gap:3u;justify-items:start}
.lp-book-copy .lp-price{margin-top:8u}
.lp-tiles{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8u}
.lp-tiles div{border-radius:14u;overflow:hidden;background:var(--card);box-shadow:inset 0 0 0 1u var(--line)}
.lp-tiles img{height:96u}
.lp-tiles p{padding:7u 9u;font-size:12u;font-weight:600}

.lpd{height:100%;display:flex;flex-direction:column;background:#ece9e4}
.lpd-bar{flex:none;height:34u;display:flex;align-items:center;gap:6u;padding:0 14u;background:#f7f6f4;border-bottom:1u solid #e3e0da}
.lpd-bar i{width:9u;height:9u;border-radius:50%;background:#dcd8d1}
.lpd-bar span{margin:0 auto;padding:4u 60u;border-radius:7u;background:#ebe8e3;font-size:11u;color:#6b665e}
.lpd-stage{flex:1;position:relative;display:flex;justify-content:center;overflow:hidden;background:var(--stage)}
.lpd.lp-maya .lpd-stage{--stage:radial-gradient(60% 80% at 20% 10%,#f7c6a6,transparent),radial-gradient(50% 70% at 85% 80%,#f2d9b8,transparent),#efe6da}
.lpd.lp-lio .lpd-stage{--stage:radial-gradient(60% 80% at 20% 10%,#3a3530,transparent),#121212}
.lpd.lp-priya .lpd-stage{--stage:radial-gradient(55% 75% at 15% 20%,#c9dbbd,transparent),radial-gradient(50% 70% at 90% 85%,#f3dcc0,transparent),#e9eadf}
.lpd-col{width:430u;height:auto;margin-top:22u;border-radius:26u 26u 0 0;box-shadow:0 20u 60u rgba(30,30,20,.16)}
.lpd-col .lp-col{padding-top:26u}
`)
