import type { CSSProperties } from "react"
import { Bell, Bookmark, Calendar, Hash, Heart, ImageIcon, MessageCircle, Pin, Search, TrendingUp } from "lucide-react"
import { Pic, StatusBar, u } from "./frame"

/*
  Three fictional Storelib communities (desktop 1040 design px, phone 390):
    The Darkroom Club        — film photographers
    Founders After Five      — bootstrapped founders
    Kiln & Clay Collective   — potters
*/
export type CommunityBrand = "darkroom" | "founders" | "kiln"

type Post = {
  who: string
  av: string
  when: string
  space: string
  text: string
  pics?: string[]
  chart?: boolean
  likes: number
  replies: number
  faces: string[]
}

type Community = {
  name: string
  mark: string
  accent: string
  tint: string
  members: string
  online: string
  spaces: [string, number?][]
  posts: Post[]
  event: { day: string; month: string; title: string; meta: string }
  leaders: [string, string, string][]
  me: string
}

const C: Record<CommunityBrand, Community> = {
  darkroom: {
    name: "The Darkroom Club",
    mark: "DC",
    accent: "#d9822b",
    tint: "#fbf4ec",
    members: "2,318",
    online: "142",
    spaces: [["general"], ["critique-corner", 12], ["gear-and-glass", 3], ["darkroom-chem"], ["roll-swap"]],
    posts: [
      {
        who: "Sana Iqbal",
        av: "av-k",
        when: "2h",
        space: "critique-corner",
        text: "First roll through the Pentax since the light seal fix. Portra 400 at box speed, metered for the shadows. Too warm, or does it work?",
        pics: ["lt-street", "lt-field"],
        likes: 48,
        replies: 17,
        faces: ["av-b", "av-h", "av-e"],
      },
      {
        who: "Marco Bellini",
        av: "av-e",
        when: "5h",
        space: "darkroom-chem",
        text: "Stand developing HP5 in Rodinal 1:100 tonight. Agitation notes in the thread if anyone wants them.",
        likes: 21,
        replies: 9,
        faces: ["av-a", "av-f"],
      },
    ],
    event: { day: "14", month: "Nov", title: "Roll swap night", meta: "Thu · 7:00 PM ET · 86 going" },
    leaders: [["Sana Iqbal", "av-k", "1,240"], ["Theo Marsh", "av-l", "980"], ["June Park", "av-j", "915"]],
    me: "av-g",
  },
  founders: {
    name: "Founders After Five",
    mark: "F5",
    accent: "#4f46e5",
    tint: "#f3f3fe",
    members: "4,906",
    online: "311",
    spaces: [["wins", 7], ["hot-seat"], ["growth-and-seo", 4], ["pricing"], ["hiring"]],
    posts: [
      {
        who: "Dana Whitfield",
        av: "av-n",
        when: "38m",
        space: "wins",
        text: "Crossed $10k MRR this morning. 14 months, two of us, no funding. The pricing-page teardown from last month's hot seat paid for itself twice.",
        chart: true,
        likes: 126,
        replies: 41,
        faces: ["av-d", "av-g", "av-m"],
      },
      {
        who: "Ravi Shah",
        av: "av-m",
        when: "3h",
        space: "growth-and-seo",
        text: "Programmatic SEO for a B2B tool: 300 pages, 9 weeks, 18% of signups now. Sharing the exact template structure below.",
        likes: 64,
        replies: 22,
        faces: ["av-b", "av-c"],
      },
    ],
    event: { day: "19", month: "Nov", title: "Weekly hot seat", meta: "Tue · 6:00 PM ET · 142 going" },
    leaders: [["Dana Whitfield", "av-n", "2,410"], ["Ravi Shah", "av-m", "2,055"], ["Lena Ortiz", "av-i", "1,870"]],
    me: "av-d",
  },
  kiln: {
    name: "Kiln & Clay Collective",
    mark: "K&C",
    accent: "#b4532a",
    tint: "#fbf3ee",
    members: "1,204",
    online: "87",
    spaces: [["studio-news", 2], ["works-in-progress", 9], ["glaze-recipes"], ["wheel-help"], ["marketplace"]],
    posts: [
      {
        who: "Hana Okada",
        av: "av-j",
        when: "1h",
        space: "glaze-recipes",
        text: "Finally nailed the speckled oatmeal on B-mix. Cone 6, slow cool from 1900°F. Recipe card is in the Learn tab.",
        pics: ["cm-cups"],
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
    ],
    event: { day: "21", month: "Nov", title: "Glaze night, live", meta: "Thu · 7:00 PM PT · 64 going" },
    leaders: [["Hana Okada", "av-j", "860"], ["Ines Duarte", "av-h", "742"], ["Sam Cole", "av-b", "690"]],
    me: "av-c",
  },
}

/** A small rising MRR line, drawn in SVG. */
function MrrChart() {
  return (
    <div className="cm-chart">
      <span>
        <b>$10,240</b> MRR <em>+12.4%</em>
      </span>
      <svg viewBox="0 0 300 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cmg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4f46e5" stopOpacity=".28" />
            <stop offset="1" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 72 L30 68 L60 66 L90 60 L120 61 L150 50 L180 44 L210 38 L240 26 L270 20 L300 8 L300 80 L0 80Z" fill="url(#cmg)" />
        <path d="M0 72 L30 68 L60 66 L90 60 L120 61 L150 50 L180 44 L210 38 L240 26 L270 20 L300 8" fill="none" stroke="#4f46e5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export function PostCard({ p, accent }: { p: Post; accent: string }) {
  return (
    <article className="cm-post">
      <header>
        <Pic n={p.av} w={96} h={96} className="cm-av" />
        <span>
          <b>{p.who}</b>
          <i>
            {p.when} · <em style={{ color: accent }}>#{p.space}</em>
          </i>
        </span>
        <Bookmark />
      </header>
      <p>{p.text}</p>
      {p.pics && (
        <div className={`cm-pics n${p.pics.length}`}>
          {p.pics.map((n) => (
            <Pic key={n} n={n} w={480} h={600} />
          ))}
        </div>
      )}
      {p.chart && <MrrChart />}
      <footer>
        <span>
          <Heart /> {p.likes}
        </span>
        <span>
          <MessageCircle /> {p.replies}
        </span>
        <span className="cm-faces">
          {p.faces.map((f) => (
            <Pic key={f} n={f} w={96} h={96} />
          ))}
        </span>
      </footer>
    </article>
  )
}

export function CommunityDesktop({ brand }: { brand: CommunityBrand }) {
  const c = C[brand]
  return (
    <div className="cm" style={{ "--acc": c.accent, "--tint": c.tint } as CSSProperties}>
      <nav className="cm-top">
        <span className="cm-logo">
          <i>{c.mark}</i>
          {c.name}
        </span>
        <span className="cm-tabs">
          <b>Feed</b>
          <span>Learn</span>
          <span>Calendar</span>
          <span>Members</span>
          <span>Leaderboard</span>
        </span>
        <span className="cm-search">
          <Search /> Search
        </span>
        <Bell className="cm-bell" />
        <Pic n={c.me} w={96} h={96} className="cm-me" />
      </nav>
      <div className="cm-body">
        <aside className="cm-spaces">
          <p className="cm-h">Spaces</p>
          {c.spaces.map(([s, n], i) => (
            <span key={s} className={i === 0 ? "on" : ""}>
              <Hash /> {s}
              {n ? <em>{n}</em> : null}
            </span>
          ))}
          <p className="cm-h">Upcoming</p>
          <span>
            <Calendar /> {c.event.title}
          </span>
        </aside>
        <main className="cm-feed">
          <div className="cm-compose">
            <Pic n={c.me} w={96} h={96} className="cm-av" />
            <span>Write something…</span>
            <ImageIcon />
          </div>
          <div className="cm-pinned">
            <Pin />
            <span className="cm-date">
              <b>{c.event.day}</b>
              {c.event.month}
            </span>
            <span>
              <b>{c.event.title}</b>
              <i>{c.event.meta}</i>
            </span>
            <em>RSVP</em>
          </div>
          {c.posts.map((p) => (
            <PostCard key={p.who} p={p} accent={c.accent} />
          ))}
        </main>
        <aside className="cm-side">
          <div className="cm-about">
            <div className="cm-cover" />
            <b>{c.name}</b>
            <span className="cm-stat">
              <span>
                <b>{c.members}</b> members
              </span>
              <span>
                <i /> <b>{c.online}</b> online
              </span>
            </span>
            <span className="cm-faces big">
              {["av-a", "av-b", "av-c", "av-d", "av-h"].map((f) => (
                <Pic key={f} n={f} w={96} h={96} />
              ))}
            </span>
            <em className="cm-invite">Invite people</em>
          </div>
          <div className="cm-board">
            <p className="cm-h">
              <TrendingUp /> This week
            </p>
            {c.leaders.map(([n, av, pts], i) => (
              <span key={n}>
                <i>{i + 1}</i>
                <Pic n={av} w={96} h={96} />
                <b>{n}</b>
                <em>{pts}</em>
              </span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

export function CommunityMobile({ brand }: { brand: CommunityBrand }) {
  const c = C[brand]
  return (
    <div className="cm cqm" style={{ "--acc": c.accent, "--tint": c.tint } as CSSProperties}>
      <StatusBar />
      <div className="cqm-head">
        <span className="cm-logo">
          <i>{c.mark}</i>
          <span>
            {c.name}
            <small>
              {c.members} members · {c.online} online
            </small>
          </span>
        </span>
        <Bell />
      </div>
      <div className="cqm-tabs">
        <b>Feed</b>
        <span>Learn</span>
        <span>Calendar</span>
        <span>Members</span>
      </div>
      <div className="cqm-chips">
        {c.spaces.slice(0, 4).map(([s], i) => (
          <span key={s} className={i === 0 ? "on" : ""}>
            #{s}
          </span>
        ))}
      </div>
      <div className="cqm-feed">
        <div className="cm-pinned">
          <span className="cm-date">
            <b>{c.event.day}</b>
            {c.event.month}
          </span>
          <span>
            <b>{c.event.title}</b>
            <i>{c.event.meta}</i>
          </span>
          <em>RSVP</em>
        </div>
        {c.posts.map((p) => (
          <PostCard key={p.who} p={p} accent={c.accent} />
        ))}
      </div>
    </div>
  )
}

export const COMMUNITY_CSS = u(`
.cm{height:100%;background:#f6f6f7;color:#18181b;font-family:var(--font-inter,Inter),Inter,sans-serif}
.cm-top{height:58u;display:flex;align-items:center;gap:26u;padding:0 22u;background:#fff;border-bottom:1u solid #ececef}
.cm-logo{display:flex;align-items:center;gap:10u;font-size:14.5u;font-weight:700;letter-spacing:-.01em}
.cm-logo>i{width:32u;height:32u;border-radius:9u;background:var(--acc);color:#fff;font-style:normal;font-size:11u;font-weight:800;display:grid;place-items:center;letter-spacing:-.02em}
.cm-tabs{display:flex;gap:4u;font-size:13u;color:#6b6b74}
.cm-tabs>*{padding:7u 11u;border-radius:8u}
.cm-tabs b{background:var(--tint);color:var(--acc);font-weight:600}
.cm-search{margin-left:auto;width:190u;display:flex;align-items:center;gap:7u;padding:8u 11u;border-radius:9u;background:#f3f3f5;font-size:12.5u;color:#8b8b94}
.cm-search svg,.cm-bell{width:15u;height:15u}
.cm-bell{color:#6b6b74}
.cm-me{width:30u!important;height:30u!important;border-radius:50%}
.cm-body{display:grid;grid-template-columns:200u 1fr 250u;gap:18u;padding:18u 22u}
.cm-h{display:flex;align-items:center;gap:6u;margin:4u 8u 6u!important;font-size:11u;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b8b94}
.cm-h svg{width:13u;height:13u}
.cm-spaces{display:flex;flex-direction:column;gap:2u}
.cm-spaces>span{display:flex;align-items:center;gap:7u;padding:8u 9u;border-radius:9u;font-size:13u;color:#3f3f46}
.cm-spaces>span svg{width:14u;height:14u;color:#9a9aa3}
.cm-spaces>span.on{background:#fff;font-weight:600;box-shadow:0 1u 2u rgba(0,0,0,.05),inset 0 0 0 1u #ececef}
.cm-spaces em{margin-left:auto;min-width:20u;padding:1u 6u;border-radius:999u;background:var(--acc);color:#fff;font-size:10.5u;font-style:normal;font-weight:700;text-align:center}
.cm-spaces .cm-h:nth-of-type(2){margin-top:16u!important}
.cm-feed,.cqm-feed{display:flex;flex-direction:column;gap:12u;min-width:0}
.cm-compose{display:flex;align-items:center;gap:10u;padding:10u 14u;border-radius:14u;background:#fff;box-shadow:inset 0 0 0 1u #ececef;font-size:13u;color:#8b8b94}
.cm-compose svg{margin-left:auto;width:17u;height:17u}
.cm-av{width:34u!important;height:34u!important;border-radius:50%}
.cm-pinned{display:flex;align-items:center;gap:12u;padding:10u 14u;border-radius:14u;background:var(--tint);box-shadow:inset 0 0 0 1u rgba(0,0,0,.04)}
.cm-pinned>svg{width:14u;height:14u;color:var(--acc)}
.cm-date{width:40u;height:42u;border-radius:9u;background:#fff;display:grid;place-items:center;align-content:center;font-size:9.5u;font-weight:600;text-transform:uppercase;color:var(--acc);line-height:1}
.cm-date b{font-size:16u;color:#18181b}
.cm-pinned>span:not(.cm-date){display:grid;font-size:13u}
.cm-pinned i{font-size:11.5u;font-style:normal;color:#6b6b74}
.cm-pinned em{margin-left:auto;padding:7u 13u;border-radius:999u;background:var(--acc);color:#fff;font-size:12u;font-style:normal;font-weight:600}
.cm-post{padding:14u 16u;border-radius:14u;background:#fff;box-shadow:inset 0 0 0 1u #ececef}
.cm-post header{display:flex;align-items:center;gap:10u}
.cm-post header span{display:grid;font-size:13u;line-height:1.3}
.cm-post header i{font-size:11.5u;font-style:normal;color:#8b8b94}
.cm-post header em{font-style:normal;font-weight:500}
.cm-post header>svg{margin-left:auto;width:15u;height:15u;color:#a1a1aa}
.cm-post>p{margin-top:9u!important;font-size:13.5u;line-height:1.5;color:#27272a}
.cm-pics{display:grid;gap:6u;margin-top:10u;height:170u}
.cm-pics.n2{grid-template-columns:1fr 1fr}
.cm-pics img{border-radius:10u}
.cm-chart{margin-top:10u;padding:10u 12u 6u;border-radius:10u;background:#f7f7fe}
.cm-chart span{display:flex;align-items:baseline;gap:6u;font-size:12u;color:#6b6b74}
.cm-chart b{font-size:17u;color:#18181b}
.cm-chart em{font-style:normal;font-weight:600;color:#16a34a}
.cm-chart svg{width:100%;height:70u;display:block}
.cm-post footer{display:flex;align-items:center;gap:16u;margin-top:11u;font-size:12.5u;color:#6b6b74}
.cm-post footer>span{display:flex;align-items:center;gap:5u}
.cm-post footer svg{width:15u;height:15u}
.cm-faces{display:flex;margin-left:auto}
.cm-faces img{width:22u;height:22u;border-radius:50%;border:2u solid #fff;margin-left:-6u}
.cm-faces.big{margin:12u 0 0}
.cm-faces.big img{width:28u;height:28u;margin-left:-8u}
.cm-faces img:first-child{margin-left:0}
.cm-side{display:flex;flex-direction:column;gap:12u}
.cm-about,.cm-board{padding:12u;border-radius:14u;background:#fff;box-shadow:inset 0 0 0 1u #ececef;font-size:13u}
.cm-cover{height:62u;margin-bottom:10u;border-radius:9u;background:linear-gradient(135deg,var(--acc),var(--tint))}
.cm-stat{display:flex;gap:12u;margin-top:5u;font-size:12u;color:#6b6b74}
.cm-stat b{color:#18181b}
.cm-stat i{display:inline-block;width:7u;height:7u;border-radius:50%;background:#22c55e}
.cm-invite{display:flex;justify-content:center;margin-top:12u;padding:8u;border-radius:9u;background:#18181b;color:#fff;font-style:normal;font-size:12.5u;font-weight:600}
.cm-board>span{display:flex;align-items:center;gap:8u;padding:6u 4u;font-size:12.5u}
.cm-board>span>i{width:14u;font-style:normal;font-weight:700;color:#a1a1aa}
.cm-board img{width:24u;height:24u;border-radius:50%}
.cm-board em{margin-left:auto;font-style:normal;font-weight:600;color:var(--acc)}

.cqm{background:#f6f6f7}
.cqm-head{display:flex;align-items:center;justify-content:space-between;padding:6u 18u 10u;background:#fff}
.cqm-head>svg{width:20u;height:20u}
.cqm-head .cm-logo>span{display:grid;font-size:15.5u}
.cqm-head small{font-size:11.5u;font-weight:500;color:#6b6b74}
.cqm-head .cm-logo>i{width:38u;height:38u;border-radius:11u;font-size:12u}
.cqm-tabs{display:flex;gap:4u;padding:0 14u 10u;background:#fff;border-bottom:1u solid #ececef;font-size:13u;color:#6b6b74}
.cqm-tabs>*{padding:7u 11u;border-radius:8u}
.cqm-tabs b{background:var(--tint);color:var(--acc);font-weight:600}
.cqm-chips{display:flex;gap:6u;padding:12u 14u 2u;overflow:hidden;white-space:nowrap}
.cqm-chips span{padding:6u 11u;border-radius:999u;background:#fff;box-shadow:inset 0 0 0 1u #e4e4e7;font-size:12u;color:#52525b}
.cqm-chips span.on{background:#18181b;color:#fff;box-shadow:none}
.cqm-feed{padding:10u 12u}
.cqm .cm-pics{height:150u}
`)
