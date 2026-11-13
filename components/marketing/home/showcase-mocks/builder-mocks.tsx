import {
  Archive,
  ArrowLeft,
  ArrowLeftToLine,
  BarChart2,
  Calendar,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  GripVertical,
  Instagram,
  Layers,
  Link2,
  Mail,
  Maximize2,
  Monitor,
  Moon,
  MoreHorizontal,
  MousePointerClick,
  Music2,
  PanelBottom,
  PanelRightClose,
  PanelTop,
  Palette,
  Pencil,
  Play,
  Plus,
  RectangleHorizontal,
  Redo2,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Star,
  Trash2,
  Undo2,
  Users,
  Youtube,
} from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MockFrame, Pic, u } from "./frame"

/*
  INSIDE STORELIB'S BUILDERS, AS THEY ARE TODAY (landing round).
  Each mock follows the real editor's own layout, read from its source:

    Website builder   app/(storelib)/website-builder/editor/[installId]/page.tsx
                      the dark 48px bar (Back, the theme's name and live dot,
                      Preview / Code / Settings, the size and full screen keys,
                      the page switcher, undo and redo, the inspector, Ask
                      Storelib, the violet Publish), the white sidebar card on
                      the #eef1f5 shelf with Sections / Pages / Theme and the
                      Header / Page / Footer tree (sections-list.tsx), and the
                      page itself with the blue section ring and its chip
                      (sections/_shared.tsx).
    Design            the same builder with the Hero section open: its colour
                      scheme picker and the theme's schemes painted in their
                      own colours (Light, Soft, Dark, Brand, Accent), as
                      components/website-builder/editor/design-panels.tsx
                      draws them, then its heading and text styles.
    OnePage editor    components/onepage/onepage-editor.tsx and tabs/links-tab:
                      undo and redo keys, the Links / Design / Products pill
                      row and Settings, Save and Share your OnePage; the Links
                      tab (profile, the violet Add, block cards with their
                      clicks and switch) beside the 410px preview column with
                      the 307 x 627 phone.
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

/** Storelib's logo, through the one component that draws it (Ask Storelib, the app bar). */
function StorelibTile({ className = "" }: { className?: string }) {
  return (
    <span className={`bm-logo ${className}`}>
      <StorelibLogo size={40} alt="" fluid style={{ width: "100%", height: "100%", borderRadius: "inherit" }} />
    </span>
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
            <em>Hero</em>
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
              <em>Curriculum</em>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================ Website builder */
type TreeRow = [string, typeof PanelTop, string?]
const TREE_PAGE: TreeRow[] = [
  ["Hero", RectangleHorizontal, "wx-hl-a"],
  ["Curriculum", RectangleHorizontal, "wx-hl-b"],
  ["Testimonials", RectangleHorizontal],
  ["Instructor", RectangleHorizontal],
  ["FAQ", RectangleHorizontal],
  ["Newsletter", RectangleHorizontal],
]

function Row({ name, Icon, hl }: { name: string; Icon: typeof PanelTop; hl?: string }) {
  return (
    <span className={`wx-row${hl ? ` ${hl}` : ""}`}>
      {hl && (
        <span className="wx-row-on">
          <i />
          <Eye />
          <Trash2 />
        </span>
      )}
      <GripVertical className="wx-grip" />
      <Icon className="wx-ico" />
      <b>{name}</b>
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
        <Palette /> Theme
      </span>
    </span>
  )
}

/** The builder's dark bar, the same on both website builder slides. */
function WbBar() {
  return (
    <div className="wx-bar">
      <span className="wx-left">
        <span className="wx-key ghost">
          <ArrowLeftToLine />
        </span>
        <b className="wx-name">Hearth &amp; Hand</b>
        <i className="wx-live" />
        <span className="wx-key ghost wx-wide">
          <MoreHorizontal />
        </span>
        <span className="wx-mode">
          <b>
            <Globe /> Preview
          </b>
          <span className="wx-wide">
            <Code2 />
          </span>
          <span className="wx-wide">
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
          Home <ChevronDown />
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
        <span className="wx-key on">
          <MousePointerClick />
        </span>
        <StorelibTile className="wx-ask" />
        <span className="wx-publish">
          <i /> Publish
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
        <Row name="Header" Icon={PanelTop} />
        <p className="wx-group">Page</p>
        <span className="wx-add">
          <Plus /> Add section
        </span>
        {TREE_PAGE.map(([n, I, hl]) => (
          <Row key={n} name={n} Icon={I} hl={hl} />
        ))}
        <span className="wx-add">
          <Plus /> Add section
        </span>
        <p className="wx-group">Footer</p>
        <Row name="Footer" Icon={PanelBottom} />
      </aside>
      <div className="wx-canvas">
        <MockFrame label="" className="wx-site">
          <HearthSite rings />
        </MockFrame>
        <span className="wx-toast">
          <Check /> Published to hearthandhand.com
        </span>
      </div>
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
        <span className="wd-head">
          <ArrowLeft />
          <b>Hero</b>
          <Eye />
          <Trash2 />
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
type Block = { t: string; s: string; pic?: string; Icon?: typeof Link2; clicks?: string; off?: boolean }
const MAYA_BLOCKS: Block[] = [
  { t: "16-Week Marathon Plan", s: "$39.00", pic: "mr-run", clicks: "1.9k" },
  { t: "Join Saturday Run Club", s: "storelib.com/c/saturday-run-club", Icon: Users, clicks: "842" },
  { t: "Book a 1:1 gait review", s: "Booking form", Icon: Calendar, clicks: "311" },
  { t: "Monday training notes", s: "Email signup", Icon: Mail, off: true },
  { t: "How I ran a 3:08 marathon", s: "youtube.com/@mayaruns", pic: "mr-race", clicks: "2.4k" },
]

function OpeBlock({ b }: { b: Block }) {
  const Icon = b.Icon
  return (
    <span className={`ope-card${b.off ? " ope-off" : ""}`}>
      <GripVertical className="ope-grip" />
      <span className="ope-face">
        <span className="ope-tile">{b.pic ? <Pic n={b.pic} w={160} h={160} /> : Icon ? <Icon /> : null}</span>
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

/** Maya Okafor's OnePage (the page in the OnePage editor's preview). `.zo-new` is the email signup the editor turns on. */
export function MayaPage() {
  return (
    <div className="zo-page">
      <Pic n="av-maya" w={160} h={160} className="zo-av" />
      <h3>Maya Okafor</h3>
      <p className="zo-bio">Run coach · 6 marathons · Brooklyn, NY. Training plans that fit real life.</p>
      <span className="zo-socials">
        <Instagram />
        <Youtube />
        <Music2 />
        <Globe />
      </span>
      <span className="zo-feature">
        <Pic n="mr-run" w={800} h={600} />
        <em>Bestseller</em>
        <span>
          <b>16-Week Marathon Plan</b>
          <i>PDF and app sync · 1,920 runners</i>
        </span>
        <strong>$39</strong>
      </span>
      <span className="zo-link">
        Join Saturday Run Club <i>Free</i>
      </span>
      <span className="zo-link">
        <Calendar /> Book a 1:1 gait review <i>$60</i>
      </span>
      <span className="zo-link zo-new">
        <span className="zo-signup">
          <b>Monday training notes</b>
          <span className="zo-form">
            <span className="zo-input">Your email</span>
            <span className="zo-sub">Subscribe</span>
          </span>
        </span>
      </span>
      <span className="zo-video zo-after">
        <Pic n="mr-race" w={800} h={600} />
        <span className="zo-vplay">
          <Play fill="currentColor" strokeWidth={0} />
        </span>
        <em>How I ran a 3:08 marathon · 12:41</em>
      </span>
    </div>
  )
}

export function OnePageEditorMock() {
  return (
    <div className="bm ope">
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
          <Pic n="av-maya" w={160} h={160} className="ope-av" />
          <span>
            <b>
              Maya Okafor <Pencil />
            </b>
            <i>Run coach · 6 marathons · Brooklyn, NY. Training plans that fit real life.</i>
            <span className="ope-socials">
              <em>
                <Instagram />
              </em>
              <em>
                <Music2 />
              </em>
              <em>
                <Youtube />
              </em>
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
          {MAYA_BLOCKS.map((b) => (
            <OpeBlock key={b.t} b={b} />
          ))}
        </div>
      </div>
      <div className="ope-stage">
        <div className="ope-phone">
          <MockFrame w={390} ratio="287/607" label="" className="ope-screen">
            <MayaPage />
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
.hs{position:absolute;inset:0;background:#faf8f5;color:#1c1a17}
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
.hs-mods{position:relative;padding:22u 40u 40u;background:#f3efe8;border-top:1u solid #ebe6de}
.hs-h{font-family:${SERIF};font-size:24u}
.hs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16u;margin-top:14u}
.hs-grid>span{display:grid;gap:3u}
.hs-grid img{height:150u!important;border-radius:12u;margin-bottom:6u}
.hs-grid em{font-size:11u;font-style:normal;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9a5b34}
.hs-grid b{font-size:14.5u;font-weight:600}
.hs-ring{position:absolute;inset:0;border-radius:4u;box-shadow:inset 0 0 0 2u #3b82f6;pointer-events:none}
.hs-ring em{position:absolute;right:8u;bottom:8u;padding:5u 7u;border-radius:6u;background:#3b82f6;color:#fff;font-size:11.5u;font-style:normal;font-weight:600;line-height:1;box-shadow:0 1u 4u rgba(0,0,0,.18)}
.hs-ring.wx-ring-b{opacity:0}
.hs-darkscheme .hs{bottom:auto;background:#1f1c19;color:#f4efe7}
.hs-darkscheme .hs-nav{border-color:rgba(255,255,255,.1)}
.hs-darkscheme .hs-links,.hs-darkscheme .hs-sub,.hs-darkscheme .hs-proof{color:#b9b1a5}
.hs-darkscheme .hs-links b{color:#f4efe7}
.hs-darkscheme .hs-enroll,.hs-darkscheme .hs-btns b{background:#f4efe7;color:#1f1c19}
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

/* ---------- website builder */
.wb{background:#eef1f5}
.wx-bar{position:absolute;inset:0 0 auto;height:48u;display:flex;align-items:center;gap:8u;padding:0 16u;background:#171717;color:#fff;border-bottom:1u solid rgba(255,255,255,.1)}
.wx-bar svg{width:15u;height:15u}
.wx-left,.wx-mid,.wx-right{display:flex;align-items:center;gap:6u}
.wx-mid{flex:1;justify-content:center}
.wx-right{gap:8u}
.wx-key{display:grid;place-items:center;width:32u;height:32u;border-radius:8u;background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);box-shadow:inset 0 1u 0 rgba(255,255,255,.06)}
.wx-key.ghost{background:none;box-shadow:none}
.wx-key.on{background:rgba(139,86,250,.22);color:#c4a8ff;box-shadow:inset 0 0 0 1u rgba(139,86,250,.55)}
.wx-name{margin-left:2u;font-size:14u;font-weight:500;white-space:nowrap}
.wx-live{width:8u;height:8u;border-radius:50%;background:#10b981}
.wx-mode{display:flex;gap:2u;margin-left:6u;padding:2u;border-radius:999u;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1)}
.wx-mode>*{display:flex;align-items:center;gap:6u;height:28u;padding:0 10u;border-radius:999u;color:rgba(255,255,255,.55);font-size:12.5u;font-weight:500}
.wx-mode b{color:#fff;background:rgba(139,86,250,.25);box-shadow:inset 0 0 0 1u rgba(139,86,250,.6)}
.wx-round{display:grid;place-items:center;width:32u;height:32u;border-radius:50%;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1)}
.wx-page{display:flex;align-items:center;gap:6u;height:32u;padding:0 12u;border-radius:8u;background:rgba(255,255,255,.06);font-size:13u;font-weight:500}
.wx-page svg{width:13u;height:13u;opacity:.7}
.wx-ask{width:32u;height:32u;border-radius:9u}
.wx-publish{display:flex;align-items:center;justify-content:center;gap:8u;min-width:92u;height:32u;padding:0 14u;border-radius:999u;background:#8b56fa;color:#fff;font-size:13u;font-weight:600}
.wx-publish i{width:7u;height:7u;border-radius:50%;background:#fff}
.wx-side{position:absolute;left:6u;top:54u;bottom:0;width:288u;padding:12u;border-radius:20u 20u 0 0;background:#fff;overflow:hidden}
.wx-tabs{display:grid;grid-template-columns:repeat(3,1fr);padding:2u;border-radius:8u;background:#f5f5f5;margin-bottom:6u}
.wx-tabs>*{display:flex;align-items:center;justify-content:center;gap:6u;height:30u;border-radius:6u;color:#737373;font-size:12.5u;font-weight:500}
.wx-tabs b{background:#fff;color:#1a1a2e;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.wx-tabs svg{width:13u;height:13u}
.wx-group{height:30u;padding:13u 8u 0 4u;font-size:11u;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}
.wx-row{position:relative;display:flex;align-items:center;height:32u;padding:0 4u;border-radius:6u;color:#1a1a2e}
.wx-row b{position:relative;margin-left:6u;font-size:13u;font-weight:500}
.wx-grip{position:relative;width:13u!important;height:13u!important;color:#c3c6cc}
.wx-ico{position:relative;margin-left:3u;width:14u!important;height:14u!important;color:#6b7280}
.wx-row-on{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;gap:10u;padding-right:10u;border-radius:6u;background:#ebecef;color:#6b7280}
.wx-row-on i{flex:1}
.wx-row-on svg{width:14u;height:14u}
.wx-hl-b .wx-row-on{opacity:0}
.wx-add{display:flex;align-items:center;gap:8u;height:32u;padding:0 8u;color:#4b5563;font-size:13u;font-weight:500}
.wx-add svg{width:14u;height:14u}
.wx-canvas{position:absolute;left:300u;right:6u;top:54u;bottom:0;border-radius:12u 12u 0 0;overflow:hidden;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.06)}
.wx-toast{position:absolute;left:50%;bottom:24u;display:flex;align-items:center;gap:8u;padding:10u 16u;border-radius:999u;background:#171717;color:#fff;font-size:12.5u;font-weight:500;white-space:nowrap;transform:translateX(-50%);opacity:0;box-shadow:0 12u 30u rgba(0,0,0,.25)}
.wx-toast svg{width:14u;height:14u;color:#34d399}
.wx-cur{left:156u;top:274u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-cur{animation:sxk-wx-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-hl-a .wx-row-on,[data-mock-live] .wx-ring-a{animation:sxk-wx-a var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-hl-b .wx-row-on,[data-mock-live] .wx-ring-b{animation:sxk-wx-b var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wb:not(.wd) .wx-publish{animation:sxk-wx-press var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-toast{animation:sxk-wx-toast var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-wx-cur{0%{opacity:0;transform:translate(520u,120u)}6%{opacity:1}22%{transform:none}24%{transform:scale(.86)}26%{transform:none}31%{transform:none}50%{transform:translate(1060u,-252u)}52%{transform:translate(1060u,-252u) scale(.86)}54%,66%{opacity:1;transform:translate(1060u,-252u)}74%,100%{opacity:0;transform:translate(1060u,-252u)}}
@keyframes sxk-wx-a{0%,23%{opacity:1}26%,94%{opacity:0}100%{opacity:1}}
@keyframes sxk-wx-b{0%,23%{opacity:0}26%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-wx-press{0%,51%{transform:none}52.5%{transform:scale(.94)}54%,100%{transform:none}}
@keyframes sxk-wx-toast{0%,54%{opacity:0;transform:translate(-50%,10u)}58%,84%{opacity:1;transform:translate(-50%,0)}90%,100%{opacity:0;transform:translate(-50%,10u)}}
@media (max-width:767px){
  .wx-wide,.wx-mid{display:none}
  .wx-right{margin-left:auto}
  .wx-side{width:200u;padding:10u}
  .wx-tabs>* svg{display:none}
  .wx-canvas{left:212u}
}

/* ---------- design: the Hero's scheme */
.wd-head{display:flex;align-items:center;gap:8u;height:36u;padding:0 4u;margin-bottom:6u;border-bottom:1u solid #f1f2f4;color:#6b7280}
.wd-head b{flex:1;color:#1a1a2e;font-size:14u;font-weight:600}
.wd-head svg{width:15u;height:15u}
.wd-label{margin:12u 0 6u!important;font-size:12u;font-weight:600;line-height:16u;color:#374151}
.wd-picker{position:relative;display:grid;height:40u}
.wd-scheme{grid-area:1/1;display:flex;align-items:center;gap:10u;padding:0 12u;border-radius:12u;font-size:13u;font-weight:500;box-shadow:inset 0 0 0 1u #e5e5e5}
.wd-scheme b,.wd-row b{font-size:15u;font-weight:700}
.wd-scheme svg{margin-left:auto;width:15u;height:15u;opacity:.7}
.wd-light{background:#fff;color:#1c1a17;opacity:0}
.wd-dark{background:#1f1c19;color:#f4efe7}
.wd-list{position:absolute;z-index:5;left:12u;right:12u;top:134u;display:grid;gap:4u;padding:6u;border-radius:12u;background:#fff;box-shadow:0 0 0 1u #e5e5e5,0 12u 28u -8u rgba(16,24,40,.22);opacity:0}
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
.wd-cur{left:150u;top:158u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-cur{animation:sxk-wd-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-list{animation:sxk-wd-list var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-pick::after{animation:sxk-wd-pick var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-light{animation:sxk-wd-off var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd-dark,[data-mock-live] .wd-dark-site{animation:sxk-wd-on var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wd .wx-publish{animation:sxk-wd-press var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-wd-cur{0%{opacity:0;transform:translate(520u,260u)}6%{opacity:1}18%{transform:none}20%{transform:scale(.86)}22%{transform:none}31%{transform:translate(0,130u)}33%{transform:translate(0,130u) scale(.86)}35%,52%{transform:translate(0,130u)}68%{transform:translate(1066u,-134u)}70%{transform:translate(1066u,-134u) scale(.86)}72%,80%{opacity:1;transform:translate(1066u,-134u)}88%,100%{opacity:0;transform:translate(1066u,-134u)}}
@keyframes sxk-wd-list{0%,20%{opacity:0;transform:translateY(-6u)}24%,35%{opacity:1;transform:none}39%,100%{opacity:0;transform:translateY(-4u)}}
@keyframes sxk-wd-pick{0%,31%{opacity:0}33%,36%{opacity:1}39%,100%{opacity:0}}
@keyframes sxk-wd-off{0%,36%{opacity:1}40%,94%{opacity:0}100%{opacity:1}}
@keyframes sxk-wd-on{0%,36%{opacity:0}46%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-wd-press{0%,69%{transform:none}70.5%{transform:scale(.94)}72%,100%{transform:none}}
@media (max-width:767px){
  .wd-list{top:126u;left:10u;right:10u}
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
.ope-card{display:flex;align-items:center;gap:12u;padding:12u;border-radius:16u;border:1u solid #ececf1;background:#fff;box-shadow:0 1u 2u rgba(16,24,40,.04)}
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
.ope-cur{left:672u;top:654u}
.ope-phone .zo-new{opacity:0}
.ope-phone .zo-after{transform:translateY(-104u)}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-cur{animation:sxk-op-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw b{animation:sxk-op-knob var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw-on,[data-mock-live] .ope-phone .zo-new{animation:sxk-op-on var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-face{animation:sxk-op-face var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-phone .zo-after{animation:sxk-op-after var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-saved{animation:sxk-op-saved var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-dirty{animation:sxk-op-dirty var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-op-cur{0%{opacity:0;transform:translate(-300u,-200u)}6%{opacity:1}24%{transform:none}26%{transform:scale(.86)}28%,34%{transform:none}52%{transform:translate(347u,-624u)}54%{transform:translate(347u,-624u) scale(.86)}56%,66%{opacity:1;transform:translate(347u,-624u)}74%,100%{opacity:0;transform:translate(347u,-624u)}}
@keyframes sxk-op-knob{0%,25%{transform:none}29%,94%{transform:translateX(16u)}100%{transform:none}}
@keyframes sxk-op-on{0%,25%{opacity:0}30%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-op-face{0%,25%{opacity:.5}30%,94%{opacity:1}100%{opacity:.5}}
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

/* ---------- Maya's OnePage, in the editor's phone */
.zo-page{display:flex;flex-direction:column;align-items:center;min-height:100%;padding:30u 24u;text-align:center;background:#f3ede4;color:#231f1a}
.zo-av{width:88u!important;height:88u!important;border-radius:50%;box-shadow:0 0 0 3u #fff}
.zo-page h3{margin-top:12u!important;font-family:${SERIF};font-weight:400;font-size:28u}
.zo-bio{max-width:330u;margin-top:6u!important;font-size:13u;line-height:1.5;color:#6b6157}
.zo-socials{display:flex;gap:16u;margin-top:12u}
.zo-socials svg{width:18u;height:18u}
.zo-feature{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;gap:0 10u;width:100%;margin-top:18u;padding:0 0 12u;border-radius:20u;background:#fff;overflow:hidden;text-align:left}
.zo-feature img{grid-column:1/-1;height:150u!important;margin-bottom:10u}
.zo-feature>em{position:absolute;left:10u;top:10u;padding:3u 8u;border-radius:999u;background:#231f1a;color:#fff;font-size:10.5u;font-style:normal;font-weight:600}
.zo-feature>span{display:grid;padding-left:14u}
.zo-feature b{font-size:14.5u}
.zo-feature i{font-size:11.5u;font-style:normal;color:#8a8073}
.zo-feature strong{margin-right:12u;padding:6u 12u;border-radius:999u;background:#e8562a;color:#fff;font-size:13u}
.zo-link{display:flex;align-items:center;justify-content:center;gap:7u;position:relative;width:100%;height:52u;margin-top:10u;border-radius:16u;background:#fff;font-size:14u;font-weight:600;box-shadow:0 1u 2u rgba(36,48,31,.06)}
.zo-link svg{width:15u;height:15u}
.zo-link i{position:absolute;right:16u;font-size:12u;font-style:normal;font-weight:600;color:#8a8073}
.zo-signup{display:grid;gap:8u;width:100%;padding:0 12u;text-align:left}
.zo-signup b{font-size:13.5u}
.zo-form{display:flex;gap:6u}
.zo-input{flex:1;height:34u;display:flex;align-items:center;padding:0 12u;border-radius:10u;background:#f3ede4;font-size:12.5u;font-weight:400;color:#8a8073}
.zo-sub{display:grid;place-items:center;padding:0 14u;border-radius:10u;background:#231f1a;color:#fff;font-size:12.5u}
.zo-link.zo-new{height:94u}
.zo-video{position:relative;display:block;width:100%;height:160u;margin-top:10u;border-radius:18u;overflow:hidden}
.zo-video>em{position:absolute;left:12u;bottom:10u;color:#fff;font-size:12u;font-style:normal;font-weight:600;text-shadow:0 1u 4u rgba(0,0,0,.5)}
.zo-vplay{position:absolute;left:50%;top:50%;width:44u;height:44u;margin:-22u 0 0 -22u;border-radius:50%;display:grid;place-items:center;background:#fff;color:#231f1a}
.zo-vplay svg{width:16u;height:16u;margin-left:2u}

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
