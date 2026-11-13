import {
  ChevronLeft,
  Heart,
  Menu,
  MoreHorizontal,
  Play,
  Search,
  ShoppingBag,
  Star,
  User,
} from "lucide-react"
import { Pic, u } from "./frame"
import { HomeOnePage, HomeOnePageStyle, LUCIA_DESKTOP, LUCIA_PHONE } from "../onepage-sample"

/*
  FIVE REAL-LOOKING STOREFRONTS, ONE PER KIND OF BUSINESS.
  Each is drawn twice, the way a buyer sees it: a desktop page in a 4:3 card
  (1024 x 768 design px) and the phone page in a 9:16 card (390 x 693). They
  are the creator's own pages, in their own colours and photographs, built
  on Storelib: no device frames, no browser chrome, no placeholder art.

    Low Season         Lightroom presets by a travel photographer
    Elena Ruiz         a watercolor course (sales page / lesson player)
    Charla Circle      a Spanish conversation circle: Storelib's real community
                       frame and feed, photographed (no hand drawing)
    Lucía Ferrer       a voice actor's OnePage (link in bio), the Gazette
                       theme, captures of the live page (../onepage-sample)
    Wren & Ash         an indie folk duo's merch shop

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.

  The two shops' product cards are the website's own Product Grid card
  (themes/default/sections/product_grid.storelib): the photo with the
  wishlist heart and a Sale or custom tag, the title, the stars with the
  review count, and the price with cents, the compare-at price struck
  through, as ThemePage draws them (landing round 2).
*/

/** Wren & Ash's mark: a three-tier pine. */
const Pine = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 7 9h3l-4 6h4l-5 6h14l-5-6h4l-4-6h3z" fill="currentColor" />
  </svg>
)

const Stars = ({ n = 5 }: { n?: number }) => (
  <span className="bz-stars" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <Star key={i} fill="currentColor" strokeWidth={0} />
    ))}
  </span>
)

/** A Product Grid card as a Storelib website draws it. */
function GridCard({ n, name, rating, count, price, was = "", tag = "", cls }: { n: string; name: string; rating: string; count: string; price: string; was?: string; tag?: string; cls: string }) {
  return (
    <span className={`bz-pc ${cls}`}>
      <span className="bz-pc-img">
        <Pic n={n} w={520} h={640} />
        {tag && <em>{tag}</em>}
        <i className="bz-pc-heart">
          <Heart />
        </i>
      </span>
      <b>{name}</b>
      <span className="bz-pc-rate">
        <Stars /> {rating} <i>({count})</i>
      </span>
      <span className="bz-pc-price">
        {price}
        {was && <s>{was}</s>}
      </span>
    </span>
  )
}

/* ================================================================ Digital products: Low Season */
const SL_PACKS = [
  ["sl-coast", "Algarve Coast, 12 presets", "4.8", "1,127", "$24.00", "$34.00", "Sale"],
  ["sl-desert", "Desert Film, 10 presets", "4.9", "386", "$19.00", "", "New"],
  ["sl-tokyo", "Shinjuku Night, 10 presets", "4.7", "512", "$19.00", "", ""],
  ["sl-lake", "Dolomites Blue, 8 presets", "4.8", "241", "$16.00", "", ""],
] as const

/** A photo shown before and after the preset: the left half is the flat original. */
function BeforeAfter({ n, w, h, at = 50 }: { n: string; w: number; h: number; at?: number }) {
  return (
    <div className="bz-ba" style={{ ["--at" as string]: `${at}%` }}>
      <Pic n={n} w={w} h={h} />
      <div className="bz-ba-before">
        <Pic n={n} w={w} h={h} />
      </div>
      <span className="bz-ba-line">
        <i />
      </span>
      <em className="bz-ba-l">Before</em>
      <em className="bz-ba-r">After</em>
    </div>
  )
}

