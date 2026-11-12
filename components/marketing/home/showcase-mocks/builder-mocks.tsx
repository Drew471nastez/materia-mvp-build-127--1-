import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  Eye,
  GraduationCap,
  GripVertical,
  Hash,
  Heart,
  ImageIcon,
  LayoutList,
  LayoutTemplate,
  Mail,
  MessageCircle,
  Monitor,
  MoreHorizontal,
  Palette,
  Plus,
  Quote,
  Redo2,
  Search,
  Settings,
  Share2,
  Smartphone,
  Type,
  Undo2,
  User,
  Users,
  X,
} from "lucide-react"
import { MockFrame, Pic, u } from "./frame"
import { OnePagePhone } from "./onepage-mock"
import { PostCard } from "./community-mock"

/*
  INSIDE STORELIB'S BUILDERS, SIMPLIFIED.
  Faithful to the real editors' shapes (components/website-builder: dark 48px
  bar, section tree, canvas on #eef1f5, inspector; components/onepage: icon
  rail Profile/Theme/Blocks/Socials/Leads/Settings beside a live phone;
  components/community/creator: the bar, the compact row of tabs with the
  current one filled, the composer), each with one gentle scripted moment.

  Motion is CSS keyframes on transform and opacity only. The resting styles
  ARE the finished state, so with reduced motion (or before the animation
  starts) every mock is a complete, still picture. Keyframes are scoped to
  [data-mock-live] so only the visible panel animates.
  Desktop is drawn at 1280 design px; on screens under 768px each mock
  switches to a 440px phone layout (the editors' own mobile shapes).
*/

