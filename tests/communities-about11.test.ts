/**
 * ===========================================================================
 *  COMMUNITIES ROUND 11: THE ABOUT PAGE AND ITS GALLERY
 * ===========================================================================
 *   CHECKS        what members get: each tick in a small filled circle with
 *                 a hairline and a 1px shadow, the pricing card's too
 *   FACTS         a quiet line under the name (no icon per fact, no price)
 *                 and one panel of real figures: members, active this week,
 *                 posts in 30 days, courses; nothing that is zero
 *   WHO RUNS IT   View profile at the row's right from 640px, centred on
 *                 the person; under the line on a phone
 *   LEAVE         not under Open community: a Your membership row at the
 *                 foot of the page, with a confirm that answers at once
 *   GALLERY       the product gallery's Swiper engine, imported (not a
 *                 copy), arrows on a computer, players never swiped away
 *   VIDEO LINKS   YouTube and Vimeo in the gallery and as the cover: read
 *                 with the composer's parser, checked again on the server,
 *                 Vimeo's still asked of Vimeo (never taken from the
 *                 request), a cover video's still saved as the cover
 *                 picture so Explore and a shared link keep a still
 *
 * Run with:  npm run test:push
 */
import { fakeDb } from "./_fake-db"
import { readCode, readSource } from "./_source"
import { GALLERY_MAX, checkGallery, coverVideo, galleryEmbed, galleryKey } from "@/components/community/creator/logic"
import { galleryStill, parseGallery } from "@/components/community/public/gallery"
import { aboutFigures } from "@/components/community/public/about-facts"
import { coverSources, previewImages, type SeoFacts } from "@/components/community/public/seo"
import { checkGalleryForCommunity, coverAfterGallery, vimeoStill } from "@/lib/communities/server/gallery"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)

const YT = "https://youtu.be/dQw4w9WgXcQ?t=42"
const VM = "https://vimeo.com/76979871"
const VM_PRIVATE = "https://vimeo.com/123456789/abcdef1234"
const own = (u: unknown) => (typeof u === "string" && u.startsWith("https://x.supabase.co/") ? u : null)
const C = "c0000000-0000-4000-8000-0000000000c1"

