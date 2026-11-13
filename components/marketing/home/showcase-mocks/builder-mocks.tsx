import {
  Archive,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowUpFromLine,
  BarChart as Chart,
  BarChart2,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  GripVertical,
  Home,
  ImageIcon,
  Inbox,
  Instagram,
  Layers,
  LayoutGrid,
  Link2,
  Mail,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Music2,
  MousePointerClick,
  Package,
  PanelBottom,
  PanelTop,
  Paperclip,
  Palette,
  Pencil,
  Plus,
  RectangleHorizontal,
  Redo2,
  Search,
  Settings,
  Share,
  ShoppingBag,
  SlidersHorizontal,
  Smile,
  Trash2,
  Undo2,
  Users,
  Youtube,
} from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MockFrame, Pic, u } from "./frame"
import { BloomDesktop } from "./business-mocks"
import { HomeOnePage, HomeOnePageStyle, MAYA } from "../onepage-sample"

/*
  INSIDE STORELIB'S BUILDERS, AS THEY ARE TODAY (wave 13).
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
    OnePage editor    components/onepage/onepage-editor.tsx and tabs/links-tab:
                      undo and redo keys, the Links / Design / Products pill
                      row and Settings, Save and Share your OnePage; the Links
                      tab (profile, the violet Add, block cards with their
                      clicks and switch) beside the 410px preview column with
                      the 307 x 627 phone.
    Community builder components/app/sidebar.tsx and community/creator:
                      Storelib's app shell (the dark bar and the white rail
                      with Community lit), the community's bar (back, logo,
                      name, Live, View page), the row of section tabs with
                      Posts filled grey, the composer and the posts list.

  Phones get the editors' own phone shapes (the dark bar of keys and the
  sections sheet; the OnePage tab bar; the community bar and tabs).

  Motion is CSS keyframes on transform and opacity only. The resting styles
  ARE the finished state, so with reduced motion (or before the animation
  starts) every mock is a complete, still picture. Animations are attached
  only under [data-mock-live] (the visible panel, in view), and only to the
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

/** The Brush & Bloom home page as a phone shows it (the website builder's canvas on a phone). */
function BloomPhonePage() {
  return (
    <div className="wxm-site">
      <div className="wxm-nav">
        <span>Brush &amp; Bloom</span>
        <i />
      </div>
      <div className="wxm-hero">
        <p>Online course · Self-paced</p>
        <h4>
          Loose florals <i>in 21 days.</i>
        </h4>
        <span>Enroll · $129</span>
      </div>
      <Pic n="bb-hero" w={1200} h={700} className="wxm-img" />
    </div>
  )
}

export function WebsiteBuilderMock() {
  return (
    <div className="bm wb">
      <div className="bm-desk">
        <div className="wx-bar">
          <span className="wx-left">
            <span className="wx-key ghost">
              <ArrowLeftToLine />
            </span>
            <b className="wx-name">Brush &amp; Bloom</b>
            <i className="wx-live" />
            <span className="wx-key ghost">
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
              Home <ChevronDown />
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
            <span className="wx-key on">
              <MousePointerClick />
            </span>
            <StorelibTile className="wx-ask" />
            <span className="wx-publish">
              <i /> Publish
            </span>
          </span>
        </div>
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
          <MockFrame w={1024} ratio="974/746" label="" className="wx-site">
            <BloomDesktop />
          </MockFrame>
          <span className="wx-ring wx-ring-a">
            <em>Hero</em>
          </span>
          <span className="wx-ring wx-ring-b">
            <em>Curriculum</em>
          </span>
          <span className="wx-toast">
            <Check /> Published to brushandbloom.art
          </span>
        </div>
        <Cursor className="wx-cur" />
      </div>
      <div className="bm-phone">
        <div className="wxm-bar">
          <span className="wxm-key">
            <ArrowLeft />
          </span>
          <i className="wxm-div" />
          <span className="wxm-key">
            <MoreHorizontal />
          </span>
          <StorelibTile className="wxm-ask" />
          <span className="wxm-key wxm-push">
            <Undo2 />
          </span>
          <span className="wxm-key on">
            <MousePointerClick />
          </span>
          <span className="wxm-key wxm-pub">
            <ArrowUpFromLine />
          </span>
        </div>
        <div className="wxm-canvas">
          <BloomPhonePage />
          <span className="wx-ring wxm-ring">
            <em>Hero</em>
          </span>
        </div>
        <div className="wxm-sheet">
          <i className="wxm-grab" />
          <WbTabs />
          <p className="wx-group">Page</p>
          <Row name="Hero" Icon={RectangleHorizontal} hl="wxm-sel" />
          <Row name="Curriculum" Icon={RectangleHorizontal} />
          <Row name="Testimonials" Icon={RectangleHorizontal} />
          <Row name="Instructor" Icon={RectangleHorizontal} />
        </div>
      </div>
    </div>
  )
}