function Cursor({ className }: { className: string }) {
  return (
    <svg className={`bm-cursor ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 2.5 19.5 12l-7 1.6-3.6 6.9z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

/* ================================================================ Website builder */
const TREE_TOP = ["Announcement bar", "Header"]
const TREE_AFTER = ["Curriculum", "Instructor", "Newsletter"]

function SectionThumb({ kind }: { kind: "quote" | "faq" | "split" | "list" }) {
  return (
    <span className={`wb-thumb wb-thumb-${kind}`}>
      {kind === "quote" ? (
        <>
          <i />
          <i />
          <i />
        </>
      ) : kind === "faq" ? (
        <>
          <b />
          <b />
          <b />
        </>
      ) : kind === "split" ? (
        <>
          <em />
          <s />
        </>
      ) : (
        <>
          <b />
          <b />
        </>
      )}
    </span>
  )
}

function BloomPage() {
  return (
    <div className="wbp">
      <div className="wbp-nav">
        <span className="bb-logo">Brush &amp; Bloom</span>
        <span className="wbp-links">
          <span>Courses</span>
          <span>Workshops</span>
          <span>Journal</span>
        </span>
        <span className="wbp-btn sm">Enroll</span>
      </div>
      <div className="wbp-hero">
        <div>
          <p className="wbp-eyebrow">Online course</p>
          <h3>
            Loose florals,
            <br />
            <i>in 21 days.</i>
          </h3>
          <p className="wbp-sub">42 short lessons, tracing sheets and a private studio community.</p>
          <span className="wbp-btn">Enroll · $129</span>
        </div>
        <div className="wbp-img">
          <Pic n="bb-hero" w={1200} h={700} />
        </div>
        <span className="wb-sel wb-sel-a">
          <em>Hero</em>
        </span>
      </div>
      <div className="wbp-line" />
      <div className="wbp-strip">
        <p className="wbp-strip-h">Loved by 2,140 painters</p>
        <div className="wbp-quotes">
          {[
            ["av-h", "Ines D.", "I finally paint loosely instead of tracing every petal."],
            ["av-c", "Rachel P.", "Short lessons I could fit into lunch breaks. Worth it."],
            ["av-n", "Amara K.", "The mixing greens lesson alone changed my palette."],
          ].map(([av, who, q]) => (
            <span key={who}>
              <b>
                <Pic n={av} w={96} h={96} /> {who}
              </b>
              {q}
            </span>
          ))}
        </div>
        <span className="wb-sel wb-sel-b">
          <em>Testimonials</em>
        </span>
      </div>
      <div className="wbp-after">
        <p className="wbp-mods-h">What you’ll paint</p>
        <div className="wbp-mods">
          {[
            ["bb-brush", "Mixing greens"],
            ["bb-table", "Three-stroke petals"],
            ["bb-bouquet", "A full bouquet"],
          ].map(([n, t]) => (
            <span key={n}>
              <Pic n={n} w={640} h={480} />
              {t}
            </span>
          ))}
        </div>
        <div className="wbp-teacher">
          <Pic n="av-o" w={160} h={160} />
          <span>
            <b>Hi, I’m Elena.</b>
            I have taught watercolor for twelve years, in studios in Bath and now online. This course is the one I wish I had when I
            started.
          </span>
        </div>
      </div>
    </div>
  )
}

export function WebsiteBuilderMock() {
  return (
    <div className="bm wb">
      <div className="wb-bar">
        <span className="wb-x">
          <X />
        </span>
        <span className="wb-site">
          <i>B</i> Brush &amp; Bloom <ChevronDown />
        </span>
        <span className="wb-page">
          Home <ChevronDown />
        </span>
        <span className="wb-device">
          <b>
            <Monitor />
          </b>
          <span>
            <Smartphone />
          </span>
        </span>
        <span className="wb-undo">
          <Undo2 />
          <Redo2 />
        </span>
        <span className="wb-preview">Preview</span>
        <span className="wb-publish">Publish</span>
      </div>
      <aside className="wb-tree">
        <p className="wb-tree-h">Home page</p>
        <p className="wb-group">Header</p>
        {TREE_TOP.map((t) => (
          <span className="wb-row" key={t}>
            <GripVertical />
            <LayoutTemplate /> {t}
          </span>
        ))}
        <p className="wb-group">Template</p>
        <span className="wb-row">
          <GripVertical />
          <ImageIcon /> Hero
        </span>
        <span className="wb-row">
          <GripVertical />
          <GraduationCap /> Featured course
        </span>
        <span className="wb-row wb-row-new on">
          <GripVertical />
          <Quote /> Testimonials <Eye className="wb-eye" />
        </span>
        <div className="wb-row-after">
          {TREE_AFTER.map((t) => (
            <span className="wb-row" key={t}>
              <GripVertical />
              <LayoutList /> {t}
            </span>
          ))}
          <span className="wb-add">
            <Plus /> Add section
          </span>
          <p className="wb-group">Footer</p>
          <span className="wb-row">
            <GripVertical />
            <LayoutTemplate /> Footer
          </span>
        </div>
      </aside>
      <div className="wb-canvas">
        <div className="wb-pageframe">
          <MockFrame w={640} ratio="640/760" label="" className="wb-pagemock">
            <BloomPage />
          </MockFrame>
        </div>
      </div>
      <aside className="wb-ins">
        <div className="wb-ins-a">
          <p className="wb-ins-h">
            Hero <MoreHorizontal />
          </p>
          <label>Heading</label>
          <span className="wb-field tall">Loose florals, in 21 days.</span>
          <label>Color scheme</label>
          <span className="wb-schemes">
            <i className="on" style={{ background: "#faf6f0" }} />
            <i style={{ background: "#3f4f3d" }} />
            <i style={{ background: "#f1ece3" }} />
            <i style={{ background: "#2b2a26" }} />
          </span>
          <label>Layout</label>
          <span className="wb-seg">
            <b>Image right</b>
            <span>Image left</span>
            <span>Stacked</span>
          </span>
          <label>Image</label>
          <span className="wb-img">
            <Pic n="bb-hero" w={1200} h={700} />
            <span>Change</span>
          </span>
          <label>Animation</label>
          <span className="wb-field">
            Fade up <ChevronDown />
          </span>
        </div>
        <div className="wb-ins-b">
          <p className="wb-ins-h">
            Testimonials <MoreHorizontal />
          </p>
          <label>Heading</label>
          <span className="wb-field">Loved by 2,140 painters</span>
          <label>Quotes</label>
          {[
            ["av-h", "Ines D."],
            ["av-c", "Rachel P."],
            ["av-n", "Amara K."],
          ].map(([av, n]) => (
            <span className="wb-quote" key={n}>
              <GripVertical />
              <Pic n={av} w={96} h={96} /> {n}
            </span>
          ))}
          <label>Card style</label>
          <span className="wb-seg">
            <span>Plain</span>
            <b>Card</b>
            <span>Bubble</span>
          </span>
          <span className="wb-toggle-row">
            Autoplay quotes
            <span className="wb-toggle">
              <i className="wb-track-on" />
              <b className="wb-knob" />
            </span>
          </span>
        </div>
      </aside>
      <div className="wb-pop">
        <p className="wb-pop-h">
          Add section <X />
        </p>
        <span className="wb-search">
          <Search /> Search sections
        </span>
        <span className="wb-chips">
          <b>All</b>
          <span>Social proof</span>
          <span>Text</span>
        </span>
        <div className="wb-tiles">
          <span className="wb-tile wb-tile-hot">
            <SectionThumb kind="quote" />
            Testimonials
          </span>
          <span className="wb-tile">
            <SectionThumb kind="faq" />
            FAQ
          </span>
          <span className="wb-tile">
            <SectionThumb kind="split" />
            Image with text
          </span>
          <span className="wb-tile">
            <SectionThumb kind="list" />
            Curriculum
          </span>
        </div>
      </div>
      <span className="wb-tile wb-ghost">
        <SectionThumb kind="quote" />
        Testimonials
      </span>
      <Cursor className="wb-cur" />
    </div>
  )
}

/* ================================================================ OnePage editor */
const THEMES = [
  ["Linen", "#f3ede4", "#231f1a", "#fffaf2"],
  ["Midnight", "#0f0f10", "#efe7da", "#1b1b1d"],
  ["Sage", "#dbe5d2", "#24301f", "#f4f1e8"],
  ["Citrus", "#ffe9a8", "#3a2a00", "#fff7d6"],
  ["Mono", "#ffffff", "#111111", "#f2f2f2"],
  ["Bloom", "#f6d7de", "#4a1f2b", "#fff1f4"],
] as const

export function OnePageEditorMock() {
  return (
    <div className="bm ope">
      <div className="ope-bar">
        <span className="ope-back">
          <ArrowLeft /> Storelib
        </span>
        <span className="ope-title">OnePage</span>
        <span className="ope-status">
          <span className="ope-saved">
            <Check /> Saved
          </span>
          <span className="ope-saving">Saving…</span>
        </span>
        <span className="ope-tools">
          <Undo2 />
          <Redo2 />
        </span>
        <span className="ope-share">
          <Share2 /> Share
        </span>
        <span className="ope-view">View page</span>
      </div>
      <nav className="ope-rail">
        {(
          [
            [User, "Profile"],
            [Palette, "Theme"],
            [LayoutList, "Blocks"],
            [Share2, "Socials"],
            [Mail, "Leads"],
            [Settings, "Settings"],
          ] as const
        ).map(([Icon, label]) => (
          <span key={label} className={label === "Theme" ? "on" : ""}>
            <Icon />
            {label}
          </span>
        ))}
      </nav>
      <div className="ope-panel">
        <p className="ope-h">Theme</p>
        <p className="ope-sub">Pick a look. Every block stays editable.</p>
        <div className="ope-grid">
          {THEMES.map(([name, bg, ink, card]) => (
            <span className="ope-theme" key={name}>
              <span className="ope-thumb" style={{ background: bg, color: ink }}>
                <i style={{ background: ink }} />
                <b style={{ background: ink }} />
                <s style={{ background: card }} />
                <s style={{ background: card }} />
                <s style={{ background: card }} />
              </span>
              {name}
            </span>
          ))}
          <span className="ope-ring" />
        </div>
        <p className="ope-label">Buttons</p>
        <span className="ope-seg">
          <span>Square</span>
          <b>Rounded</b>
          <span>Pill</span>
        </span>
        <p className="ope-label">Font</p>
        <span className="ope-select">
          <Type /> Space Grotesk <ChevronDown />
        </span>
      </div>
      <div className="ope-stage">
        <div className="ope-phone">
          <MockFrame w={390} ratio="7/15" label="" className="ope-screen">
            <OnePagePhone brand="maya" theme="linen" />
            <div className="ope-dark">
              <OnePagePhone brand="maya" theme="midnight" />
            </div>
          </MockFrame>
        </div>
        <span className="ope-toast">
          <Check /> Midnight applied
        </span>
      </div>
      <Cursor className="ope-cur" />
    </div>
  )
}

/* ================================================================ Community builder */
const FEED = [
  {
    who: "Hana Okada",
    av: "av-j",
    when: "1h",
    space: "glaze-recipes",
    text: "Finally nailed the speckled oatmeal on B-mix. Cone 6, slow cool from 1900°F. Recipe card is in Learn.",
    likes: 73,
    replies: 26,
    faces: ["av-a", "av-c", "av-i"],
  },
  {
    who: "Oliver Grant",
    av: "av-f",
    when: "4h",
    space: "wheel-help",
    text: "Walls keep collapsing past 8 inches. Throwing too wet? Video of my pull in the comments.",
    likes: 18,
    replies: 14,
    faces: ["av-k"],
  },
]

export function CommunityBuilderMock() {
  return (
    <div className="bm cb">
      <div className="cb-bar">
        <ArrowLeft className="cb-back" />
        <span className="cb-logo">K&amp;C</span>
        <span className="cb-name">
          Kiln &amp; Clay Collective <em>Live</em>
        </span>
        <span className="cb-view">View page</span>
        <span className="cb-share">
          <Share2 /> Share
        </span>
      </div>
      <div className="cb-tabs">
        {["Overview", "Page", "Posts", "Spaces", "Learn", "Calendar", "Members", "Analytics", "Settings"].map((t) => (
          <span key={t} className={t === "Posts" ? "on" : ""}>
            {t}
          </span>
        ))}
      </div>
      <div className="cb-composer">
        <span className="cb-space">
          <Hash /> studio-news <ChevronDown />
        </span>
        <span className="cb-title">
          <span>Glaze night is back: Thursday at 7pm</span>
          <i className="cb-type" />
        </span>
        <p className="cb-text">
          Bring two bisqued pieces and we will glaze together on camera. I will demo the oatmeal and a new copper red, then answer
          questions live.
        </p>
        <div className="cb-attach">
          <Pic n="cm-cups" w={800} h={600} />
          <Pic n="cm-vases" w={640} h={480} />
          <span>
            <Plus />
          </span>
        </div>
        <div className="cb-foot">
          <span className="cb-notify">
            <span className="cb-sw">
              <b />
            </span>
            Notify 1,204 members
          </span>
          <span className="cb-sched">
            <Calendar /> Schedule
          </span>
          <span className="cb-post">Post</span>
        </div>
      </div>
      <div className="cb-side">
        <div className="cb-stats">
          <span>
            <i>Members</i>
            <b>1,204</b>
            <em>+38 this week</em>
          </span>
          <span>
            <i>Active today</i>
            <b>312</b>
            <em>26% of members</em>
          </span>
          <span>
            <i>Posts this week</i>
            <b className="cb-num">
              <span className="cb-n0">47</span>
              <span className="cb-n1">48</span>
            </b>
            <em>+9 vs last week</em>
          </span>
        </div>
        <div className="cb-feed">
          <article className="cm-post cb-new">
            <header>
              <Pic n="av-o" w={160} h={160} className="cm-av" />
              <span>
                <b>
                  Mei Lin <small>Owner</small>
                </b>
                <i>
                  Just now · <em style={{ color: "#b4532a" }}>#studio-news</em>
                </i>
              </span>
              <Bell className="cb-bell" />
            </header>
            <p>
              <b>Glaze night is back: Thursday at 7pm</b> Bring two bisqued pieces and we will glaze together on camera.
            </p>
            <div className="cb-new-pics">
              <Pic n="cm-cups" w={800} h={600} />
              <Pic n="cm-vases" w={640} h={480} />
            </div>
            <footer>
              <span className="cb-like">
                <Heart className="cb-h0" />
                <Heart className="cb-h1" fill="#e11d48" color="#e11d48" />
                <span className="cb-l0">0</span>
                <span className="cb-l1">12</span>
              </span>
              <span>
                <MessageCircle /> 3
              </span>
              <span className="cb-seen">
                <Users /> Seen by 96
              </span>
            </footer>
          </article>
          <div className="cb-after">
            {FEED.map((p) => (
              <PostCard key={p.who} p={p} accent="#b4532a" />
            ))}
          </div>
        </div>
      </div>
      <span className="cb-toast">
        <Check /> Posted to #studio-news · 1,204 members notified
      </span>
      <Cursor className="cb-cur" />
    </div>
  )
}

/* ================================================================ styles */
const SERIF = `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Noto Serif",serif`
const T = 8.4 // seconds per scripted moment; the tabs advance after one

export const BUILDER_DURATION_MS = T * 1000

export const BUILDER_CSS = u(`
.bm{position:absolute;inset:0;background:#fff;color:#18181b;font-family:var(--font-inter),Inter,sans-serif;font-size:13u}
.bm-cursor{position:absolute;z-index:30;width:22u;height:22u;opacity:0;filter:drop-shadow(0 2u 3u rgba(0,0,0,.25));pointer-events:none}
.smk:has(.bm){--w:1280}
@media (max-width:767px){.smk:has(.bm){--w:440}}
@media(prefers-reduced-motion:reduce){.bm *{animation:none!important}}
.bm *{animation-duration:${T}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.45,0,.2,1);animation-play-state:paused}
[data-mock-live] .bm *{animation-play-state:running}

/* ---------- website builder */
.wb{--gx:26;--gy:526;--dx:534;--dy:-218;--tx:1148;--ty:-126;background:#eef1f5}
.wb-bar{position:absolute;inset:0 0 auto;height:48u;display:flex;align-items:center;gap:10u;padding:0 12u;background:#171717;color:#fff;font-size:13u}
.wb-bar svg{width:15u;height:15u}
.wb-x{display:grid;place-items:center;width:30u;height:30u;border-radius:8u;color:rgba(255,255,255,.75);border-right:1u solid rgba(255,255,255,.1)}
.wb-site{display:flex;align-items:center;gap:7u;font-weight:600}
.wb-site i{width:22u;height:22u;border-radius:6u;background:#3f4f3d;font-family:${SERIF};font-style:italic;display:grid;place-items:center;font-size:13u}
.wb-page{display:flex;align-items:center;gap:6u;padding:6u 10u;border-radius:8u;background:rgba(255,255,255,.1);color:rgba(255,255,255,.85)}
.wb-device{display:flex;margin:0 auto;padding:3u;border-radius:9u;background:rgba(255,255,255,.08)}
.wb-device>*{display:grid;place-items:center;width:34u;height:26u;border-radius:6u;color:rgba(255,255,255,.6)}
.wb-device b{background:rgba(255,255,255,.16);color:#fff}
.wb-undo{display:flex;gap:12u;color:rgba(255,255,255,.6);padding-right:6u}
.wb-preview{padding:7u 12u;border-radius:8u;color:rgba(255,255,255,.85)}
.wb-publish{padding:7u 14u;border-radius:8u;background:#fff;color:#111;font-weight:600}
.wb-tree{position:absolute;left:0;top:48u;bottom:0;width:260u;padding:14u 10u;background:#fff;border-right:1u solid #e5e7eb;overflow:hidden}
.wb-tree-h{padding:0 8u 10u;font-size:14u;font-weight:600}
.wb-group{padding:10u 8u 4u;font-size:11u;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#9ca3af}
.wb-row{display:flex;align-items:center;gap:7u;height:30u;padding:0 8u;border-radius:7u;font-size:13u;color:#374151}
.wb-row svg{width:14u;height:14u;color:#9ca3af}
.wb-row svg:first-child{width:12u;color:#d1d5db}
.wb-row.on{background:#eef2ff;color:#1e3a8a;font-weight:500}
.wb-row.on svg{color:#3b5bdb}
.wb-eye{margin-left:auto}
.wb-add{display:flex;align-items:center;gap:7u;height:32u;padding:0 8u;color:#3b5bdb;font-weight:500}
.wb-add svg{width:15u;height:15u}
.wb-canvas{position:absolute;left:260u;right:290u;top:48u;bottom:0;overflow:hidden}
.wb-pageframe{position:absolute;left:45u;top:28u;width:640u;border-radius:10u;overflow:hidden;background:#fff;box-shadow:0 1u 2u rgba(16,24,40,.06),0 12u 32u rgba(16,24,40,.1)}
.wb-ins{position:absolute;right:0;top:48u;bottom:0;width:290u;background:#fff;border-left:1u solid #e5e7eb}
.wb-ins>div{position:absolute;inset:0;padding:14u 16u}
.wb-ins-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6u!important;font-size:14u;font-weight:600}
.wb-ins-h svg{width:16u;height:16u;color:#9ca3af}
.wb-ins label{display:block;margin:12u 0 6u;font-size:11.5u;font-weight:500;color:#6b7280}
.wb-field{display:flex;align-items:center;justify-content:space-between;min-height:34u;padding:0 10u;border-radius:8u;box-shadow:inset 0 0 0 1u #e5e7eb;font-size:12.5u}
.wb-field.tall{min-height:52u;align-items:flex-start;padding-top:8u}
.wb-field svg{width:14u;height:14u;color:#9ca3af}
.wb-schemes{display:flex;gap:8u}
.wb-schemes i{width:30u;height:30u;border-radius:8u;box-shadow:inset 0 0 0 1u rgba(0,0,0,.12)}
.wb-schemes i.on{box-shadow:0 0 0 2u #fff,0 0 0 3.5u #3b5bdb}
.wb-seg{display:grid;grid-template-columns:repeat(3,1fr);padding:3u;border-radius:9u;background:#f3f4f6;font-size:11.5u;text-align:center}
.wb-seg>*{padding:6u 0;border-radius:7u;color:#6b7280}
.wb-seg b{background:#fff;color:#111;font-weight:600;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.wb-img{display:flex;align-items:center;gap:10u;font-size:12u;color:#3b5bdb;font-weight:500}
.wb-img img{width:76u!important;height:48u!important;border-radius:7u}
.wb-quote{display:flex;align-items:center;gap:8u;height:34u;margin-bottom:5u;padding:0 8u;border-radius:8u;box-shadow:inset 0 0 0 1u #e5e7eb;font-size:12.5u}
.wb-quote svg{width:12u;height:12u;color:#d1d5db}
.wb-quote img{width:20u!important;height:20u!important;border-radius:50%}
.wb-toggle-row{position:absolute;left:16u;right:16u;top:404u;display:flex;align-items:center;justify-content:space-between;font-size:12.5u}
.wb-toggle{position:relative;width:34u;height:20u;border-radius:10u;background:#d1d5db}
.wb-track-on{position:absolute;inset:0;border-radius:10u;background:#3b5bdb}
.wb-knob{position:absolute;left:3u;top:3u;width:14u;height:14u;border-radius:50%;background:#fff;box-shadow:0 1u 2u rgba(0,0,0,.2);transform:translateX(14u)}
.wb-pop{position:absolute;z-index:20;left:14u;top:404u;width:292u;padding:12u;border-radius:14u;background:#fff;box-shadow:0 0 0 1u rgba(0,0,0,.06),0 18u 40u rgba(16,24,40,.18);opacity:0}
.wb-pop-h{display:flex;justify-content:space-between;align-items:center;height:20u;margin-bottom:10u!important;font-size:13.5u;font-weight:600}
.wb-pop-h svg{width:14u;height:14u;color:#9ca3af}
.wb-search{display:flex;align-items:center;gap:7u;height:34u;padding:0 10u;border-radius:8u;background:#f3f4f6;font-size:12.5u;color:#9ca3af}
.wb-search svg{width:14u;height:14u}
.wb-chips{display:flex;gap:6u;height:26u;margin:10u 0;font-size:11.5u}
.wb-chips>*{display:flex;align-items:center;padding:0 10u;border-radius:999u;box-shadow:inset 0 0 0 1u #e5e7eb;color:#4b5563}
.wb-chips b{background:#111;color:#fff;box-shadow:none;font-weight:500}
.wb-tiles{display:grid;grid-template-columns:repeat(2,130u);gap:8u}
.wb-tile{display:flex;flex-direction:column;gap:5u;width:130u;height:96u;padding:7u;border-radius:10u;background:#fff;box-shadow:inset 0 0 0 1u #e5e7eb;font-size:11.5u;font-weight:500}
.wb-tile-hot{box-shadow:inset 0 0 0 2u #3b5bdb}
.wb-thumb{flex:1;display:flex;gap:4u;align-items:center;justify-content:center;padding:6u;border-radius:6u;background:#f5f2ec}
.wb-thumb i{width:30u;height:34u;border-radius:4u;background:#fff;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.wb-thumb-faq{flex-direction:column;align-items:stretch;justify-content:center;background:#f3f4f6}
.wb-thumb b{display:block;height:8u;border-radius:3u;background:#d8dbe0}
.wb-thumb-list{flex-direction:column;align-items:stretch;background:#eef1ea}
.wb-thumb-list b{height:12u;background:#cfd8c9}
.wb-thumb em{width:42u;height:36u;border-radius:4u;background:#c9b8a4}
.wb-thumb s{flex:1;height:22u;border-radius:3u;background:repeating-linear-gradient(#d8dbe0 0 5u,transparent 5u 9u)}
.wb-ghost{position:absolute;z-index:25;left:calc(var(--gx)*var(--u));top:calc(var(--gy)*var(--u));box-shadow:inset 0 0 0 2u #3b5bdb,0 16u 36u rgba(16,24,40,.24);opacity:0}
.wb-cur{left:calc((var(--gx) + 70)*var(--u));top:calc((var(--gy) + 60)*var(--u));transform:translate(calc(var(--tx)*var(--u)),calc(var(--ty)*var(--u)))}

.wbp{height:100%;background:#faf6f0;color:#2b2a26;font-family:"Plus Jakarta Sans",var(--font-inter),sans-serif;font-size:12u}
.wbp-nav{height:44u;display:flex;align-items:center;gap:20u;padding:0 22u;border-bottom:1u solid #ece4d8}
.wbp-nav .bb-logo{font-family:${SERIF};font-style:italic;font-size:17u;color:#3f4f3d}
.wbp-links{display:flex;gap:14u;color:#6d675c;font-size:11u}
.wbp-btn{display:inline-flex;margin-top:14u;padding:9u 15u;border-radius:999u;background:#3f4f3d;color:#faf6f0;font-size:11.5u;font-weight:600}
.wbp-btn.sm{margin:0 0 0 auto;padding:6u 12u;font-size:10.5u}
.wbp-hero{position:relative;height:236u;display:grid;grid-template-columns:1fr 1fr;gap:22u;align-items:center;padding:0 22u}
.wbp-eyebrow{font-size:9.5u;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c46f4f}
.wbp-hero h3{margin-top:6u!important;font-family:${SERIF};font-weight:400;font-size:31u;line-height:1.05;letter-spacing:-.02em}
.wbp-hero h3 i{color:#5b6e58}
.wbp-sub{margin-top:8u!important;font-size:11.5u;line-height:1.5;color:#6d675c}
.wbp-img{height:188u;border-radius:12u 12u 70u 12u;overflow:hidden}
.wbp-line{position:relative;height:0}
.wbp-line::before{content:"";position:absolute;left:10u;right:10u;top:-1.5u;height:3u;border-radius:2u;background:#3b5bdb;box-shadow:0 0 0 3u rgba(59,91,219,.18)}
.wbp-line{opacity:0}
.wbp-strip{position:relative;height:120u;padding:16u 22u;background:#f1ece3;text-align:center}
.wbp-strip-h{font-family:${SERIF};font-size:18u}
.wbp-quotes{display:grid;grid-template-columns:repeat(3,1fr);gap:10u;margin-top:12u;text-align:left}
.wbp-quotes span{padding:9u;border-radius:9u;background:#fff;font-size:10u;line-height:1.4;color:#6d675c}
.wbp-quotes b{display:flex;align-items:center;gap:5u;margin-bottom:4u;font-size:10u;color:#2b2a26}
.wbp-quotes img{width:16u!important;height:16u!important;border-radius:50%}
.wbp-after{padding:18u 22u}
.wbp-mods-h{font-family:${SERIF};font-size:18u}
.wbp-mods{display:grid;grid-template-columns:repeat(3,1fr);gap:10u;margin-top:10u}
.wbp-mods span{display:grid;gap:6u;font-size:11u;font-weight:600}
.wbp-mods img{height:84u;border-radius:9u}
.wbp-teacher{display:flex;gap:14u;align-items:center;margin-top:18u;padding:14u;border-radius:12u;background:#fff;box-shadow:inset 0 0 0 1u #ece4d8;font-size:11u;line-height:1.5;color:#6d675c}
.wbp-teacher img{flex:none;width:58u!important;height:58u!important;border-radius:50%}
.wbp-teacher b{display:block;font-family:${SERIF};font-weight:400;font-size:16u;color:#2b2a26}
.wb-sel{position:absolute;inset:0;box-shadow:inset 0 0 0 2u #3b5bdb;pointer-events:none}
.wb-sel em{position:absolute;left:0;top:0;padding:2u 7u;border-radius:0 0 6u 0;background:#3b5bdb;color:#fff;font-size:9.5u;font-style:normal;font-weight:600}
.wb-sel-a{opacity:0}
.wb-ins-a{opacity:0}

[data-mock-live] .wb-pop{animation-name:wb-pop}
[data-mock-live] .wb-tile-hot{animation-name:wb-hot}
[data-mock-live] .wb-ghost{animation-name:wb-ghost}
[data-mock-live] .wb-cur{animation-name:wb-cur}
[data-mock-live] .wbp-line{animation-name:wb-line}
[data-mock-live] .wbp-strip,[data-mock-live] .wb-row-new{animation-name:wb-in}
[data-mock-live] .wbp-after{animation-name:wb-after-page}
[data-mock-live] .wb-row-after{animation-name:wb-after-tree}
[data-mock-live] .wb-sel-a,[data-mock-live] .wb-ins-a{animation-name:wb-a}
[data-mock-live] .wb-sel-b,[data-mock-live] .wb-ins-b{animation-name:wb-b}
[data-mock-live] .wb-knob{animation-name:wb-knob}
[data-mock-live] .wb-track-on{animation-name:wb-track}
@keyframes wb-pop{0%{opacity:0;transform:translateY(10u) scale(.98)}6%,38%{opacity:1;transform:none}46%,100%{opacity:0;transform:translateY(10u) scale(.98)}}
@keyframes wb-hot{0%,12%{box-shadow:inset 0 0 0 1u #e5e7eb}16%,46%{box-shadow:inset 0 0 0 2u #3b5bdb}}
@keyframes wb-ghost{0%,19%{opacity:0;transform:none}23%{opacity:1;transform:translate(4u,-6u) rotate(-2deg) scale(1.03)}42%{opacity:1;transform:translate(calc(var(--dx)*var(--u)),calc(var(--dy)*var(--u))) rotate(0) scale(1)}47%,100%{opacity:0;transform:translate(calc(var(--dx)*var(--u)),calc(var(--dy)*var(--u))) scale(.94)}}
@keyframes wb-cur{0%{opacity:0;transform:translate(150u,110u)}6%{opacity:1}16%{transform:none}18%{transform:scale(.86)}20%{transform:none}23%{transform:translate(4u,-6u)}42%,50%{transform:translate(calc(var(--dx)*var(--u)),calc(var(--dy)*var(--u)))}66%{transform:translate(calc(var(--tx)*var(--u)),calc(var(--ty)*var(--u)))}69%{transform:translate(calc(var(--tx)*var(--u)),calc(var(--ty)*var(--u))) scale(.86)}72%,86%{opacity:1;transform:translate(calc(var(--tx)*var(--u)),calc(var(--ty)*var(--u)))}92%,100%{opacity:0;transform:translate(calc(var(--tx)*var(--u)),calc(var(--ty)*var(--u)))}}
@keyframes wb-line{0%,28%{opacity:0}36%,43%{opacity:1}47%,100%{opacity:0}}
@keyframes wb-in{0%,43%{opacity:0;transform:scale(.985)}52%,92%{opacity:1;transform:none}99%,100%{opacity:0;transform:scale(.985)}}
@keyframes wb-after-page{0%,43%{transform:translateY(-120u)}53%,92%{transform:none}100%{transform:translateY(-120u)}}
@keyframes wb-after-tree{0%,43%{transform:translateY(-30u)}53%,92%{transform:none}100%{transform:translateY(-30u)}}
@keyframes wb-a{0%,45%{opacity:1}52%,94%{opacity:0}100%{opacity:1}}
@keyframes wb-b{0%,45%{opacity:0}52%,94%{opacity:1}100%{opacity:0}}
@keyframes wb-knob{0%,68%{transform:none}73%,94%{transform:translateX(14u)}100%{transform:none}}
@keyframes wb-track{0%,68%{opacity:0}73%,94%{opacity:1}100%{opacity:0}}

@media (max-width:767px){
  .wb{--gx:16;--gy:470;--dx:139;--dy:-248;--tx:200;--ty:-120}
  .wb-tree,.wb-ins,.wb-undo,.wb-preview,.wb-page{display:none}
  .wb-device{margin:0 6u 0 auto}
  .wb-canvas{left:0;right:0}
  .wb-pageframe{left:14u;top:14u;width:412u}
  .wb-pop{left:0;right:0;top:400u;width:auto;padding:14u 16u;border-radius:18u 18u 0 0;opacity:1}
  .wb-search{display:none}
  .wb-chips{margin-top:0}
  .wb-tiles{grid-template-columns:repeat(3,130u)}
  [data-mock-live] .wb-pop{animation-name:none}
}

/* ---------- OnePage editor */
.ope{--rx:101;--ry:149;--cx:310;--cy:226;background:#f4f4f5}
.ope-bar{position:absolute;inset:0 0 auto;height:56u;display:flex;align-items:center;gap:14u;padding:0 16u;background:#fff;border-bottom:1u solid #e4e4e7;font-size:13u}
.ope-bar svg{width:15u;height:15u}
.ope-back{display:flex;align-items:center;gap:6u;color:#52525b}
.ope-title{padding-left:14u;border-left:1u solid #e4e4e7;font-weight:600;font-size:14u}
.ope-status{position:relative;width:80u;height:20u;font-size:12u;color:#71717a}
.ope-status>span{position:absolute;inset:0;display:flex;align-items:center;gap:4u}
.ope-saved svg{width:13u;height:13u;color:#16a34a}
.ope-saving{opacity:0}
.ope-tools{display:flex;gap:14u;margin-left:auto;color:#71717a}
.ope-share{display:flex;align-items:center;gap:6u;padding:8u 12u;border-radius:9u;box-shadow:inset 0 0 0 1u #e4e4e7;font-weight:500}
.ope-view{padding:8u 14u;border-radius:9u;background:#18181b;color:#fff;font-weight:600}
.ope-rail{position:absolute;left:0;top:56u;bottom:0;width:76u;display:flex;flex-direction:column;gap:4u;padding:10u 8u;background:#fafafa;border-right:1u solid #e4e4e7}
.ope-rail span{display:flex;flex-direction:column;align-items:center;gap:4u;padding:9u 0;border-radius:10u;font-size:10.5u;color:#71717a}
.ope-rail svg{width:19u;height:19u}
.ope-rail span.on{background:#fff;color:#18181b;font-weight:600;box-shadow:0 1u 3u rgba(0,0,0,.08),inset 0 0 0 1u #e4e4e7}
.ope-panel{position:absolute;left:76u;top:56u;bottom:0;width:470u;padding:28u;background:#fff;border-right:1u solid #e4e4e7}
.ope-h{height:24u;font-size:19u;font-weight:600;letter-spacing:-.02em}
.ope-sub{height:18u;margin:6u 0 20u!important;font-size:13u;color:#71717a}
.ope-grid{position:relative;display:grid;grid-template-columns:repeat(3,128u);gap:14u}
.ope-theme{display:grid;gap:7u;font-size:12.5u;font-weight:500;text-align:center}
.ope-thumb{height:148u;display:flex;flex-direction:column;align-items:center;gap:6u;padding:16u 14u;border-radius:12u;box-shadow:inset 0 0 0 1u rgba(0,0,0,.08)}
.ope-thumb i{width:26u;height:26u;border-radius:50%;opacity:.85}
.ope-thumb b{width:52u;height:6u;border-radius:3u;opacity:.85;margin-bottom:6u}
.ope-thumb s{width:100%;height:16u;border-radius:6u;box-shadow:inset 0 0 0 1u rgba(0,0,0,.06)}
.ope-ring{position:absolute;left:-4u;top:-4u;width:136u;height:156u;border-radius:15u;box-shadow:0 0 0 2.5u #7c3aed;transform:translateX(142u)}
.ope-label{margin:22u 0 8u!important;font-size:12u;font-weight:500;color:#71717a}
.ope-seg{display:grid;grid-template-columns:repeat(3,1fr);padding:3u;border-radius:10u;background:#f4f4f5;font-size:12.5u;text-align:center}
.ope-seg>*{padding:8u 0;border-radius:8u;color:#71717a}
.ope-seg b{background:#fff;color:#18181b;box-shadow:0 1u 2u rgba(0,0,0,.08)}
.ope-select{display:flex;align-items:center;gap:8u;height:40u;padding:0 12u;border-radius:10u;box-shadow:inset 0 0 0 1u #e4e4e7;font-size:13u}
.ope-select svg{width:15u;height:15u;color:#71717a}
.ope-select svg:last-child{margin-left:auto}
.ope-stage{position:absolute;left:546u;right:0;top:56u;bottom:0;background:radial-gradient(#dcdce0 1u,transparent 1.2u) 0 0/18u 18u,#f4f4f5}
.ope-phone{position:absolute;left:50%;top:44u;width:312u;margin-left:-156u;padding:9u;border-radius:46u;background:#111;box-shadow:0 30u 60u rgba(24,24,27,.22)}
.ope-screen{border-radius:38u}
.ope-dark{position:absolute;inset:0}
.ope-toast{position:absolute;left:50%;bottom:28u;display:flex;align-items:center;gap:7u;padding:9u 14u;margin-left:-80u;border-radius:999u;background:#18181b;color:#fff;font-size:12.5u;font-weight:500;opacity:0}
.ope-toast svg{width:14u;height:14u;color:#4ade80}
.ope-cur{left:calc(var(--cx)*var(--u));top:calc(var(--cy)*var(--u))}
[data-mock-live] .ope-ring{animation-name:op-ring}
[data-mock-live] .ope-dark{animation-name:op-dark}
[data-mock-live] .ope-cur{animation-name:op-cur}
[data-mock-live] .ope-saving{animation-name:op-saving}
[data-mock-live] .ope-saved{animation-name:op-saved}
[data-mock-live] .ope-toast{animation-name:op-toast}
@keyframes op-ring{0%,31%{transform:none}37%,93%{transform:translateX(142u)}100%{transform:none}}
@keyframes op-dark{0%,32%{opacity:0}46%,93%{opacity:1}100%{opacity:0}}
@keyframes op-cur{0%{opacity:0;transform:translate(260u,200u)}8%{opacity:1}28%{transform:none}31%{transform:scale(.86)}34%,66%{opacity:1;transform:none}76%,100%{opacity:0;transform:translate(120u,240u)}}
@keyframes op-saving{0%,33%{opacity:0}36%,50%{opacity:1}54%,100%{opacity:0}}
@keyframes op-saved{0%,33%{opacity:1}36%,50%{opacity:0}54%,100%{opacity:1}}
@keyframes op-toast{0%,44%{opacity:0;transform:translateY(8u)}50%,80%{opacity:1;transform:none}86%,100%{opacity:0;transform:translateY(8u)}}

@media (max-width:767px){
  .ope{--cx:220;--cy:520}
  .ope-rail,.ope-tools,.ope-share,.ope-title{display:none}
  .ope-stage{left:0}
  .ope-phone{top:20u;width:236u;margin-left:-118u;border-radius:38u;padding:7u}
  .ope-screen{border-radius:32u}
  .ope-panel{z-index:2;left:0;right:0;top:auto;bottom:0;width:auto;height:228u;padding:14u;border:0;border-radius:20u 20u 0 0;box-shadow:0 -10u 30u rgba(24,24,27,.12)}
  .ope-sub,.ope-label,.ope-seg,.ope-select{display:none}
  .ope-h{height:26u;margin-bottom:10u!important;font-size:16u}
  .ope-toast{top:20u;bottom:auto}
}

/* ---------- community builder */
.cb{--acc:#b4532a;background:#f6f6f7}
.cb-bar{position:absolute;inset:0 0 auto;height:60u;display:flex;align-items:center;gap:12u;padding:0 20u;background:#fff;font-size:13u}
.cb-back{width:18u;height:18u;color:#52525b}
.cb-logo{width:34u;height:34u;border-radius:10u;background:var(--acc);color:#fff;display:grid;place-items:center;font-size:11u;font-weight:800}
.cb-name{display:flex;align-items:center;gap:8u;font-size:15u;font-weight:600}
.cb-name em{padding:2u 8u;border-radius:999u;background:#dcfce7;color:#15803d;font-size:11u;font-style:normal;font-weight:600}
.cb-view{margin-left:auto;padding:8u 12u;border-radius:9u;box-shadow:inset 0 0 0 1u #e4e4e7;font-weight:500}
.cb-share{display:flex;align-items:center;gap:6u;padding:8u 13u;border-radius:9u;background:#18181b;color:#fff;font-weight:600}
.cb-share svg{width:14u;height:14u}
.cb-tabs{position:absolute;left:0;right:0;top:60u;height:48u;display:flex;align-items:center;gap:4u;padding:0 16u;background:#fff;border-bottom:1u solid #e4e4e7;font-size:13u;color:#71717a;white-space:nowrap;overflow:hidden}
.cb-tabs span{padding:7u 12u;border-radius:8u}
.cb-tabs span.on{background:#f0f0f2;color:#18181b;font-weight:600}
.cb-composer{position:absolute;left:24u;top:132u;width:640u;height:452u;padding:18u;border-radius:16u;background:#fff;box-shadow:inset 0 0 0 1u #e4e4e7}
.cb-space{display:inline-flex;align-items:center;gap:6u;height:30u;padding:0 10u;border-radius:8u;background:#fbf3ee;color:var(--acc);font-size:12.5u;font-weight:600}
.cb-space svg{width:13u;height:13u}
.cb-title{position:relative;display:block;margin-top:14u;height:36u;overflow:hidden;font-size:22u;font-weight:600;letter-spacing:-.02em;white-space:nowrap}
.cb-type{position:absolute;inset:0 -4u 0 0;background:#fff;transform:translateX(100%)}
.cb-type::before{content:"";position:absolute;left:1u;top:5u;bottom:5u;width:2u;background:var(--acc)}
.cb-text{margin-top:8u!important;font-size:14u;line-height:1.55;color:#52525b}
.cb-attach{display:flex;gap:10u;margin-top:16u;height:150u}
.cb-attach img{width:200u!important;border-radius:12u}
.cb-attach span{width:110u;border-radius:12u;display:grid;place-items:center;box-shadow:inset 0 0 0 1.5u #e4e4e7;color:#a1a1aa}
.cb-attach svg{width:20u;height:20u}
.cb-foot{position:absolute;left:18u;right:18u;bottom:18u;display:flex;align-items:center;gap:10u;padding-top:14u;border-top:1u solid #f0f0f2;font-size:12.5u}
.cb-notify{display:flex;align-items:center;gap:8u;color:#52525b}
.cb-sw{position:relative;width:32u;height:19u;border-radius:10u;background:var(--acc)}
.cb-sw b{position:absolute;right:2.5u;top:2.5u;width:14u;height:14u;border-radius:50%;background:#fff}
.cb-sched{display:flex;align-items:center;gap:6u;margin-left:auto;padding:10u 13u;border-radius:10u;box-shadow:inset 0 0 0 1u #e4e4e7;font-weight:500}
.cb-sched svg{width:14u;height:14u}
.cb-post{width:84u;height:38u;display:grid;place-items:center;border-radius:10u;background:var(--acc);color:#fff;font-size:13.5u;font-weight:600}
.cb-side{position:absolute;left:688u;right:24u;top:132u;bottom:0}
.cb-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10u}
.cb-stats>span{display:grid;padding:11u 13u;border-radius:13u;background:#fff;box-shadow:inset 0 0 0 1u #e4e4e7}
.cb-stats i{font-size:11.5u;font-style:normal;color:#71717a}
.cb-stats b{font-size:20u;letter-spacing:-.02em}
.cb-stats em{font-size:11u;font-style:normal;color:#16a34a}
.cb-num{position:relative;display:block;height:28u}
.cb-num span{position:absolute;left:0;top:0}
.cb-n0{opacity:0}
.cb-feed{margin-top:12u;display:flex;flex-direction:column;gap:12u}
.cb-after{display:flex;flex-direction:column;gap:12u}
.cb-new{box-shadow:inset 0 0 0 1.5u rgba(180,83,42,.35),0 10u 24u rgba(180,83,42,.08)}
.cb-new header small{margin-left:6u;padding:1u 6u;border-radius:5u;background:#fbf3ee;color:var(--acc);font-size:10u;font-weight:600}
.cb-new>p b{display:block;font-size:14u;color:#18181b}
.cb-bell{width:15u;height:15u}
.cb-new-pics{display:grid;grid-template-columns:1fr 1fr;gap:6u;height:96u;margin-top:10u}
.cb-new-pics img{height:96u!important;min-height:0;border-radius:9u}
.cb-new{height:280u;overflow:hidden}
.cb-like{position:relative;padding-left:20u}
.cb-like svg{position:absolute;left:0}
.cb-like span{position:absolute;left:20u}
.cb-like{min-width:40u}
.cb-h0,.cb-l0{opacity:0}
.cb-toast{position:absolute;z-index:20;left:0;right:0;bottom:26u;width:max-content;margin:0 auto;display:flex;align-items:center;gap:8u;padding:10u 16u;border-radius:999u;background:#18181b;color:#fff;font-size:12.5u;font-weight:500;opacity:0;box-shadow:0 12u 30u rgba(0,0,0,.2)}
.cb-toast svg{width:14u;height:14u;color:#4ade80}
.cb-cur{left:600u;top:524u}
[data-mock-live] .cb-type{animation-name:cb-type}
[data-mock-live] .cb-post{animation-name:cb-press}
[data-mock-live] .cb-new{animation-name:cb-new}
[data-mock-live] .cb-after{animation-name:cb-after}
[data-mock-live] .cb-toast{animation-name:cb-toast}
[data-mock-live] .cb-cur{animation-name:cb-cur}
[data-mock-live] .cb-n0,[data-mock-live] .cb-h0,[data-mock-live] .cb-l0{animation-name:cb-old}
[data-mock-live] .cb-n1{animation-name:cb-num}
[data-mock-live] .cb-h1,[data-mock-live] .cb-l1{animation-name:cb-like}
@keyframes cb-type{0%,5%{transform:none;animation-timing-function:steps(36,end)}27%,100%{transform:translateX(100%)}}
@keyframes cb-press{0%,33%{transform:none}35%{transform:scale(.93)}38%,100%{transform:none}}
@keyframes cb-new{0%,37%{opacity:0;transform:translateY(-14u) scale(.98)}47%,93%{opacity:1;transform:none}100%{opacity:0;transform:none}}
@keyframes cb-after{0%,37%{transform:translateY(-292u)}48%,93%{transform:none}100%{transform:translateY(-292u)}}
@keyframes cb-toast{0%,42%{opacity:0;transform:translateY(-8u)}47%,78%{opacity:1;transform:none}84%,100%{opacity:0;transform:translateY(-8u)}}
@keyframes cb-cur{0%{opacity:0;transform:translate(-200u,-150u)}6%{opacity:1}30%{transform:none}35%{transform:scale(.86)}38%,58%{opacity:1;transform:none}68%,100%{opacity:0;transform:translate(150u,90u)}}
@keyframes cb-old{0%,45%{opacity:1}50%,93%{opacity:0}100%{opacity:1}}
@keyframes cb-num{0%,45%{opacity:0}50%,93%{opacity:1}100%{opacity:0}}
@keyframes cb-like{0%,60%{opacity:0;transform:scale(.6)}66%,93%{opacity:1;transform:none}100%{opacity:0}}

@media (max-width:767px){
  .cb-composer,.cb-view,.cb-cur,.cb-back{display:none}
  .cb-name{font-size:14u}
  .cb-side{left:12u;right:12u;top:120u}
  .cb-stats{grid-template-columns:repeat(2,1fr)}
  .cb-stats>span:first-child{display:none}
  .cb-toast{font-size:11.5u;padding:9u 13u}
}
`)
