import type { ComponentType, SVGProps } from "react"
import {
  Archive,
  ArrowLeft,
  ArrowLeftToLine,
  BarChart2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  GripVertical,
  Layers,
  Link2,
  Loader2,
  Mail,
  Maximize2,
  Monitor,
  Moon,
  MoreHorizontal,
  MousePointerClick,
  PanelBottom,
  PanelRightClose,
  PanelTop,
  Palette,
  Pencil,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Star,
  Trash2,
  Undo2,
} from "lucide-react"
import { SiInstagram, SiSpotify, SiTiktok, SiYoutube } from "@/components/icons/brand-icons.generated"
import { MockFrame, Pic, u } from "./frame"

/*
  INSIDE STORELIB'S BUILDERS, AS THEY ARE TODAY (landing round).
  Each mock follows the real editor's own layout, read from its source:

    Website builder   app/(storelib)/website-builder/editor/[installId]/page.tsx
                      the dark 48px bar (Back, the theme's name, its live dot
                      and menu, Preview / Code / Website Settings, the size
                      and full screen keys, the page pill, undo and redo, the
                      inspector lit violet, the violet Publish; no Ask Storelib
                      key, the owner's second pass), the white sidebar card on
                      the #eef1f5 shelf with Sections / Pages / Theme and the
                      Header / Page / Footer tree on tree-parts.tsx's grid
                      (sections-list.tsx: chevrons, grips, the dark badges,
                      Add section in its raised key), the page itself with the
                      blue ring and its "Selected" chip (sections/_shared.tsx),
                      and Publish's own panel (publish-panel.tsx) putting the
                      change live.
    Design            the same builder with the Hero section open (the tabs,
                      then PanelBack): its colour scheme picker and the theme's
                      schemes painted in their own colours (Light, Soft, Dark,
                      Brand, Accent), as design-panels.tsx draws them; only the
                      Hero turns dark.
    OnePage editor    components/onepage/onepage-editor.tsx and tabs/links-tab:
                      undo and redo keys, the Links / Design / Products pill
                      row and Settings, Save and Share your OnePage; the Links
                      tab (profile with its brand coloured social chips, the
                      violet Add, block cards with their clicks and switch)
                      beside the 410px preview column with the 307 x 627
                      phone, which shows Nina Sato's page on the Air theme
                      with the Hero header (public-onepage.tsx).
    Community editor  components/community/creator/page-editor: its own full
                      screen. The white bar (back, the logo, the name and its
                      Published badge, Computer or Phone, As a visitor, the
                      dark look, the save state, the panel key and Save), the
                      community's About page in the stage card
                      (components/community/public/sales-page.tsx: the sheet
                      with the cover, name, tagline, About and What's inside,
                      the join card beside it) with the picked part outlined
                      and its name on a tab, and the Edit page panel with its
                      six groups, Name and introduction open.

  One drawing for every screen (the owner: no phone shapes on phones). A
  phone draws the same editors on a narrower design width (640 instead of
  1280, taller), the sidebars narrower and the bar's words dropped where the
  real bar drops them, so a phone sees what a computer sees.

  Motion is CSS keyframes on transform and opacity only. The resting styles
  ARE the finished state, so with reduced motion (or before the animation
  starts) every mock is a complete, still picture. Animations are attached
  only under [data-mock-live] (the slide in front, in view), and only to the
  few elements that move: no universal or relational selectors.
*/