/* ================================================================ OnePage editor */
type Block = { t: string; s: string; pic?: string; Icon?: typeof Link2; clicks?: string; off?: boolean }
/* In the order the preview draws them (MAYA in ../onepage-sample): two links, the plan, the signup switched on, the video. */
const MAYA_BLOCKS: Block[] = [
  { t: "Join Saturday Run Club", s: "storelib.com/c/saturday-run-club", Icon: Users, clicks: "842" },
  { t: "Book a 1:1 gait review", s: "Booking form", Icon: Calendar, clicks: "311" },
  { t: "16-Week Marathon Plan", s: "$39.00", pic: "mr-run", clicks: "1.9k" },
  { t: "Monday training notes", s: "Lead capture form", Icon: Mail, off: true },
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

function OpeProfile() {
  return (
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
  )
}

export function OnePageEditorMock() {
  return (
    <div className="bm ope">
      <HomeOnePageStyle />
      <div className="bm-desk">
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
              <Globe /> Share your OnePage
            </span>
          </span>
        </div>
        <div className="ope-panel">
          <OpeProfile />
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
              {/* Maya's page in Lagoon, a theme the picker ships, drawn by the picker's own ThemePreview; her signup appears as it is switched on. */}
              <HomeOnePage theme="lagoon" who={MAYA} className="ope-page" />
            </MockFrame>
          </div>
        </div>
        <Cursor className="ope-cur" />
      </div>
      <div className="bm-phone">
        <div className="opm-bar">
          <ArrowLeft />
          <span className="ope-key">
            <Undo2 />
          </span>
          <span className="ope-key">
            <Redo2 />
          </span>
          <i>Saved</i>
          <span className="ope-key">
            <Share />
          </span>
          <span className="opm-preview">
            <Eye /> Preview
          </span>
        </div>
        <div className="opm-body">
          <OpeProfile />
          <span className="ope-add">Add</span>
          <div className="ope-list">
            {MAYA_BLOCKS.slice(0, 4).map((b) => (
              <OpeBlock key={b.t} b={{ ...b, off: false }} />
            ))}
          </div>
        </div>
        <div className="opm-tabs">
          <b>
            <Link2 />
            Links
          </b>
          <span>
            <Palette />
            Design
          </span>
          <span>
            <ShoppingBag />
            Products
          </span>
          <span>
            <SlidersHorizontal />
            Settings
          </span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Community builder */
const APP_NAV: [string, typeof Home, boolean?][] = [
  ["Dashboard", Home],
  ["Products", Package],
  ["Community", Users, true],
  ["Analytics", Chart],
  ["Orders", Inbox],
  ["Creator Page", LayoutGrid],
  ["Website", Monitor],
  ["OnePage", Link2],
  ["Contacts", Users],
  ["Emails", Mail],
]

const CB_TABS = ["Overview", "Page", "Posts", "Spaces", "Learn", "Calendar", "Members", "Analytics", "Settings"]

type PostRow = { who: string; av: string; space: string; when: string; title: string; text: string; pic?: string; stats: string }
const CB_ROWS: PostRow[] = [
  {
    who: "Hana Okada",
    av: "av-j",
    space: "Glaze recipes",
    when: "1h",
    title: "Speckled oatmeal on B-mix, finally",
    text: "Cone 6, slow cool from 1900°F. The recipe card is in Learn if you want to try it this week.",
    pic: "cm-plates",
    stats: "73 likes · 26 comments",
  },
  {
    who: "Oliver Grant",
    av: "av-f",
    space: "Wheel help",
    when: "4h",
    title: "Walls collapsing past 8 inches",
    text: "Am I throwing too wet? Video of my pull is in the comments.",
    pic: "cm-wheel",
    stats: "18 likes · 14 comments",
  },
]

function CbRow({ r, className = "" }: { r: PostRow; className?: string }) {
  return (
    <span className={`cb-row ${className}`}>
      <Pic n={r.av} w={96} h={96} className="cb-av" />
      <span className="cb-row-main">
        <span className="cb-row-meta">
          <b>{r.who}</b> · {r.space} · {r.when}
        </span>
        <b className="cb-row-t">{r.title}</b>
        <i>{r.text}</i>
        <em>{r.stats}</em>
      </span>
      {r.pic && <Pic n={r.pic} w={640} h={480} className="cb-thumb" />}
      <MoreHorizontal className="cb-more" />
    </span>
  )
}

const NEW_POST: PostRow = {
  who: "Mei Lin",
  av: "av-o",
  space: "Studio news",
  when: "now",
  title: "Glaze night is back: Thursday at 7pm",
  text: "Bring two bisqued pieces and we will glaze together on camera. Oatmeal and a new copper red.",
  pic: "cm-cups",
  stats: "Seen by 96",
}

function CommunityHead() {
  return (
    <>
      <div className="cb-head">
        <ArrowLeft className="cb-back" />
        <Pic n="cm-vases" w={640} h={480} className="cb-logo" />
        <b className="cb-name">Kiln &amp; Clay Collective</b>
        <span className="cb-live">Live</span>
        <span className="cb-view">
          <ExternalLink /> View page
        </span>
      </div>
      <div className="cb-tabs">
        {CB_TABS.map((t) => (
          <span key={t} className={t === "Posts" ? "on" : ""}>
            {t}
            {t === "Members" && <i>1,204</i>}
          </span>
        ))}
      </div>
    </>
  )
}

export function CommunityBuilderMock() {
  return (
    <div className="bm cb">
      <div className="bm-desk">
        <div className="cb-appbar">
          <StorelibTile />
          <b>Storelib</b>
          <span className="cb-biz">
            Mei Lin Ceramics <ChevronDown />
          </span>
          <span className="cb-search">
            <Search /> Search
          </span>
          <Pic n="av-o" w={160} h={160} className="cb-me" />
        </div>
        <nav className="cb-rail">
          {APP_NAV.map(([label, Icon, on]) => (
            <span key={label} className={on ? "on" : ""}>
              <Icon /> {label}
            </span>
          ))}
        </nav>
        <div className="cb-main">
          <CommunityHead />
          <div className="cb-composer">
            <span className="cb-who">
              <Pic n="av-o" w={160} h={160} className="cb-av" />
              <b>Mei Lin</b>
              <span className="cb-space">
                Studio news <ChevronDown />
              </span>
            </span>
            <span className="cb-title">
              <span>Glaze night is back: Thursday at 7pm</span>
              <i className="cb-type" />
            </span>
            <p className="cb-text">
              Bring two bisqued pieces and we will glaze together on camera. I will demo the oatmeal and a new copper red, then answer
              questions live.
            </p>
            <span className="cb-attach">
              <Pic n="cm-cups" w={800} h={600} />
              <Pic n="cm-vases" w={640} h={480} />
            </span>
            <span className="cb-foot">
              <ImageIcon />
              <Paperclip />
              <BarChart3 />
              <Smile />
              <span className="cb-draft">Save draft</span>
              <span className="cb-post">Post</span>
            </span>
          </div>
          <div className="cb-list">
            <span className="cb-list-head">
              <span className="cb-filter">
                <b>All posts</b>
                <span>Pinned</span>
                <span>Removed</span>
              </span>
              <span className="cb-find">
                <Search /> Search posts
              </span>
            </span>
            <div className="cb-rows">
              <CbRow r={NEW_POST} className="cb-new" />
              <div className="cb-after">
                {CB_ROWS.map((r) => (
                  <CbRow key={r.who} r={r} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <span className="cb-toast">
          <Check /> Posted to Studio news
        </span>
        <Cursor className="cb-cur" />
      </div>
      <div className="bm-phone">
        <div className="cbm-appbar">
          <StorelibTile />
          <b>Storelib</b>
          <Pic n="av-o" w={160} h={160} className="cb-me" />
        </div>
        <div className="cbm-main">
          <CommunityHead />
          <span className="cbm-compose">
            <Pic n="av-o" w={160} h={160} className="cb-av" />
            Share something...
          </span>
          <div className="cb-list">
            <CbRow r={NEW_POST} />
            {CB_ROWS.map((r) => (
              <CbRow key={r.who} r={r} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ styles */
const T = 8.4 // seconds per scripted moment; the tabs advance after one

export const BUILDER_DURATION_MS = T * 1000

export const BUILDER_CSS = u(`
.bm{position:absolute;inset:0;background:#fff;color:#1a1a2e;font-family:var(--font-inter,Inter),Inter,sans-serif;font-size:13u;--bm-t:${T}s;--bm-ease:cubic-bezier(.45,0,.2,1)}
.bm svg{width:16u;height:16u}
.bm-frame>.smk{--w:1280}
.bm-phone{display:none}
.bm-desk,.bm-phone{position:absolute;inset:0}
.bm-cursor{position:absolute;z-index:30;width:22u!important;height:22u!important;opacity:0;filter:drop-shadow(0 2u 3u rgba(0,0,0,.25));pointer-events:none}
.bm-logo{flex:none;display:block;width:28u;height:28u;border-radius:8u;overflow:hidden}
@media (max-width:767px){
  .bm-frame>.smk{--w:390}
  .bm-desk{display:none}
  .bm-phone{display:block}
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
.wx-name{margin-left:2u;font-size:14u;font-weight:500}
.wx-live{width:8u;height:8u;border-radius:50%;background:#10b981}
.wx-mode{display:flex;gap:2u;margin-left:6u;padding:2u;border-radius:999u;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1u rgba(255,255,255,.1)}
.wx-mode>*{display:flex;align-items:center;gap:6u;height:28u;padding:0 10u;border-radius:999u;color:rgba(255,255,255,.55);font-size:12.5u;font-weight:500}
.wx-mode b{color:#fff;background:rgba(139,86,250,.25);box-shadow:inset 0 0 0 1u rgba(139,86,250,.6),0 0 18u -4u rgba(139,86,250,.7)}
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
.wx-ring{position:absolute;left:0;right:0;border-radius:4u;box-shadow:inset 0 0 0 2u #3b82f6;pointer-events:none}
.wx-ring em{position:absolute;right:8u;bottom:8u;padding:5u 7u;border-radius:6u;background:#3b82f6;color:#fff;font-size:11u;font-style:normal;font-weight:600;line-height:1;box-shadow:0 1u 4u rgba(0,0,0,.18)}
.wx-ring-a{top:62.8u;height:390u}
.wx-ring-b{top:452.8u;bottom:0;opacity:0}
.wx-toast{position:absolute;left:50%;bottom:24u;display:flex;align-items:center;gap:8u;padding:10u 16u;border-radius:999u;background:#171717;color:#fff;font-size:12.5u;font-weight:500;white-space:nowrap;transform:translateX(-50%);opacity:0;box-shadow:0 12u 30u rgba(0,0,0,.25)}
.wx-toast svg{width:14u;height:14u;color:#34d399}
.wx-cur{left:156u;top:274u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-cur{animation:sxk-wx-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-hl-a .wx-row-on,[data-mock-live] .wx-ring-a{animation:sxk-wx-a var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-hl-b .wx-row-on,[data-mock-live] .wx-ring-b{animation:sxk-wx-b var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-publish{animation:sxk-wx-press var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .wx-toast{animation:sxk-wx-toast var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-wx-cur{0%{opacity:0;transform:translate(520u,120u)}6%{opacity:1}22%{transform:none}24%{transform:scale(.86)}26%{transform:none}31%{transform:none}50%{transform:translate(1060u,-252u)}52%{transform:translate(1060u,-252u) scale(.86)}54%,66%{opacity:1;transform:translate(1060u,-252u)}74%,100%{opacity:0;transform:translate(1060u,-252u)}}
@keyframes sxk-wx-a{0%,23%{opacity:1}26%,94%{opacity:0}100%{opacity:1}}
@keyframes sxk-wx-b{0%,23%{opacity:0}26%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-wx-press{0%,51%{transform:none}52.5%{transform:scale(.94)}54%,100%{transform:none}}
@keyframes sxk-wx-toast{0%,54%{opacity:0;transform:translate(-50%,10u)}58%,84%{opacity:1;transform:translate(-50%,0)}90%,100%{opacity:0;transform:translate(-50%,10u)}}

/* website builder, phone */
.wxm-bar{position:absolute;inset:0 0 auto;height:58u;display:flex;align-items:center;gap:8u;padding:0 12u;background:#171717}
.wxm-key{display:grid;place-items:center;width:40u;height:40u;border-radius:11u;background:rgba(255,255,255,.08);color:rgba(255,255,255,.85);box-shadow:inset 0 1u 0 rgba(255,255,255,.08),0 1u 2u rgba(0,0,0,.4)}
.wxm-key svg{width:18u;height:18u}
.wxm-key.on{background:rgba(139,86,250,.24);color:#c4a8ff}
.wxm-div{width:1u;height:20u;background:rgba(255,255,255,.12)}
.wxm-ask{width:40u;height:40u;border-radius:11u}
.wxm-push{margin-left:auto}
.wxm-pub{background:#8b56fa;color:#fff}
.wxm-canvas{position:absolute;left:0;right:0;top:58u;height:330u;overflow:hidden;background:#fbf7f1}
.wxm-site{color:#2b2a26}
.wxm-nav{display:flex;align-items:center;justify-content:space-between;height:50u;padding:0 18u;border-bottom:1u solid #ece4d8}
.wxm-nav span{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-style:italic;font-size:19u;color:#3f5a45}
.wxm-nav i{position:relative;width:18u;height:12u;border-block:2u solid #2b2a26}
.wxm-nav i::after{content:"";position:absolute;left:0;right:0;top:3u;height:2u;background:#2b2a26}
.wxm-hero{padding:18u 18u 14u}
.wxm-hero p{font-size:10.5u;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#c8694a}
.wxm-hero h4{margin:6u 0 0;font-family:"Iowan Old Style",Palatino,Georgia,serif;font-weight:400;font-size:32u;line-height:1.02}
.wxm-hero h4 i{color:#3f5a45}
.wxm-hero span{display:inline-block;margin-top:12u;padding:10u 16u;border-radius:999u;background:#3f5a45;color:#fff;font-size:13u;font-weight:600}
.wxm-img{height:160u!important;margin:0 18u;width:calc(100% - 36u)!important;border-radius:16u}
.wxm-ring{top:50u;height:280u}
.wxm-sheet{position:absolute;left:0;right:0;bottom:0;height:262u;padding:8u 14u 0;border-radius:20u 20u 0 0;background:#fff;box-shadow:0 -10u 30u rgba(16,24,40,.14)}
.wxm-grab{display:block;width:40u;height:5u;margin:0 auto 10u;border-radius:3u;background:#d4d4d8}
.wxm-sheet .wx-row{height:40u}
.wxm-sheet .wx-row b{font-size:15u}

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
.ope-socials em{display:grid;place-items:center;width:28u;height:28u;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1u rgba(17,17,19,.1),0 1u 2u rgba(17,17,19,.06);font-size:9.5u;font-style:normal;font-weight:700}
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
.ope-stage{position:absolute;right:0;top:60u;bottom:0;width:410u;border-left:1u solid #e5e7eb;background:linear-gradient(135deg,#f3f4f6,#f9fafb,#f3f4f6)}
.ope-phone{position:absolute;left:51.5u;top:56u;width:307u;padding:10u;border-radius:46u;background:#1a1a1a;box-shadow:0 25u 50u -12u rgba(0,0,0,.25)}
.ope-screen{border-radius:36u}
.ope-cur{left:672u;top:654u}
.ope-page{position:absolute!important;inset:0}
/* Until the signup is switched on: hidden, and the block under it up in its place (158px is the signup and the gap under it, on the page at 390). */
.ope-phone [data-tp-news]{opacity:0}
.ope-phone [data-tp-news]~*{transform:translateY(-158px)}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-cur{animation:sxk-op-cur var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw b{animation:sxk-op-knob var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-sw-on,[data-mock-live] .ope-phone [data-tp-news]{animation:sxk-op-on var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-off .ope-face{animation:sxk-op-face var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-phone [data-tp-news]~*{animation:sxk-op-after var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-saved{animation:sxk-op-saved var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .ope-dirty{animation:sxk-op-dirty var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-op-cur{0%{opacity:0;transform:translate(-300u,-200u)}6%{opacity:1}24%{transform:none}26%{transform:scale(.86)}28%,34%{transform:none}52%{transform:translate(347u,-624u)}54%{transform:translate(347u,-624u) scale(.86)}56%,66%{opacity:1;transform:translate(347u,-624u)}74%,100%{opacity:0;transform:translate(347u,-624u)}}
@keyframes sxk-op-knob{0%,25%{transform:none}29%,94%{transform:translateX(16u)}100%{transform:none}}
@keyframes sxk-op-on{0%,25%{opacity:0}30%,94%{opacity:1}100%{opacity:0}}
@keyframes sxk-op-face{0%,25%{opacity:.5}30%,94%{opacity:1}100%{opacity:.5}}
@keyframes sxk-op-after{0%,27%{transform:translateY(-158px)}36%,94%{transform:none}100%{transform:translateY(-158px)}}
@keyframes sxk-op-saved{0%,26%{opacity:.6}28%,54%{opacity:0}57%,100%{opacity:.6}}
@keyframes sxk-op-dirty{0%,26%{opacity:0}28%,54%{opacity:1}57%,100%{opacity:0}}

/* OnePage editor, phone */
.opm-bar{position:absolute;inset:0 0 auto;height:52u;display:flex;align-items:center;gap:6u;padding:0 12u;border-bottom:1u solid #e5e7eb;background:#fff}
.opm-bar>svg{width:18u;height:18u;color:#6b7280;margin-right:4u}
.opm-bar i{flex:1;text-align:center;font-size:12u;font-style:normal;font-weight:500;color:#6b7280}
.opm-preview{display:flex;align-items:center;gap:4u;height:32u;padding:0 10u;border-radius:8u;background:#111827;color:#fff;font-size:13u;font-weight:500}
.opm-preview svg{width:15u;height:15u}
.opm-body{position:absolute;left:0;right:0;top:52u;bottom:84u;padding:16u;display:flex;flex-direction:column;gap:16u;overflow:hidden}
.opm-body .ope-profile{padding-bottom:14u}
.opm-body .ope-list{margin-top:0}
.opm-body .ope-stats{display:none}
.opm-tabs{position:absolute;left:0;right:0;bottom:0;height:84u;display:grid;grid-template-columns:repeat(4,1fr);gap:8u;padding:9u 16u 0;border-top:1u solid #e5e7eb;background:#fff}
.opm-tabs>*{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5u;height:54u;border-radius:12u;border:1u solid #e3e4e8;font-size:11.5u;font-weight:500;color:#6b7280}
.opm-tabs svg{width:18u;height:18u}
.opm-tabs b{background:#1a1a2e;border-color:#1a1a2e;color:#fff}

/* ---------- community builder */
.cb{background:#f8f9fa}
.cb-appbar{position:absolute;inset:0 0 auto;height:58u;display:flex;align-items:center;gap:10u;padding:0 20u;background:#131316;color:#fff}
.cb-appbar>b{font-size:16u;font-weight:700}
.cb-biz{display:flex;align-items:center;gap:6u;margin-left:14u;height:32u;padding:0 12u;border-radius:8u;background:rgba(255,255,255,.08);font-size:13u;color:rgba(255,255,255,.85)}
.cb-biz svg{width:13u;height:13u}
.cb-search{display:flex;align-items:center;gap:8u;width:300u;height:34u;margin:0 auto;padding:0 12u;border-radius:9u;background:rgba(255,255,255,.08);font-size:13u;color:rgba(255,255,255,.5)}
.cb-search svg{width:14u;height:14u}
.cb-me{width:32u!important;height:32u!important;border-radius:50%}
.cb-rail{position:absolute;left:0;top:58u;bottom:0;width:240u;padding:14u 12u;border-right:1u solid #ececec;background:#fff;display:flex;flex-direction:column;gap:2u}
.cb-rail span{display:flex;align-items:center;gap:12u;height:38u;padding:0 12u;border-radius:10u;font-size:14u;font-weight:500;color:#4b5563}
.cb-rail svg{width:18u;height:18u;color:#6b7280}
.cb-rail span.on{background:#f1f2f4;color:#1a1a2e;font-weight:600}
.cb-rail span.on svg{color:#1a1a2e}
.cb-main{position:absolute;left:240u;right:0;top:58u;bottom:0;padding:10u 32u 0;overflow:hidden}
.cb-head{display:flex;align-items:center;gap:12u;height:60u}
.cb-back{width:20u!important;height:20u!important;color:#1a1a2e}
.cb-logo{width:36u!important;height:36u!important;border-radius:10u}
.cb-name{font-size:22u;font-weight:700}
.cb-live{padding:3u 9u;border-radius:999u;background:#ecfdf3;color:#067647;font-size:12u;font-weight:600;box-shadow:inset 0 0 0 1u #abefc6}
.cb-view{display:flex;align-items:center;gap:7u;margin-left:auto;height:36u;padding:0 14u;border-radius:10u;background:#fff;border:1u solid #d9dbe0;font-size:13.5u;font-weight:500;box-shadow:inset 0 -2u 0 rgba(0,0,0,.05)}
.cb-view svg{width:15u;height:15u}
.cb-tabs{display:flex;gap:2u;padding-bottom:8u;white-space:nowrap;overflow:hidden}
.cb-tabs span{display:flex;align-items:center;gap:6u;height:36u;padding:0 14u;border-radius:10u;font-size:14u;font-weight:500;color:#4b5563}
.cb-tabs span.on{background:#e6e8ec;color:#1a1a2e;box-shadow:0 1u 2u rgba(16,18,27,.06),inset 0 0 0 1u rgba(16,18,27,.04)}
.cb-tabs i{font-style:normal;color:#9ca3af}
.cb-composer,.cb-list{border-radius:16u;background:#fff;box-shadow:0 0 0 1u rgba(229,231,235,.8),0 1u 2u rgba(16,24,40,.04)}
.cb-composer{position:relative;margin-top:8u;padding:16u 18u}
.cb-who{display:flex;align-items:center;gap:10u;font-size:14u}
.cb-av{width:36u!important;height:36u!important;border-radius:50%}
.cb-space{display:flex;align-items:center;gap:5u;height:28u;padding:0 10u;border-radius:8u;background:#f3f4f6;font-size:12.5u;font-weight:500;color:#374151}
.cb-space svg{width:13u;height:13u}
.cb-title{position:relative;display:block;margin-top:12u;height:30u;overflow:hidden;font-size:20u;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
.cb-type{position:absolute;inset:0 -4u 0 0;background:#fff;transform:translateX(100%)}
.cb-type::before{content:"";position:absolute;left:1u;top:4u;bottom:4u;width:2u;background:#1a1a2e}
.cb-text{margin-top:4u!important;font-size:14u;line-height:1.55;color:#4b5563}
.cb-attach{display:flex;gap:8u;margin-top:12u}
.cb-attach img{width:120u!important;height:84u!important;border-radius:10u}
.cb-foot{display:flex;align-items:center;gap:16u;margin-top:14u;padding-top:12u;border-top:1u solid #f1f2f4;color:#6b7280}
.cb-foot svg{width:18u;height:18u}
.cb-draft{margin-left:auto;font-size:13.5u;font-weight:500;color:#374151}
.cb-post{display:grid;place-items:center;width:78u;height:36u;border-radius:10u;background:#1a1a2e;color:#fff;font-size:14u;font-weight:600;box-shadow:inset 0 1u 0 rgba(255,255,255,.14),0 1u 2u rgba(16,24,40,.25)}
.cb-list{margin-top:16u;overflow:hidden}
.cb-list-head{display:flex;align-items:center;justify-content:space-between;padding:10u 14u;border-bottom:1u solid #f1f2f4}
.cb-filter{display:flex;gap:2u}
.cb-filter>*{height:30u;display:grid;place-items:center;padding:0 12u;border-radius:8u;font-size:13u;font-weight:500;color:#6b7280}
.cb-filter b{background:#f1f2f4;color:#1a1a2e}
.cb-find{display:flex;align-items:center;gap:7u;width:220u;height:32u;padding:0 10u;border-radius:8u;box-shadow:inset 0 0 0 1u #e5e7eb;font-size:13u;color:#9ca3af}
.cb-find svg{width:14u;height:14u}
.cb-rows{position:relative}
.cb-rows .cb-row{height:112u;overflow:hidden}
.cb-row{display:flex;gap:12u;padding:14u 16u 14u 18u;border-bottom:1u solid #f1f2f4;background:#fff}
.cb-row-main{flex:1;display:grid;gap:2u;min-width:0}
.cb-row-meta{font-size:12.5u;color:#6b7280}
.cb-row-meta b{color:#1a1a2e;font-weight:500}
.cb-row-t{font-size:15u;font-weight:600}
.cb-row i{font-size:14u;font-style:normal;line-height:1.4;color:#4b5563}
.cb-row em{margin-top:4u;font-size:12u;font-style:normal;color:#9ca3af}
.cb-thumb{flex:none;width:96u!important;height:72u!important;border-radius:10u}
.cb-more{flex:none;color:#9ca3af}
.cb-new{position:relative;z-index:1;background:#fcfbff}
.cb-toast{position:absolute;z-index:20;left:0;right:0;bottom:26u;width:max-content;margin:0 auto;display:flex;align-items:center;gap:8u;padding:10u 16u;border-radius:999u;background:#1a1a2e;color:#fff;font-size:12.5u;font-weight:500;opacity:0;box-shadow:0 12u 30u rgba(0,0,0,.2)}
.cb-toast svg{width:14u;height:14u;color:#4ade80}
.cb-cur{left:1170u;top:452u}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cb-type{animation:sxk-cb-type var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cb-post{animation:sxk-cb-press var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cb-new{animation:sxk-cb-new var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cb-after{animation:sxk-cb-after var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cb-toast{animation:sxk-cb-toast var(--bm-t) var(--bm-ease) infinite both}}
@media(prefers-reduced-motion:no-preference){[data-mock-live] .cb-cur{animation:sxk-cb-cur var(--bm-t) var(--bm-ease) infinite both}}
@keyframes sxk-cb-type{0%,5%{transform:none;animation-timing-function:steps(36,end)}27%,100%{transform:translateX(100%)}}
@keyframes sxk-cb-press{0%,33%{transform:none}35%{transform:scale(.93)}38%,100%{transform:none}}
@keyframes sxk-cb-new{0%,37%{opacity:0;transform:translateY(-10u)}47%,93%{opacity:1;transform:none}100%{opacity:0;transform:none}}
@keyframes sxk-cb-after{0%,37%{transform:translateY(-112u)}48%,93%{transform:none}100%{transform:translateY(-112u)}}
@keyframes sxk-cb-toast{0%,42%{opacity:0;transform:translateY(8u)}47%,78%{opacity:1;transform:none}84%,100%{opacity:0;transform:translateY(8u)}}
@keyframes sxk-cb-cur{0%{opacity:0;transform:translate(-260u,-180u)}6%{opacity:1}30%{transform:none}34%{transform:scale(.86)}37%,58%{opacity:1;transform:none}68%,100%{opacity:0;transform:translate(120u,90u)}}

/* community builder, phone */
.cbm-appbar{position:absolute;inset:0 0 auto;height:54u;display:flex;align-items:center;gap:10u;padding:0 16u;background:#111;color:#fff}
.cbm-appbar>b{flex:1;font-size:16u;font-weight:700}
.cbm-main{position:absolute;left:0;right:0;top:54u;bottom:0;padding:4u 14u 0;overflow:hidden}
.cbm-main .cb-head{height:56u;gap:10u}
.cbm-main .cb-name{font-size:18u}
.cbm-main .cb-view,.cbm-main .cb-back{display:none}
.cbm-main .cb-tabs span{padding:0 12u}
.cbm-compose{display:flex;align-items:center;gap:10u;height:56u;margin-top:6u;padding:0 14u;border-radius:16u;background:#fff;box-shadow:0 0 0 1u #e5e7eb;font-size:14u;color:#9ca3af}
.cbm-main .cb-list{margin-top:12u}
.cbm-main .cb-thumb{width:64u!important;height:64u!important}
.cbm-main .cb-row{padding:12u}
.cbm-main .cb-more{display:none}
`)
