import type { ComponentType, SVGProps } from "react"
import {
  Archive,
  ArrowLeftToLine,
  BarChart2,
  Bell,
  Calendar,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  GripVertical,
  Heart,
  Layers,
  Link2,
  Loader2,
  Mail,
  Maximize2,
  Menu,
  MessageCircle,
  Monitor,
  MoreHorizontal,
  MousePointerClick,
  PanelBottom,
  PanelTop,
  Palette,
  Pencil,
  Pin,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings,
  Share,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  Undo2,
  UserRound,
  Users,
  X,
} from "lucide-react"
import { SiInstagram } from "@/components/icons/brand/SiInstagram"
import { SiTiktok } from "@/components/icons/brand/SiTiktok"
import { SiVimeo } from "@/components/icons/brand/SiVimeo"
import { SiYoutube } from "@/components/icons/brand/SiYoutube"
import { MockFrame, Pic, u } from "./frame"

/*
  INSIDE STORELIB'S BUILDERS, AS THEY ARE TODAY (landing round 4).
  Three editors, one tab each, each drawn from the real one's source:

    Website builder   app/(storelib)/website-builder/editor/[installId]/page.tsx
                      the dark 48px bar (Back, the site's name, its live dot
                      and menu, Preview / Code / Website Settings, the size
                      and full screen keys, the page pill, undo and redo, the
                      inspector lit violet, the violet Publish), the white
                      sidebar card on the #eef1f5 shelf with Sections / Pages
                      / Theme and the Header / Page / Footer tree on
                      tree-parts.tsx's grid, the page itself with the blue
                      ring and its "Selected" chip (sections/_shared.tsx), and
                      Publish's own panel (publish-panel.tsx). The site is
                      the owner's Materia Steez theme (round 13), then
                      loudlib (round 11).
    OnePage editor    components/onepage/onepage-editor.tsx and tabs/links-tab:
                      undo and redo, the Links / Design / Products pill row
                      and Settings, Save and Share your OnePage; the Links tab
                      beside the 410px preview column with the 307 x 627
                      phone. The phone shows Desmond Ayo's page on the Ember
                      theme (components/onepage/themes/r40-themes.ts: deep
                      brown with grain, a Bodoni title, amber outlined pills)
                      with the classic header, its Share and Subscribe keys in
                      the top corners. He sells a pack of film LUTs.
    Community         inside a community, as a member sees it
                      (components/community/member/shell-frame.tsx and
                      top-bar.tsx, wall.tsx, post-card.tsx): the community's
                      own bar with its mark, name, owner, the menu key, the
                      search and the bell; the row of places (Community,
                      Learn, Calendar, Members, Leaderboards, About); on the
                      left the community card (cover, name, address, about,
                      Members / Online / Admins, faces) and the next event;
                      in the middle the space chips, the composer and the
                      posts. One community: The Strength Room, Rina
                      Castillo's paid strength coaching group (round 5, the
                      owner: a community like the ones people really pay for
                      in 2026, not a made up hobby club). Round 8 (the
                      owner): a real emblem in place of the "SR" letters, a
                      barbell in black on yellow, and a cover that reads
                      like a banner, the name in heavy yellow on the
                      photograph (baked into st-banner.webp).

  One drawing for every screen (the owner, round 4: on a phone, the editors
  exactly as on a computer). The frame keeps its 1280 design width at every
  size and is simply smaller on a phone.

  Motion is CSS keyframes on transform and opacity only. The resting styles
  ARE the finished state, so with reduced motion (or before the animation
  starts) every mock is a complete, still picture. Animations are attached
  only under [data-mock-live] (the tab in front, in view), and only to the
  few elements that move.
*/