function Cursor({ className }: { className: string }) {
  return (
    <svg className={`bm-cursor ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 2.5 19.5 12l-7 1.6-3.6 6.9z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

const Stars = () => (
  <span className="hs-stars" aria-hidden="true">
    {Array.from({ length: 5 }, (_, i) => (
      <Star key={i} fill="currentColor" strokeWidth={0} />
    ))}
  </span>
)

/* ================================================================ The site in the website builder: Hearth & Hand */
const HS_MODULES = [
  ["hb-dough", "Week 1", "Starter, flour and water"],
  ["hb-loaf", "Week 2", "Your first loaf"],
  ["hb-score", "Week 3", "Shaping and scoring"],
  ["hb-crumb", "Week 4", "Reading the crumb"],
] as const

/**
 * Nora Lind's sourdough course, the site open in the website builder. `top` draws only the bar and the hero (the
 * Design slide lays a dark copy of them over the light page); `ring` outlines the Hero, and `rings` the Hero then
 * Curriculum, the way the builder rings the section it has selected.
 */
export function HearthSite({ top = false, rings = false, ring = false }: { top?: boolean; rings?: boolean; ring?: boolean }) {
  return (
    <div className="hs">
      <div className="hs-nav">
        <span className="hs-logo">Hearth &amp; Hand</span>
        <span className="hs-links">
          <b>Courses</b>
          <span>Live bakes</span>
          <span>Recipes</span>
          <span>Journal</span>
        </span>
        <span className="hs-login">Log in</span>
        <span className="hs-enroll">Enroll</span>
      </div>
      <div className="hs-hero">
        <div className="hs-copy">
          <p className="hs-eyebrow">Online course · Self-paced</p>
          <h3>Bake real sourdough at home.</h3>
          <p className="hs-sub">18 short lessons, a printable baking schedule and a live Q&amp;A with Nora every other Sunday.</p>
          <span className="hs-btns">
            <b>Enroll · $79</b>
            <span>
              <Play fill="currentColor" strokeWidth={0} /> Watch lesson 1
            </span>
          </span>
          <span className="hs-proof">
            <span className="hs-faces">
              <Pic n="av-k" w={96} h={96} />
              <Pic n="av-l" w={96} h={96} />
              <Pic n="av-n" w={96} h={96} />
            </span>
            <span>
              <Stars /> <b>4.9</b> · 1,860 bakers
            </span>
          </span>
        </div>
        <div className="hs-video">
          <Pic n="hb-hero" w={1000} h={720} />
          <span className="hs-play">
            <Play fill="currentColor" strokeWidth={0} />
          </span>
          <em>Free lesson · 7:15</em>
        </div>
        {(rings || ring) && (
          <span className={`hs-ring${rings ? " wx-ring-a" : ""}`}>
            <em>Selected</em>
          </span>
        )}
      </div>
      {!top && (
        <div className="hs-mods">
          <p className="hs-h">What you will learn</p>
          <div className="hs-grid">
            {HS_MODULES.map(([n, m, t]) => (
              <span key={n}>
                <Pic n={n} w={520} h={400} />
                <em>{m}</em>
                <b>{t}</b>
              </span>
            ))}
          </div>
          {rings && (
            <span className="hs-ring wx-ring-b">
              <em>Selected</em>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================ Website builder */
/** A section row of the Page group: its blocks' chevron (when it has blocks), the grip, the name; `hl` marks the selected one. */
type TreeRow = { name: string; twisty?: boolean; hl?: string }
const TREE_PAGE: TreeRow[] = [
  { name: "Hero", twisty: true, hl: "wx-hl-a" },
  { name: "Curriculum", twisty: true, hl: "wx-hl-b" },
  { name: "Testimonials", twisty: true },
  { name: "Instructor" },
  { name: "FAQ", twisty: true },
  { name: "Newsletter" },
]

/** One line of the sidebar's tree (components/website-builder/editor/tree-parts.tsx): the chevron column, the mark column, the name. */
function Row({ name, twisty, hl }: TreeRow) {
  return (
    <span className={`wx-row${hl ? ` ${hl}` : ""}`}>
      {hl && (
        <span className="wx-row-on">
          <Eye />
          <Trash2 />
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

/**
 * The builder's dark bar, the same on both website builder slides: Back, the theme's name, its live dot and its
 * menu, the Preview / Code / Website Settings switch; the size, full screen and the page pill in the middle; undo,
 * redo, the inspector and Publish on the right.
 */
function WbBar() {
  return (
    <div className="wx-bar">
      <span className="wx-left">
        <span className="wx-key ghost">
          <ArrowLeftToLine />
        </span>
        <b className="wx-name">Hearth &amp; Hand</b>
        <i className="wx-live" />
        <span className="wx-key wx-wide">
          <MoreHorizontal />
        </span>
        <span className="wx-mode wx-wide">
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
        <span className="wx-key wx-wide">
          <Undo2 />
        </span>
        <span className="wx-key wx-wide">
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
        <b>hearthandhand.com</b>
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
        <p className="wx-group">Header</p>
        <ChromeRow name="Header" Icon={PanelTop} />
        <AddRow />
        <i className="wx-rule" />
        <p className="wx-group">Page</p>
        <AddRow />
        {TREE_PAGE.map((r) => (
          <Row key={r.name} {...r} />
        ))}
        <AddRow />
        <i className="wx-rule" />
        <p className="wx-group">Footer</p>
        <ChromeRow name="Footer" Icon={PanelBottom} />
      </aside>
      <div className="wx-canvas">
        <MockFrame label="" className="wx-site">
          <HearthSite rings />
        </MockFrame>
      </div>
      <PublishPanel />
      <Cursor className="wx-cur" />
    </div>
  )
}

/* ================================================================ Design: the Hero's colour scheme */
const SCHEMES = [
  ["Light", "#ffffff", "#1c1a17", ""],
  ["Soft", "#f6f1ea", "#1c1a17", ""],
  ["Dark", "#1f1c19", "#f4efe7", "wd-pick"],
  ["Brand", "#2f3d33", "#f4efe7", ""],
  ["Accent", "#b5532a", "#fff8f1", ""],
] as const

function Select({ label, value }: { label: string; value: string }) {
  return (
    <>
      <p className="wd-label">{label}</p>
      <span className="wd-select">
        {value} <ChevronDown />
      </span>
    </>
  )
}

export function DesignMock() {
  return (
    <div className="bm wb wd">
      <WbBar />
      <aside className="wx-side">
        <WbTabs />
        <span className="wd-head">
          <span className="wd-back">
            <ArrowLeft />
          </span>
          <b>Hero</b>
          <Eye />
          <MoreHorizontal />
        </span>
        <p className="wd-label">Color scheme</p>
        <span className="wd-picker">
          <span className="wd-scheme wd-light">
            <b>Aa</b> Light
            <ChevronDown />
          </span>
          <span className="wd-scheme wd-dark">
            <b>Aa</b> Dark
            <ChevronDown />
          </span>
        </span>
        <span className="wd-list">
          {SCHEMES.map(([name, bg, ink, cls]) => (
            <span key={name} className={`wd-row ${cls}`} style={{ background: bg, color: ink }}>
              <b>Aa</b> {name}
              {name === "Light" && <Check />}
            </span>
          ))}
        </span>
        <span className="wd-advanced">
          Advanced colors <em>Using scheme</em>
        </span>
        <Select label="Heading" value="Heading 1" />
        <Select label="Text" value="Body large" />
        <Select label="Animation" value="Same as theme (fade up)" />
        <p className="wd-label">Show on</p>
        <span className="wd-seg">
          <b>Both</b>
          <span>Desktop</span>
          <span>Phone</span>
        </span>
      </aside>
      <div className="wx-canvas">
        <MockFrame label="" className="wx-site">
          <HearthSite ring />
        </MockFrame>
        <div className="wd-dark-site">
          <MockFrame label="" className="wx-site">
            <div className="hs-darkscheme">
              <HearthSite top ring />
            </div>
          </MockFrame>
        </div>
      </div>
      <Cursor className="wd-cur" />
    </div>
  )
}

/* ================================================================ OnePage editor */
type Mark = ComponentType<SVGProps<SVGSVGElement>>
/* Simple Icons' marks, the same ones the OnePage draws (components/onepage/brand-icons.tsx); cast to an SVG component, as integrations-section does. */
const IG = SiInstagram as unknown as Mark
const TT = SiTiktok as unknown as Mark
const YT = SiYoutube as unknown as Mark
const SP = SiSpotify as unknown as Mark

/** The social row's platforms, in the page's order. */
const SOCIALS = [
  ["instagram", IG],
  ["tiktok", TT],
  ["youtube", YT],
  ["spotify", SP],
] as const

/**
 * A mark in its brand's own colour, as the Links tab's social chips draw them (tone "brand"): Instagram in its
 * gradient (the editor's own `bm-ig` gradient, below), TikTok with its cyan and red echo, YouTube red, Spotify green.
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
  return k === "youtube" ? <YT color="#ff0000" /> : <SP color="#1ed760" />
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

/** The record in its sleeve: the EP's cover, and the black disc showing past its edge. */
function Vinyl({ className = "" }: { className?: string }) {
  return (
    <span className={`vy ${className}`}>
      <i className="vy-disc">
        <Pic n="op-ep" w={160} h={160} className="vy-label" />
      </i>
      <Pic n="op-ep" w={320} h={320} className="vy-sleeve" />
    </span>
  )
}

type Block = { t: string; s: string; pic?: string; vinyl?: boolean; Icon?: typeof Calendar; clicks?: string; off?: boolean }
const NINA_BLOCKS: Block[] = [
  { t: "Listen to Small Rooms", s: "open.spotify.com/album/small-rooms", pic: "op-ep", clicks: "3.2k" },
  { t: "Small Rooms on vinyl", s: "$28.00", vinyl: true, clicks: "1.1k" },
  { t: "Guitar lessons on video call", s: "Booking form", Icon: Calendar, clicks: "418" },
  { t: "Letters from the road", s: "Email signup", Icon: Mail, off: true },
  { t: "Small Rooms, live at home", s: "youtube.com/@ninasato", pic: "op-video", clicks: "5.8k" },
]

function OpeBlock({ b }: { b: Block }) {
  const Icon = b.Icon
  return (
    <span className={`ope-card${b.off ? " ope-off" : ""}`}>
      <GripVertical className="ope-grip" />
      <span className="ope-face">
        <span className="ope-tile">{b.vinyl ? <Vinyl /> : b.pic ? <Pic n={b.pic} w={160} h={160} /> : Icon ? <Icon /> : null}</span>
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
 * Nina Sato's OnePage, as components/onepage/public-onepage.tsx draws it on the Air theme (a cool grey page, white
 * buttons rounded 14, DM Sans names, large buttons) with the Hero header: her photo melting into the page (the
 * HERO_FADE_MASK of lib/onepage/poster-video.ts), her name and bio over the faded part, the social row under it.
 * `.np-new` is the email signup the editor turns on.
 */
export function NinaPage() {
  return (
    <div className="np">
      <div className="np-hero">
        <Pic n="op-nina-hero" w={780} h={878} className="np-photo" />
        <div className="np-title">
          <h3>Nina Sato</h3>
          <p>Singer and songwriter from Lisbon. New EP, Small Rooms, out now.</p>
        </div>
      </div>
      <span className="np-socials">
        {SOCIALS.map(([k, M]) => (
          <M key={k} />
        ))}
      </span>
      <span className="np-btn">
        <Pic n="op-ep" w={160} h={160} className="np-thumb" />
        Listen to Small Rooms
      </span>
      <span className="np-prod">
        <Vinyl className="np-vinyl" />
        <span>
          <b>Small Rooms on vinyl</b>
          <i>Signed 12 inch, ships in 3 days</i>
        </span>
        <strong>$28</strong>
      </span>
      <span className="np-btn">
        <Calendar className="np-ico" />
        Guitar lessons on video call
      </span>
      <span className="np-btn np-new">
        <span className="np-signup">
          <b>Letters from the road</b>
          <span className="np-form">
            <span className="np-input">Your email</span>
            <span className="np-sub">Subscribe</span>
          </span>
        </span>
      </span>
      <span className="np-video np-after">
        <Pic n="op-video" w={800} h={525} />
        <span className="np-vplay">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <em>Small Rooms, live at home · 4:12</em>
      </span>
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
      <div className="ope-panel">
        <div className="ope-profile">
          <Pic n="op-nina-av" w={160} h={160} className="ope-av" />
          <span>
            <b>
              Nina Sato <Pencil />
            </b>
            <i>Singer and songwriter from Lisbon. New EP, Small Rooms, out now.</i>
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
          {NINA_BLOCKS.map((b) => (
            <OpeBlock key={b.t} b={b} />
          ))}
        </div>
      </div>
      <div className="ope-stage">
        <div className="ope-phone">
          <MockFrame w={390} ratio="287/607" label="" className="ope-screen">
            <NinaPage />
          </MockFrame>
        </div>
      </div>
      <Cursor className="ope-cur" />
    </div>
  )
}

/* ================================================================ Community editor */
const CE_GROUPS: [string, string][] = [
  ["Cover and gallery", "1 picture, 3 in the gallery"],
  ["About", "Description, 4 things inside, 3 questions"],
  ["Links", "Website, Instagram, YouTube"],
  ["Join button", "Join for $12 a month"],
  ["Visibility and search", "Public, listed in Explore"],
]

const CE_INSIDE = ["Open studio hours, twice a week", "A glaze night every month, live", "Feedback on your pieces from Mei", "Learn: 4 programs, 38 lessons"]

const CE_OLD = "A ceramics community."
const CE_NEW = "Learn to throw, glaze and fire, together."

/** The community's About page as the stage shows it, at the editor's computer width. */
function KilnAbout() {
  return (
    <div className="ka">
      <div className="ka-cols">
        <div className="ka-sheet">
          <Pic n="cm-cups" w={1200} h={600} className="ka-cover" />
          <div className="ka-head">
            <h4>Kiln &amp; Clay Collective</h4>
            <p className="ka-tag">
              <span className="ka-tag-new">
                {CE_NEW}
                <i className="ce-type" />
              </span>
              <span className="ka-tag-old">{CE_OLD}</span>
              <span className="ka-ring">
                <em>
                  <Pencil /> Tagline
                </em>
              </span>
            </p>
            <p className="ka-row">
              <span className="ka-stars">
                <Star fill="currentColor" strokeWidth={0} />
              </span>
              <b>4.9</b> (86 reviews) · 1,204 members · $12 a month
            </p>
          </div>
          <div className="ka-sec">
            <h5>About</h5>
            <p>
              A small online studio for people learning wheel throwing at home or in a shared space. Every week there is something to make,
              a short lesson, and a place to post what came out of the kiln.
            </p>
          </div>
          <div className="ka-sec">
            <h5>What&apos;s inside</h5>
            <ul>
              {CE_INSIDE.map((t) => (
                <li key={t}>
                  <i>
                    <Check />
                  </i>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <aside className="ka-card">
          <span className="ka-card-top">
            <Pic n="cm-vases" w={640} h={480} className="ka-logo" />
            <b>Kiln &amp; Clay Collective</b>
          </span>
          <p className="ka-price">
            <b>$12</b> a month
          </p>
          <span className="ka-join">Join for $12 a month</span>
          <span className="ka-cancel">Cancel anytime</span>
          <span className="ka-facts">
            <span>
              Posts in the last 30 days <b>318</b>
            </span>
            <span>
              Programs <b>4</b>
            </span>
            <span>
              Since <b>March 2023</b>
            </span>
            <span>
              Run by <b>Mei Lin</b>
            </span>
          </span>
        </aside>
      </div>
    </div>
  )
}

export function CommunityBuilderMock() {
  return (
    <div className="bm ce">
      <div className="ce-bar">
        <ArrowLeft className="ce-back" />
        <Pic n="cm-vases" w={160} h={160} className="ce-logo" />
        <b className="ce-name">Kiln &amp; Clay Collective</b>
        <span className="ce-badge">
          <i /> Published
        </span>
        <span className="ce-tools">
          <span className="ce-device">
            <b>
              <Monitor /> <span>Computer</span>
            </b>
            <span>
              <Smartphone /> <span>Phone</span>
            </span>
          </span>
          <span className="ce-icon ce-visitor">
            <Eye /> <span>As a visitor</span>
          </span>
          <span className="ce-icon ce-look">
            <Moon />
          </span>
        </span>
        <span className="ce-saverow">
          <span className="ce-status">
            <span className="ce-st ce-st-saved">
              <Check /> Saved
            </span>
            <span className="ce-st ce-st-dirty">
              <i /> Unsaved changes
            </span>
          </span>
          <span className="ce-icon ce-panel-key">
            <PanelRightClose />
          </span>
          <span className="ce-save">
            <span className="ce-save-off">Save</span>
            <span className="ce-save-on">Save</span>
          </span>
        </span>
      </div>
      <div className="ce-stage">
        <MockFrame label="" className="ce-preview">
          <KilnAbout />
        </MockFrame>
      </div>
      <span className="ce-handle">
        <i />
      </span>
      <aside className="ce-side">
        <span className="ce-side-head">
          <b>Edit page</b>
          <PanelRightClose />
        </span>
        <div className="ce-group ce-open">
          <span className="ce-group-h">
            <b>Name and introduction</b>
            <ChevronDown />
          </span>
          <p className="ce-flabel">Name</p>
          <span className="ce-input">Kiln &amp; Clay Collective</span>
          <p className="ce-flabel">Tagline</p>
          <span className="ce-input ce-focus">
            <span className="ka-tag-new">
              {CE_NEW}
              <i className="ce-type" />
            </span>
            <span className="ka-tag-old">{CE_OLD}</span>
          </span>
          <p className="ce-flabel">Short description</p>
          <span className="ce-input ce-area">Weekly lessons, open studio hours and a kind crowd of potters who share what works.</span>
          <p className="ce-flabel">Logo</p>
          <span className="ce-logo-row">
            <Pic n="cm-vases" w={160} h={160} />
            <span>Change</span>
          </span>
        </div>
        {CE_GROUPS.map(([t, s]) => (
          <span key={t} className="ce-group">
            <span className="ce-group-h">
              <span>
                <b>{t}</b>
                <i>{s}</i>
              </span>
              <ChevronDown />
            </span>
          </span>
        ))}
      </aside>
      <Cursor className="ce-cur" />
    </div>
  )
}

/* ================================================================ styles */
const T = 8.4 // seconds per scripted moment; the carousel moves on after one

export const BUILDER_DURATION_MS = T * 1000

const SERIF = `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif`

export const BUILDER_CSS = u(`
.bm{position:absolute;inset:0;background:#fff;color:#1a1a2e;font-family:var(--font-inter,Inter),Inter,sans-serif;font-size:13u;--bm-t:${T}s;--bm-ease:cubic-bezier(.45,0,.2,1)}
.bm svg{width:16u;height:16u}
.bm-frame>.smk{--w:1280}
.bm-cursor{position:absolute;z-index:30;width:22u!important;height:22u!important;opacity:0;filter:drop-shadow(0 2u 3u rgba(0,0,0,.25));pointer-events:none}
.bm-logo{flex:none;display:block;width:28u;height:28u;border-radius:8u;overflow:hidden}
@media (max-width:767px){
  .bm-frame>.smk{--w:640}
  .bm-cursor{display:none}
}

/* ---------- the site: Hearth & Hand (its own design width, narrower on a phone) */
.wx-canvas .wx-site{position:absolute;inset:0}
.wx-site>.smk{--w:1024}
.hs{position:absolute;inset:0;display:flex;flex-direction:column;background:#faf8f5;color:#1c1a17}
.hs-nav{height:64u;display:flex;align-items:center;gap:32u;padding:0 40u;border-bottom:1u solid #ebe6de}
.hs-logo{font-family:${SERIF};font-size:22u;letter-spacing:-.01em;white-space:nowrap}
.hs-links{display:flex;gap:24u;font-size:13.5u;color:#6a645b}
.hs-links b{color:#1c1a17;font-weight:600}
.hs-login{margin-left:auto;font-size:13.5u}
.hs-enroll{padding:9u 18u;border-radius:999u;background:#1c1a17;color:#faf8f5;font-size:13.5u;font-weight:600}
.hs-hero{position:relative;display:grid;grid-template-columns:410u 1fr;gap:40u;align-items:center;height:420u;padding:0 40u}
.hs-eyebrow{font-size:11.5u;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9a5b34}
.hs-copy h3{margin-top:12u!important;font-family:${SERIF};font-weight:400;font-size:50u;line-height:1.02;letter-spacing:-.02em}
.hs-sub{margin-top:16u!important;font-size:14.5u;line-height:1.55;color:#6a645b}
.hs-btns{display:flex;gap:10u;margin-top:24u}
.hs-btns>*{display:flex;align-items:center;gap:7u;padding:12u 20u;border-radius:999u;font-size:14u;font-weight:600;white-space:nowrap}
.hs-btns b{background:#1c1a17;color:#faf8f5}
.hs-btns span{box-shadow:inset 0 0 0 1.5u #d9d2c6}
.hs-btns svg{width:12u;height:12u}
.hs-proof{display:flex;align-items:center;gap:10u;margin-top:20u;font-size:12.5u;color:#6a645b}
.hs-proof b{color:inherit;font-weight:600}
.hs-faces{display:flex}
.hs-faces img{width:26u!important;height:26u!important;border-radius:50%;margin-left:-7u;box-shadow:0 0 0 2u #faf8f5}
.hs-faces img:first-child{margin-left:0}
.hs-stars{display:inline-flex;gap:1u;color:#c98a2b;vertical-align:-1u}
.hs-stars svg{width:12u;height:12u}
.hs-video{position:relative;height:340u;border-radius:18u;overflow:hidden}
.hs-play{position:absolute;left:50%;top:50%;width:60u;height:60u;margin:-30u 0 0 -30u;border-radius:50%;background:rgba(255,255,255,.94);color:#1c1a17;display:grid;place-items:center;box-shadow:0 6u 20u rgba(0,0,0,.18)}
.hs-play svg{width:20u;height:20u;margin-left:3u}
.hs-video em{position:absolute;left:14u;bottom:14u;padding:6u 11u;border-radius:999u;background:rgba(28,26,23,.66);color:#fff;font-size:12u;font-style:normal;font-weight:600}
.hs-nav,.hs-hero{flex:none}
.hs-mods{position:relative;flex:1 0 auto;padding:22u 40u 40u;background:#f3efe8;border-top:1u solid #ebe6de}
.hs-h{font-family:${SERIF};font-size:24u}
.hs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16u;margin-top:14u}
.hs-grid>span{display:grid;gap:3u}
.hs-grid img{height:150u!important;border-radius:12u;margin-bottom:6u}
.hs-grid em{font-size:11u;font-style:normal;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9a5b34}
.hs-grid b{font-size:14.5u;font-weight:600}
.hs-ring{position:absolute;inset:0;border-radius:4u;box-shadow:inset 0 0 0 2u #3b82f6;pointer-events:none}
.hs-ring em{position:absolute;right:8u;bottom:8u;padding:5u 7u;border-radius:6u;background:#3b82f6;color:#fff;font-size:11.5u;font-style:normal;font-weight:600;line-height:1;box-shadow:0 1u 4u rgba(0,0,0,.18)}
.hs-ring.wx-ring-b{opacity:0}
.hs-darkscheme .hs{bottom:auto;background:none;color:#f4efe7}
.hs-darkscheme .hs-nav{visibility:hidden}
.hs-darkscheme .hs-hero{background:#1f1c19}
.hs-darkscheme .hs-sub,.hs-darkscheme .hs-proof{color:#b9b1a5}
.hs-darkscheme .hs-btns b{background:#f4efe7;color:#1f1c19}
.hs-darkscheme .hs-btns span{box-shadow:inset 0 0 0 1.5u rgba(255,255,255,.25)}
.hs-darkscheme .hs-eyebrow{color:#e0a47a}
.hs-darkscheme .hs-faces img{box-shadow:0 0 0 2u #1f1c19}
@media (max-width:767px){
  .wx-site>.smk{--w:600}
  .hs-nav{gap:20u;padding:0 24u}
  .hs-links span{display:none}
  .hs-hero{grid-template-columns:1fr;gap:18u;align-content:start;height:auto;padding:26u 24u 24u}
  .hs-copy h3{font-size:44u}
  .hs-proof{display:none}
  .hs-video{height:230u}
  .hs-mods{padding:20u 24u 30u}
  .hs-grid{grid-template-columns:repeat(2,1fr)}
  .hs-grid img{height:120u!important}
}

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
.wx-hl-b .wx-row-on{opacity:0}
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
.wx-cur{left:120u;top:326u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-cur{animation:sxk-wx-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-hl-a .wx-row-on,[data-mock-live] .wx-ring-a{animation:sxk-wx-a var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-hl-b .wx-row-on,[data-mock-live] .wx-ring-b{animation:sxk-wx-b var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wb:not(.wd) .wx-publish{animation:sxk-wx-press var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-pub{animation:sxk-wx-pub var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-pub-go{animation:sxk-wx-go var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-go-a{animation:sxk-wx-go-a var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-go-b{animation:sxk-wx-go-b var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-go-c,[data-mock-live] .wx-pub-now,[data-mock-live] .wx-pub-dot::after{animation:sxk-wx-go-c var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-pub-was{animation:sxk-wx-was var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-spin{animation:sxk-wx-spin var(--bm-t) linear infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-publish i{animation:sxk-wx-dot var(--bm-t) linear infinite both}}
@keyframes sxk-wx-cur{0%{opacity:0;transform:translate(420u,140u)}5%{opacity:1}18%{transform:none}20%{transform:scale(.86)}22%,27%{transform:none}42%{transform:translate(1094u,-305u)}44%{transform:translate(1094u,-305u) scale(.86)}46%,49%{transform:translate(1094u,-305u)}58%{transform:translate(1028u,-14u)}60%{transform:translate(1028u,-14u) scale(.86)}62%,82%{opacity:1;transform:translate(1028u,-14u)}90%,100%{opacity:0;transform:translate(1028u,-14u)}}
@keyframes sxk-wx-a{0%,19%{opacity:1}22%,94%{opacity:0}100%{opacity:1}}
@keyframes sxk-wx-b{0%,19%{opacity:0}22%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-wx-press{0%,43%{transform:none}44.5%{transform:scale(.94)}46%,100%{transform:none}}
@keyframes sxk-wx-pub{0%,44%{opacity:0;transform:translateY(-4u) scale(.95)}47%,84%{opacity:1;transform:none}88%,100%{opacity:0;transform:translateY(-4u) scale(.95)}}
@keyframes sxk-wx-go{0%,59%{transform:none;opacity:1}60.5%{transform:scale(.96)}62%,69.5%{transform:none;opacity:1}72%,94%{transform:none;opacity:.4}96%,100%{transform:none;opacity:1}}
@keyframes sxk-wx-go-a{0%,60%{opacity:1}60.5%,100%{opacity:0}}
@keyframes sxk-wx-go-b{0%,60%{opacity:0}60.5%,69.5%{opacity:1}70%,100%{opacity:0}}
@keyframes sxk-wx-go-c{0%,69.5%{opacity:0}70%,94%{opacity:1}96%,100%{opacity:0}}
@keyframes sxk-wx-was{0%,69.5%{opacity:1}70%,94%{opacity:0}96%,100%{opacity:1}}
@keyframes sxk-wx-spin{0%,60%{transform:none}70%,100%{transform:rotate(1080deg)}}
@keyframes sxk-wx-dot{0%,69.5%{opacity:1}70%,94%{opacity:.5}96%,100%{opacity:1}}
@media (max-width:767px){
  .wx-wide,.wx-mid{display:none}
  .wx-right{margin-left:auto}
  .wx-side{width:214u;padding:10u 8u 0}
  .wx-tabs>* svg{display:none}
  .wx-canvas{left:220u}
  .wx-pub{right:10u;width:400u}
  .wx-row-on svg:not(:last-child){display:none}
}

/* ---------- design: the Hero's scheme */
.wd-head{display:flex;align-items:center;gap:10u;height:44u;margin:0 -12u 4u;padding:0 14u 0 10u;border-bottom:1u solid #eceef1;color:#6b7280}
.wd-head b{flex:1;color:#1a1a2e;font-size:14u;font-weight:600}
.wd-head svg{width:15u;height:15u}
.wd-back{display:grid;place-items:center;width:32u;height:32u;border-radius:8u;background:#f7f7f8;color:#4b5563;box-shadow:inset 0 0 0 1u rgba(0,0,0,.07),inset 0 -1u 0 rgba(0,0,0,.05)}
.wd-label{margin:12u 0 6u!important;font-size:12u;font-weight:600;line-height:16u;color:#374151}
.wd-picker{position:relative;display:grid;height:40u}
.wd-scheme{grid-area:1/1;display:flex;align-items:center;gap:10u;padding:0 12u;border-radius:12u;font-size:13u;font-weight:500;box-shadow:inset 0 0 0 1u #e5e5e5}
.wd-scheme b,.wd-row b{font-size:15u;font-weight:700}
.wd-scheme svg{margin-left:auto;width:15u;height:15u;opacity:.7}
.wd-light{background:#fff;color:#1c1a17;opacity:0}
.wd-dark{background:#1f1c19;color:#f4efe7}
.wd-list{position:absolute;z-index:5;left:12u;right:12u;top:180u;display:grid;gap:4u;padding:6u;border-radius:12u;background:#fff;box-shadow:0 0 0 1u #e5e5e5,0 12u 28u -8u rgba(16,24,40,.22);opacity:0}
.wd-row{position:relative;display:flex;align-items:center;gap:10u;height:36u;padding:0 12u;border-radius:9u;font-size:13u;font-weight:500;box-shadow:inset 0 0 0 1u rgba(0,0,0,.08)}
.wd-row svg{margin-left:auto;width:14u;height:14u;opacity:.7}
.wd-row:first-child{box-shadow:inset 0 0 0 2u #171717}
.wd-pick::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 2u #a3a3a3;opacity:0}
.wd-advanced{display:flex;align-items:center;justify-content:space-between;height:36u;margin-top:10u;padding:0 12u;border-radius:10u;background:#f7f7f8;font-size:12.5u;font-weight:500}
.wd-advanced em{font-style:normal;color:#9ca3af}
.wd-select{display:flex;align-items:center;justify-content:space-between;height:38u;padding:0 12u;border-radius:10u;box-shadow:inset 0 0 0 1u #e5e5e5;font-size:13u;white-space:nowrap}
.wd-select svg{width:14u;height:14u;color:#9ca3af}
.wd-seg{display:grid;grid-template-columns:repeat(3,1fr);padding:2u;border-radius:9u;background:#f5f5f5}
.wd-seg>*{display:grid;place-items:center;height:30u;border-radius:7u;font-size:12.5u;color:#737373}
.wd-seg b{background:#fff;color:#1a1a2e;font-weight:500;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.wd-dark-site{position:absolute;inset:0}
.wd-cur{left:150u;top:204u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-cur{animation:sxk-wd-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-list{animation:sxk-wd-list var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-pick::after{animation:sxk-wd-pick var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-light{animation:sxk-wd-off var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-dark,[data-mock-live] .wd-dark-site{animation:sxk-wd-on var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-wd-cur{0%{opacity:0;transform:translate(520u,260u)}6%{opacity:1}18%{transform:none}20%{transform:scale(.86)}22%{transform:none}31%{transform:translate(0,130u)}33%{transform:translate(0,130u) scale(.86)}35%,46%{transform:translate(0,130u)}58%{opacity:1;transform:translate(420u,90u)}66%,100%{opacity:0;transform:translate(420u,90u)}}
@keyframes sxk-wd-list{0%,20%{opacity:0;transform:translateY(-6u)}24%,35%{opacity:1;transform:none}39%,100%{opacity:0;transform:translateY(-4u)}}
@keyframes sxk-wd-pick{0%,31%{opacity:0}33%,36%{opacity:1}39%,100%{opacity:0}}
@keyframes sxk-wd-off{0%,36%{opacity:1}40%,94%{opacity:0}100%{opacity:1}}
@keyframes sxk-wd-on{0%,36%{opacity:0}46%,94%{opacity:1}100%{opacity:0}}
@media (max-width:767px){
  .wd-list{top:170u;left:8u;right:8u}
  .wd-advanced em{display:none}
  .wd-head{margin:0 -8u 4u}
  .wd-row{height:32u}
}

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
.ope-phone .np-new{opacity:0}
.ope-phone .np-after{transform:translateY(-104u)}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-cur{animation:sxk-op-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw b{animation:sxk-op-knob var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw-on,[data-mock-live] .ope-phone .np-new{animation:sxk-op-on var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-face{animation:sxk-op-face var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-phone .np-after{animation:sxk-op-after var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-phone .np{animation:sxk-op-scroll var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-saved{animation:sxk-op-saved var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-dirty{animation:sxk-op-dirty var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-op-cur{0%{opacity:0;transform:translate(-300u,-160u)}6%{opacity:1}24%{transform:none}26%{transform:scale(.86)}28%,34%{transform:none}52%{transform:translate(348u,-535u)}54%{transform:translate(348u,-535u) scale(.86)}56%,66%{opacity:1;transform:translate(348u,-535u)}74%,100%{opacity:0;transform:translate(348u,-535u)}}
@keyframes sxk-op-knob{0%,25%{transform:none}29%,94%{transform:translateX(16u)}100%{transform:none}}
@keyframes sxk-op-on{0%,25%{opacity:0}30%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-op-face{0%,25%{opacity:.5}30%,94%{opacity:1}100%{opacity:.5}}
@keyframes sxk-op-scroll{0%,29%{transform:none}40%,90%{transform:translateY(-170u)}98%,100%{transform:none}}
@keyframes sxk-op-after{0%,27%{transform:translateY(-104u)}36%,94%{transform:none}100%{transform:translateY(-104u)}}
@keyframes sxk-op-saved{0%,26%{opacity:.6}28%,54%{opacity:0}57%,100%{opacity:.6}}
@keyframes sxk-op-dirty{0%,26%{opacity:0}28%,54%{opacity:1}57%,100%{opacity:0}}
@media (max-width:767px){
  .ope-bar{height:56u}
  .ope-bar-l{padding:0 14u;gap:6u}
  .ope-bar-l>.ope-key,.ope-set,.ope-share>span{display:none}
  .ope-pills>*{padding:0 12u;font-size:13u}
  .ope-bar-r{width:auto;padding:0 14u;border:0}
  .ope-share{padding:0 10u}
  .ope-panel{left:0;width:360u;top:56u;padding:16u;gap:16u}
  .ope-profile i{display:none}
  .ope-stats{display:none}
  .ope-stage{top:56u;width:280u}
  .ope-phone{left:22u;top:30u;width:236u;padding:8u;border-radius:36u}
  .ope-screen{border-radius:28u}
}

/* ---------- Nina's OnePage, in the editor's phone: the Air theme with the Hero header */
.np{display:flex;flex-direction:column;align-items:center;min-height:100%;padding:0 20u 30u;background:#eef0f3;color:#111827;font-family:"DM Sans",var(--font-inter,Inter),Inter,sans-serif}
.np-hero{position:relative;width:calc(100% + 40u);margin:0 -20u 8u}
.np-photo{height:439u!important;object-position:50% 30%;-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 46%,rgba(0,0,0,.93) 54%,rgba(0,0,0,.79) 62%,rgba(0,0,0,.6) 70%,rgba(0,0,0,.4) 78%,rgba(0,0,0,.21) 86%,rgba(0,0,0,.07) 94%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,#000 46%,rgba(0,0,0,.93) 54%,rgba(0,0,0,.79) 62%,rgba(0,0,0,.6) 70%,rgba(0,0,0,.4) 78%,rgba(0,0,0,.21) 86%,rgba(0,0,0,.07) 94%,transparent 100%);background:none}
.np-title{position:absolute;left:0;right:0;bottom:12u;padding:0 24u;text-align:center}
.np-title h3{font-size:30u;font-weight:700;letter-spacing:-.02em;line-height:1.15;text-shadow:0 1u 14u rgba(238,240,243,.72),0 0 2u rgba(238,240,243,.72)}
.np-title p{max-width:300u;margin:6u auto 0!important;font-size:14u;line-height:1.45;color:#5b6170;text-shadow:0 1u 10u rgba(238,240,243,.72)}
.np-socials{display:flex;justify-content:center;gap:22u;height:42u;align-items:center;margin-bottom:14u;color:#374151}
.np-socials svg{width:20u;height:20u}
.np-btn{position:relative;display:flex;align-items:center;justify-content:center;width:100%;min-height:62u;margin-top:12u;padding:0 60u;border-radius:14u;background:#fff;font-size:15u;font-weight:600;text-align:center;box-shadow:0 2u 4u rgba(0,0,0,.08)}
.np-thumb{position:absolute;left:8u;top:8u;width:46u!important;height:46u!important;border-radius:10u}
.np-ico{position:absolute;left:21u;width:20u!important;height:20u!important;color:#111827}
.np-prod{display:flex;align-items:center;gap:14u;width:100%;margin-top:12u;padding:10u 14u 10u 10u;border-radius:14u;background:#fff;box-shadow:0 2u 4u rgba(0,0,0,.08);text-align:left}
.np-prod>span{flex:1;display:grid;gap:2u;min-width:0}
.np-prod b{font-size:15u;font-weight:600}
.np-prod i{font-size:12.5u;font-style:normal;color:#5b6170}
.np-prod strong{padding:7u 13u;border-radius:999u;background:#111827;color:#fff;font-size:13.5u;font-weight:600}
.np-btn.np-new{padding:0 16u}
.np-signup{display:grid;gap:9u;width:100%;padding:14u 0;text-align:left}
.np-signup b{font-size:14.5u;font-weight:600}
.np-form{display:flex;gap:6u}
.np-input{flex:1;display:flex;align-items:center;height:38u;padding:0 12u;border-radius:10u;background:#eef0f3;font-size:13u;font-weight:400;color:#6b7280}
.np-sub{display:grid;place-items:center;padding:0 15u;border-radius:10u;background:#111827;color:#fff;font-size:13u}
.np-video{position:relative;display:block;width:100%;height:196u;margin-top:12u;border-radius:14u;overflow:hidden}
.np-video>em{position:absolute;left:14u;bottom:12u;color:#fff;font-size:12.5u;font-style:normal;font-weight:600;text-shadow:0 1u 4u rgba(0,0,0,.5)}
.np-vplay{position:absolute;left:50%;top:50%;width:46u;height:46u;margin:-23u 0 0 -23u;border-radius:50%;display:grid;place-items:center;background:#fff;color:#111827}
.np-vplay svg{width:16u;height:16u;margin-left:2u}

/* the record in its sleeve: a black disc with grooves and the cover on its label, half out of the sleeve */
.vy{--s:30u;position:relative;display:block;width:calc(var(--s) * 1.42);height:var(--s)}
.vy-sleeve{position:absolute;left:0;top:0;z-index:1;width:var(--s)!important;height:var(--s)!important;border-radius:2u;box-shadow:1u 0 3u rgba(0,0,0,.28)}
.vy-disc{position:absolute;top:4%;left:calc(var(--s) * .5);width:calc(var(--s) * .92);height:calc(var(--s) * .92);border-radius:50%;background:radial-gradient(circle,#0d0d0d 0 17%,transparent 18%),repeating-radial-gradient(circle,#151515 0 1.3%,#262626 1.8% 2.6%);box-shadow:inset 0 0 0 .5u rgba(255,255,255,.08)}
.vy-label{position:absolute;inset:31%;width:38%!important;height:38%!important;border-radius:50%}
.np-vinyl{--s:64u}
.ope-tile .vy{--s:26u}

/* brand marks in the Links tab's chips */
.bm-defs{position:absolute;width:0;height:0;overflow:hidden}
.bm-tt{position:relative;display:grid;width:13u;height:13u}
.bm-tt svg{grid-area:1/1;width:100%!important;height:100%!important;color:#111}
.bm-tt .bm-tt-c{color:#25f4ee;transform:translate(-.8u,-.8u)}
.bm-tt .bm-tt-r{color:#fe2c55;transform:translate(.8u,.8u)}

/* ---------- community editor: its own screen */
.ce{background:#f8f9fa}
.ce-bar{position:absolute;inset:0 0 auto;z-index:2;height:56u;display:flex;align-items:center;gap:8u;padding:0 16u 0 12u;background:#fff;box-shadow:inset 0 -1u 0 #e5e7eb}
.ce-back{width:20u!important;height:20u!important;margin:0 6u;color:#4b5563}
.ce-logo{flex:none;width:32u!important;height:32u!important;border-radius:9u;box-shadow:0 0 0 1u rgba(16,24,40,.06)}
.ce-name{margin-left:2u;font-size:15u;font-weight:600;white-space:nowrap}
.ce-badge{display:flex;align-items:center;gap:6u;height:22u;padding:0 8u;border-radius:6u;background:#e3f5e9;color:#14532d;font-size:12u;font-weight:500;box-shadow:0 0 0 1u rgba(20,83,45,.12)}
.ce-badge i{width:6u;height:6u;border-radius:50%;background:#22a06b}
.ce-tools{display:flex;align-items:center;gap:6u;margin-left:auto}
.ce-device{display:flex;padding:2u;border-radius:10u;background:#eef0f2}
.ce-device>*{display:flex;align-items:center;gap:6u;height:32u;padding:0 10u;border-radius:8u;font-size:13u;font-weight:500;color:#4b5563}
.ce-device b{background:#fff;color:#1a1a2e;box-shadow:0 1u 2u rgba(16,24,40,.08),0 0 0 .5u rgba(16,24,40,.06)}
.ce-icon{display:flex;align-items:center;justify-content:center;gap:6u;min-width:36u;height:36u;padding:0 8u;border-radius:8u;color:#4b5563;font-size:13u;font-weight:500}
.ce-saverow{display:flex;align-items:center;gap:6u;margin-left:24u}
.ce-status{display:grid;min-width:132u;font-size:13u}
.ce-st{grid-area:1/1;display:flex;align-items:center;justify-content:flex-end;gap:6u;white-space:nowrap}
.ce-st svg{width:14u;height:14u}
.ce-st-saved{color:#6b7280}
.ce-st-dirty{opacity:0;color:#1a1a2e;font-weight:500}
.ce-st-dirty i{width:8u;height:8u;border-radius:50%;background:#e0a100}
.ce-save{position:relative;display:grid;min-width:72u;height:36u;border-radius:10u;background:#1a1a2e;color:#fff;font-size:14u;font-weight:500;box-shadow:inset 0 1u 0 rgba(255,255,255,.14),0 1u 2u rgba(16,24,40,.25)}
.ce-save>span{grid-area:1/1;display:grid;place-items:center}
.ce-save-off{opacity:.5}
.ce-save-on{opacity:0}
.ce-stage{position:absolute;left:12u;top:68u;right:376u;bottom:12u;border-radius:16u;overflow:hidden;background:#f8f9fa;box-shadow:0 0 0 1u rgba(229,231,235,.8),0 1u 3u rgba(0,0,0,.04)}
.ce-stage .ce-preview{position:absolute;inset:0}
.ce-preview>.smk{--w:1040}
.ce-handle{position:absolute;top:56u;bottom:0;right:360u;width:16u;display:grid;place-items:center}
.ce-handle i{width:5u;height:36u;border-radius:3u;background:#d9dce1}
.ce-side{position:absolute;right:0;top:56u;bottom:0;width:360u;background:#fff;box-shadow:inset 1u 0 0 #e5e7eb;overflow:hidden}
.ce-side-head{display:flex;align-items:center;justify-content:space-between;height:49u;padding:0 14u 0 20u;border-bottom:1u solid #f1f2f4;color:#6b7280}
.ce-side-head b{font-size:15u;font-weight:600;color:#1a1a2e}
.ce-group{display:block;border-bottom:1u solid #f1f2f4}
.ce-group-h{display:flex;align-items:center;justify-content:space-between;gap:12u;min-height:56u;padding:0 20u;color:#9ca3af}
.ce-group-h>span{display:grid;gap:2u;min-width:0}
.ce-group-h b{font-size:14.5u;font-weight:600;color:#1a1a2e}
.ce-group-h i{font-size:12.5u;font-style:normal;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ce-open .ce-group-h svg{transform:rotate(180deg)}
.ce-open{padding-bottom:18u}
.ce-flabel{margin:10u 20u 6u!important;font-size:13u;font-weight:500;line-height:16u;color:#374151}
.ce-input{position:relative;display:grid;align-items:center;height:40u;margin:0 20u;padding:0 12u;border-radius:10u;background:#fff;box-shadow:inset 0 0 0 1u #d9dbe0;font-size:13.5u;white-space:nowrap;overflow:hidden}
.ce-input>span{grid-area:1/1}
.ce-focus{box-shadow:inset 0 0 0 1u #1a1a2e,0 0 0 3u rgba(26,26,46,.1)}
.ce-area{height:64u;align-items:start;padding-top:10u;white-space:normal;line-height:1.45;color:#374151}
.ce-logo-row{display:flex;align-items:center;gap:10u;margin:0 20u}
.ce-logo-row img{width:40u!important;height:40u!important;border-radius:10u}
.ce-logo-row span{display:grid;place-items:center;height:34u;padding:0 12u;border-radius:9u;box-shadow:inset 0 0 0 1u #e3e5e9;font-size:13u;font-weight:500}
.ka-tag-new{position:relative;justify-self:start;overflow:hidden;white-space:nowrap}
.ka-tag-old{opacity:0;white-space:nowrap}
.ce-type{position:absolute;inset:0 -2u 0 0;background:#fff;transform:translateX(100%)}
.ce-type::before{content:"";position:absolute;left:1u;top:3u;bottom:3u;width:1.5u;background:#1a1a2e}
.ce-cur{left:1100u;top:282u}

/* the About page in the stage, at its own width */
.ka{position:absolute;inset:0;background:#f8f9fa;color:#1a1a2e;font-size:15u}
.ka-cols{display:grid;grid-template-columns:minmax(0,1fr) 320u;gap:28u;padding:28u 30u 0}
.ka-sheet{border-radius:16u;background:#fff;box-shadow:0 0 0 1u #eceef1;overflow:hidden}
.ka-cover{height:330u!important}
.ka-head{padding:24u 32u 22u}
.ka-head h4{margin:0;font-size:30u;font-weight:600;letter-spacing:-.015em}
.ka-tag{position:relative;display:grid;margin-top:6u!important;font-size:17u;color:#4b5563}
.ka-tag>span{grid-area:1/1}
.ka-ring{position:absolute;inset:-5u -8u;border-radius:6u;box-shadow:inset 0 0 0 2u #1a1a2e;opacity:0}
.ka-ring em{position:absolute;right:-2u;top:-22u;display:flex;align-items:center;gap:5u;height:22u;padding:0 8u;border-radius:5u 5u 0 0;background:#1a1a2e;color:#fff;font-size:12u;font-style:normal;font-weight:600}
.ka-ring svg{width:12u;height:12u}
.ka-row{display:flex;align-items:center;gap:5u;margin-top:12u!important;font-size:14u;color:#6b7280}
.ka-row b{color:#1a1a2e}
.ka-stars svg{width:15u;height:15u;color:#1a1a2e}
.ka-sec{padding:24u 32u;border-top:1u solid #eef0f2}
.ka-sec h5{margin:0;font-size:18u;font-weight:600}
.ka-sec p{margin-top:10u!important;font-size:15u;line-height:1.6;color:#374151}
.ka-sec ul{display:grid;gap:10u;margin:12u 0 0;padding:0;list-style:none;font-size:15u;color:#374151}
.ka-sec li{display:flex;align-items:center;gap:10u}
.ka-sec li i{display:grid;place-items:center;width:20u;height:20u;border-radius:50%;background:#1a1a2e;color:#fff}
.ka-sec li svg{width:12u;height:12u}
.ka-card{align-self:start;display:grid;gap:12u;padding:20u;border-radius:16u;background:#fff;box-shadow:0 0 0 1u #eceef1}
.ka-card-top{display:flex;align-items:center;gap:12u}
.ka-card-top b{font-size:16u;font-weight:600;line-height:1.25}
.ka-logo{flex:none;width:48u!important;height:48u!important;border-radius:12u}
.ka-price{font-size:14u;color:#6b7280}
.ka-price b{font-size:26u;font-weight:600;color:#1a1a2e}
.ka-join{display:grid;place-items:center;height:46u;border-radius:12u;background:#1a1a2e;color:#fff;font-size:15u;font-weight:600}
.ka-cancel{text-align:center;font-size:12.5u;color:#6b7280}
.ka-facts{display:grid;gap:10u;padding-top:14u;border-top:1u solid #eef0f2;font-size:13.5u;color:#6b7280}
.ka-facts>span{display:flex;justify-content:space-between}
.ka-facts b{color:#1a1a2e;font-weight:500}

@media(prefers-reduced-motion:no-preference){[data-mock-live] .ce-cur{animation:sxk-ce-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ce-type{animation:sxk-ce-type var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ka-tag-old{animation:sxk-ce-old var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ka-ring{animation:sxk-ce-ring var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ce-st-saved,[data-mock-live] .ce-save-off{animation:sxk-ce-saved var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ce-st-dirty,[data-mock-live] .ce-save-on{animation:sxk-ce-dirty var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ce-save{animation:sxk-ce-press var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-ce-cur{0%{opacity:0;transform:translate(-420u,240u)}6%{opacity:1}18%{transform:none}20%{transform:scale(.86)}22%,44%{transform:none}54%{transform:translate(128u,-254u)}56%{transform:translate(128u,-254u) scale(.86)}58%,68%{opacity:1;transform:translate(128u,-254u)}76%,100%{opacity:0;transform:translate(128u,-254u)}}
@keyframes sxk-ce-type{0%,23%{transform:none;animation-timing-function:steps(41,end)}45%,100%{transform:translateX(100%)}}
@keyframes sxk-ce-old{0%,20%{opacity:1}22%,100%{opacity:0}}
@keyframes sxk-ce-ring{0%,19%{opacity:0}22%,88%{opacity:1}94%,100%{opacity:0}}
@keyframes sxk-ce-saved{0%,22%{opacity:1}24%,56%{opacity:0}60%,100%{opacity:1}}
@keyframes sxk-ce-dirty{0%,22%{opacity:0}24%,56%{opacity:1}60%,100%{opacity:0}}
@keyframes sxk-ce-press{0%,55%{transform:none}56.5%{transform:scale(.94)}58%,100%{transform:none}}
@media (max-width:767px){
  .ce-bar{gap:6u;padding:0 10u 0 6u}
  .ce-back{margin:0 2u}
  .ce-logo,.ce-badge,.ce-device span,.ce-visitor span,.ce-look,.ce-status,.ce-panel-key{display:none}
  .ce-name{overflow:hidden;text-overflow:ellipsis}
  .ce-saverow{margin-left:6u}
  .ce-stage{left:8u;top:64u;right:258u;bottom:8u;border-radius:12u}
  .ce-preview>.smk{--w:560}
  .ka-cols{grid-template-columns:1fr;padding:16u}
  .ka-card{display:none}
  .ka-cover{height:220u!important}
  .ka-head,.ka-sec{padding-inline:20u}
  .ka-tag{white-space:normal}
  .ce-handle{right:244u;width:14u}
  .ce-side{width:244u}
  .ce-side-head{padding:0 12u 0 14u}
  .ce-group-h{padding:0 14u}
  .ce-group-h i{display:none}
  .ce-flabel{margin-inline:14u!important}
  .ce-input,.ce-logo-row{margin-inline:14u}
  .ce-input{font-size:12.5u;padding:0 10u}
}
`)