export function LowSeasonDesktop() {
  return (
    <div className="bz zs">
      <p className="zs-ann">Spring sale: 30% off Algarve Coast until Sunday</p>
      <div className="zs-nav">
        <span className="zs-logo">
          <i />
          low season
        </span>
        <span className="zs-links">
          <b>Presets</b>
          <span>LUTs</span>
          <span>Bundles</span>
          <span>Free pack</span>
          <span>Tutorials</span>
        </span>
        <span className="zs-icons">
          <Search />
          <User />
          <span className="zs-bag">
            <ShoppingBag />
            <em>2</em>
          </span>
        </span>
      </div>
      <div className="zs-hero">
        <div className="zs-copy">
          <p className="zs-eyebrow">New · Desert Film</p>
          <h3>Make every trip look the way it felt.</h3>
          <p className="zs-sub">Lightroom presets for warm skin, deep blues and honest color. One tap on your phone or desktop.</p>
          <span className="zs-btns">
            <b>Shop presets</b>
            <span>Try the free pack</span>
          </span>
          <span className="zs-proof">
            <Stars /> 4.8 from 2,906 reviews
          </span>
        </div>
        <div className="zs-shot">
          <BeforeAfter n="sl-hero" w={1100} h={620} at={42} />
        </div>
      </div>
      <div className="zs-shop">
        <p className="zs-h">
          Bestsellers <span>View all 18 packs</span>
        </p>
        <div className="zs-grid">
          {SL_PACKS.map(([n, name, rating, count, price, was, tag]) => (
            <GridCard key={n} cls="zs-card" n={n} name={name} rating={rating} count={count} price={price} was={was} tag={tag} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function LowSeasonMobile() {
  return (
    <div className="bz zs zs-m">
      <div className="zs-mnav">
        <Menu />
        <span className="zs-logo">
          <i />
          low season
        </span>
        <span className="zs-bag">
          <ShoppingBag />
          <em>2</em>
        </span>
      </div>
      <div className="zs-mshot">
        <BeforeAfter n="sl-cove" w={600} h={680} at={46} />
        <span className="zs-dots">
          <b />
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="zs-mbody">
        <p className="zs-eyebrow">Lightroom presets · 12 presets</p>
        <h3>Algarve Coast</h3>
        <span className="zs-proof">
          <Stars /> 4.8 · 1,127 reviews
        </span>
        <p className="zs-price">
          $24.00 <s>$34.00</s> <em>Sale</em>
        </p>
        <span className="zs-cta">Add to cart · $24.00</span>
        <p className="zs-note">Instant download · Lightroom mobile and desktop</p>
      </div>
    </div>
  )
}

/* ================================================================ Courses: Elena Ruiz Watercolor */
const BB_MODULES = [
  ["bb-brushes", "Module 1", "Brushes, paper and water"],
  ["bb-palette", "Module 2", "Mixing clean greens"],
  ["bb-hero", "Module 3", "Three-stroke petals"],
  ["bb-bouquet", "Module 4", "A full loose bouquet"],
] as const

export function WatercolorDesktop() {
  return (
    <div className="bz zb">
      <div className="zb-nav">
        <span className="zb-logo">Elena Ruiz</span>
        <span className="zb-links">
          <b>Courses</b>
          <span>Live workshops</span>
          <span>Paint kits</span>
          <span>Journal</span>
        </span>
        <span className="zb-login">Log in</span>
        <span className="zb-enroll">Enroll</span>
      </div>
      <div className="zb-hero">
        <div className="zb-copy">
          <p className="zb-eyebrow">Online course · Self-paced</p>
          <h3>
            Loose florals
            <br />
            <i>in 21 days.</i>
          </h3>
          <p className="zb-sub">42 short lessons, printable tracing sheets and a private studio where Elena reviews your paintings every Friday.</p>
          <span className="zb-btns">
            <b>Enroll · $129.00</b>
            <span>
              <Play fill="currentColor" strokeWidth={0} /> Watch lesson 1
            </span>
          </span>
          <span className="zb-proof">
            <span className="zb-faces">
              <Pic n="av-h" w={96} h={96} />
              <Pic n="av-c" w={96} h={96} />
              <Pic n="av-n" w={96} h={96} />
            </span>
            <span>
              <Stars /> <b>4.8</b> · 1,962 painters
            </span>
          </span>
        </div>
        <div className="zb-video">
          <Pic n="bb-hero" w={1200} h={700} />
          <span className="zb-play">
            <Play fill="currentColor" strokeWidth={0} />
          </span>
          <em>Free lesson · 6:42</em>
        </div>
      </div>
      <div className="zb-mods">
        <p className="zb-h">What you’ll paint</p>
        <div className="zb-grid">
          {BB_MODULES.map(([n, m, t]) => (
            <span key={n}>
              <Pic n={n} w={520} h={400} />
              <em>{m}</em>
              <b>{t}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const BB_LESSONS = [
  ["done", "5", "Mixing a warm and a cool pink", "5:10"],
  ["done", "6", "Loading the brush", "4:02"],
  ["now", "7", "Three-stroke petals", "6:42"],
  ["next", "8", "Turning a petal", "7:15"],
  ["next", "9", "Leaves and negative space", "8:30"],
] as const

export function WatercolorMobile() {
  return (
    <div className="bz zb zb-m">
      <div className="zb-mbar">
        <ChevronLeft />
        <b>Loose Florals in 21 Days</b>
        <MoreHorizontal />
      </div>
      <div className="zb-player">
        <Pic n="bb-brush" w={1000} h={600} />
        <span className="zb-play sm">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <span className="zb-scrub">
          <i />
          <em>2:18 / 6:42</em>
        </span>
      </div>
      <div className="zb-mbody">
        <p className="zb-eyebrow">Module 2 · Lesson 7</p>
        <h3>Three-stroke petals</h3>
        <span className="zb-progress">
          <span>
            <i />
          </span>
          38% complete
        </span>
        <div className="zb-lessons">
          {BB_LESSONS.map(([state, n, t, d]) => (
            <span key={n} className={`zb-lesson ${state}`}>
              <i>{state === "now" ? <Play fill="currentColor" strokeWidth={0} /> : state === "done" ? "" : n}</i>
              <b>{t}</b>
              <em>{d}</em>
            </span>
          ))}
        </div>
        <span className="zb-cta">Complete and continue</span>
      </div>
    </div>
  )
}

/* ================================================================ Communities: Charla Circle */
/*
  NOT DRAWN BY HAND (landing round 2). The community is Storelib's own member
  frame and feed (components/community/member/shell-frame.tsx and feed.tsx),
  rendered with a fictional community's data and photographed at 2x: a
  computer at 1024 x 768 and a phone at 390 x 693, a little way down its feed.
  So the bar, the row of places, the community card, the next event, the space
  chips, the composer, the poll and the post cards are the product's, not an
  imitation of them. Re-shoot them when the member frame changes.
*/
export function CharlaDesktop() {
  return <Pic n="ch-desktop" w={2048} h={1536} className="zc-shot" />
}

export function CharlaMobile() {
  return <Pic n="ch-phone" w={780} h={1386} className="zc-shot" />
}

/* ================================================================ OnePage: Lucía Ferrer */
/*
  Lucía's OnePage in Gazette, a theme the OnePage picker ships, captured from
  the live page (../onepage-sample) at a computer's 1280 x 960 and a phone's
  390 x 693: on a computer it is the page's own card on the theme's
  wallpaper, with the QR code the live page shows there.
*/
export function LuciaDesktop() {
  return (
    <div className="bz zo">
      <HomeOnePageStyle />
      <HomeOnePage shot={LUCIA_DESKTOP} className="zo-full" />
    </div>
  )
}

export function LuciaMobile() {
  return (
    <div className="bz zo zo-m">
      <HomeOnePageStyle />
      <HomeOnePage shot={LUCIA_PHONE} className="zo-full" />
    </div>
  )
}

/* ================================================================ Physical products: Wren & Ash */
const HP_ITEMS = [
  ["hp-hoodie", "Ashgrove Heavyweight Hoodie", "4.8", "187", "$68.00", "", ""],
  ["hp-tee", "Long Winter Tour Tee", "4.7", "94", "$32.00", "", ""],
  ["hp-vinyl", "Long Winter on vinyl, signed", "5.0", "63", "$30.00", "", "Signed"],
  ["hp-capgrey", "Washed Field Cap", "4.6", "41", "$22.00", "$26.00", "Sale"],
] as const

export function WrenAshDesktop() {
  return (
    <div className="bz zh">
      <p className="zh-ann">Long Winter tour merch ships Oct 28. Free US shipping over $75</p>
      <div className="zh-nav">
        <span className="zh-links">
          <b>Shop</b>
          <span>Tour</span>
          <span>Music</span>
          <span>Journal</span>
        </span>
        <span className="zh-logo">
          <Pine /> Wren &amp; Ash
        </span>
        <span className="zh-icons">
          <Search />
          <User />
          <span className="zs-bag">
            <ShoppingBag />
            <em>1</em>
          </span>
        </span>
      </div>
      <div className="zh-hero">
        <Pic n="hp-stage" w={1100} h={560} />
        <div className="zh-copy">
          <p>The Long Winter Tour 2026</p>
          <h3>Merch from the road.</h3>
          <span className="zh-btns">
            <b>Shop the collection</b>
            <span>Tour dates</span>
          </span>
        </div>
      </div>
      <div className="zh-shop">
        <p className="zh-h">
          New arrivals <span>View all</span>
        </p>
        <div className="zh-grid">
          {HP_ITEMS.map(([n, name, rating, count, price, was, tag]) => (
            <GridCard key={n} cls="zh-card" n={n} name={name} rating={rating} count={count} price={price} was={was} tag={tag} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function WrenAshMobile() {
  return (
    <div className="bz zh zh-m">
      <div className="zh-mnav">
        <Menu />
        <span className="zh-logo">
          <Pine /> Wren &amp; Ash
        </span>
        <span className="zs-bag">
          <ShoppingBag />
          <em>1</em>
        </span>
      </div>
      <div className="zh-mshot">
        <Pic n="hp-hoodie" w={600} h={700} />
        <span className="zh-heart">
          <Heart />
        </span>
        <span className="zs-dots">
          <b />
          <i />
          <i />
        </span>
      </div>
      <div className="zh-mbody">
        <p className="zh-mtitle">
          Ashgrove Heavyweight Hoodie <b>$68.00</b>
        </p>
        <span className="zh-rating">
          <Stars /> 4.8 · 187 reviews
        </span>
        <p className="zh-label">
          Color <b>Fog grey</b>
        </p>
        <span className="zh-sw">
          <i className="on" style={{ background: "#9ca3a8" }} />
          <i style={{ background: "#2f4a3c" }} />
          <i style={{ background: "#e7dcc6" }} />
        </span>
        <p className="zh-label">
          Size <b>M</b> <u>Size guide</u>
        </p>
        <span className="zh-sizes">
          <i>S</i>
          <b>M</b>
          <i>L</i>
          <i>XL</i>
          <i className="out">XXL</i>
        </span>
        <span className="zh-cta">Add to cart · $68.00</span>
      </div>
    </div>
  )
}

/* ================================================================ styles */
const SERIF = `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif`

export const BUSINESS_MOCK_CSS = u(`
.bz{position:absolute;inset:0;overflow:hidden;font-family:var(--font-inter,Inter),Inter,system-ui,sans-serif;font-size:14u;line-height:1.4}
.bz svg{width:18u;height:18u}
.bz-stars{display:inline-flex;gap:1u;color:#f5a623}
.bz-stars svg{width:12u;height:12u}
.bz-ba{position:relative;width:100%;height:100%;overflow:hidden}
.bz-ba>.smk-pic{position:absolute;inset:0}
.bz-ba-before{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--at)) 0 0)}
.bz-ba-before .smk-pic{filter:saturate(.35) contrast(.82) brightness(1.08)}
.bz-ba-line{position:absolute;top:0;bottom:0;left:var(--at);width:2u;margin-left:-1u;background:#fff}
.bz-ba-line i{position:absolute;left:50%;top:50%;width:34u;height:34u;margin:-17u 0 0 -17u;border-radius:50%;background:#fff;box-shadow:0 4u 14u rgba(0,0,0,.25)}
.bz-ba-line i::before,.bz-ba-line i::after{content:"";position:absolute;top:12u;border:5u solid transparent}
.bz-ba-line i::before{left:5u;border-right-color:#1d1b19}
.bz-ba-line i::after{right:5u;border-left-color:#1d1b19}
.bz-ba em{position:absolute;top:14u;padding:4u 9u;border-radius:999u;background:rgba(20,18,16,.55);color:#fff;font-size:11u;font-style:normal;font-weight:600;letter-spacing:.02em}
.bz-ba-l{left:14u}.bz-ba-r{right:14u}
.zs-dots{position:absolute;left:0;right:0;bottom:14u;display:flex;justify-content:center;gap:5u}
.zs-dots>*{width:6u;height:6u;border-radius:3u;background:rgba(255,255,255,.6)}
.zs-dots b{width:18u;background:#fff}
.zs-bag{position:relative;display:flex}
.zs-bag em{position:absolute;right:-6u;top:-5u;min-width:15u;height:15u;padding:0 4u;border-radius:8u;background:#e2553b;color:#fff;font-size:9.5u;font-style:normal;font-weight:700;display:grid;place-items:center}

/* ---------- Low Season */
.zs{background:#f7f1e8;color:#1d1b19}
.zs-ann{height:32u;display:grid;place-items:center;background:#e2553b;color:#fff;font-size:12u;font-weight:600}
.zs-nav{height:64u;display:flex;align-items:center;gap:36u;padding:0 36u;border-bottom:1u solid #e8ddcd}
.zs-logo{display:flex;align-items:center;gap:7u;font-size:21u;font-weight:800;letter-spacing:-.04em}
.zs-logo i{width:16u;height:16u;border-radius:50%;background:linear-gradient(180deg,#f7b267 0 50%,#e2553b 50%)}
.zs-links{display:flex;gap:24u;font-size:13.5u;color:#6b6157}
.zs-links b{color:#1d1b19;font-weight:600}
.zs-icons{display:flex;gap:18u;margin-left:auto}
.zs-hero{display:grid;grid-template-columns:372u 1fr;gap:30u;align-items:center;height:346u;padding:0 36u}
.zs-eyebrow{font-size:11.5u;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e2553b}
.zs-copy h3{margin-top:10u!important;font-size:42u;font-weight:800;line-height:1.02;letter-spacing:-.035em}
.zs-sub{margin-top:14u!important;font-size:15u;line-height:1.5;color:#5f564d}
.zs-btns{display:flex;gap:10u;margin-top:22u}
.zs-btns>*{padding:12u 20u;border-radius:999u;font-size:14u;font-weight:600}
.zs-btns b{background:#1d1b19;color:#fff}
.zs-btns span{box-shadow:inset 0 0 0 1.5u #1d1b19}
.zs-proof{display:flex;align-items:center;gap:7u;margin-top:18u;font-size:12.5u;color:#6b6157}
.zs-shot{height:290u;border-radius:20u;overflow:hidden;box-shadow:0 20u 40u -18u rgba(80,40,10,.45)}
.zs-shop{padding:6u 36u 0}
.zs-h{display:flex;align-items:baseline;justify-content:space-between;font-size:20u;font-weight:800;letter-spacing:-.02em}
.zs-h span{font-size:13u;font-weight:600;color:#e2553b;letter-spacing:0}
.zs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16u;margin-top:14u}
.bz-pc{display:grid;gap:3u;min-width:0}
.bz-pc-img{position:relative;height:196u;overflow:hidden}
.bz-pc-img em{position:absolute;left:10u;top:10u;padding:3u 9u;border-radius:999u;background:#111;color:#fff;font-size:11u;font-style:normal;font-weight:600}
.bz-pc-heart{position:absolute;right:10u;top:10u;width:30u;height:30u;display:grid;place-items:center;background:#fff;border-radius:6u;color:#111}
.bz-pc-heart svg{width:15u;height:15u}
.bz-pc>b{margin-top:8u;font-size:14u;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bz-pc-rate{display:flex;align-items:center;gap:5u;font-size:12u;color:inherit;opacity:.75}
.bz-pc-rate i{font-style:normal}
.bz-pc-price{display:flex;align-items:baseline;gap:8u;font-size:14u;font-weight:600}
.bz-pc-price s{font-size:12.5u;font-weight:400;opacity:.55}
.zs-card .bz-pc-img{border-radius:12u}
.zs-card .bz-pc-img em{background:#e2553b}
.zs-m .zs-logo{font-size:19u}
.zs-mnav{height:56u;display:flex;align-items:center;justify-content:space-between;padding:0 18u}
.zs-mshot{position:relative;height:392u}
.zs-mbody{padding:18u 20u}
.zs-m h3{margin-top:4u!important;font-size:28u;font-weight:800;letter-spacing:-.03em}
.zs-m .zs-proof{margin-top:6u}
.zs-price{display:flex;align-items:center;gap:8u;margin-top:10u!important;font-size:22u;font-weight:800}
.zs-price s{font-size:15u;font-weight:500;color:#9a8f83}
.zs-price em{padding:3u 8u;border-radius:999u;background:#fde3dc;color:#c2412b;font-size:11.5u;font-style:normal;font-weight:700}
.zs-cta{display:grid;place-items:center;height:50u;margin-top:16u;border-radius:14u;background:#e2553b;color:#fff;font-size:15.5u;font-weight:700}
.zs-note{margin-top:10u!important;text-align:center;font-size:12u;color:#7a6f63}

/* ---------- Elena Ruiz Watercolor */
.zb{background:#fbf7f1;color:#2b2a26}
.zb-nav{height:66u;display:flex;align-items:center;gap:34u;padding:0 40u;border-bottom:1u solid #ece4d8}
.zb-logo{font-family:${SERIF};font-style:italic;font-size:23u;color:#3f5a45}
.zb-links{display:flex;gap:24u;font-size:13.5u;color:#6d675c}
.zb-links b{color:#2b2a26;font-weight:600}
.zb-login{margin-left:auto;font-size:13.5u}
.zb-enroll{padding:9u 18u;border-radius:999u;background:#3f5a45;color:#fff;font-size:13.5u;font-weight:600}
.zb-hero{display:grid;grid-template-columns:400u 1fr;gap:36u;align-items:center;height:410u;padding:0 40u}
.zb-eyebrow{font-size:11.5u;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#c8694a}
.zb-copy h3{margin-top:10u!important;font-family:${SERIF};font-weight:400;font-size:52u;line-height:1;letter-spacing:-.02em}
.zb-copy h3 i{color:#3f5a45}
.zb-sub{margin-top:14u!important;font-size:14.5u;line-height:1.55;color:#6d675c}
.zb-btns{display:flex;gap:10u;margin-top:22u}
.zb-btns>*{display:flex;align-items:center;gap:7u;padding:12u 20u;border-radius:999u;font-size:14u;font-weight:600}
.zb-btns b{background:#3f5a45;color:#fff}
.zb-btns span{box-shadow:inset 0 0 0 1.5u #d7cdbd}
.zb-btns svg{width:12u;height:12u}
.zb-proof{display:flex;align-items:center;gap:10u;margin-top:18u;font-size:12.5u;color:#6d675c}
.zb-proof b{color:#2b2a26}
.zb-faces{display:flex}
.zb-faces img{width:26u!important;height:26u!important;border-radius:50%;margin-left:-7u;box-shadow:0 0 0 2u #fbf7f1}
.zb-faces img:first-child{margin-left:0}
.zb-video{position:relative;height:320u;border-radius:22u 22u 120u 22u;overflow:hidden;box-shadow:0 22u 44u -20u rgba(63,90,69,.55)}
.zb-play{position:absolute;left:50%;top:50%;width:64u;height:64u;margin:-32u 0 0 -32u;border-radius:50%;background:rgba(255,255,255,.92);color:#3f5a45;display:grid;place-items:center;box-shadow:0 8u 24u rgba(0,0,0,.25)}
.zb-play svg{width:22u;height:22u;margin-left:3u}
.zb-play.sm{width:52u;height:52u;margin:-26u 0 0 -26u}
.zb-video em{position:absolute;left:16u;bottom:16u;padding:6u 11u;border-radius:999u;background:rgba(43,42,38,.7);color:#fff;font-size:12u;font-style:normal;font-weight:600}
.zb-mods{padding:16u 40u 0;background:#f3ece1;height:100%}
.zb-h{font-family:${SERIF};font-size:24u}
.zb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16u;margin-top:12u}
.zb-grid>span{display:grid;gap:3u}
.zb-grid img{height:150u!important;border-radius:14u;margin-bottom:6u}
.zb-grid em{font-size:11u;font-style:normal;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#c8694a}
.zb-grid b{font-size:14.5u;font-weight:600}
.zb-mbar{height:54u;display:flex;align-items:center;gap:12u;padding:0 16u;font-size:14u}
.zb-mbar b{flex:1;text-align:center;font-weight:600}
.zb-player{position:relative;height:222u;background:#111}
.zb-scrub{position:absolute;left:14u;right:14u;bottom:12u;height:4u;border-radius:2u;background:rgba(255,255,255,.35)}
.zb-scrub i{position:absolute;left:0;top:0;bottom:0;width:34%;border-radius:2u;background:#fff}
.zb-scrub i::after{content:"";position:absolute;right:-6u;top:-4u;width:12u;height:12u;border-radius:50%;background:#fff}
.zb-scrub em{position:absolute;right:0;bottom:10u;color:#fff;font-size:11u;font-style:normal;font-weight:600}
.zb-mbody{padding:18u 18u 0}
.zb-m h3{margin-top:5u!important;font-family:${SERIF};font-weight:400;font-size:27u;letter-spacing:-.01em}
.zb-progress{display:flex;align-items:center;gap:10u;margin-top:12u;font-size:12u;color:#6d675c;white-space:nowrap}
.zb-progress>span{flex:1;height:6u;border-radius:3u;background:#e8e0d2;overflow:hidden}
.zb-progress i{display:block;width:38%;height:100%;background:#3f5a45}
.zb-lessons{margin-top:14u;border-top:1u solid #ece4d8}
.zb-lesson{display:flex;align-items:center;gap:12u;height:50u;border-bottom:1u solid #ece4d8;font-size:14u}
.zb-lesson i{flex:none;width:26u;height:26u;border-radius:50%;display:grid;place-items:center;font-size:11.5u;font-style:normal;font-weight:700;color:#8a8273;box-shadow:inset 0 0 0 1.5u #ddd3c3}
.zb-lesson.done i{background:#3f5a45;box-shadow:none}
.zb-lesson.done i::after{content:"";width:8u;height:4u;margin-top:-2u;border:solid #fff;border-width:0 0 2u 2u;transform:rotate(-45deg)}
.zb-lesson.done b{color:#8a8273;font-weight:500}
.zb-lesson.now{margin:0 -10u;padding:0 10u;border-radius:12u;background:#fff;box-shadow:0 0 0 1u #ece4d8}
.zb-lesson.now i{background:#c8694a;color:#fff;box-shadow:none}
.zb-lesson.now i svg{width:10u;height:10u;margin-left:2u}
.zb-lesson b{flex:1;font-weight:600}
.zb-lesson em{font-size:12u;font-style:normal;color:#8a8273}
.zb-cta{display:grid;place-items:center;height:48u;margin-top:16u;border-radius:14u;background:#3f5a45;color:#fff;font-size:15u;font-weight:600}

/* ---------- Charla Circle (the real community frame, photographed) */
.zc-shot{position:absolute;inset:0;object-position:top center;background:#f7f7f8}

/* ---------- Lucía Ferrer (OnePage) */
.zo{background:#edeae0}
.zo-full{position:absolute!important;inset:0}

/* ---------- Wren & Ash */
.zh{background:#f6f0e4;color:#1e2a22}
.zh-ann{height:32u;display:grid;place-items:center;background:#f2b53a;color:#1e2a22;font-size:12u;font-weight:600}
.zh-nav{height:62u;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 36u;background:#1d3a2f;color:#f6f0e4}
.zh-links{display:flex;gap:22u;font-size:13.5u;opacity:.82}
.zh-links b{font-weight:600}
.zh-logo{display:flex;align-items:center;gap:8u;font-size:16u;font-weight:800;letter-spacing:.22em;text-transform:uppercase}
.zh-logo svg{width:18u;height:18u;color:#f2b53a}
.zh-icons{display:flex;justify-content:flex-end;gap:18u}
.zh-icons .zs-bag em{background:#f2b53a;color:#1e2a22}
.zh-hero{position:relative;height:330u;overflow:hidden}
.zh-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,22,30,.82),rgba(14,22,30,.2) 60%,transparent)}
.zh-copy{position:absolute;z-index:1;left:44u;bottom:44u;color:#fff}
.zh-copy p{font-size:12u;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#f2b53a}
.zh-copy h3{margin-top:8u!important;font-size:46u;font-weight:800;line-height:1;letter-spacing:-.03em}
.zh-btns{display:flex;gap:10u;margin-top:20u}
.zh-btns>*{padding:12u 20u;border-radius:999u;font-size:14u;font-weight:700}
.zh-btns b{background:#f2b53a;color:#1e2a22}
.zh-btns span{box-shadow:inset 0 0 0 1.5u rgba(255,255,255,.7)}
.zh-shop{padding:20u 36u 0}
.zh-h{display:flex;align-items:baseline;justify-content:space-between;font-size:20u;font-weight:800;letter-spacing:-.02em}
.zh-h span{font-size:13u;font-weight:600;color:#1d3a2f;text-decoration:underline;letter-spacing:0}
.zh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16u;margin-top:14u}
.zh-card .bz-pc-img{background:#e9e1d1}
.zh-card .bz-pc-img em{background:#1d3a2f;color:#f6f0e4}
.zh-m .zh-logo{font-size:14u;letter-spacing:.18em}
.zh-mnav{height:56u;display:flex;align-items:center;justify-content:space-between;padding:0 18u;background:#1d3a2f;color:#f6f0e4}
.zh-mnav .zs-bag em{background:#f2b53a;color:#1e2a22}
.zh-mshot{position:relative;height:332u;background:#d9d4cb}
.zh-heart{position:absolute;right:14u;top:14u;width:38u;height:38u;border-radius:50%;display:grid;place-items:center;background:#fff}
.zh-mbody{padding:16u 20u}
.zh-mtitle{display:flex;justify-content:space-between;gap:12u;font-size:19u;font-weight:800;line-height:1.2;letter-spacing:-.02em}
.zh-rating{display:flex;align-items:center;gap:7u;margin-top:6u;font-size:12.5u;color:#5c6a60}
.zh-label{display:flex;gap:6u;margin-top:14u!important;font-size:13u;color:#5c6a60}
.zh-label b{color:#1e2a22}
.zh-label u{margin-left:auto;color:#1e2a22}
.zh-sw{display:flex;gap:10u;margin-top:8u}
.zh-sw i{width:30u;height:30u;border-radius:50%;box-shadow:inset 0 0 0 1u rgba(0,0,0,.12)}
.zh-sw i.on{box-shadow:0 0 0 2u #f6f0e4,0 0 0 3.5u #1e2a22}
.zh-sizes{display:grid;grid-template-columns:repeat(5,1fr);gap:7u;margin-top:8u}
.zh-sizes>*{height:40u;display:grid;place-items:center;border-radius:10u;font-size:13.5u;font-style:normal;box-shadow:inset 0 0 0 1u #d6ccb9}
.zh-sizes b{background:#1e2a22;color:#fff;box-shadow:none}
.zh-sizes .out{color:#b3a993;text-decoration:line-through}
.zh-cta{display:grid;place-items:center;height:50u;margin-top:14u;border-radius:14u;background:#f2b53a;color:#1e2a22;font-size:15.5u;font-weight:800}
`)