/** A stand in for Vimeo's oEmbed: answers the still it is given, and records what it was asked. */
function vimeo(answer: unknown, asked: string[] = [], status = 200): typeof fetch {
  return (async (url: string) => {
    asked.push(String(url))
    return new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
}

async function main() {
  /* ── Video links: what the creator may paste ─────────────────────────── */
  console.log("\nVideo links in the gallery and as the cover")
  {
    const yt = galleryEmbed(YT)
    check("a YouTube link of any shape becomes its id and YouTube's own still", yt?.provider === "youtube" && yt.id === "dQw4w9WgXcQ" && yt.thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && galleryEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ", yt)
    const vm = galleryEmbed(VM_PRIVATE)
    check("a Vimeo link keeps its private hash, and has no still until Vimeo is asked", vm?.provider === "vimeo" && vm.id === "123456789" && vm.hash === "abcdef1234" && vm.thumb === undefined, vm)
    check("anything else is refused: another site, a script, an empty line", !galleryEmbed("https://evil.example/watch?v=dQw4w9WgXcQ") && !galleryEmbed("javascript:alert(1)") && !galleryEmbed("") && !galleryEmbed("https://youtube.com/watch?v=short"))
    check("a stored item is parsed again, never trusted: a forged id or provider is dropped", !galleryEmbed({ type: "embed", provider: "youtube", id: "<script>" }) && !galleryEmbed({ type: "embed", provider: "vimeo", id: "dQw4w9WgXcQ" }) && galleryEmbed({ type: "embed", provider: "youtube", id: "dQw4w9WgXcQ" })?.id === "dQw4w9WgXcQ")
    check("a stored still is kept only from YouTube's or Vimeo's picture hosts", galleryEmbed({ type: "embed", provider: "vimeo", id: "76979871", thumb: "https://i.vimeocdn.com/video/1-d_1280" })?.thumb === "https://i.vimeocdn.com/video/1-d_1280" && galleryEmbed({ type: "embed", provider: "vimeo", id: "76979871", thumb: "https://evil.example/x.jpg" })?.thumb === undefined)
    check("YouTube's still comes from the id, whatever the request says", galleryEmbed({ type: "embed", provider: "youtube", id: "dQw4w9WgXcQ", thumb: "https://i.vimeocdn.com/other" })?.thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")

    const good = checkGallery([{ type: "embed", url: YT, cover: true }, { type: "image", url: "https://x.supabase.co/a.png" }, { type: "embed", url: VM }], own)
    check("the gallery takes links beside pictures, in order", good.ok && good.value.map((g) => g.type).join() === "embed,image,embed" && coverVideo(good.ok ? good.value : [])?.id === "dQw4w9WgXcQ", good)
    const bad = checkGallery([{ type: "embed", url: "https://evil.example/v/1" }], own)
    check("a link that is not YouTube or Vimeo is refused with what to do", bad.ok === false && /Only YouTube and Vimeo links/.test(bad.error), bad)
    const twice = checkGallery([{ type: "embed", url: YT }, { type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }], own)
    check("the same video twice is kept once", twice.ok && twice.value.length === 1)
    const late = checkGallery([{ type: "image", url: "https://x.supabase.co/a.png" }, { type: "embed", url: YT, cover: true }], own)
    check("the cover mark stays on the first item only", late.ok && late.value[1].type === "embed" && !(late.value[1] as { cover?: true }).cover && coverVideo(late.ok ? late.value : []) === null)
    check("still at most twelve, links counted", GALLERY_MAX === 12 && !checkGallery(Array.from({ length: 13 }, () => ({ type: "embed", url: YT })), own).ok)
    check("one key per thing, whatever its kind", galleryKey({ type: "embed", provider: "vimeo", id: "1" }) === "vimeo:1" && galleryKey({ type: "video", videoId: "AB" }) === "ab")
  }

  /* ── The server: Vimeo's still, the cover picture ────────────────────── */
  console.log("\nOn the server")
  {
    const asked: string[] = []
    const r = await checkGalleryForCommunity(fakeDb({}) as never, C, [{ type: "embed", url: VM_PRIVATE, thumb: "https://i.vimeocdn.com/forged" }, { type: "embed", url: YT }], vimeo({ thumbnail_url: "https://i.vimeocdn.com/video/452001751-d_1280" }, asked))
    const v = r.ok ? r.value[0] : null
    check("Vimeo is asked for the still on the save, with the video's own link only", asked.length === 1 && asked[0].startsWith("https://vimeo.com/api/oembed.json?") && decodeURIComponent(asked[0]).includes("url=https://vimeo.com/123456789/abcdef1234"), asked)
    check("its answer is the still; the one the request carried never is", v?.type === "embed" && v.thumb === "https://i.vimeocdn.com/video/452001751-d_1280", v)
    check("YouTube is not asked anything", asked.length === 1 && r.ok && r.value[1].type === "embed" && (r.value[1] as { thumb?: string }).thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
    const evil = await checkGalleryForCommunity(fakeDb({}) as never, C, [{ type: "embed", url: VM, thumb: "https://i.vimeocdn.com/kept?" }], vimeo({ thumbnail_url: "https://evil.example/still.jpg" }))
    check("a still from anywhere but Vimeo's picture host is not kept (and neither is the request's)", evil.ok && (evil.value[0] as { thumb?: string }).thumb === undefined, evil)
    const down = await checkGalleryForCommunity(fakeDb({}) as never, C, [{ type: "embed", url: VM }], vimeo({}, [], 500))
    check("Vimeo down: the video is still saved, without a still", down.ok && down.value.length === 1 && (down.value[0] as { thumb?: string }).thumb === undefined)
    check("vimeoStill never throws", (await vimeoStill({ id: "1" }, (async () => { throw new Error("offline") }) as unknown as typeof fetch)) === null)

    const ytCover = [{ type: "embed" as const, provider: "youtube" as const, id: "dQw4w9WgXcQ", thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", cover: true as const }]
    check("a cover video's still becomes the cover picture", coverAfterGallery(null, true, ytCover) === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && coverAfterGallery("https://x.supabase.co/old.png", false, ytCover) === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")
    check("a cover video without a still (Vimeo did not answer) leaves the cover as the save says", coverAfterGallery("https://x.supabase.co/old.png", false, [{ type: "embed", provider: "vimeo", id: "1", cover: true }]) === undefined)
    check("the cover video gone: its still goes too, a picture stays", coverAfterGallery("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", false, []) === null && coverAfterGallery("https://x.supabase.co/pic.png", false, []) === undefined && coverAfterGallery("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", true, []) === undefined)
    const creator = code("lib/communities/server/creator.ts")
    check("the settings route sets the cover from the checked gallery, after the cover field", /const r = await checkGalleryForCommunity\(db, c\.id, b\.gallery\)[\s\S]{0,200}const cover = coverAfterGallery\(c\.cover_url \?\? null, patch\.cover_url !== undefined, gallery\)\s*if \(cover !== undefined\) patch\.cover_url = cover/.test(creator) && creator.indexOf('for (const key of ["logoUrl", "coverUrl"] as const)') < creator.indexOf("coverAfterGallery(c.cover_url"))
    check("the module says server-only", /^import "server-only"/m.test(readSource("lib/communities/server/gallery.ts")))
  }

  /* ── The page: what it reads, the still, the preview ─────────────────── */
  console.log("\nWhat the page reads and a shared link shows")
  {
    const parsed = parseGallery([{ type: "embed", provider: "youtube", id: "dQw4w9WgXcQ", cover: true }, { type: "embed", provider: "vimeo", id: "76979871", thumb: "https://evil.example/x.jpg" }, { type: "embed", provider: "youtube", id: "nope" }, { type: "image", url: "https://x.supabase.co/a.png" }])
    check("the page reads linked videos with YouTube's still, drops a forged still and a forged id", parsed.length === 3 && parsed[0].type === "embed" && parsed[0].thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && parsed[1].type === "embed" && parsed[1].thumb === null && parsed[2].type === "image", parsed)
    check("the still before a press: picture, poster, linked still", galleryStill({ type: "image", url: "/a.png" }) === "/a.png" && galleryStill({ type: "video", videoId: "x", posterUrl: "/p.jpg" }) === "/p.jpg" && galleryStill({ type: "embed", provider: "youtube", id: "x", thumb: "/t.jpg" }) === "/t.jpg")
    const pub = code("lib/communities/server/public.ts")
    check("the about page's gallery passes linked videos through", /if \(g\.type === "image" \|\| g\.type === "embed"\) out\.push\(g\)/.test(pub))
    check("a shared link of a YouTube cover is cut from the large still first, then the stored one", JSON.stringify(coverSources("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")) === JSON.stringify(["https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"]) && JSON.stringify(coverSources("https://x.supabase.co/c.png")) === JSON.stringify(["https://x.supabase.co/c.png"]))
    const facts: SeoFacts = { slug: "clay", name: "Clay", tagline: null, description: null, seoTitle: null, seoDescription: null, coverUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", logoUrl: null, indexable: true, creatorName: null, shareVersion: "v2" }
    check("with a video cover the preview is still the cover.jpg still, never a player", (previewImages(facts, false)?.og as { url: string; type: string }[])[0].url === "https://storelib.com/community/clay/cover.jpg?v=v2")
    const route = code("app/(marketing)/community/[slug]/cover.jpg/route.ts")
    check("cover.jpg tries each source until one draws", /for \(const source of coverSources\(community\.cover_url\)\) \{\s*picture = await sharePicture\(source, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT, "jpeg"\)\s*if \(picture\) break/.test(route))
  }

  /* ── The figures ─────────────────────────────────────────────────────── */
  console.log("\nThe figures")
  {
    const all = aboutFigures({ members: 1284, online: 14, admins: 2 }, { activity: { posts30: 186, active7: 402, since: null }, classroom: { total: 9, courses: [] }, creatorBio: null })
    /* Round 13 (ask 22): no "Active this week" anywhere; Online now fills the place it left. */
    check("members, posts in 30 days, courses, then Online now: no active this week", all.map((c) => `${c.key}:${c.value}`).join() === "members:1284,posts:186,courses:9,online:14", all)
    const few = aboutFigures({ members: 86, online: 3, admins: 1 }, { activity: { posts30: 23, active7: null, since: null }, classroom: null, creatorBio: null })
    check("nothing that is zero; Online now only fills a place, only when someone is", few.map((c) => c.key).join() === "members,posts,online", few)
    check("no heartbeat, nothing else: members alone", aboutFigures({ members: 1, online: null, admins: null }, null).map((c) => `${c.key}:${c.label}`).join() === "members:Member")
    const page = code("components/community/public/sales-page.tsx")
    /* Round 13 (ask 22): the row of figures is gone from the sheet; the facts are one quiet list (facts-list.tsx). */
    check("the sheet has no row of figures; the facts are one list", !/data-community-stats=""/.test(page) && /<FactsList facts=\{facts\} \/>/.test(page))
    const about = code("lib/communities/server/about.ts")
    check("active this week is counted on last_active_at over seven days", /ACTIVE_DAYS = 7/.test(about) && /\.gte\("last_active_at", week\)/.test(about))
  }

  /* ── The checks, who runs it, leaving ────────────────────────────────── */
  console.log("\nChecks, who runs it, leaving")
  {
    const dot = code("components/community/public/check-dot.tsx")
    check("the tick sits in a small filled circle with a hairline and a 1px shadow", /h-5 w-5[^"]*rounded-full bg-\[#f4f5f7\][^"]*shadow-\[0_0_0_1px_rgba\(16,24,40,0\.08\),0_1px_1px_rgba\(16,24,40,0\.06\)\]/.test(dot) && !/"use client"/.test(dot))
    const page = code("components/community/public/sales-page.tsx")
    const controls = code("components/community/public/join-controls.tsx")
    check("what members get and the pricing card both use it", /<CheckDot className="mt-px" \/>/.test(page) && /<CheckDot className="-mt-px" \/>/.test(controls) && !/import \{ Check[, ]/.test(page))
    /* Round 13 (ask 22): on a phone too, View profile ends the row; the creator's line runs under the whole row. */
    check("who runs it: View profile in the row's third column, at its right at every width; the line under the row", /grid-cols-\[48px_minmax\(0,1fr\)_auto\][^"]*sm:grid-cols-\[56px_minmax\(0,1fr\)_auto\]/.test(page) && /col-start-3 row-start-1[^"]*justify-self-end/.test(page) && /col-span-3 col-start-1 row-start-2/.test(page))
    const status = controls.slice(controls.indexOf("function Status()"), controls.indexOf("const ROW_BUTTON"))
    check("Leave is no longer a link under Open community", !/Leave community/.test(status) && !/setLeaveOpen/.test(status) && !/manageHref/.test(status))
    check("it is a row in Your membership at the page's foot, for a member who is not the owner", /export function MembershipRow\(\)/.test(controls) && /if \(join\.kind !== "open" \|\| join\.isOwner\) return null/.test(controls) && /data-community-your-membership=""[\s\S]*<MembershipRow \/>/.test(page) && page.indexOf("<MembershipRow />") > page.indexOf('aria-labelledby="community-faq"'))
    check("Leave asks first, in Storelib's sheet or dialog", /onClick=\{\(\) => setLeaveOpen\(true\)\}[^>]*data-membership-leave=""/.test(controls) && /function LeaveDialog\(\)/.test(controls) && /<SheetDialog open=\{leaveOpen\}/.test(controls))
    check("the confirm answers at once (Leaving with a spinner) and a second press does nothing", /if \(!busy\) leave\(askWhy \? \{ reason, note \} : undefined\)/.test(controls) && /<Spinner size=\{16\} className="!text-white" \/>\s*Leaving/.test(controls))
    check("no bump on press: the main button darkens, it does not scale", !/active:scale/.test(controls) && /active:bg-\[#10101d\]/.test(controls))
  }

  /* ── The gallery ─────────────────────────────────────────────────────── */
  console.log("\nThe gallery")
  {
    const view = code("components/community/public/gallery-view.tsx")
    /* Changed on purpose: the gallery also takes the engine's slide speed (SLIDE_SPEED_MS) for its own slideTo (ddcbaf919), so the import names are read one by one. */
    const engineNames = (view.match(/import \{([^}]*)\} from "@\/components\/product\/media-swiper"/)?.[1] ?? "").split(",").map((n) => n.trim())
    check("it is the product gallery's engine, imported and not copied", ["MediaSwiper", "SwiperSlide", "useMediaSwiper", "type SwiperClass"].every((n) => engineNames.includes(n)) && !/from "swiper\/react"/.test(view))
    check("the engine owns the position, the page the index", /swiper\.slideTo\(at, wrap \|\| dist === 1 \? SLIDE_SPEED_MS : 0\)/.test(view) && /onIndexChange=\{moved\}/.test(view))
    check("arrows on a computer only, hidden at the end they cannot pass, pressed by tint", /sm:flex \[@media\(pointer:coarse\)\]:hidden/.test(view) && /hidden=\{at === 0\}/.test(view) && /hidden=\{at === count - 1\}/.test(view) && /active:bg-\[#eef0f2\]/.test(view) && !/scale-/.test(view.slice(view.indexOf("function Arrow"), view.indexOf("export function CommunityGallery"))))
    check("the arrows sit inside the engine's container, so a drag that starts on one still moves it", /<div slot="container-end" className="contents">/.test(view))
    check("a press at the end of a drag is not a play", /if \(!carousel\.clickAllowed\(\) \|\| loading\) return/.test(view))
    check("a linked video plays in place in the privacy player; a player is never swiped away", /src=\{embedPlayerSrc\(g\)\}/.test(view) && (view.match(/swiper-no-swiping/g) ?? []).length >= 2 && /allow="autoplay; encrypted-media; picture-in-picture; fullscreen"/.test(view))
    check("moving on stops what was playing (in a transition, round 13)", /const moved = React\.useCallback\(\(i: number\) => \{\s*React\.startTransition\(\(\) => \{\s*setIndex\(i\)\s*setPlaying\(null\)/.test(view))
    check("the browser's parts import no server code", ["components/community/public/gallery-view.tsx", "components/community/public/gallery.ts", "components/community/creator/gallery-editor.tsx", "components/community/creator/logic.ts"].every((f) => !/server-only|next\/headers|lib\/communities\/server/.test(code(f))))
  }

  /* ── The creator's settings ──────────────────────────────────────────── */
  console.log("\nThe creator's settings")
  {
    const editor = code("components/community/creator/gallery-editor.tsx")
    check("the gallery takes a link, read with the composer's parser before anything is saved", /data-gallery-add-link=""/.test(editor) && /const embed = galleryEmbed\(text\.trim\(\)\)/.test(editor) && /That is not a YouTube or Vimeo video link\./.test(editor))
    check("the cover takes a link too: the video first in the gallery, marked as the cover", /export function CoverField/.test(editor) && /onChange\(\{ coverUrl: null, gallery: \[\{ \.\.\.embed, cover: true \}, \.\.\.rest\] \}\)/.test(editor))
    const settings = code("components/community/creator/settings-section.tsx")
    check("the settings draw the cover field, and the gallery edits what follows a cover video", /<CoverField/.test(settings) && /value=\{coverOf\(s\.gallery\) \? s\.gallery\.slice\(1\) : s\.gallery\}/.test(settings) && /max=\{coverOf\(s\.gallery\) \? GALLERY_MAX - 1 : GALLERY_MAX\}/.test(settings))
  }

  /* ── Words ───────────────────────────────────────────────────────────── */
  {
    const mine = [
      "components/community/public/gallery-view.tsx",
      "components/community/public/gallery.ts",
      "components/community/public/check-dot.tsx",
      "components/community/public/about-facts.ts",
      "components/community/public/sales-page.tsx",
      "components/community/public/join-controls.tsx",
      "components/community/public/seo.ts",
      "components/community/creator/gallery-editor.tsx",
      "lib/communities/server/gallery.ts",
      "lib/communities/server/about.ts",
      "app/(marketing)/community/[slug]/cover.jpg/route.ts",
    ]
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
    const offenders = mine.filter((f) => banned.test(readSource(f)))
    check("no em dash and none of the banned words", offenders.length === 0, offenders)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