function Cursor({ className }: { className: string }) {
  return (
    <svg className={`bm-cursor ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 2.5 19.5 12l-7 1.6-3.6 6.9z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

/* ================================================================ The sites in the website builder: Steez, then loudlib */
/*
  Landing round 13 (the owner: the website builder example "needs to actually be accurate"): GodBless goes, and the
  first site is the owner's own Materia Steez theme (1.2.0), drawn from its export: templates/index.json for the
  order of the home page, config/settings_data.json for the colours and type, snippets/demo-image.liquid for the
  pictures the theme ships with. The Steez Club slideshow is left out, as the owner asked, so the page starts with
  the Summer Madness '26 slideshow.

    announcement  announcement-bar-basic: #111, white, 34px, "FREE SHIPPING THIS SUMMER", a close key.
    header        transparent over the slideshow (white words and icons), the white STEEZ wordmark in the middle
                  (EDEN_2.png, 90px wide), the menu on the left, search, account and cart on the right.
    slideshow     640px tall, the theme's demo photo (Untitled_design_8.png), a 29% black overlay, the words at
                  the bottom centre: NEW COLLECTION (12px), Summer Madness '26 (66px, Instrument Sans 600,
                  -0.034em), EXPLORE on the scheme's taupe key (#847265, border #bab6b1, radius 2).
    products      products-carousel, the t-shirts collection: no heading, four to a row, 5px apart, 66px above and
                  below, portrait (3:4) shots with 4px corners, the name and the price centred under them, then
                  "View all" (#111, square).
    slideshow     DISCOVER, SUMMER COLLECTION (60px), SHOP MENS and SHOP WOMENS, over the theme's demo photo of
                  a man by a black car (0a18c0d1...jpg), a 16% overlay.

  The site is drawn as the 1440px desktop page at 1024u (so 1px of the theme is 0.711u). Headings in Instrument
  Sans (the theme's own font files, subset to Latin, public/home/fonts/stz-instrument-*.woff2), body in
  Montserrat (the theme's body setting, montserrat_n4, subset the same way).

  Landing round 14 (the owner): no people in the products. The four are the owner's own Steez products, as his
  store shows them (r14in/10.webp): flat shots on light grey, cut from that picture (the export holds no product
  photos) at 480 x 640, the 3:4 of the carousel. The carousel's progress bar goes. The builder now edits the
  slideshow's heading in place: Summer Madness '26 is selected and Winter Drop '26 typed over it, then Publish.
*/
type Product = { pic: string; name: string; price: string; was?: string }
const STZ_PRODUCTS: Product[] = [
  { pic: "stz-p-hoodie", name: "Gradient Hoodie", price: "$100.00" },
  { pic: "stz-p-raw", name: "Raw Tee", price: "$120.00" },
  { pic: "stz-p-grey", name: "Grey Graphic T-shirt", price: "$80.00" },
  { pic: "stz-p-faith", name: "Faith over fear Graphic T-shirt", price: "$120.00" },
]
const STZ_MENU = ["Home", "Shop", "Products", "Contact"]
/** The heading the builder edits on each site: the words the site has, and the words typed over them (landing round 14). */
export const STZ_EDIT = { was: "Summer Madness '26", now: "Winter Drop '26" } as const
export const LL_EDIT = { was: "BESTSELLING", now: "NEW RELEASES" } as const

/** A product in a store's grid: its shot, a sale badge when it is reduced, the name and the price. */
function ShopCard({ p, cls, w = 480, h = 480 }: { p: Product; cls: string; w?: number; h?: number }) {
  return (
    <span className={`${cls}-card`}>
      <span className={`${cls}-img`}>
        <Pic n={p.pic} w={w} h={h} />
        {p.was && <i className={`${cls}-sale`}>On Sale</i>}
      </span>
      <b>{p.name}</b>
      <span className={`${cls}-price`}>
        {p.was && <s>{p.was}</s>}
        {p.price}
      </span>
    </span>
  )
}

/**
 * A heading the builder edits in place (landing round 14): the site's own words, which a double click selects, and
 * the new words, one span per character, each lit on its own beat (its delay) as if typed, a caret after the newest.
 * The resting picture is the site as it is: the old words, the new ones hidden.
 */
function Edit({ was, now }: { was: string; now: string }) {
  const beat = (TYPE_SPAN * T) / now.length
  return (
    <span className="wx-edit">
      <span className="wx-was">
        <i className="wx-mark" />
        {was}
      </span>
      <span className="wx-now" aria-hidden="true">
        {[...now].map((c, i) => (
          <i key={i} style={{ animationDelay: `${(i * beat).toFixed(3)}s` }}>
            {c}
          </i>
        ))}
      </span>
    </span>
  )
}

/**
 * Steez, the owner's Materia Steez theme, open in the website builder: the announcement bar, the transparent header
 * over the Summer Madness '26 slideshow, the t-shirts carousel, then the Summer Collection slideshow. `rings`
 * outlines the slideshow, the section the builder has selected.
 */
export function SteezSite({ rings = false }: { rings?: boolean }) {
  return (
    <div className="stz">
      <div className="stz-page">
        <p className="stz-bar">
          FREE SHIPPING THIS SUMMER
          <X className="stz-x" />
        </p>
        <div className="stz-hero">
          <Pic n="stz-hero" w={1800} h={800} className="stz-photo" />
          <div className="stz-nav">
            <span className="stz-menu">
              {STZ_MENU.map((m) => (
                <span key={m}>
                  {m}
                  {m === "Shop" && <i>Hot</i>}
                </span>
              ))}
            </span>
            <Pic n="stz-logo" w={200} h={87} className="stz-logo" />
            <span className="stz-icons">
              <Search />
              <UserRound />
              <span className="stz-cart">
                <ShoppingBag />
                <i>0</i>
              </span>
            </span>
          </div>
          <span className="stz-pitch">
            <span className="stz-sub">NEW COLLECTION</span>
            <b>{rings ? <Edit {...STZ_EDIT} /> : STZ_EDIT.was}</b>
            <em>EXPLORE</em>
          </span>
          {rings && (
            <span className="wx-sel wx-ring">
              <em>Selected</em>
            </span>
          )}
        </div>
        <div className="stz-shop">
          <div className="stz-grid">
            {STZ_PRODUCTS.map((p) => (
              <ShopCard key={p.name} p={p} cls="stz" w={480} h={640} />
            ))}
          </div>
          <span className="stz-all">View all</span>
        </div>
        <div className="stz-hero stz-summer">
          <Pic n="stz-summer" w={1200} h={533} className="stz-photo" />
          <span className="stz-pitch">
            <span className="stz-sub">DISCOVER</span>
            <b>SUMMER COLLECTION</b>
            <span className="stz-keys">
              <em>SHOP MENS</em>
              <em>SHOP WOMENS</em>
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

/*
  Landing round 11 (the owner: "after some time another template should appear, e.g. the loudlib website", their own
  store): loudlib, a dark sample pack store.

  Landing round 14 (the owner: "make it accurate to loudlib.net", "exactly like the real site"). The live site answers
  automated requests with a Cloudflare challenge, so it is rebuilt from the owner's full page screenshot
  (r14in/loudlib-full.webp, 460px wide for the 1440px page, so 1px there is 3.13px of the page and 2.23u here):
  the purple bar with the sun and "Sale 60% Off To All Products"; the near black header with the thin "loud" and
  "LIB." under it, the seven menu words with Home underlined, search, account and cart, and Discover in a purple
  outlined pill; then straight away (no hero) BESTSELLING in heavy italic capitals and the grid of six packs, three
  to a row, each a box shot on white with the purple On Sale badge, the name and the struck and sale prices. The
  six box shots are cut from that screenshot and enlarged (the store's product photos are behind the same
  challenge). The builder selects the grid and types NEW RELEASES over BESTSELLING.
*/
const LL_PRODUCTS: Product[] = [
  { pic: "ll-serum", name: "Serum Presets Vol 1", price: "€8,99", was: "€22,47" },
  { pic: "ll-tech-house", name: "Tech House Sample Pack - Master Bundle 2025", price: "€19,98", was: "€49,96" },
  { pic: "ll-drums", name: "Tech House Drum Kit Vol I", price: "From €0,00" },
  { pic: "ll-ambience", name: "Free Ambience Sample Pack Vol I", price: "Free" },
  { pic: "ll-deep-house", name: "Deep House Production Suite - Serenade", price: "€9,98", was: "€24,94" },
  { pic: "ll-unitech", name: "Tech House Sample Pack - Unitech", price: "€9,20" },
]
const LL_MENU = ["Home", "Shop", "Sample Packs", "Free Downloads", "Blog", "Work With Us", "Support"]

export function LoudlibSite({ rings = false }: { rings?: boolean }) {
  return (
    <div className="ll">
      <p className="ll-bar">
        <Sun className="ll-sun" />
        Sale 60% Off To All Products
      </p>
      <div className="ll-nav">
        <span className="ll-logo">
          loud<i>LIB.</i>
        </span>
        <span className="ll-menu">
          {LL_MENU.map((m, i) => (
            <span key={m} className={i === 0 ? "on" : undefined}>
              {m}
            </span>
          ))}
        </span>
        <span className="ll-icons">
          <Search />
          <UserRound />
          <ShoppingBag />
        </span>
        <span className="ll-discover">Discover</span>
      </div>
      <div className="ll-shop">
        <p className="ll-h">{rings ? <Edit {...LL_EDIT} /> : LL_EDIT.was}</p>
        <div className="ll-grid">
          {LL_PRODUCTS.map((p) => (
            <ShopCard key={p.name} p={p} cls="ll" w={540} h={513} />
          ))}
        </div>
        {rings && (
          <span className="wx-sel wx-ring">
            <em>Selected</em>
          </span>
        )}
      </div>
    </div>
  )
}

/* ================================================================ Website builder */
/** A section row of the Page group: its blocks' chevron (when it has blocks), the grip, the name; `hl` marks the selected one. */
type TreeRow = { name: string; twisty?: boolean; hl?: string }
/*
  Landing round 13: each site has its own tree, cross faded with it. Steez's rows are what the builder calls an
  imported theme's sections, the names in their schemas (lib/website-builder/section-name.ts): the header group's
  announcement bar and header, the home page in the template's order without the Steez Club slideshow, and the
  footer. loudlib, a Storelib theme, keeps its own. Both header groups hold two rows, so the rows the cursor and
  the rings point at stand at the same height in both. Landing round 14: loudlib's rows follow its real page, the
  Bestselling grid first (no hero), and each tree lights the one section the builder edits.
*/
type Tree = { header: string[]; page: TreeRow[] }
const STEEZ_TREE: Tree = {
  header: ["Announcement Bar Basic", "Header"],
  page: [
    { name: "Slideshow", twisty: true, hl: "wx-hl" },
    { name: "Products carousel", twisty: true },
    { name: "Slideshow", twisty: true },
    { name: "Products carousel", twisty: true },
    { name: "Collection List", twisty: true },
    { name: "Countdown Timer Flip", twisty: true },
    { name: "Category Banners", twisty: true },
  ],
}
const LOUDLIB_TREE: Tree = {
  header: ["Announcement bar", "Header"],
  page: [
    { name: "Featured products", twisty: true, hl: "wx-hl" },
    { name: "Features", twisty: true },
    { name: "Image banner", twisty: true },
    { name: "Image with text", twisty: true },
    { name: "Product tabs", twisty: true },
    { name: "Newsletter" },
    { name: "Blog posts", twisty: true },
  ],
}

/** One line of the sidebar's tree (components/website-builder/editor/tree-parts.tsx): the chevron column, the mark column, the name. */
function Row({ name, twisty, hl }: TreeRow) {
  return (
    <span className={`wx-row${hl ? ` ${hl}` : ""}`}>
      {hl && (
        <span className="wx-row-on">
          <Eye />
          <MoreHorizontal />
        </span>
      )}
      <span className="wx-col">{twisty && <ChevronRight className="wx-twisty" />}</span>
      <span className="wx-col">
        <GripVertical className="wx-grip" />
      </span>
      <b>{name}</b>
    </span>
  )
}

/** The Header and Footer rows: the dark grey badge in the mark column (sections-list.tsx). */
function ChromeRow({ name, Icon }: { name: string; Icon: typeof PanelTop }) {
  return (
    <span className="wx-row">
      <span className="wx-col" />
      <span className="wx-col">
        <span className="wx-badge">
          <Icon />
        </span>
      </span>
      <b>{name}</b>
    </span>
  )
}

/** "Add section": the plus in a small raised white key, on the names' edge (tree-parts.tsx TreeAddRow). */
function AddRow() {
  return (
    <span className="wx-add">
      <span className="wx-col" />
      <span className="wx-col">
        <span className="wx-add-key">
          <Plus />
        </span>
      </span>
      Add section
    </span>
  )
}

/** The sidebar's tree for one site: the header group, the page's sections, the footer. */
function SiteTree({ tree, className }: { tree: Tree; className: string }) {
  return (
    <div className={`wx-tree ${className}`}>
      <p className="wx-group">Header</p>
      {tree.header.map((n) => (
        <ChromeRow key={n} name={n} Icon={PanelTop} />
      ))}
      <AddRow />
      <i className="wx-rule" />
      <p className="wx-group">Page</p>
      <AddRow />
      {tree.page.map((r, i) => (
        <Row key={`${r.name}-${i}`} {...r} />
      ))}
      <AddRow />
      <i className="wx-rule" />
      <p className="wx-group">Footer</p>
      <ChromeRow name="Footer" Icon={PanelBottom} />
    </div>
  )
}

function WbTabs() {
  return (
    <span className="wx-tabs">
      <b>
        <Layers /> Sections
      </b>
      <span>
        <FileText /> Pages
      </span>
      <span>
        <Settings /> Theme
      </span>
    </span>
  )
}

/** The builder's dark bar: Back, the site's name, its live dot and menu, the Preview / Code / Website Settings switch; the size, full screen and the page pill; undo, redo, the inspector and Publish. */
function WbBar() {
  return (
    <div className="wx-bar">
      <span className="wx-left">
        <span className="wx-key ghost">
          <ArrowLeftToLine />
        </span>
        <b className="wx-name">
          <span className="bm-s1">Steez</span>
          <span className="bm-s2">loudlib</span>
        </b>
        <i className="wx-live" />
        <span className="wx-key">
          <MoreHorizontal />
        </span>
        <span className="wx-mode">
          <b>
            <Globe /> Preview
          </b>
          <span>
            <Code2 />
          </span>
          <span>
            <Settings />
          </span>
        </span>
      </span>
      <span className="wx-mid">
        <span className="wx-round">
          <Monitor />
        </span>
        <span className="wx-round">
          <Maximize2 />
        </span>
        <span className="wx-page">
          <RefreshCw className="wx-page-re" />
          <b>Home</b>
          <ChevronDown />
        </span>
        <span className="wx-key ghost">
          <ExternalLink />
        </span>
      </span>
      <span className="wx-right">
        <span className="wx-key">
          <Undo2 />
        </span>
        <span className="wx-key">
          <Redo2 />
        </span>
        <span className="wx-key wx-inspect">
          <MousePointerClick />
        </span>
        <span className="wx-publish">
          <i /> Publish
        </span>
      </span>
    </div>
  )
}

/** Publish's panel, hung from the button (components/website-builder/publish-panel.tsx), as the change goes live. */
function PublishPanel() {
  return (
    <div className="wx-pub">
      <p className="wx-pub-h">
        <i className="wx-pub-dot" />
        <b>Publish</b>
      </p>
      <p className="wx-pub-st">
        <span className="wx-pub-was">Changes since published 2 days ago</span>
        <span className="wx-pub-now">Published just now</span>
      </p>
      <p className="wx-pub-l">Website URL</p>
      <span className="wx-pub-url">
        <Globe />
        <b className="wx-pub-host">
          <span className="bm-s1">steez.storelib.com</span>
          <span className="bm-s2">loudlib.net</span>
        </b>
        <Copy />
        <ExternalLink />
      </span>
      <p className="wx-pub-sec">
        <ShieldCheck /> No security issues found
      </p>
      <span className="wx-pub-act">
        <span className="wx-pub-prev">
          <ExternalLink /> Preview
        </span>
        <span className="wx-pub-go">
          <span className="wx-go-a">Publish changes</span>
          <span className="wx-go-b">
            <Loader2 className="wx-spin" /> Publishing
          </span>
          <span className="wx-go-c">Published</span>
        </span>
      </span>
    </div>
  )
}

export function WebsiteBuilderMock() {
  return (
    <div className="bm wb">
      <WbBar />
      <aside className="wx-side">
        <WbTabs />
        <div className="wx-trees">
          <SiteTree tree={STEEZ_TREE} className="bm-s1" />
          <SiteTree tree={LOUDLIB_TREE} className="bm-s2" />
        </div>
      </aside>
      <div className="wx-canvas">
        <MockFrame label="" className="wx-site bm-s1">
          <SteezSite rings />
        </MockFrame>
        {/* Landing round 11: the second site the tab moves on to (data-scene, ideas-come-to-life.tsx), cross faded in the same canvas. */}
        <MockFrame label="" className="wx-site bm-s2">
          <LoudlibSite rings />
        </MockFrame>
      </div>
      <PublishPanel />
      {/* Landing round 14: one pointer per site, each with its own path to the heading it edits, faded with its site. */}
      <span className="wx-curs bm-s1">
        <Cursor className="wx-cur wx-cur-stz" />
      </span>
      <span className="wx-curs bm-s2">
        <Cursor className="wx-cur wx-cur-ll" />
      </span>
    </div>
  )
}

/* ================================================================ OnePage editor */
type Mark = ComponentType<SVGProps<SVGSVGElement>>
/* Simple Icons' marks, the same ones the OnePage draws (components/onepage/brand-icons.tsx); cast to an SVG component, as integrations-section does. */
const IG = SiInstagram as unknown as Mark
const YT = SiYoutube as unknown as Mark
const VM = SiVimeo as unknown as Mark
const TT = SiTiktok as unknown as Mark

/** The social row's platforms, in the page's order. */
const SOCIALS = [
  ["instagram", IG],
  ["youtube", YT],
  ["vimeo", VM],
  ["tiktok", TT],
] as const

/**
 * A mark in its brand's own colour, as the Links tab's social chips draw them (tone "brand"): Instagram in its
 * gradient (the editor's own `bm-ig` gradient, below), YouTube red, Vimeo blue, TikTok with its cyan and red echo.
 */
function BrandMark({ k }: { k: (typeof SOCIALS)[number][0] }) {
  if (k === "tiktok")
    return (
      <span className="bm-tt">
        <TT className="bm-tt-c" />
        <TT className="bm-tt-r" />
        <TT />
      </span>
    )
  if (k === "instagram") return <IG fill="url(#bm-ig)" />
  return k === "youtube" ? <YT color="#ff0000" /> : <VM color="#1ab7ea" />
}

/** Instagram's current colours (components/onepage/brand-icons.tsx INSTAGRAM_STOPS), once for the editor's chips. */
function BrandDefs() {
  return (
    <svg className="bm-defs" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="bm-ig" cx="0.25" cy="1.05" r="1.35" fx="0.25" fy="1.05">
          <stop offset="0" stopColor="#FFD600" />
          <stop offset="0.22" stopColor="#FF7A00" />
          <stop offset="0.48" stopColor="#FF0069" />
          <stop offset="0.74" stopColor="#D300C5" />
          <stop offset="1" stopColor="#7638FA" />
        </radialGradient>
      </defs>
    </svg>
  )
}

type Block = { t: string; s: string; pic?: string; Icon?: typeof Calendar; clicks?: string; off?: boolean }
/*
  Landing round 12 (perf): a block's tile and a product's pack are drawn at 11 to 63px (a phone to 2560), and they
  were 480 to 640px photos, each decoded at full size for a thumbnail. They use small copies now, about twice their
  largest drawn size (-128: 128x160; lp-f2-208: 208x130), the same crop, so they look the same and decode in a blink.
*/
const DESMOND_BLOCKS: Block[] = [
  { t: "Night Stock, 14 film LUTs", s: "$24.00", pic: "dr-neon-128", clicks: "2.4k" },
  { t: "Free LUT: Tungsten Fade", s: "Free download", Icon: Download, clicks: "6.1k" },
  { t: "Grade review on video call", s: "Booking form", Icon: Calendar, clicks: "312" },
  { t: "Grade notes", s: "Email signup", Icon: Mail, off: true },
  { t: "Before and after: Lisbon at night", s: "youtube.com/@desmondgrades", pic: "lp-f2-208", clicks: "8.7k" },
]

function OpeBlock({ b }: { b: Block }) {
  const Icon = b.Icon
  return (
    <span className={`ope-card${b.off ? " ope-off" : ""}`}>
      <GripVertical className="ope-grip" />
      <span className="ope-face">
        <span className="ope-tile">{b.pic ? <Pic n={b.pic} w={128} h={128} /> : Icon ? <Icon /> : null}</span>
        <span className="ope-txt">
          <b>{b.t}</b>
          <i>{b.s}</i>
        </span>
      </span>
      <span className="ope-stats">
        {b.clicks && (
          <>
            <BarChart2 /> {b.clicks}
          </>
        )}
      </span>
      <span className="ope-sw">
        <i className="ope-sw-on" />
        <b />
      </span>
    </span>
  )
}

/**
 * Desmond Ayo's OnePage, as components/onepage/public-onepage.tsx draws it on the Ember theme (deep brown with a
 * fine grain, a Bodoni title, Manrope words, amber outlined pills) with the classic header: the round photo, the
 * name, the bio, the social row, and the Share and Subscribe keys in the top corners. `.dp-new` is the email signup
 * the editor turns on.
 */
export function DesmondPage() {
  return (
    <div className="dp">
      <span className="dp-corner dp-share">
        <Share />
      </span>
      <span className="dp-corner dp-bell">
        <Bell />
      </span>
      <div className="dp-head">
        <Pic n="lp-av" w={240} h={240} className="dp-av" />
        <h3>Desmond Ayo</h3>
        <p>Colourist in Lisbon. Film looks for Premiere, Resolve and Final Cut.</p>
        <span className="dp-socials">
          {SOCIALS.map(([k, M]) => (
            <M key={k} />
          ))}
        </span>
      </div>
      <span className="dp-prod">
        <span className="dp-pack">
          <Pic n="dr-neon-128" w={128} h={160} className="dp-pack-a" />
          <Pic n="dr-neon-128" w={128} h={160} className="dp-pack-b" />
          <i />
        </span>
        <span className="dp-prod-t">
          <b>Night Stock, 14 film LUTs</b>
          <i>.cube files · Premiere, Resolve, Final Cut</i>
        </span>
        <strong>$24</strong>
      </span>
      <span className="dp-btn">Free LUT: Tungsten Fade</span>
      <span className="dp-btn">Grade review on video call</span>
      <span className="dp-btn dp-new">
        <span className="dp-signup">
          <b>Grade notes, every other Sunday</b>
          <span className="dp-form">
            <span className="dp-input">Your email</span>
            <span className="dp-sub">Subscribe</span>
          </span>
        </span>
      </span>
      <span className="dp-video dp-after">
        <Pic n="lp-f2" w={640} h={400} />
        <span className="dp-vplay">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <em>Before and after: Lisbon at night · 3:08</em>
      </span>
    </div>
  )
}

/** The Links tab's column: the profile (photo, name, bio, social chips), Add, and the blocks with their switches. */
function OpePanel({ av, name, bio, blocks }: { av: string; name: string; bio: string; blocks: Block[] }) {
  return (
    <div className="ope-panel">
      <div className="ope-profile">
        <Pic n={av} w={240} h={240} className="ope-av" />
        <span>
          <b>
            {name} <Pencil />
          </b>
          <i>{bio}</i>
          <span className="ope-socials">
            {SOCIALS.map(([k]) => (
              <em key={k}>
                <BrandMark k={k} />
              </em>
            ))}
            <em className="add">
              <Plus />
            </em>
          </span>
        </span>
      </div>
      <span className="ope-add">Add</span>
      <span className="ope-quick">
        <span>
          <Layers /> Add Group
        </span>
        <span>
          <Archive /> View archive
        </span>
      </span>
      <div className="ope-list">
        {blocks.map((b) => (
          <OpeBlock key={b.t} b={b} />
        ))}
      </div>
    </div>
  )
}

export function OnePageEditorMock() {
  return (
    <div className="bm ope">
      <BrandDefs />
      <div className="ope-bar">
        <span className="ope-bar-l">
          <span className="ope-key">
            <Undo2 />
          </span>
          <span className="ope-key">
            <Redo2 />
          </span>
          <span className="ope-pills">
            <b>
              <Link2 /> Links
            </b>
            <span>
              <Palette /> Design
            </span>
            <span>
              <ShoppingBag /> Products
            </span>
          </span>
          <span className="ope-set">
            <SlidersHorizontal />
          </span>
        </span>
        <span className="ope-bar-r">
          <span className="ope-save">
            <span className="ope-saved">Saved</span>
            <span className="ope-dirty">Save</span>
          </span>
          <span className="ope-share">
            <Globe /> <span>Share your OnePage</span>
          </span>
        </span>
      </div>
      {/* Landing round 13 (the owner): Idris Kane is gone; the tab shows Desmond's page alone, one scene. */}
      <OpePanel av="lp-av" name="Desmond Ayo" bio="Colourist in Lisbon. Film looks for Premiere, Resolve and Final Cut." blocks={DESMOND_BLOCKS} />
      <div className="ope-stage">
        <div className="ope-phone">
          <MockFrame w={390} ratio="287/607" label="" className="ope-screen">
            <DesmondPage />
          </MockFrame>
        </div>
      </div>
      <Cursor className="ope-cur" />
    </div>
  )
}

/* ================================================================ Community: inside The Strength Room */
const ST_CHIPS = [
  ["All", ""],
  ["Wins", "🏆"],
  ["Form checks", "🎥"],
  ["Programs", "📋"],
  ["Nutrition", "🥗"],
  ["Introductions", "👋"],
] as const

const ST_PLACES = ["Community", "Learn", "Calendar", "Members", "Leaderboards", "About"]
const ST_FACES = ["av-k", "av-l", "av-n", "av-e", "av-g", "av-j"]
/** What a member types into the composer; the caret steps once per character (its keyframes read the length). */
export const ST_TYPED = "3 x 5 on squats at 50 kg today. Video is in Form checks."

/** The Strength Room's emblem: a loaded barbell in black on the cover's yellow, like a gym's own badge. */
function StrengthMark() {
  return (
    <svg className="cx-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#ffd400" />
      <rect x="5" y="18.9" width="30" height="2.2" rx="1.1" fill="#111" />
      <rect x="9" y="10.5" width="3.6" height="19" rx="1.4" fill="#111" />
      <rect x="27.4" y="10.5" width="3.6" height="19" rx="1.4" fill="#111" />
      <rect x="13.4" y="13.5" width="2.6" height="13" rx="1.1" fill="#111" />
      <rect x="24" y="13.5" width="2.6" height="13" rx="1.1" fill="#111" />
    </svg>
  )
}

export function CommunityMock() {
  return (
    <div className="bm cx">
      <div className="cx-bar">
        <span className="cx-lead">
          <StrengthMark />
          <span className="cx-who">
            <b>The Strength Room</b>
            <i>By Rina Castillo</i>
          </span>
          <span className="cx-menu">
            <Menu />
          </span>
        </span>
        <span className="cx-search">
          <Search /> Search discussions, members, or content...
        </span>
        <span className="cx-icons">
          <span className="cx-msg">
            <MessageCircle />
            <i>3</i>
          </span>
          <Sun />
          <Pic n="av-h" w={96} h={96} className="cx-me" />
        </span>
      </div>
      <div className="cx-tabs">
        {ST_PLACES.map((p, i) => (
          <span key={p} className={i === 0 ? "on" : undefined}>
            {p}
          </span>
        ))}
      </div>
      <aside className="cx-left">
        <div className="cx-card">
          <Pic n="st-banner" w={960} h={540} className="cx-cover" />
          <div className="cx-card-in">
            <b className="cx-name">The Strength Room</b>
            <p className="cx-addr">storelib.com/community/strengthroom</p>
            <p className="cx-sum">Strength training for women, coached by Rina. A new four day program every six weeks, form checks on your videos, a live Q&amp;A on Thursdays.</p>
            <span className="cx-stats">
              <span>
                <b>1,284</b>
                <i>Members</i>
              </span>
              <span>
                <b>37</b>
                <i>
                  <em /> Online
                </i>
              </span>
              <span>
                <b>2</b>
                <i>Admins</i>
              </span>
            </span>
            <span className="cx-faces">
              {ST_FACES.map((f) => (
                <Pic key={f} n={f} w={96} h={96} />
              ))}
              <em>+1.2k</em>
            </span>
          </div>
        </div>
        <div className="cx-card cx-event">
          <p className="cx-card-h">
            Upcoming event <span>View all</span>
          </p>
          <span className="cx-ev">
            <span className="cx-date">
              <i>Nov</i>
              <b>20</b>
            </span>
            <span>
              <b>Live form check: squat depth</b>
              <i>Thu, Nov 20, 6:30 PM EST</i>
              <i>
                <Users /> 46 going
              </i>
            </span>
          </span>
        </div>
      </aside>
      <main className="cx-main">
        <span className="cx-chips">
          {ST_CHIPS.map(([t, e], i) => (
            <span key={t} className={i === 0 ? "on" : undefined}>
              {e && <i>{e}</i>}
              {t}
            </span>
          ))}
          <span className="cx-sort">
            <SlidersHorizontal />
          </span>
        </span>
        <div className="cx-compose">
          <Pic n="av-h" w={96} h={96} className="cx-av" />
          <span className="cx-field">
            <span className="cx-ph">Share something...</span>
            <span className="cx-typed">
              {ST_TYPED}
              <i className="cx-type" />
            </span>
          </span>
        </div>
        <article className="cx-post">
          <p className="cx-pin">
            <Pin /> Pinned
          </p>
          <span className="cx-ph-head">
            <Pic n="av-c" w={96} h={96} className="cx-av" />
            <span>
              <b>
                Rina Castillo <em>Owner</em>
              </b>
              <i>2h · 📋 Programs</i>
            </span>
            <MoreHorizontal className="cx-more" />
          </span>
          <h4>Block 4 is up: four days, 45 minutes, a deadlift focus</h4>
          <p>Warmups are in Learn. Log your top set every Friday and I will set your weights for the week after. Questions go under this post.</p>
          <span className="cx-foot">
            <span className="cx-heart">
              <Heart className="cx-h-off" />
              <Heart className="cx-h-on" fill="currentColor" strokeWidth={0} />
              <b className="cx-n">
                <span className="cx-n-a">63</span>
                <span className="cx-n-b">64</span>
              </b>
            </span>
            <span>
              <MessageCircle /> <b>31</b>
            </span>
            <span className="cx-faces cx-faces-s">
              <Pic n="av-l" w={96} h={96} />
              <Pic n="av-k" w={96} h={96} />
              <Pic n="av-e" w={96} h={96} />
            </span>
            <span className="cx-new">New comment 4m ago</span>
          </span>
        </article>
        <article className="cx-post">
          <span className="cx-ph-head">
            <Pic n="av-n" w={96} h={96} className="cx-av" />
            <span>
              <b>Dana Whitfield</b>
              <i>5h · 🏆 Wins</i>
            </span>
            <MoreHorizontal className="cx-more" />
          </span>
          <h4>Eight months in: 70 kg deadlift</h4>
          <p>In March I could not pull the bar off the floor without my back rounding. Today&apos;s top set on the left, back squats this morning on the right.</p>
          <span className="cx-pics">
            <Pic n="st-pull" w={640} h={480} />
            <Pic n="st-squat" w={640} h={480} />
          </span>
        </article>
      </main>
      <Cursor className="cx-cur" />
    </div>
  )
}

/* ================================================================ styles */
const T = 8.4 // seconds per scripted moment; the tabs move on after one

export const BUILDER_DURATION_MS = T * 1000

/*
  Landing round 14 (the owner): the builder's moment is an edit. The pointer goes to the heading, a click selects
  its section (the ring, the row in the sidebar), a double click selects the words, new words are typed over them,
  then Publish, Publish changes, Published. Steez plays it when the tab opens; loudlib plays it when the tab moves on
  to it (data-scene="1"), each once (1 iteration, both), so the finished edit stays while the site fades away and
  the next showing starts from the site as it is. Publish's own panel is the editor's, shared, on the usual loop.
*/
/** The share of the moment the typing takes, from 21% (when the selected words go) to 33%. */
const TYPE_SPAN = 0.12
const TYPE_AT = 21
/** Where each pointer clicks the heading, in the editor's 1280u: measured off the drawn page (scripts in the round 14 notes). */
export const EDIT_AT = { stz: [872, 377], ll: [826, 226] } as const
const PUBLISH_AT = [1214, 21]
const GO_AT = [1150, 298]
const pct = (n: number) => `${+n.toFixed(2)}%`

/** One pointer's path: in from the lower right, click (the section), double click (the words), aside while typing, Publish, Publish changes, gone. */
function cursorKeys(name: string, [x, y]: readonly number[]) {
  const at = (px: number, py: number) => `translate(${px - x}u,${py - y}u)`
  const p = at(PUBLISH_AT[0], PUBLISH_AT[1])
  const g = at(GO_AT[0], GO_AT[1])
  return `@keyframes ${name}{0%{opacity:0;transform:translate(170u,190u)}4%{opacity:1}12%{transform:none}13%{transform:scale(.86)}14%,15.5%{transform:none}16.5%{transform:scale(.86)}17.5%,19%{transform:none}22%,33%{transform:translate(26u,34u)}42%{transform:${p}}44%{transform:${p} scale(.86)}46%,49%{transform:${p}}58%{transform:${g}}60%{transform:${g} scale(.86)}62%,82%{opacity:1;transform:${g}}90%,100%{opacity:0;transform:${g}}}`
}

/** The caret after character i stays until the next one comes; after the last it stays a little longer. */
function caretKeys(n: number) {
  const w = (TYPE_SPAN * 100) / n
  return `@keyframes sxk-ed-car-${n}{0%,${TYPE_AT}%{opacity:0}${pct(TYPE_AT + 0.2)},${pct(TYPE_AT + w)}{opacity:1}${pct(TYPE_AT + w + 0.2)},100%{opacity:0}}`
}

const ONCE = "var(--bm-t) var(--bm-ease) 1 both"
const STZ = "[data-mock-live] .stz"
const LL = '[data-mock-live][data-scene="1"] .ll'
const motion = (sel: string, anim: string) => `@media(prefers-reduced-motion:no-preference){${sel}{animation:${anim}}}`
const EDIT_CSS = [
  `.wx-curs{position:absolute;inset:0;z-index:30;pointer-events:none}`,
  `.wx-cur-stz{left:${EDIT_AT.stz[0]}u;top:${EDIT_AT.stz[1]}u}`,
  `.wx-cur-ll{left:${EDIT_AT.ll[0]}u;top:${EDIT_AT.ll[1]}u}`,
  `.wx-edit{display:inline-grid;justify-items:center;vertical-align:top}`,
  `.wx-edit>span{grid-area:1/1;white-space:pre}`,
  `.wx-was{position:relative;z-index:0}`,
  `.wx-mark{position:absolute;z-index:-1;inset:-.02em -.05em;background:rgba(59,130,246,.55);opacity:0}`,
  `.wx-now i{position:relative;font-style:inherit;opacity:0}`,
  `.wx-now i::after{content:"";position:absolute;right:-.06em;top:.1em;bottom:.08em;width:max(1.4u,.05em);background:currentColor;opacity:0}`,
  motion(`${STZ} .wx-ring,[data-mock-live] .wx-tree.bm-s1 .wx-hl .wx-row-on`, `sxk-ed-sel ${ONCE}`),
  motion(`${LL} .wx-ring,[data-mock-live][data-scene="1"] .wx-tree.bm-s2 .wx-hl .wx-row-on`, `sxk-ed-sel ${ONCE}`),
  motion(`[data-mock-live] .wx-cur-stz`, `sxk-cur-stz ${ONCE}`),
  motion(`[data-mock-live][data-scene="1"] .wx-cur-ll`, `sxk-cur-ll ${ONCE}`),
  ...[STZ, LL].flatMap((at) => [
    motion(`${at} .wx-mark`, `sxk-ed-mark var(--bm-t) linear 1 both`),
    motion(`${at} .wx-was`, `sxk-ed-was var(--bm-t) linear 1 both`),
    motion(`${at} .wx-now i`, `sxk-ed-ch var(--bm-t) linear 1 both`),
  ]),
  motion(`${STZ} .wx-now i::after`, `sxk-ed-car-${STZ_EDIT.now.length} var(--bm-t) linear 1 both`),
  motion(`${LL} .wx-now i::after`, `sxk-ed-car-${LL_EDIT.now.length} var(--bm-t) linear 1 both`),
  motion(`${STZ} .wx-now i:last-child::after,${LL} .wx-now i:last-child::after`, `sxk-ed-car-last var(--bm-t) linear 1 both`),
  `@keyframes sxk-ed-sel{0%,12.5%{opacity:0}13.5%,100%{opacity:1}}`,
  `@keyframes sxk-ed-mark{0%,16.5%{opacity:0}17%,${TYPE_AT - 0.5}%{opacity:1}${TYPE_AT}%,100%{opacity:0}}`,
  `@keyframes sxk-ed-was{0%,${TYPE_AT - 0.5}%{opacity:1}${TYPE_AT}%,100%{opacity:0}}`,
  `@keyframes sxk-ed-ch{0%,${TYPE_AT}%{opacity:0}${TYPE_AT + 0.2}%,100%{opacity:1}}`,
  caretKeys(STZ_EDIT.now.length),
  caretKeys(LL_EDIT.now.length),
  `@keyframes sxk-ed-car-last{0%,${TYPE_AT}%{opacity:0}${TYPE_AT + 0.2}%,${TYPE_AT + 8}%{opacity:1}${TYPE_AT + 8.2}%,100%{opacity:0}}`,
  cursorKeys("sxk-cur-stz", EDIT_AT.stz),
  cursorKeys("sxk-cur-ll", EDIT_AT.ll),
].join("\n")

export const BUILDER_CSS = u(`
.bm{position:absolute;inset:0;background:#fff;color:#1a1a2e;font-family:var(--font-inter,Inter),Inter,sans-serif;font-size:13u;--bm-t:${T}s;--bm-ease:cubic-bezier(.45,0,.2,1)}
.bm svg{width:16u;height:16u}
.bm-frame>.smk{--w:1280}
.bm-cursor{position:absolute;z-index:30;width:22u!important;height:22u!important;opacity:0;filter:drop-shadow(0 2u 3u rgba(0,0,0,.25));pointer-events:none}

/* ---------- the site (its own design width). Landing round 13: the owner's Materia Steez theme, its 1440px home page drawn at 1024u (1px of the theme = .711u), its settings in the comment above SteezSite. */
.wx-canvas .wx-site{position:absolute;inset:0}
.wx-site>.smk{--w:1024}
@font-face{font-family:"STZ Instrument";src:url(/home/fonts/stz-instrument-500.woff2) format("woff2");font-weight:500;font-display:swap}
@font-face{font-family:"STZ Instrument";src:url(/home/fonts/stz-instrument-600.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:"STZ Montserrat";src:url(/home/fonts/stz-montserrat-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"STZ Montserrat";src:url(/home/fonts/stz-montserrat-500.woff2) format("woff2");font-weight:500;font-display:swap}
.stz{position:absolute;inset:0;background:#fff;color:#1f1f1f;overflow:hidden;font-family:"STZ Montserrat",Montserrat,var(--font-inter,Inter),sans-serif;--stz-head:"STZ Instrument","Instrument Sans",var(--font-inter,Inter),sans-serif}
.stz-page{display:flex;flex-direction:column}
.stz-bar{position:relative;flex:none;height:24u;display:grid;place-items:center;background:#111;color:#fff;font-size:10u;font-weight:400}
.stz .stz-x{position:absolute;right:14u;top:7u;width:10u;height:10u;color:#fff}
.stz-hero{position:relative;flex:none;height:455u;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;background:#2c2a27;color:#fff;overflow:hidden}
.stz-photo{position:absolute;inset:0;width:100%!important;height:100%!important;object-fit:cover;background:none!important}
/* The slide's overlay: 29% black on Summer Madness, 16% on Summer Collection (overlay_opacity). Over the photo, under the words and the builder's ring. */
.stz-hero::before{content:"";position:absolute;z-index:1;inset:0;background:rgba(0,0,0,.29)}
.stz-summer::before{background:rgba(0,0,0,.16)}
.stz-hero .wx-sel{z-index:4}
/* The header, transparent over the first slide: white words and icons, the wordmark in the middle (logo-center). */
.stz-nav{position:absolute;z-index:3;inset:0 0 auto;height:50u;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 21u;color:#fff}
.stz-menu{display:flex;gap:21u;font-family:var(--stz-head);font-size:11.4u;font-weight:500;letter-spacing:-.01em}
.stz-menu>span{position:relative}
.stz-menu i{position:absolute;left:100%;top:-7u;margin-left:2u;padding:1.5u 4u;border-radius:999u;background:#353535;color:#fff;font-size:6.5u;font-style:normal;font-weight:500;line-height:1.1}
.stz-logo{width:64u!important;height:28u!important;object-fit:contain;background:none!important}
.stz-icons{display:flex;justify-content:flex-end;align-items:center;gap:16u}
.stz .stz-icons svg{width:14u;height:14u;stroke-width:1.7}
.stz-cart{position:relative;display:grid}
.stz-cart i{position:absolute;right:-6u;top:-5u;display:grid;place-items:center;width:11u;height:11u;border-radius:50%;background:#131d2e;color:#fff;font-size:6.5u;font-style:normal;font-weight:500}
.stz-pitch{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;padding:0 21u 68u;text-align:center}
.stz-sub{font-family:var(--stz-head);font-size:8.5u;font-weight:500;letter-spacing:.04em}
.stz-pitch b{margin-top:7u;font-family:var(--stz-head);font-size:47u;font-weight:600;line-height:1.1;letter-spacing:-.034em}
.stz-pitch em{margin-top:20u;padding:10u 18.5u;border:1u solid #bab6b1;border-radius:1.4u;background:#847265;color:#fff;font-size:10u;font-style:normal;font-weight:500;line-height:1;letter-spacing:.02em}
.stz-summer{justify-content:center}
.stz-summer .stz-pitch{padding:0 21u}
.stz-summer .stz-pitch b{font-size:42.7u}
.stz-keys{display:flex;gap:10u}
.stz-summer .stz-pitch em{border-color:#292929;background:#ebebeb;color:#000}
/* products-carousel: no heading, 4 to a row, 5px apart, 66px above and below, 3:4 shots with 4px corners, centred name and price, the progress bar, View all. */
.stz-shop{position:relative;flex:none;display:flex;flex-direction:column;align-items:center;padding:47u 11u}
.stz-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3.5u;width:100%}
.stz-card{display:grid;align-content:start;justify-items:center;text-align:center}
.stz-img{position:relative;display:block;width:100%;aspect-ratio:3/4;border-radius:3u;background:#f4f6fa;overflow:hidden}
.stz-img img{width:100%!important;height:100%!important;object-fit:cover;background:none!important}
.stz-card>b{margin-top:10.7u;font-family:var(--stz-head);font-size:10.7u;font-weight:600;letter-spacing:-.01em;color:#000;white-space:nowrap}
.stz-price{margin-top:3.5u;font-size:10.7u;color:#1f1f1f}
.stz-all{margin-top:27u;padding:10u 18.5u;background:#111;color:#fff;font-size:10u;font-weight:500;line-height:1}
/* Landing round 14: once the change is live, the canvas scrolls down to the products (transform only), and stays there while loudlib fades in: it runs once per showing (the panel's data-mock-live comes and goes with it), not on a loop that would jump back mid fade. */
@media(prefers-reduced-motion:no-preference){[data-mock-live] .stz-page{animation:sxk-stz-scroll var(--bm-t) var(--bm-ease) 1 both}}
@keyframes sxk-stz-scroll{0%,86%{transform:none}96%,100%{transform:translateY(-485u)}}

/* ---------- loudlib, after loudlib.net (landing round 14): its 1440px page at 1024u, measured off the owner's screenshot (1px there = 2.23u) */
.ll{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#1f1f1f;font-family:var(--font-inter,Inter),Inter,sans-serif}
.ll-bar{flex:none;height:32u;display:flex;align-items:center;justify-content:center;gap:6u;background:#6c2bd9;color:#fff;font-size:11u;letter-spacing:.01em}
.ll .ll-sun{width:11.5u;height:11.5u;color:#ffc83d;fill:#ffc83d}
.ll-nav{flex:none;height:68u;display:flex;align-items:center;padding:0 54u 0 55.5u;background:#141414;color:#fff}
.ll-logo{display:flex;flex-direction:column;align-items:flex-end;margin-right:44u;font-size:30.6u;font-weight:300;line-height:1;letter-spacing:-.01em}
.ll-logo i{margin:1u 11u 0 0;font-size:6.8u;font-style:normal;font-weight:600;line-height:1;letter-spacing:.06em}
.ll-menu{display:flex;gap:15u;font-size:11.5u}
.ll-menu .on{text-decoration:underline;text-underline-offset:4.3u;text-decoration-thickness:.75u}
.ll-icons{display:flex;align-items:center;gap:18.5u;margin:0 32.7u 0 auto}
.ll .ll-icons svg{width:15u;height:15u;stroke-width:1.6}
.ll-discover{display:grid;place-items:center;width:91u;height:37u;border-radius:999u;box-shadow:inset 0 0 0 1.4u #6c2bd9;font-size:11.4u;font-weight:500}
.ll-shop{position:relative;flex:1 0 auto;padding-top:70.4u}
.ll-h{text-align:center;font-size:15.3u;font-style:italic;font-weight:800;line-height:1;letter-spacing:.035em;color:#1c2331}
.ll-grid{display:grid;grid-template-columns:repeat(3,267u);grid-auto-rows:356u;column-gap:15.7u;margin:32.2u 0 0 97.9u}
.ll-card{display:block}
.ll-img{position:relative;display:block;height:254u;background:#fff}
.ll-img img{width:100%!important;height:100%!important;object-fit:cover;background:none!important}
.ll-sale{position:absolute;left:8.3u;top:223.4u;display:grid;place-items:center;height:19.9u;padding:0 8.5u;border-radius:6.4u;background:#6c2bd9;color:#fff;font-size:9.6u;font-style:normal;font-weight:500}
.ll-card>b{display:block;margin:17.5u 0 0 9u;font-size:10.4u;font-weight:400;line-height:1.2;white-space:nowrap}
.ll-price{display:flex;gap:7u;margin:9.8u 0 0 9u;font-size:10.2u;line-height:1.2}
.ll-price s{color:#8a8a8a}

/* Landing round 11: two sites in the builder, two pages in the OnePage editor. The tab shows the first, then (data-scene="1" on its panel, set on the autoplay clock) cross fades to the second; only opacity moves. */
.bm-s1,.bm-s2{transition:opacity .7s cubic-bezier(.4,0,.2,1)}
.bm-s2{opacity:0}
[data-scene="1"] .bm-s1{opacity:0}
[data-scene="1"] .bm-s2{opacity:1}
.wx-name,.wx-pub-host,.wx-trees{display:grid}
.wx-trees>.wx-tree{grid-area:1/1}
.wx-name>span,.wx-pub-host>span{grid-area:1/1}
.wx-pub-host>span{font-weight:400}
@media(prefers-reduced-motion:reduce){.bm-s1,.bm-s2{transition:none}}
.wx-sel{position:absolute;inset:0;box-shadow:inset 0 0 0 2u #3b82f6;pointer-events:none}
.wx-sel em{position:absolute;left:8u;top:8u;padding:5u 7u;border-radius:6u;background:#3b82f6;color:#fff;font-size:11.5u;font-style:normal;font-weight:600;line-height:1;box-shadow:0 1u 4u rgba(0,0,0,.18)}

/* ---------- website builder (app/(storelib)/website-builder/editor, its bar, the sidebar card, the canvas) */
.wb{background:#eef1f5}
.wx-bar{position:absolute;inset:0 0 auto;height:48u;display:flex;align-items:center;gap:8u;padding:0 16u;background:#171717;color:#fff;border-bottom:1u solid rgba(255,255,255,.1)}
.wx-bar svg{width:16u;height:16u}
.wx-left,.wx-mid,.wx-right{display:flex;align-items:center;gap:6u}
.wx-mid{flex:1;justify-content:center}
.wx-right{gap:8u}
.wx-key{display:grid;place-items:center;width:32u;height:32u;border-radius:8u;background:#262626;color:rgba(255,255,255,.8);box-shadow:inset 0 1u 0 rgba(255,255,255,.06),0 1u 2u rgba(0,0,0,.5),0 4u 10u -4u rgba(0,0,0,.6)}
.wx-key.ghost{background:none;box-shadow:none;color:rgba(255,255,255,.7)}
.wx-inspect svg{fill:currentColor;color:#fff;filter:drop-shadow(0 0 5u rgba(139,86,250,.9))}
.wx-name{margin-left:2u;font-size:14u;font-weight:500;white-space:nowrap}
.wx-live{width:8u;height:8u;margin:0 4u;border-radius:50%;background:#10b981}
.wx-mode{display:flex;gap:2u;margin-left:6u;padding:2u;border-radius:999u;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1)}
.wx-mode>*{display:flex;align-items:center;gap:6u;height:28u;padding:0 10u;border-radius:999u;color:rgba(255,255,255,.55);font-size:12.5u;font-weight:500}
.wx-mode b{color:#fff;background:rgba(139,86,250,.25);box-shadow:inset 0 0 0 1u rgba(139,86,250,.6),0 0 18u -4u rgba(139,86,250,.7)}
.wx-round{display:grid;place-items:center;width:32u;height:32u;border-radius:50%;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1)}
.wx-round svg{width:15u;height:15u}
.wx-page{display:flex;align-items:center;gap:8u;width:240u;height:28u;padding:0 10u 0 6u;border-radius:999u;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1);font-size:12.5u;font-weight:500}
.wx-page b{flex:1;text-align:center;font-weight:500}
.wx-page svg{width:15u;height:15u;color:rgba(255,255,255,.6)}
.wx-page .wx-page-re{width:13u;height:13u;color:rgba(255,255,255,.7)}
.wx-publish{display:flex;align-items:center;justify-content:center;gap:8u;min-width:92u;height:32u;padding:0 14u;border-radius:999u;background:#8b56fa;color:#fff;font-size:13u;font-weight:600}
.wx-publish i{width:8u;height:8u;border-radius:50%;background:#fff}
.wx-side{position:absolute;left:0;top:54u;bottom:0;width:288u;padding:12u 12u 0;border-radius:20u 20u 0 0;background:#fff;overflow:hidden}
.wx-tabs{display:grid;grid-template-columns:repeat(3,1fr);padding:2u;border-radius:8u;background:#f5f5f5;margin-bottom:6u}
.wx-tabs>*{display:flex;align-items:center;justify-content:center;gap:6u;height:32u;border-radius:6u;color:#737373;font-size:13u;font-weight:500}
.wx-tabs b{background:#fff;color:#1a1a2e;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.wx-tabs svg{width:14u;height:14u}
.wx-group{padding:12u 8u 4u 4u;font-size:11u;font-weight:600;line-height:14u;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}
.wx-rule{display:block;height:1u;margin:8u 4u;background:#eceef1}
.wx-row,.wx-add{position:relative;display:flex;align-items:center;height:32u;padding:0 4u;border-radius:6u;color:#1a1a2e}
.wx-row{margin-bottom:2u}
.wx-col{position:relative;display:grid;place-items:center;flex:none;width:20u;height:24u}
.wx-row b{position:relative;margin-left:6u;font-size:13u;font-weight:500}
.wx-twisty{width:14u!important;height:14u!important;color:#6b7280}
.wx-grip{width:14u!important;height:14u!important;color:#1a1a2e;opacity:.4}
.wx-badge{display:grid;place-items:center;width:20u;height:20u;border-radius:5u;background:#4d5058;color:#fff}
.wx-badge svg{width:12u;height:12u}
.wx-row-on{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;gap:12u;padding-right:9u;border-radius:6u;background:#ebecef;color:#4b5563}
.wx-row-on svg{width:14u;height:14u}
.wx-add{color:#4b5563;font-size:13u;font-weight:500}
.wx-add .wx-col:last-of-type{margin-right:6u}
.wx-add-key{display:grid;place-items:center;width:18u;height:18u;border-radius:6u;background:#fff;color:#4b5563;box-shadow:0 0 0 1u rgba(16,24,40,.1),0 1u 2u rgba(16,24,40,.1),inset 0 -1u 0 rgba(16,24,40,.05)}
.wx-add-key svg{width:12u;height:12u;stroke-width:2.75}
.wx-canvas{position:absolute;left:294u;right:0;top:54u;bottom:0;border-radius:20u 20u 0 0;overflow:hidden;background:#fff}
/* Publish's panel: hung under the button, right aligned (publish-panel.tsx, 420 wide, #1f1f1f) */
.wx-pub{position:absolute;z-index:20;right:16u;top:54u;width:420u;padding:24u;border-radius:16u;background:#1f1f1f;color:#fff;box-shadow:0 0 0 1u rgba(255,255,255,.1),0 24u 80u -16u rgba(0,0,0,.7);transform-origin:top right;opacity:0;transform:translateY(-4u) scale(.95)}
.wx-pub svg{width:16u;height:16u}
.wx-pub-h{display:flex;align-items:center;gap:10u}
.wx-pub-h b{font-size:20u;font-weight:600;line-height:1}
.wx-pub-dot{position:relative;width:10u;height:10u;border-radius:50%;background:#3b82f6}
.wx-pub-dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:#10b981;opacity:0}
.wx-pub-st{display:grid;margin-top:10u!important;font-size:15u;color:rgba(255,255,255,.6)}
.wx-pub-st>span{grid-area:1/1}
.wx-pub-now{opacity:0}
.wx-pub-l{margin-top:20u!important;margin-bottom:10u!important;font-size:15u;font-weight:500}
.wx-pub-url{display:flex;align-items:center;gap:12u;padding:14u 16u;border-radius:12u;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1);font-size:15u;color:rgba(255,255,255,.6)}
.wx-pub-url b{flex:1;font-weight:400;color:#fff}
.wx-pub-sec{display:flex;align-items:center;gap:10u;margin-top:20u!important;font-size:14u;color:rgba(255,255,255,.8)}
.wx-pub-sec svg{color:#34d399}
.wx-pub-act{display:flex;align-items:center;gap:12u;margin-top:24u}
.wx-pub-prev{display:flex;align-items:center;gap:8u;height:40u;padding:0 16u;border-radius:12u;box-shadow:inset 0 0 0 1u rgba(255,255,255,.15);font-size:15u;font-weight:500;color:rgba(255,255,255,.85)}
.wx-pub-go{position:relative;display:grid;margin-left:auto;min-width:180u;height:40u;border-radius:12u;background:#8b56fa;font-size:15u;font-weight:600}
.wx-pub-go>span{grid-area:1/1;display:flex;align-items:center;justify-content:center;gap:8u}
.wx-go-b,.wx-go-c{opacity:0}
.wx-spin{width:16u!important;height:16u!important}
${EDIT_CSS}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wb:not(.wd) .wx-publish{animation:sxk-wx-press var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-pub{animation:sxk-wx-pub var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-pub-go{animation:sxk-wx-go var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-go-a{animation:sxk-wx-go-a var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-go-b{animation:sxk-wx-go-b var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-go-c,[data-mock-live] .wx-pub-now,[data-mock-live] .wx-pub-dot::after{animation:sxk-wx-go-c var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-pub-was{animation:sxk-wx-was var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-spin{animation:sxk-wx-spin var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-publish i{animation:sxk-wx-dot var(--bm-t) linear infinite both}}
@keyframes sxk-wx-press{0%,43%{transform:none}44.5%{transform:scale(.94)}46%,100%{transform:none}}
@keyframes sxk-wx-pub{0%,44%{opacity:0;transform:translateY(-4u) scale(.95)}47%,84%{opacity:1;transform:none}88%,100%{opacity:0;transform:translateY(-4u) scale(.95)}}
@keyframes sxk-wx-go{0%,59%{transform:none;opacity:1}60.5%{transform:scale(.96)}62%,69.5%{transform:none;opacity:1}72%,94%{transform:none;opacity:.4}96%,100%{transform:none;opacity:1}}
@keyframes sxk-wx-go-a{0%,60%{opacity:1}60.5%,100%{opacity:0}}
@keyframes sxk-wx-go-b{0%,60%{opacity:0}60.5%,69.5%{opacity:1}70%,100%{opacity:0}}
@keyframes sxk-wx-go-c{0%,69.5%{opacity:0}70%,94%{opacity:1}96%,100%{opacity:0}}
@keyframes sxk-wx-was{0%,69.5%{opacity:1}70%,94%{opacity:0}96%,100%{opacity:1}}
@keyframes sxk-wx-spin{0%,60%{transform:none}70%,100%{transform:rotate(1080deg)}}
@keyframes sxk-wx-dot{0%,69.5%{opacity:1}70%,94%{opacity:.5}96%,100%{opacity:1}}

/* ---------- OnePage editor */
.ope{background:#fff}
.ope-bar{position:absolute;inset:0 0 auto;height:60u;display:flex;border-bottom:1u solid #e5e7eb;background:#fff}
.ope-bar-l{flex:1;display:flex;align-items:center;gap:10u;padding:0 24u 0 171u}
.ope-bar-r{width:410u;display:flex;align-items:center;justify-content:flex-end;gap:12u;padding:0 24u;border-left:1u solid #e5e7eb}
.ope-key{display:grid;place-items:center;width:32u;height:32u;border-radius:9u;border:1u solid #d9dbe0;background:#fff;color:#374151;box-shadow:inset 0 -2u 0 rgba(0,0,0,.07),0 1u 2u rgba(15,23,42,.08)}
.ope-pills{display:flex;gap:4u;padding:4u;border-radius:999u;background:#f3f4f6}
.ope-pills>*{display:flex;align-items:center;gap:8u;height:32u;padding:0 16u;border-radius:999u;color:#6b7280;font-size:14u;font-weight:500}
.ope-pills b{background:#fff;color:#1a1a2e;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.ope-set{display:grid;place-items:center;width:40u;height:40u;border-radius:12u;border:1u solid #e5e7eb;color:#4b5563;box-shadow:0 1u 2u rgba(0,0,0,.05)}
.ope-save{position:relative;display:grid;width:72u;height:36u;border-radius:8u;background:#1a1a2e;color:#fff;font-size:14u;font-weight:500}
.ope-save>span{grid-area:1/1;display:grid;place-items:center}
.ope-saved{opacity:.6}
.ope-dirty{opacity:0}
.ope-share{display:flex;align-items:center;gap:8u;height:36u;padding:0 16u;border-radius:8u;border:1u solid #e5e7eb;font-size:14u;font-weight:500;box-shadow:0 1u 2u rgba(0,0,0,.05)}
.ope-share svg{color:#6b7280}
.ope-panel{position:absolute;left:147u;top:60u;width:576u;bottom:0;padding:24u;display:flex;flex-direction:column;gap:22u}
.ope-profile{display:flex;align-items:center;gap:16u;padding-bottom:20u;border-bottom:1u solid #e5e7eb}
.ope-av{flex:none;width:56u!important;height:56u!important;border-radius:50%;box-shadow:0 0 0 1u #e5e7eb}
.ope-profile>span{display:grid;gap:2u}
.ope-profile b{display:flex;align-items:center;gap:6u;font-size:15u;font-weight:600}
.ope-profile b svg{width:12u;height:12u;color:#9ca3af}
.ope-profile i{font-size:13u;font-style:normal;color:#6b7280}
.ope-socials{display:flex;gap:6u;margin-top:5u}
.ope-socials em{display:grid;place-items:center;width:28u;height:28u;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1u rgba(17,17,19,.1),0 1u 2u rgba(17,17,19,.06);font-style:normal}
.ope-socials em.add{background:#f3f4f6;box-shadow:none;color:#9ca3af}
.ope-socials svg{width:13u;height:13u}
.ope-add{display:grid;place-items:center;height:44u;border-radius:12u;background:#8b5cf6;color:#fff;font-size:15u;font-weight:600;box-shadow:inset 0 1u 0 rgba(255,255,255,.22),inset 0 -1u 0 rgba(0,0,0,.18),0 1u 1u rgba(76,29,149,.25)}
.ope-quick{display:flex;gap:8u;margin-top:-6u}
.ope-quick span{display:flex;align-items:center;gap:5u;height:32u;padding:0 11u;border-radius:8u;border:1u solid #e5e7eb;font-size:12u;font-weight:500}
.ope-quick svg{width:12u;height:12u}
.ope-list{display:flex;flex-direction:column;gap:8u;margin-top:-6u}
.ope-card{display:flex;align-items:center;gap:12u;padding:12u;border-radius:15u;border:1u solid #ececf1;background:#fff;box-shadow:0 1u 2u rgba(16,24,40,.04)}
.ope-grip{width:18u!important;height:18u!important;color:#b4b8c0}
.ope-face{flex:1;display:flex;align-items:center;gap:12u;min-width:0}
.ope-tile{flex:none;display:grid;place-items:center;width:40u;height:40u;border-radius:11u;background:#f2f2f4;overflow:hidden;color:#1a1a2e}
.ope-tile svg{width:19u;height:19u}
.ope-txt{display:grid;min-width:0}
.ope-txt b{font-size:14u;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ope-txt i{font-size:12u;font-style:normal;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ope-off .ope-face{opacity:.5}
.ope-stats{display:flex;align-items:center;gap:5u;width:56u;font-size:12u;font-weight:500;color:#9ca3af}
.ope-stats svg{width:15u;height:15u}
.ope-sw{position:relative;flex:none;width:38u;height:22u;border-radius:11u;background:#e4e5e9;box-shadow:inset 0 1u 2u rgba(16,24,40,.16)}
.ope-sw-on{position:absolute;inset:0;border-radius:11u;background:#111113}
.ope-sw b{position:absolute;left:3u;top:3u;width:16u;height:16u;border-radius:50%;background:#fff;box-shadow:0 1u 2u rgba(0,0,0,.25);transform:translateX(16u)}
.ope-off .ope-sw-on{opacity:0}
.ope-off .ope-sw b{transform:none}
.ope-stage{position:absolute;right:0;top:60u;bottom:0;width:410u;border-left:1u solid #e5e7eb;background:#f5f6f7}
.ope-phone{position:absolute;left:51.5u;top:56u;width:307u;padding:10u;border-radius:46u;background:#1a1a1a;box-shadow:0 25u 50u -12u rgba(0,0,0,.25)}
.ope-screen{border-radius:36u}
.ope-cur{left:664u;top:562u}
.ope-phone .dp-new{opacity:0}
.ope-phone .dp-after{transform:translateY(-104u)}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-cur{animation:sxk-op-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw b{animation:sxk-op-knob var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw-on,[data-mock-live] .ope-phone .dp-new{animation:sxk-op-on var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-face{animation:sxk-op-face var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-phone .dp-after{animation:sxk-op-after var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-saved{animation:sxk-op-saved var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-dirty{animation:sxk-op-dirty var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-op-cur{0%{opacity:0;transform:translate(-300u,-160u)}6%{opacity:1}24%{transform:none}26%{transform:scale(.86)}28%,34%{transform:none}52%{transform:translate(348u,-535u)}54%{transform:translate(348u,-535u) scale(.86)}56%,66%{opacity:1;transform:translate(348u,-535u)}74%,100%{opacity:0;transform:translate(348u,-535u)}}
@keyframes sxk-op-knob{0%,25%{transform:none}29%,94%{transform:translateX(16u)}100%{transform:none}}
@keyframes sxk-op-on{0%,25%{opacity:0}30%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-op-face{0%,25%{opacity:.5}30%,94%{opacity:1}100%{opacity:.5}}
@keyframes sxk-op-after{0%,27%{transform:translateY(-104u)}36%,94%{transform:none}100%{transform:translateY(-104u)}}
@keyframes sxk-op-saved{0%,26%{opacity:.6}28%,54%{opacity:0}57%,100%{opacity:.6}}
@keyframes sxk-op-dirty{0%,26%{opacity:0}28%,54%{opacity:1}57%,100%{opacity:0}}

/* brand marks in the Links tab's chips */
.bm-defs{position:absolute;width:0;height:0;overflow:hidden}
.bm-tt{position:relative;display:grid;width:13u;height:13u}
.bm-tt svg{grid-area:1/1;width:100%!important;height:100%!important;color:#111}
.bm-tt .bm-tt-c{color:#25f4ee;transform:translate(-.8u,-.8u)}
.bm-tt .bm-tt-r{color:#fe2c55;transform:translate(.8u,.8u)}


/* ---------- Desmond's OnePage, in the editor's phone: the Ember theme with the classic header */
.dp{position:relative;display:flex;flex-direction:column;align-items:center;min-height:100%;padding:58u 20u 30u;background:radial-gradient(120% 60% at 50% 0%,#2a211a 0%,#1b1612 60%),#1b1612;color:#f4ece2;font-family:Manrope,var(--font-inter,Inter),Inter,sans-serif}
.dp::before{content:"";position:absolute;inset:0;opacity:.07;background-image:radial-gradient(rgba(255,255,255,.9) .6u,transparent .7u),radial-gradient(rgba(255,255,255,.7) .5u,transparent .6u);background-size:5u 5u,7u 7u;background-position:0 0,2u 3u;pointer-events:none}
.dp>*{position:relative}
.dp-corner{position:absolute!important;top:16u;display:grid;place-items:center;width:38u;height:38u;border-radius:50%;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1u rgba(255,255,255,.16);color:#f4ece2}
.dp-corner svg{width:16u;height:16u}
.dp-share{left:16u}
.dp-bell{right:16u}
.dp-head{display:flex;flex-direction:column;align-items:center;text-align:center}
.dp-av{width:96u!important;height:96u!important;border-radius:50%;box-shadow:0 0 0 3u rgba(246,176,98,.35)}
.dp-head h3{margin-top:14u!important;font-family:"Bodoni Moda","Bodoni 72",Didot,"Playfair Display",Georgia,serif;font-size:31u;font-weight:500;letter-spacing:-.01em;line-height:1.1}
.dp-head p{max-width:290u;margin-top:7u!important;font-size:13.5u;line-height:1.5;color:#c2b5a6}
.dp-socials{display:flex;justify-content:center;gap:20u;height:40u;align-items:center;margin:6u 0 10u;color:#f6b062}
.dp-socials svg{width:19u;height:19u}
.dp-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:54u;margin-top:12u;padding:0 22u;border-radius:999u;box-shadow:inset 0 0 0 2u #f6b062;color:#f6b062;font-size:14.5u;font-weight:600;text-align:center}
.dp-prod{display:flex;align-items:center;gap:12u;width:100%;margin-top:6u;padding:9u 10u 9u 9u;border-radius:20u;background:rgba(246,176,98,.07);box-shadow:inset 0 0 0 1u rgba(246,176,98,.4)}
.dp-pack{position:relative;flex:none;width:76u;height:76u;border-radius:13u;overflow:hidden}
.dp-pack img{position:absolute;inset:0}
.dp-pack-a{filter:saturate(.35) contrast(.85) brightness(1.05)}
.dp-pack-b{clip-path:inset(0 0 0 50%);filter:saturate(1.25) contrast(1.1)}
.dp-pack i{position:absolute;left:50%;top:0;bottom:0;width:1.5u;background:#fff;opacity:.85}
.dp-prod-t{flex:1;display:grid;gap:3u;min-width:0;text-align:left}
.dp-prod-t b{font-size:14.5u;font-weight:700;line-height:1.25}
.dp-prod-t i{font-size:11.5u;font-style:normal;color:#c2b5a6}
.dp-prod strong{padding:8u 13u;border-radius:999u;background:#f6b062;color:#1b1612;font-size:13.5u;font-weight:700}
.dp-btn.dp-new{padding:0 18u;border-radius:24u}
.dp-signup{display:grid;gap:9u;width:100%;padding:14u 0;text-align:left}
.dp-signup b{font-size:14u;font-weight:600;color:#f4ece2}
.dp-form{display:flex;gap:6u}
.dp-input{flex:1;display:flex;align-items:center;height:38u;padding:0 14u;border-radius:999u;background:rgba(255,255,255,.08);font-size:13u;font-weight:400;color:#c2b5a6}
.dp-sub{display:grid;place-items:center;padding:0 15u;border-radius:999u;background:#f6b062;color:#1b1612;font-size:13u;font-weight:700}
/* Landing round 13 (the owner: his page "not cut off", his head sitting well): the phone no longer scrolls when the signup opens, so the photo, name and corners stay put; the video is 156u (was 186u) so the whole page, video included, stands in the phone with the signup on. */
.dp-video{position:relative;display:block;width:100%;height:156u;margin-top:12u;border-radius:20u;overflow:hidden}
.dp-video>em{position:absolute;left:14u;bottom:12u;color:#fff;font-size:12.5u;font-style:normal;font-weight:600;text-shadow:0 1u 4u rgba(0,0,0,.6)}
.dp-vplay{position:absolute;left:50%;top:50%;width:46u;height:46u;margin:-23u 0 0 -23u;border-radius:50%;display:grid;place-items:center;background:#f6b062;color:#1b1612}
.dp-vplay svg{width:16u;height:16u;margin-left:2u}

/* ---------- inside a community: The Strength Room (components/community/member) */
.cx{background:#f8f9fa;color:#1a1a2e}
.cx svg{width:18u;height:18u}
.cx-bar{position:absolute;inset:0 0 auto;height:64u;display:flex;align-items:center;gap:24u;padding:0 40u;background:#fff}
.cx-lead{display:flex;align-items:center;gap:12u;width:278u}
.cx .cx-mark{display:block;flex:none;width:40u;height:40u;border-radius:10u}
.cx-who{display:grid;min-width:0;line-height:1.25}
.cx-who b{font-size:16u;font-weight:600;white-space:nowrap}
.cx-who i{font-size:12.5u;font-style:normal;color:#6b7280}
.cx-menu{display:grid;place-items:center;flex:none;width:40u;height:40u;margin-left:auto;border-radius:10u;border:1u solid #e6e8eb;background:#f8f9fa;box-shadow:0 1u 1u rgba(16,24,40,.04)}
.cx-search{display:flex;align-items:center;gap:10u;width:600u;height:40u;padding:0 14u;border-radius:10u;background:#f3f4f6;color:#8a8f98;font-size:14u}
.cx-search svg{width:16u;height:16u}
.cx-icons{display:flex;align-items:center;gap:22u;margin-left:auto;color:#4b5563}
.cx-msg{position:relative;display:grid}
.cx-msg i{position:absolute;right:-8u;top:-7u;display:grid;place-items:center;min-width:17u;height:17u;border-radius:999u;background:#ef4444;color:#fff;font-size:10u;font-style:normal;font-weight:600;box-shadow:0 0 0 2u #fff}
.cx-me{width:36u!important;height:36u!important;border-radius:50%}
.cx-tabs{position:absolute;left:0;right:0;top:64u;height:44u;display:flex;gap:30u;padding:0 40u;background:#fff;border-bottom:1u solid #e6e8ec;font-size:14.5u;font-weight:500;color:#6b7280}
.cx-tabs span{display:flex;align-items:center}
.cx-tabs .on{color:#1a1a2e;box-shadow:inset 0 -2u 0 #1a1a2e}
.cx-left{position:absolute;left:40u;top:132u;width:278u;display:grid;gap:14u}
.cx-card{border-radius:16u;border:1u solid rgba(229,231,235,.8);background:#fff;overflow:hidden}
.cx-cover{height:156u!important}
.cx-card-in{padding:14u 16u 16u}
.cx-name{display:block;font-size:16u;font-weight:600}
.cx-addr{margin-top:2u!important;font-size:12.5u;color:#8a8f98}
.cx-sum{margin-top:10u!important;font-size:13.5u;line-height:1.5;color:#374151}
.cx-stats{display:flex;margin-top:14u;padding:11u 0;border-top:1u solid #eceef1;border-bottom:1u solid #eceef1}
.cx-stats>span{flex:1;display:grid;justify-items:center;gap:2u}
.cx-stats>span+span{border-left:1u solid #eceef1}
.cx-stats b{font-size:16u;font-weight:600}
.cx-stats i{display:flex;align-items:center;gap:5u;font-size:12u;font-style:normal;color:#6b7280}
.cx-stats em{width:7u;height:7u;border-radius:50%;background:#22a06b}
.cx-faces{display:flex;align-items:center;margin-top:13u}
.cx-faces img{width:30u!important;height:30u!important;border-radius:50%;margin-right:-7u;box-shadow:0 0 0 2u #fff}
.cx-faces em{display:grid;place-items:center;height:30u;margin-left:4u;padding:0 9u;border-radius:999u;background:#f1f2f4;font-size:11.5u;font-style:normal;font-weight:600;color:#4b5563;box-shadow:0 0 0 2u #fff}
.cx-event{padding:14u 16u}
.cx-card-h{display:flex;justify-content:space-between;font-size:15u;font-weight:600}
.cx-card-h span{font-size:13u;font-weight:500;color:#4b5563}
.cx-ev{display:flex;gap:12u;margin-top:12u}
.cx-date{display:grid;place-items:center;align-content:center;flex:none;width:50u;height:54u;border-radius:12u;border:1u solid #e8e9ec}
.cx-date i{font-size:10.5u;font-style:normal;font-weight:600;text-transform:uppercase;color:#c4290c}
.cx-date b{font-size:20u;font-weight:600;line-height:1.1}
.cx-ev>span:last-child{display:grid;gap:2u}
.cx-ev>span:last-child b{font-size:14u;font-weight:600}
.cx-ev>span:last-child i{display:flex;align-items:center;gap:5u;font-size:12u;font-style:normal;color:#6b7280}
.cx-ev svg{width:13u;height:13u}
.cx-main{position:absolute;left:342u;right:40u;top:132u;display:grid;gap:14u}
.cx-chips{display:flex;align-items:center;gap:8u}
.cx-chips>span{display:flex;align-items:center;gap:7u;height:36u;padding:0 15u;border-radius:999u;border:1u solid #e4e7ec;background:#fff;color:#4b5563;font-size:13.5u;font-weight:500;box-shadow:0 1u 1u rgba(16,24,40,.05)}
.cx-chips>span i{font-style:normal;font-size:13u}
.cx-chips>.on{border-color:#1a1a2e;background:#1a1a2e;color:#fff}
.cx-chips>.cx-sort{width:36u;margin-left:auto;padding:0;justify-content:center}
.cx-sort svg{width:16u;height:16u}
.cx-compose{display:flex;align-items:center;gap:12u;padding:12u 18u;border-radius:16u;border:1u solid rgba(229,231,235,.8);background:#fff}
.cx-av{flex:none;width:40u!important;height:40u!important;border-radius:50%}
.cx-field{position:relative;display:grid;align-items:center;flex:1;height:40u;padding:0 16u;border-radius:10u;background:#f3f4f6;font-size:14u;overflow:hidden}
.cx-field>span{grid-area:1/1;white-space:nowrap}
.cx-ph{color:#9ca3af;opacity:0}
.cx-typed{position:relative;justify-self:start;color:#1a1a2e;overflow:hidden}
.cx-type{position:absolute;inset:0 -2u 0 0;background:#f3f4f6;transform:translateX(100%)}
.cx-type::before{content:"";position:absolute;left:1u;top:2u;bottom:2u;width:1.5u;background:#1a1a2e}
.cx-post{padding:16u 20u 12u;border-radius:16u;border:1u solid rgba(229,231,235,.8);background:#fff}
.cx-pin{display:flex;align-items:center;gap:6u;margin-bottom:10u!important;font-size:12.5u;font-weight:600;color:#4b5563}
.cx-pin svg{width:13u;height:13u;color:#1a1a2e;fill:#1a1a2e}
.cx-ph-head{display:flex;align-items:flex-start;gap:12u}
.cx-ph-head>span{flex:1;display:grid;gap:1u}
.cx-ph-head b{display:flex;align-items:center;gap:6u;font-size:14.5u;font-weight:600}
.cx-ph-head b em{font-size:12u;font-style:normal;font-weight:500;color:#b7791f}
.cx-ph-head i{font-size:13u;font-style:normal;color:#6b7280}
.cx-more{color:#9ca3af}
.cx-post h4{margin:12u 0 0;font-size:18u;font-weight:600;letter-spacing:-.005em}
.cx-post>p:not(.cx-pin){margin-top:5u!important;font-size:14.5u;line-height:1.55;color:#4b5563}
.cx-foot{display:flex;align-items:center;gap:18u;height:44u;margin-top:6u;font-size:14u;color:#4b5563}
.cx-foot>span{display:flex;align-items:center;gap:7u}
.cx-foot b{font-weight:500}
.cx-heart{position:relative}
.cx-heart svg{grid-area:1/1}
.cx-h-on{position:absolute;left:0;color:#e5484d}
.cx-n{display:grid}
.cx-n>span{grid-area:1/1}
.cx-n-a{opacity:0}
.cx-faces-s{margin:0!important;gap:0!important}
.cx-faces-s img{width:24u!important;height:24u!important;margin-right:-6u}
.cx-new{margin-left:6u;font-size:13.5u}
.cx-pics{display:grid;grid-template-columns:1fr 1fr;gap:4u;margin-top:12u;border-radius:12u;overflow:hidden}
.cx-pics img{height:240u!important}
.cx-cur{left:366u;top:457u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-cur{animation:sxk-cx-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-h-on{animation:sxk-cx-like var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-n-a{animation:sxk-cx-na var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-n-b{animation:sxk-cx-nb var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-ph{animation:sxk-cx-ph var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-typed{animation:sxk-cx-typed var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cx-type{animation:sxk-cx-type var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-cx-cur{0%{opacity:0;transform:translate(360u,260u)}6%{opacity:1}22%{transform:none}24%{transform:scale(.86)}26%,36%{transform:none}50%{transform:translate(70u,-245u)}52%{transform:translate(70u,-245u) scale(.86)}54%,80%{opacity:1;transform:translate(70u,-245u)}88%,100%{opacity:0;transform:translate(70u,-245u)}}
@keyframes sxk-cx-like{0%,23%{opacity:0;transform:scale(.6)}26%{opacity:1;transform:scale(1.18)}29%,92%{opacity:1;transform:none}96%,100%{opacity:0;transform:scale(.6)}}
@keyframes sxk-cx-na{0%,24%{opacity:1}25%,94%{opacity:0}95%,100%{opacity:1}}
@keyframes sxk-cx-nb{0%,24%{opacity:0}25%,94%{opacity:1}95%,100%{opacity:0}}
@keyframes sxk-cx-ph{0%,52%{opacity:1}53%,96%{opacity:0}97%,100%{opacity:1}}
@keyframes sxk-cx-typed{0%,52%{opacity:0}53%,96%{opacity:1}97%,100%{opacity:0}}
@keyframes sxk-cx-type{0%,53%{transform:none;animation-timing-function:steps(${ST_TYPED.length},end)}80%,100%{transform:translateX(100%)}}
`)
