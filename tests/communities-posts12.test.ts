/**
 * ===========================================================================
 *  COMMUNITIES: POSTS AND COMMENTS, ROUND 12 (P)
 * ===========================================================================
 * Held from their inputs and their source (the behaviour itself, frame by
 * frame, is measured by scripts/check-community-posts.mjs, sections r12*):
 *
 *   HIGHLIGHT   the new post's tint: a soft warm paper, there from the post's
 *               first frame, held, then eased out over about 1.2s
 *   GIFS        play while on screen (one shared IntersectionObserver), rest
 *               on their still off screen and with reduced motion
 *   SOUND       a like and an unlike are a tiny Web Audio sound (the unlike
 *               softer); never hidden, never with reduced motion, never with
 *               Sounds off (kept in this browser)
 *   CARD        two or more pictures go under the words on a computer too
 *   REPORT      a sheet on a phone, a dialog on a computer, the report route,
 *               a toast
 *   COMPOSER    no morph: one 40px picture for the card's whole life
 *   POPOVERS    emoji and GIF never taller than the room they have (Radix's
 *               available height), flipped and shifted inside the window,
 *               about 320x340 and 340x380
 *   LINKS       YouTube, Vimeo and Loom by link (Loom allowed in the frame
 *               policy), Paste, a live preview; polls reordered and voted
 *   COMMENTS    emoji, a video by link, pictures and GIFs; files refused on
 *               the server and gone from the box
 *   PICTURES    compressed in the browser: 2560px, WebP or JPEG at 0.85, no
 *               EXIF, GIFs as they are
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  COMMENT_MEDIA_TYPES,
  EMBED_NAMES,
  MAX_COMMENT_EMBEDS,
  POST_PICTURE_MAX_EDGE,
  POST_PICTURE_QUALITY,
  bodyEmbeds,
  cardPictures,
  cardThumb,
  embedFromUrl,
  embedPlayerSrc,
  embedThumbUrl,
  loomFromUrl,
  postEmbedFromUrl,
} from "@/lib/communities/post-media"
import { checkMedia } from "@/lib/communities/server/feed"
import { NATIVE_FRAME_SRC } from "@/lib/security/csp"
import { COMMENT_FILES_REFUSED, checkCommentMedia, mediaLine } from "@/lib/communities/server/comments"
import { HIGHLIGHT, HIGHLIGHT_FADE_MS, HIGHLIGHT_HOLD_MS, HIGHLIGHT_MS } from "@/components/community/member/arrive"
import { withAnswer } from "@/components/community/member/poll"
import { EMOJI_POPOVER, FIT_POPOVER, GIF_POPOVER, POPOVER_EDGE, fitBox } from "@/components/ui/popover-fit"
import { REPORT_REASONS, type CommunityRow, type PollView } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const LOOM = "0123456789abcdef0123456789abcdef"

function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: U(1), member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...o }
}
const community = { id: U(900), creator_id: U(800), slug: "studio", name: "Studio", chat_enabled: true } as CommunityRow
const noStorage = { storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) } }

async function main() {
  /* ── 17: the highlight ──────────────────────────────────────────────── */
  console.log("\n17. The new post's highlight")
  const arrive = code("components/community/member/arrive.ts")
  /* Changed on purpose (round 28): the light tint is the fallback of a variable the dark look sets. */
  check("a soft warm paper tint (#fdf8ec), not a yellow", HIGHLIGHT === "var(--sl-arrive, #fdf8ec)")
  check("held while the post lands, then eased out over about 1.2s", HIGHLIGHT_HOLD_MS >= 300 && HIGHLIGHT_HOLD_MS <= 600 && HIGHLIGHT_FADE_MS === 1200 && HIGHLIGHT_MS === HIGHLIGHT_HOLD_MS + HIGHLIGHT_FADE_MS)
  check("there from the post's first frame (it starts at full, so it fades in with the post: no tint popping on), on a long soft curve out", /tint\.animate\(\[\{ opacity: 1, easing: "linear" \}, \{ opacity: 1, offset: hold, easing: "cubic-bezier\(0\.4, 0, 0\.2, 1\)" \}, \{ opacity: 0 \}\]/.test(arrive))

  /* ── 18: GIFs play ──────────────────────────────────────────────────── */
  console.log("\n18. GIFs play in the feed and the opened post")
  const media = code("components/community/member/media.tsx")
  check("one shared IntersectionObserver, a margin ahead of the screen", /screenWatch \?\?= new IntersectionObserver\(/.test(media) && /rootMargin: "120px 0px"/.test(media))
  /* Changed on purpose: the address is chosen once as `src` (the still stays until the moving file has arrived) and the one <img> takes it (ddcbaf919). */
  check("the moving picture on screen, the still off it, in the same <img>", /const src = moving \? motion : still\s*[\s\S]{0,200}<img ref=\{ref\} src=\{src\}/.test(media) && /data-gif-state=\{moving \? "playing" : "paused"\}/.test(media))
  check("reduced motion keeps the still", /* Changed on purpose: the moving file is fetched before it is swapped in. */ /prefers-reduced-motion: reduce\)"\)\.matches\) return[\s\S]{0,120}return watchOnScreen\(el, setWanted\)/.test(media))
  check("the card's thumbnail, the card's pictures, the opened post's tile and a comment's tile all play", (media.match(/<GifImg /g) ?? []).length >= 4)
  const gif = { type: "gif" as const, url: "https://media2.giphy.com/media/a/200w.gif", still: "https://media2.giphy.com/media/a/200w_s.gif", w: 200, h: 150 }
  check("the card knows a GIF's moving picture as well as its still", cardThumb([gif])?.motion === gif.url && cardThumb([gif])?.url === gif.still && cardPictures([gif])[0].motion === gif.url)

  /* ── 19: the like's sound ───────────────────────────────────────────── */
  console.log("\n19. The like's sound")
  const heart = code("components/community/member/heart.tsx")
  check("made with Web Audio on the spot (no file), the like louder than the unlike, both very quiet", /\.createOscillator\(\)/.test(heart) && /tone\("sine", 520, 1080, 0\.03, 0\.06, 0\.11\)/.test(heart) && /tone\("sine", 480, 300, 0\.05, 0\.026, 0\.08\)/.test(heart))
  check("never when the page is hidden, with reduced motion, or with Sounds off", /document\.visibilityState !== "visible" \|\| !soundsOn\(\) \|\| window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return (false|null)/.test(heart))
  check("Sounds is kept in this browser, on unless turned off, with its own switch", /SOUNDS_KEY = "storelib:sounds"/.test(heart) && /getItem\(SOUNDS_KEY\) !== "off"/.test(heart) && /export function SoundsSwitch/.test(heart) && /role="switch"/.test(heart))
  check("one sound per press, in the press, for a post and for a comment", /likeSound\(!now\.on\)\s*press\(`like:\$\{post\.id\}`/.test(code("components/community/member/post-card.tsx")) && /likeSound\(!reacted\)\s*press\(`comment-like:\$\{c\.id\}`/.test(code("components/community/member/comments.tsx")))

  /* ── 20: several pictures on a computer's card ──────────────────────── */
  console.log("\n20. A computer's card with several pictures")
  const card = code("components/community/member/post-card.tsx")
  check("two or more pictures: under the words at every width, no thumbnail on the right", /const several = useMemo\(\(\) => cardPictures\(media\)\.length >= 2, \[media\]\)/.test(card) && /className=\{several \? "mt-3" : "mt-3 sm:hidden"\}/.test(card) && /\{several \? null : <PostThumb/.test(card))
  check("round 13: one box of a fixed shape, 8:3 from 640px (2:1 on a phone), sized for the card", /aspect-\[2\/1\] grid-cols-2 gap-\[3px\] bg-white sm:aspect-\[8\/3\]/.test(media) && /"\(min-width: 640px\) 360px, 50vw"/.test(media))

  /* ── 21: report ─────────────────────────────────────────────────────── */
  console.log("\n21. Reporting a post or a comment")
  const report = code("components/community/member/report-sheet.tsx")
  check("the app's sheet on a phone, a dialog that fades and settles on a computer", /<BottomSheet isOpen=\{open\}/.test(report) && /DialogPrimitive\.Content/.test(report) && /data-\[state=open\]:zoom-in-\[0\.97\]/.test(report) && /data-\[state=closed\]:zoom-out-\[0\.97\]/.test(report))
  check("every reason has a calm label", REPORT_REASONS.every((r) => new RegExp(`\\b${r}: "[A-Z][a-z]`).test(report)))
  check("sent to the community's report route (its queue), then a toast", /api<\{ ok: boolean; already: boolean \}>\(`\$\{apiBase\(communityId\)\}\/reports`/.test(report) && /toast\(r\.data\.already \? REPORT_AGAIN : REPORT_THANKS\)/.test(report) && /REPORT_THANKS = "Thanks\. The moderators will take a look\."/.test(report))
  check("posts and comments use it", /<ReportSheet communityId=\{post\.communityId\}/.test(card) && /<ReportSheet communityId=\{communityId\}/.test(code("components/community/member/comments.tsx")))

  /* ── 22: the composer opens without a morph ─────────────────────────── */
  console.log("\n22. The composer opens without a morph")
  const composer = code("components/community/member/composer.tsx")
  /* Changed on purpose: every face in a community goes through MemberAvatar, the one wrapper around AppAvatar (components/community/member/member-avatar.tsx, ddcbaf919). */
  check("one picture of the member in the card, 40px, for the card's whole life (the editor has none of its own)", (composer.match(/<MemberAvatar src=\{me\.avatarUrl\} name=\{me\.name\} alt="" size=\{40\}/g) ?? []).length === 1 && !/data-composer-editor=""[\s\S]{0,300}(AppAvatar|MemberAvatar)/.test(composer))
  check("the card grows, the field's words go, then the content fades in; Cancel the same backwards", /CONTENT_DELAY_MS = 110/.test(composer) && /delay: CONTENT_DELAY_MS/.test(composer) && /delay: FOLD_DELAY_MS/.test(composer) && /delay: FIELD_BACK_DELAY_MS/.test(composer))

  /* ── 23: popovers inside the window ─────────────────────────────────── */
  console.log("\n23. Popovers whole inside the window")
  const box = fitBox(340, 380)
  check("flipped and shifted by Radix, 12px from every edge", FIT_POPOVER.avoidCollisions === true && FIT_POPOVER.collisionPadding === POPOVER_EDGE && POPOVER_EDGE === 12)
  check("never taller than the room it has, never wider than the window", box.height === "min(380px, var(--radix-popover-content-available-height, 380px))" && box.width === "min(340px, calc(100vw - 24px))" && box.maxHeight === "var(--radix-popover-content-available-height, 380px)")
  check("GIFs about 340x380, emoji about 320x340", GIF_POPOVER.w === 340 && GIF_POPOVER.h === 380 && EMOJI_POPOVER.w === 320 && EMOJI_POPOVER.h === 340)
  const gifBtn = code("components/community/member/media-gif.tsx")
  const emoji = code("components/app/rich-text/emoji-picker.tsx")
  check("the GIF popover and the emoji popover use it (no fixed height left)", /\{\.\.\.FIT_POPOVER\}\s*style=\{fitBox\(GIF_POPOVER\.w, GIF_POPOVER\.h\)\}/.test(gifBtn) && !/h-\[420px\]/.test(gifBtn) && /\{\.\.\.FIT_POPOVER\}\s*style=\{fitBox\(size\.w, size\.h\)\}/.test(emoji) && !/h-\[360px\]/.test(emoji))
  check("the composer and the comment box ask for the smaller emoji", /<EmojiControl className=\{TOOL\} size=\{EMOJI_POPOVER\}/.test(composer) && /size=\{EMOJI_POPOVER\}/.test(code("components/community/member/comments.tsx")))
  /* Changed on purpose: the GIF sheet's props are one to a line, with its height tied to the visible viewport (ddcbaf919). */
  check("on a phone they are still the app's sheets", /<BottomSheet\s+isOpen=\{open\}\s+onClose=\{\(\) => setOpen\(false\)\}\s+label="GIFs"/.test(gifBtn) && /<BottomSheet\s+isOpen=\{open\}\s+onClose=\{close\}\s+label="Emoji"/.test(emoji))

  /* ── 24: links, videos, polls ───────────────────────────────────────── */
  console.log("\n24. Links, videos by link, polls")
  const loom = loomFromUrl(`https://www.loom.com/share/${LOOM}?sid=abc`)
  check("a Loom share or embed address is a video by link", loom?.provider === "loom" && loom.id === LOOM && loom.url === `https://www.loom.com/share/${LOOM}` && loomFromUrl(`https://loom.com/embed/${LOOM}`)?.id === LOOM)
  check("anything else that says Loom is not", !loomFromUrl("https://www.loom.com/share/short") && !loomFromUrl(`https://loom.com.evil.io/share/${LOOM}`) && !loomFromUrl(`javascript:alert(1)//loom.com/share/${LOOM}`) && !loomFromUrl(`https://user:pw@loom.com/share/${LOOM}`))
  check("posts and comments take YouTube, Vimeo and Loom; the community's cover and gallery keep to YouTube and Vimeo", postEmbedFromUrl("https://youtu.be/dQw4w9WgXcQ")?.provider === "youtube" && postEmbedFromUrl("https://vimeo.com/76979871")?.provider === "vimeo" && postEmbedFromUrl(`https://www.loom.com/share/${LOOM}`)?.provider === "loom" && embedFromUrl(`https://www.loom.com/share/${LOOM}`) === null)
  check("Loom plays in its own player, plainly", embedPlayerSrc({ provider: "loom", id: LOOM }).startsWith(`https://www.loom.com/embed/${LOOM}?`) && /hide_owner=true/.test(embedPlayerSrc({ provider: "loom", id: LOOM })) && /autoplay=1/.test(embedPlayerSrc({ provider: "loom", id: LOOM })))
  check("a Loom link in a post's words plays under them", bodyEmbeds(`see https://www.loom.com/share/${LOOM}`, [])[0]?.provider === "loom")
  check("a post may carry a Loom video (checked from its own id), its picture only from Loom's own host", (() => {
    const ok = checkMedia([{ type: "embed", url: `https://www.loom.com/share/${LOOM}`, thumb: "https://cdn.loom.com/sessions/thumbnails/x.gif" }])
    return ok.ok && ok.value[0].type === "embed" && (ok.value[0] as { provider: string }).provider === "loom" && (ok.value[0] as { thumb?: string }).thumb === "https://cdn.loom.com/sessions/thumbnails/x.gif" && !checkMedia([{ type: "embed", url: "https://www.loom.com/share/nope" }]).ok && !embedThumbUrl("https://evil.example/x.gif")
  })())
  check("each site has its name", EMBED_NAMES.youtube === "YouTube" && EMBED_NAMES.vimeo === "Vimeo" && EMBED_NAMES.loom === "Loom")
  const csp = read("lib/security/csp.ts")
  /* Changed on purpose (OnePage integrations audit): the app's frame list is lib/security/csp NATIVE_FRAME_SRC now, every frame-src host but bare js.stripe.com, which proxy.ts sends as NATIVE_FRAME_POLICY. */
  check("the frame policy lets Loom's player in (the header, vercel.json and the app's own)", /"https:\/\/www\.loom\.com"/.test(csp) && /frame-src [^;]*https:\/\/www\.loom\.com/.test(read("vercel.json")) && NATIVE_FRAME_SRC.includes("https://www.loom.com") && NATIVE_FRAME_SRC.includes("https://player.vimeo.com") && /NATIVE_FRAME_POLICY\)/.test(read("proxy.ts")))
  const linkField = code("components/community/member/media-link.tsx")
  check("a typed or pasted address gets https:// and must be one with a dot in its host; a video field says what it takes", read("components/community/member/media-link.tsx").includes("? t : `https://${t}`") && linkField.includes('return u.hostname.includes(".") ? u.toString() : null') && linkField.includes('VIDEO_HINT = "Paste a YouTube, Vimeo or Loom link."'))
  check("the field: Paste from the clipboard, the site's mark, a live preview read by the server, Upload beside it for a video", /navigator\.clipboard\.readText\(\)/.test(linkField) && /<ProviderMark provider=\{embed\.provider\}/.test(linkField) && /\/posts\/link-preview`/.test(linkField) && /data-composer-video-upload=""/.test(linkField))
  check("the composer and the comment box use it", /<LinkField\s/.test(composer) && /<LinkField mode="video"/.test(code("components/community/member/comments.tsx")))
  check("the poll editor: choices dragged by a handle (or arrow keys), how long it runs as choices, several answers as a switch", /data-choice-handle=""/.test(composer) && /onPointerDown=\{\(e\) => drag\(e, i\)\}/.test(composer) && /onKeyDown=\{\(e\) => keyMove\(e, i\)\}/.test(composer) && /POLL_ENDS/.test(composer) && /data-poll-multiple=/.test(composer))
  const poll: PollView = { id: "p", question: "q", multiple: false, closesAt: null, closed: false, totalVotes: 6, options: [{ id: "a", label: "A", voteCount: 3, voted: false }, { id: "b", label: "B", voteCount: 2, voted: true }, { id: "c", label: "C", voteCount: 1, voted: false }] }
  const changed = withAnswer(poll, ["c"])
  check("a vote is drawn at once: changing it moves one count from the old choice to the new", changed.options.map((o) => `${o.id}${o.voteCount}${o.voted ? "*" : ""}`).join() === "a3,b1,c2*" && changed.totalVotes === 6)
  check("taking it back takes the count away", withAnswer(poll, []).totalVotes === 5 && withAnswer(poll, []).options.every((o) => !o.voted))
  check("several answers add one to each", withAnswer({ ...poll, multiple: true }, ["a", "b", "c"]).totalVotes === 8)

  /* ── 25: comments ───────────────────────────────────────────────────── */
  console.log("\n25. Comments: emoji, a video by link, pictures, GIFs, no files")
  check("a comment may carry pictures, a GIF and a video by link, nothing else", JSON.stringify([...COMMENT_MEDIA_TYPES].sort()) === JSON.stringify(["embed", "gif", "image"]) && MAX_COMMENT_EMBEDS === 1)
  const fileRefused = await checkCommentMedia(noStorage as never, community, viewer(), [{ type: "file", assetId: U(7), name: "Plan.pdf", size: 10, store: "community" }])
  check("a file is refused on the server with a sentence", !fileRefused.ok && (fileRefused as { error: string }).error === COMMENT_FILES_REFUSED && /post/.test(COMMENT_FILES_REFUSED))
  const loomComment = await checkCommentMedia(noStorage as never, community, viewer({ role: null }), [{ type: "embed", url: `https://www.loom.com/share/${LOOM}` }])
  check("a video by link needs no upload right", loomComment.ok && loomComment.value[0].type === "embed")
  check("one video by link per comment", !(await checkCommentMedia(noStorage as never, community, viewer(), [{ type: "embed", url: "https://youtu.be/dQw4w9WgXcQ" }, { type: "embed", url: `https://www.loom.com/share/${LOOM}` }])).ok)
  check("a notification for a video alone says so", mediaLine([{ type: "embed", provider: "loom", id: LOOM, url: "u" }]) === "Sent a video")
  const comments = code("components/community/member/comments.tsx")
  check("the box: pictures only (no paperclip, no file route), a video link, emoji, GIF", !/Paperclip/.test(comments) && !/uploadCommunityFile/.test(comments) && /accept="image\/\*"/.test(comments) && /data-comment-tool="video"/.test(comments) && /<EmojiControl /.test(comments) && /<GifButton /.test(comments))
  check("emoji go in where the caret is (the box's own handle, still handed on)", /onInsert=\{\(e\) => textRef\.current\?\.insert\(e\)\}/.test(comments) && /if \(typeof handleRef === "function"\) handleRef\(h\)/.test(comments))
  check("a video in a comment plays inline under its words (from its media or its words)", /<CommentMedia media=\{c\.media \?\? \[\]\} text=\{c\.body\}/.test(comments) && /<EmbedPlayer item=\{\{ kind: "embed", provider: e\.provider/.test(media))

  /* ── 26: pictures compressed ────────────────────────────────────────── */
  console.log("\n26. Pictures compressed in the browser")
  const compress = code("components/community/member/media-compress.ts")
  check("2560px at most, quality 0.85", POST_PICTURE_MAX_EDGE === 2560 && POST_PICTURE_QUALITY === 0.85)
  check("WebP, or JPEG (PNG with see through parts) where the canvas cannot write WebP", /toBlob\(canvas, "image\/webp", opts\.quality\)/.test(compress) && /blob\.type !== "image\/webp"\) blob = seeThrough\(canvas\) \? await toBlob\(canvas, "image\/png"\) : await toBlob\(canvas, "image\/jpeg", opts\.quality\)/.test(compress))
  check("a GIF and an SVG go as they are; the turn in EXIF applied before the rest is dropped", /UNTOUCHED = \/\^image\\\/\(gif\|svg\\\+xml\)\$\/i/.test(compress) && /imageOrientation: "from-image"/.test(compress))
  check("never bigger than it came, never thrown: the original without its metadata instead", /scale === 1 && blob\.size >= file\.size && !MAY_BE_HDR\.test\(file\.type\)\) return \(await withoutMetadata\(file\)\)/.test(compress) && /catch \{\s*return \(await withoutMetadata\(file\)\) as File/.test(compress))
  check("every picture for a post or a comment goes through it", /const upload = await compressPostPicture\(file\)/.test(code("components/community/member/media-upload.ts")))

  /* ── Held for a moderator (worker T's 202 answer) ───────────────────── */
  console.log("\nHeld for a moderator (202)")
  check("a held post closes the editor without going into the feed, says the server's words, and stays a draft to change", /if \(r\.data\.held\) \{[\s\S]{0,200}const said = r\.data\.message \|\| HELD_POST[\s\S]{0,300}localStorage\.setItem\(key,[\s\S]{0,300}setRestored\(true\)[\s\S]{0,80}toast\(said\)[\s\S]{0,120}window\.setTimeout\(shut,[\s\S]{0,60}return\s*\}/.test(composer) && !/if \(r\.data\.held\) \{[\s\S]{0,700}onPosted\(/.test(composer))
  check("a held comment is taken out of the thread, its words go back in the box, and the toast says why", /if \(r\.ok && r\.data\.held\) \{\s*sending\.drop\(tempId\)[\s\S]{0,200}setBody\(text\)[\s\S]{0,80}return toast\(r\.data\.message \|\| HELD_COMMENT\)/.test(comments))

  /* ── Copy and boundaries ────────────────────────────────────────────── */
  console.log("\nCopy and boundaries")
  const mine = [
    "components/community/member/report-sheet.tsx",
    "components/community/member/media-link.tsx",
    "components/community/member/media-providers.tsx",
    "components/community/member/media-compress.ts",
    "components/community/member/poll.tsx",
    "components/community/member/composer.tsx",
    "components/community/member/comments.tsx",
    "components/community/member/media.tsx",
    "components/community/member/heart.tsx",
    "components/community/member/arrive.ts",
    "components/ui/popover-fit.ts",
    "lib/communities/post-media.ts",
    "lib/communities/server/comments.ts",
  ]
  const offenders = mine.filter((f) => /\u2014/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word", offenders.length === 0, offenders.join(", "))
  const clients = mine.filter((f) => /^"use client"/.test(read(f)))
  const leaks = clients.filter((f) => /server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth/.test(code(f)))
  check("client parts import nothing from the server", clients.length >= 6 && leaks.length === 0, leaks.join(", "))
  check("no violet fill", !mine.some((f) => /bg-\[#8b5cf6\]|bg-violet|bg-purple/.test(read(f))))

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
