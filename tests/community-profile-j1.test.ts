/**
 * ===========================================================================
 *  ROUND J1: A MEMBER'S PROFILE INSIDE A COMMUNITY, AND THEIR COVER
 * ===========================================================================
 * The owner, on /community/<slug>?profile=<handle>:
 *
 *   THE COVER    "users' covers can also be their cover from the creator page,
 *                and also in the edit profile; some of them, even though they
 *                have covers, that thing is empty". One order everywhere
 *                (lib/profile/page-look.ts): their own cover, else their
 *                creator page's, else a wash of their photo or of a colour
 *                from their name, never a flat grey band. The account page and
 *                Settings show and change the same cover.
 *   NO LAG       the cover in the server's HTML, preloaded at high priority,
 *                through the optimizer at real widths (Storelib's own /media/
 *                address too, which was fetched at full size), in a box whose
 *                shape is fixed before anything loads, and decoded ahead when
 *                a member's link is hovered.
 *   THE LAYOUT   no right column on a profile, the cards across the middle and
 *                the right from 1280px.
 *
 * The geometry, the files the browser picked, in-app navigation and Back are
 * measured in a browser by the J1 probe (the round's report); this suite
 * holds the rules.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { chooseCover, ownCoverValue, pageLookOf, personCover } from "@/lib/profile/page-look"
import { publicCoverUrl, parseProfileCover } from "@/lib/profile/cover"
import { loadMemberProfile } from "@/lib/communities/server/member-profile"
import { MEMBER_COVER_WIDTHS, PROFILE_COLUMN_PX, PROFILE_COLUMN_SHARE, PROFILE_COLUMN_WIDE_PX, coverOptimizable, memberCoverSizes, memberCoverSource } from "@/lib/communities/member-cover"
import { NEXT_IMAGE_WIDTHS } from "@/lib/images/optimized-url"
import { MemberCover, nameWash } from "@/components/community/member/member-cover"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* A database of a few tables: the shapes the loaders use. `fail` makes a table's single read answer an error, as a duplicate row does. */
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, opts: { fail?: Record<string, (cols: string) => boolean>; reads?: string[] } = {}) {
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    let cols = "*"
    let limited = false
    const q = {
      select(c: string) {
        cols = c
        opts.reads?.push(`${table}:${c}`)
        return q
      },
      eq(k: string, v: unknown) {
        rows = rows.filter((r) => r[k] === v)
        return q
      },
      ilike(k: string, v: string) {
        rows = rows.filter((r) => String(r[k] ?? "").toLowerCase() === v.replace(/\\/g, "").toLowerCase())
        return q
      },
      in(k: string, v: unknown[]) {
        rows = rows.filter((r) => v.includes(r[k]))
        return q
      },
      is: () => q,
      or: () => q,
      gte: () => q,
      order: () => q,
      range: () => q,
      limit() {
        limited = true
        return q
      },
      pick(r: Row) {
        const m = /^(\w+):(\w+)->(\w+)$/.exec(cols.trim())
        if (!m) return r
        const json = r[m[2]] as Record<string, unknown> | null
        return { [m[1]]: json ? json[m[3]] ?? null : null }
      },
      /* PostgREST's maybeSingle: more than one row is an error, unless the query was limited. */
      maybeSingle: async () => {
        if (opts.fail?.[table]?.(cols)) return { data: null, error: { code: "42703", message: "column does not exist" } }
        if (rows.length > 1 && !limited) return { data: null, error: { code: "PGRST116", message: "multiple rows" } }
        return { data: rows[0] ? q.pick(rows[0]) : null, error: null }
      },
      then(ok: (v: { data: Row[]; error: null; count: number }) => unknown) {
        return Promise.resolve({ data: rows.map((r) => q.pick(r)), error: null, count: rows.length }).then(ok)
      },
    }
    return q
  }
  return { from: query, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "no such function" } }) } as never
}

const ME = "11111111-1111-4111-8111-111111111111"
const LUCA = "22222222-2222-4222-8222-222222222222"
const CR = "cccccccc-0000-4000-8000-000000000001"
const PAGE = "https://storelib.com/media/store-builder-images/cr/header.jpg"
const OWN = `https://abc.supabase.co/storage/v1/object/public/covers/${LUCA}/own.jpg`

async function main() {
  console.log("\nA cover address that can be drawn")
  {
    check("an https address is kept exactly", publicCoverUrl(PAGE) === PAGE && publicCoverUrl(` ${OWN} `) === OWN)
    check("Storelib's own /media/ path, saved without its host, is made whole (it used to read as no cover)", publicCoverUrl("/media/covers/x/a.jpg") === "https://storelib.com/media/covers/x/a.jpg")
    check(
      "nothing else: http, javascript:, //host, a path that climbs, junk",
      ["http://x.com/a.jpg", "javascript:alert(1)", "//evil.com/a.jpg", "/media/../etc/passwd", "/other/a.jpg", "", null, 42, "https://user:pw@x.com/a.jpg"].every((v) => publicCoverUrl(v) === null),
    )
  }

  console.log("\nTheir creator page's cover")
  {
    const creators = [{ id: CR, user_id: LUCA, onboarding_completed: true, cover_url: "https://abc.supabase.co/old.jpg", bio: "Row bio." }]
    const header = { creator_id: CR, page_type: "shop", published_config: { headerSettings: { coverImageUrl: PAGE, coverFocalPoint: { x: 20, y: 80 }, coverZoom: 1.5, bio: "Header bio." } } }
    /* Two shop rows for one creator (the unique index is skipped where duplicates exist): a single read used to error, and the cover was lost. */
    const twice = await pageLookOf(fakeDb({ creators, store_builder_configs: [header, { ...header, published_config: { headerSettings: {} } }] }), LUCA)
    check("two shop rows for one creator still read one header (limit 1, newest published first), never an empty band", twice.cover?.url === PAGE && twice.cover.crop.zoom === 1.5, twice)
    const relative = await pageLookOf(fakeDb({ creators, store_builder_configs: [{ ...header, published_config: { headerSettings: { coverImageUrl: "/media/store-builder-images/cr/h.jpg" } } }] }), LUCA)
    check("a header cover saved as /media/... is drawn", relative.cover?.url === "https://storelib.com/media/store-builder-images/cr/h.jpg", relative)
    const oldColumns = await pageLookOf(fakeDb({ creators, store_builder_configs: [] }, { fail: { creators: (c) => c.includes("onboarding_completed") } }), LUCA)
    check("a creators read that fails on a column still finds the row's cover", oldColumns.cover?.url === "https://abc.supabase.co/old.jpg", oldColumns)
  }

  console.log("\nOne cover, the same everywhere: their own, else their page's, else none")
  {
    const creators = [{ id: CR, user_id: LUCA, onboarding_completed: true, cover_url: null, bio: null }]
    const configs = [{ creator_id: CR, page_type: "shop", published_config: { headerSettings: { coverImageUrl: PAGE, coverFocalPoint: { x: 30, y: 70 }, coverZoom: 1.2 } } }]
    const noOwn = await personCover(fakeDb({ profiles: [{ id: LUCA, cover_url: null }], creators, store_builder_configs: configs }), LUCA)
    const pagePart = parseProfileCover(noOwn.value)
    check("no cover of their own: their page's, with where they placed it", noOwn.source === "page" && pagePart.url === PAGE && pagePart.crop.x === 30 && pagePart.crop.zoom === 1.2 && noOwn.page === noOwn.value, noOwn)
    const own = await personCover(fakeDb({ profiles: [{ id: LUCA, cover_url: `${OWN}#crop=10,20,1.1` }], creators, store_builder_configs: configs }), LUCA)
    check("their own cover wins, its crop kept, and the page's is still known (Settings offers it back)", own.source === "own" && own.value === `${OWN}#crop=10,20,1.1` && parseProfileCover(own.page).url === PAGE, own)
    const none = await personCover(fakeDb({ profiles: [{ id: LUCA, cover_url: "preset:sunset" }], creators: [] }), LUCA)
    check("neither: none (an old preset value is not a picture)", none.value === null && none.source === null && none.page === null, none)
    check("ownCoverValue: only a drawable picture", (await ownCoverValue(fakeDb({ profiles: [{ id: LUCA, cover_url: "http://x/a.jpg" }] }), LUCA)) === null)
    check("chooseCover is the same order, pure", chooseCover(null, { hasStorefront: false, cover: null, bio: null }).value === null && chooseCover("a", { hasStorefront: true, cover: { url: PAGE, crop: { x: 50, y: 50, zoom: 1 } }, bio: null }).source === "own")

    const C1 = "c1c1c1c1-0000-4000-8000-000000000001"
    const tables = {
      profiles: [
        { id: ME, username: "me", display_name: "Mia", avatar_url: null, bio: "", cover_url: null },
        { id: LUCA, username: "lucadragoste", display_name: "LucaDragoste", avatar_url: null, bio: "", cover_url: null },
      ],
      community_members: [{ community_id: C1, user_id: LUCA, status: "active", role: "member", tier_id: null, level: 1, points: 0, joined_at: "2026-10-09T10:00:00.000Z", muted_until: null, banned_at: null }],
      creators,
      store_builder_configs: configs,
      follows: [],
      community_spaces: [],
      community_feed_posts: [],
    }
    const community = { id: C1, slug: "bandido-social", name: "Bandido Social", gamification_enabled: false, status: "active" } as never
    const viewer = { userId: ME, active: true, member: { role: "member", status: "active" }, signedIn: true } as never
    const data = await loadMemberProfile(fakeDb(tables), community, viewer, "lucadragoste", Date.UTC(2026, 9, 12))
    check("?profile=lucadragoste: their creator page's cover, in the first payload the server renders", data?.person.coverUrl === PAGE && data?.person.coverCrop.x === 30 && data?.person.coverCrop.zoom === 1.2, data?.person)
  }

  console.log("\nThe cover's files")
  {
    check("Storelib's own /media/ address goes through the optimizer (next.config allows /media/**)", coverOptimizable(PAGE) && /images:[\s\S]*pathname: '\/media\/\*\*'/.test(read("next.config.mjs")))
    check("a host the optimizer cannot read is drawn as it is", !coverOptimizable("https://cdn.example.com/a.jpg") && memberCoverSource("https://cdn.example.com/a.jpg").srcSet === undefined)
    check("every width offered is one the optimizer makes", MEMBER_COVER_WIDTHS.every((w) => NEXT_IMAGE_WIDTHS.includes(w)))
    const s = memberCoverSource(PAGE, 1)
    check("a srcset of real file widths, and the 1200px file where srcset is not read", (s.srcSet?.split(", ").length ?? 0) === MEMBER_COVER_WIDTHS.length && /&w=1200&q=88$/.test(s.src) && /&w=640&q=88 640w/.test(s.srcSet ?? ""), s)
    /* Changed on purpose (the owner: "the content is a bit too wide"): from 1280px the column is 95.2% of the two columns, at most 944px. */
    check("sizes says the band's width at each breakpoint, the widest the profile column", memberCoverSizes(1) === `(min-width: 1280px) min(${PROFILE_COLUMN_WIDE_PX}px, calc((100vw - 368px) * ${PROFILE_COLUMN_SHARE})), (min-width: 1024px) calc(100vw - 348px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)`)
    check("a zoomed crop asks for that much more", /min\(1888px, calc\(\(100vw - 368px\) \* 1\.904\)\)/.test(memberCoverSizes(2)) && /calc\(\(100vw - 32px\) \* 2\)$/.test(memberCoverSizes(2)) && memberCoverSizes(9) === memberCoverSizes(4))
    check("the column number matches the frame: 1360 less 32px gutters, the 280px left column and one 24px gap", PROFILE_COLUMN_PX === 1360 - 64 - 280 - 24)
    check("  and the computer's column is about 5% narrower than that, its share of it at 1360px", PROFILE_COLUMN_WIDE_PX === Math.round(PROFILE_COLUMN_PX * PROFILE_COLUMN_SHARE) && PROFILE_COLUMN_SHARE >= 0.94 && PROFILE_COLUMN_SHARE <= 0.97)
  }

  console.log("\nThe band, as the server draws it")
  {
    const html = renderToString(createElement(MemberCover, { url: PAGE, crop: { x: 50, y: 50, zoom: 1 }, name: "LucaDragoste", avatarUrl: "https://abc.supabase.co/storage/v1/object/public/avatars/l/a.jpg" }))
    const img = /<img[^>]*data-member-cover-image="[^"]*"[^>]*>/.exec(html)?.[0] ?? ""
    check("the picture is in the server's HTML, shown as it loads (no script needed)", !!img && /data-member-cover-image="shown"/.test(img) && /opacity-100/.test(img), html.slice(0, 400))
    check("  at high priority, with its srcset and sizes", /fetchPriority="high"|fetchpriority="high"/.test(img) && /srcSet="|srcset="/.test(img) && /sizes="\(min-width: 1280px\)/.test(img))
    check("  and preloaded with the same files", /<link rel="preload"[^>]*as="image"[^>]*>/.test(html) && /imageSrcSet="|imagesrcset="/i.test(html))
    /* Changed on purpose (the owner: "the cover banner is too tall"): 10:3 from 1280px; a phone's 2:1 and a tablet's 16:5 are as they were. */
    check("a fixed shape, drawn before anything loads", /aspect-\[2\/1\][^"]*sm:aspect-\[16\/5\] xl:aspect-\[10\/3\]/.test(html))
    /* Changed on purpose (the owner: "the images don't have that blur thing"): no blurred photo under the cover, the name's own soft colour. */
    check("under it a soft wash of the name's colour, never a blurred photo", !/data-member-cover-wash/.test(html) && !/blur-\[/.test(html) && html.includes("linear-gradient(135deg, hsl("))
    const plain = renderToString(createElement(MemberCover, { url: null, crop: { x: 50, y: 50, zoom: 1 }, name: "Ana", avatarUrl: null }))
    check("nobody's picture at all: a soft wash of a colour from their name, never a flat grey", /data-member-profile-cover="name-wash"/.test(plain) && plain.includes("linear-gradient(135deg, hsl(") && !/<img/.test(plain))
    check("  the same colour for the same name, every time", nameWash("Ana") === nameWash("Ana") && nameWash("Ana") !== nameWash("Bo"))
    const decoded = code("components/community/member/member-cover.tsx")
    check("opened inside the app: decoded first, then a short fade; a cover decoded before is there at once", /el\.decode\(\)\.then\(show, show\)/.test(decoded) && /fromServer \|\| memberCoverReady\(url\)/.test(decoded) && /el\.complete/.test(decoded))
  }

  console.log("\nRead ahead")
  {
    const cache = code("lib/communities/client/place-cache.ts")
    check("a profile read ahead (a member's link hovered or pressed) decodes their cover with it", /warmProfileCover\(answer\.data\)/.test(cache) && /warmMemberCover\(person\.coverUrl/.test(cache))
  }

  console.log("\nThe layout")
  {
    const frame = code("components/community/member/shell-frame.tsx")
    /* Changed on purpose (round 39): no place has a right column any more (two columns, shell-frame.tsx), so a profile has that room like every page. */
    check("a profile has no right column: it takes that room, like About and the classroom", /const profilePage = shown\.kind === "profile"/.test(frame) && /xl:grid-cols-\[280px_minmax\(0,1fr\)\]"/.test(frame) && !/data-community-right/.test(frame) && /profilePage \? "profile"/.test(frame))
    const view = code("components/community/member/member-profile.tsx")
    /* Changed on purpose (the owner: "the content is a bit too wide"): from 1280px the cards take 95.2% of the column, at most 944px, centred; below it as before. */
    check("the profile's cards fill that column (680px before), a little narrower on a computer", new RegExp(`const COLUMN_CLASS = "max-w-\\[${PROFILE_COLUMN_PX}px\\] xl:max-w-\\[min\\(${PROFILE_COLUMN_WIDE_PX}px,${Math.round(PROFILE_COLUMN_SHARE * 1000) / 10}%\\)\\]"`).test(view) && !/max-w-\[680px\]/.test(view))
    check("larger on a computer: the photo, the name, the padding", /lg:h-\[128px\] lg:w-\[128px\]/.test(view) && /lg:-mt-\[67px\]/.test(view) && /lg:text-\[26px\]/.test(view) && /lg:px-8/.test(view))
    check("the band is the member cover, not the plain grey strip", /<MemberCover url=\{person\.coverUrl\}/.test(view) && !/bg-\[#f3f4f6\] sm:h-\[128px\]/.test(view))
  }

  console.log("\nEdit profile: the same cover, and the page's offered back")
  {
    const layout = code("app/account/layout.tsx")
    check("the account page draws the same cover (own, else page)", /personCover\(admin, user\.id\)/.test(layout) && /coverUrl: cover\?\.value \?\? null/.test(layout) && /ownCoverUrl: cover\?\.source === "own"/.test(layout))
    const loader = code("lib/account/load-account-settings.ts")
    check("Settings knows their page's cover", /chooseCover\(null, look\)\.page/.test(loader))
    const field = code("components/account/cover-field.tsx")
    check("Settings shows the page's cover when they have none, without moving or removing it there", /const fromPage = !cover && !!page\.url/.test(field) && /value=\{cover \|\| page\.url \|\| undefined\}/.test(field) && /allowRemove=\{!!cover\}/.test(field) && /editable: false/.test(field))
    check("Use my creator page cover: clears their own (the same owner only PATCH), and the page's is back", /Use my creator page cover/.test(field) && /changePicture\(null\)/.test(field) && /\/api\/profile\/cover/.test(field))
    const prime = code("components/account/settings-subpage.tsx")
    check("Edit profile opened from the profile is primed with their own cover, not the page's as if it were theirs", /seed\.coverUrl !== undefined \? seed\.coverUrl : base\?\.cover\?\.url/.test(prime) && /page: seed\.pageCoverUrl !== undefined/.test(prime))
    const route = code("app/api/profile/cover/route.ts")
    check("the cover route is still the session's own row only", /auth\.getUser\(\)/.test(route) && /\.eq\("id", user\.id\)/.test(route) && /ownCoverUrl\(body\.coverUrl, user\.id/.test(route))
  }

  console.log("\nWords")
  {
    const files = ["components/community/member/member-cover.tsx", "lib/communities/member-cover.ts", "lib/profile/page-look.ts", "components/account/cover-field.tsx"]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge)\b/i
    check("no em dash and no banned word in the new copy", files.every((f) => !read(f).includes("\u2014") && !banned.test(read(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailed:")
    for (const f of failures) console.log(`  · ${f}`)
    process.exit(1)
  }
}

void main()
