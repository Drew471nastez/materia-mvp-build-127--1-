/**
 * ===========================================================================
 *  COMMUNITY CHAT, ROUND 38: SPEED AND RICH CONTENT
 * ===========================================================================
 * The owner: "it takes too much to load ... it shows that iOS-style loading
 * thing too much ... make sure the sending feels smooth, safe ... GIFs,
 * images, videos, emojis, links, YouTube embeds". Held from their inputs:
 *
 *   LINKS      only http and https addresses are links; a javascript: or
 *              data: address is words; a card keeps its picture only from
 *              https; YouTube, Vimeo and Loom are found in the words
 *   SIGNED     a link card keeps its title, words and picture only when the
 *              server read them (its signature); anything else keeps the
 *              address and its site; one card per message, and a card goes
 *              when pictures and files are off
 *   UNFURL     the route's gate (communities on, a member who may chat, a
 *              rate limit), the public only fetch, kept answers
 *   SPEED      the kept page and list (memory and sessionStorage, under the
 *              member's id), asked for early (hover, touch, the top rows),
 *              one ask per chat, skeletons in place of the spinner, one time
 *              formatter, the newest bubbles first, bubbles memoised and
 *              keyed by the client id
 *   RICH       emoji and GIF tools loaded after the chat is up; a GIF from
 *              the device stays a GIF; a video plays in place; the player is
 *              youtube-nocookie and only after a press; CSP already names it
 *
 * Measured, not asserted, in scripts/check-community-chat-speed-r38.mjs.
 *
 * Run with: npx tsx --conditions=react-server tests/community-chat-speed-r38.test.ts
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { attachmentLine } from "@/lib/communities/chat-rules"
import { chatCardPayload, chatVideoOf, cleanChatCard, firstLink, httpsPicture, linksIn, webUrl } from "@/lib/communities/chat-links"
import { chatCardSigned, signChatCard } from "@/lib/communities/server/chat-unfurl"
import { chatLinkOf, chatMediaOf, checkChatMedia } from "@/lib/communities/server/chat-media"
import { RATE_LIMITS } from "@/lib/communities/limits"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => readCode(f)

async function main() {
  /* ── LINKS ────────────────────────────────────────────────────────────── */
  console.log("\nLinks in a message")
  {
    check("http and https are links", webUrl("https://example.com/a") === "https://example.com/a" && webUrl("http://example.com") === "http://example.com/")
    check("javascript:, data:, a file and credentials are not", [webUrl("javascript:alert(1)"), webUrl("data:text/html,x"), webUrl("file:///etc/passwd"), webUrl("https://user:pw@example.com"), webUrl("https://localhost")].every((x) => x === null))
    check("a card's picture only from https", httpsPicture("http://example.com/a.png") === null && httpsPicture("https://example.com/a.png") === "https://example.com/a.png")
    const words = "see https://example.com/a, then https://example.com/a and javascript:alert(1) or https://youtu.be/dQw4w9WgXcQ."
    check("the addresses in the words, in order, each once, no trailing comma or stop", JSON.stringify(linksIn(words)) === JSON.stringify(["https://example.com/a", "https://youtu.be/dQw4w9WgXcQ"]), linksIn(words))
    check("the first one is the card's", firstLink(words) === "https://example.com/a" && firstLink("no links here") === null)
    const yt = chatVideoOf(words)
    check("a YouTube address in the words is a video, by its id", yt?.provider === "youtube" && yt.id === "dQw4w9WgXcQ" && yt.thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", yt)
    check("Vimeo and Loom too; a plain page is not a video", chatVideoOf("https://vimeo.com/76979871")?.provider === "vimeo" && chatVideoOf("https://www.loom.com/share/0123456789abcdef0123456789abcdef")?.provider === "loom" && chatVideoOf("https://example.com") === null)
    const card = cleanChatCard({ url: "https://example.com/p", title: "  A\n title\u0000 ", description: "x".repeat(400), image: "http://example.com/i.png", site: "Example", extra: "dropped" })
    check("a card cleaned: one line each, cut to size, an http picture dropped, nothing else kept", !!card && card.title === "A title" && card.description?.length === 300 && !card.image && card.site === "Example" && !("extra" in card), card)
    check("a card with no good address is no card", cleanChatCard({ url: "javascript:alert(1)", title: "x" }) === null)
    check("a link card is not counted as something the message carries", attachmentLine([{ type: "link" }]) === "Link" && attachmentLine([{ type: "image" }, { type: "link" }]) === "Photo" && attachmentLine([]) === "")
  }

  /* ── SIGNED ───────────────────────────────────────────────────────────── */
  console.log("\nA card is the server's reading")
  {
    const card = { url: "https://example.com/p", title: "Title", description: "Words", image: "https://example.com/i.png", site: "example.com" }
    const sig = signChatCard(card, "key-1")
    check("signed and checked with the same key", sig.length === 32 && chatCardSigned(card, sig, "key-1"))
    check("another key, a changed title or picture, or no signature: not the server's", !chatCardSigned(card, sig, "key-2") && !chatCardSigned({ ...card, title: "Changed" }, sig, "key-1") && !chatCardSigned({ ...card, image: "https://evil.example/p.png" }, sig, "key-1") && !chatCardSigned(card, undefined, "key-1") && !chatCardSigned(card, "x".repeat(32), "key-1"))
    check("the payload has a fixed order and a version", chatCardPayload(card) === JSON.stringify(["chat-link-card:v1", card.url, "Title", "Words", card.image, "example.com"]))
    const real = signChatCard(card)
    const kept = chatLinkOf({ type: "link", ...card, sig: real })
    check("a signed card is kept whole", kept?.title === "Title" && kept?.image === card.image && kept?.description === "Words", kept)
    const forged = chatLinkOf({ type: "link", ...card, title: "Free money", sig: real })
    check("an unsigned or altered card keeps its address and site only", !!forged && forged.url === card.url && forged.site === "example.com" && !forged.title && !forged.image && !forged.description, forged)
    check("a card to a private or odd address is refused", chatLinkOf({ type: "link", url: "http://169.254.169.254/latest" }) === null && chatLinkOf({ type: "link", url: "javascript:alert(1)" }) === null && chatLinkOf({ type: "link", url: "http://localhost:3000" }) === null)
    const community = { id: "c", chat_enabled: true } as never
    const viewer = { userId: "u", role: "member" } as never
    const two = await checkChatMedia({} as never, community, viewer, [{ type: "link", url: "https://a.example.com" }, { type: "link", url: "https://b.example.com" }], { attachmentsEnabled: true })
    check("one card per message", !two.ok && /One link preview/.test((two as { error: string }).error))
    const off = await checkChatMedia({} as never, community, viewer, [{ type: "link", ...card, sig: real }], { attachmentsEnabled: false })
    check("a card goes when pictures and files are off (it is words, not an upload)", off.ok && off.value.length === 1 && off.value[0].type === "link")
    const upload = await checkChatMedia({} as never, community, viewer, [{ type: "image", url: "https://x.supabase.co/a.png" }], { attachmentsEnabled: false })
    check("an upload still does not", !upload.ok && (upload as { status?: number }).status === 403)
    const shown = chatMediaOf([{ type: "link", url: "javascript:alert(1)", title: "x" }, { type: "link", url: "https://example.com", image: "http://example.com/i.png", title: "Ok" }, { type: "script", src: "x" }, { type: "image", url: "https://x.supabase.co/a.gif" }])
    check("what is stored is checked again as it is read: a bad card, an http picture and an unknown kind are dropped", shown.length === 2 && shown[0].type === "link" && !(shown[0] as { image?: string }).image && shown[1].type === "image", shown)
  }

  /* ── UNFURL ───────────────────────────────────────────────────────────── */
  console.log("\nThe card's route")
  {
    const route = code("app/api/community/[communityId]/chat/unfurl/route.ts")
    check("communities on, a member who may chat, a rate limit, in that order", /const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(route) && route.indexOf('requireMember(db, communityId, await sessionUserId(), "chat")') > route.indexOf("requireCommunitiesOn()") && route.indexOf('chatLimit(gate, "chatUnfurl")') > route.indexOf("requireMember("))
    check("its rate: 60 a minute, 600 an hour", JSON.stringify(RATE_LIMITS.chatUnfurl) === JSON.stringify([{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }]))
    check("signed on the way out, never cached by the browser", /sig: signChatCard\(card\)/.test(route) && /NO_STORE/.test(route))
    const unfurl = code("lib/communities/server/chat-unfurl.ts")
    check("the public only fetch: size and time limits, redirects checked, no fetch() of its own", /fetchPublic\(url, \{ maxBytes: PREVIEW_MAX_BYTES, timeoutMs: PREVIEW_TIMEOUT_MS, maxRedirects: 3 \}\)/.test(unfurl) && !/[^.\w]fetch\(/.test(unfurl.replace(/fetchPublic\(/g, "")) && /const url = linkUrl\(/.test(unfurl))
    check("YouTube and Vimeo read from their oEmbed, through the same fetch", /youtube\.com\/oembed/.test(unfurl) && /vimeo\.com\/api\/oembed\.json/.test(unfurl) && /await fetchPublic\(endpoint/.test(unfurl))
    check("kept: an hour for a card, ten minutes for nothing, 500 addresses at most", /KEEP_MS = 60 \* 60_000/.test(unfurl) && /KEEP_EMPTY_MS = 10 \* 60_000/.test(unfurl) && /KEEP_MAX = 500/.test(unfurl))
    check("the key is the server's and compared in constant time", /timingSafeEqual/.test(unfurl) && /process\.env\.CHAT_LINK_SECRET \|\| process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(unfurl))
    const media = code("lib/communities/server/chat-media.ts")
    check("round 37's storage rules stand: the sender's picture folder, their own community files", /path\.startsWith\(folder\)/.test(media) && /storedObjectSize\(/.test(media) && /m\.store !== "community"/.test(media) && /ownedMedia\(db, community, viewer, media\)/.test(media))
  }

  /* ── SPEED ────────────────────────────────────────────────────────────── */
  console.log("\nOpening, going back, sending")
  {
    const core = code("components/community/member/chat-core.ts")
    check("the kept page is in memory and the tab's sessionStorage, under the member's id", /window\.sessionStorage/.test(core) && /export function chatCacheKey\(userId: string \| null \| undefined, kind: ChatKind, chatId: string\): string \{\s*return `\$\{userId \?\? "anon"\}:\$\{kind\}:\$\{chatId\}`/.test(core) && /STORED_MESSAGES = 40/.test(core) && /STORED_CHATS = 24/.test(core))
    check("every storage read and write is guarded", (core.match(/try \{/g) ?? []).length >= 4)
    check("one ask per chat: a second caller gets the ask on its way", /const busy = ASKING\.get\(key\)\s*if \(busy\) return busy/.test(core))
    check("a row already kept up to its newest message is not asked for again", /if \(newest && lastAt && Date\.parse\(newest\) >= Date\.parse\(lastAt\)\) return/.test(core))
    check("one time formatter for every bubble", /CLOCK \?\?= new Intl\.DateTimeFormat/.test(core) && !/toLocaleTimeString/.test(core))
    const msgs = code("components/community/member/messages.tsx")
    check("the list: kept per community and member, drawn from the kept copy, refreshed quietly", /useState<InboxData \| null>\(\(\) => keptList<InboxData>\(communityId, userId\)\)/.test(msgs) && /keepList\(communityId, userId, next\)/.test(msgs) && !/let inboxKept/.test(msgs))
    check("and read before the panel first opens, from the badge's own ask", /keepList\(communityId, userId, \{ conversations: r\.data\.conversations/.test(msgs) && /if \(!userId \|\| initial === null \|\| keptList\(communityId, userId\)\) return/.test(msgs))
    check("rows asked for on hover, touch and focus, and the top rows as the list is drawn", (msgs.match(/onPointerEnter=\{\(\) => warm\(/g) ?? []).length === 2 && (msgs.match(/onTouchStart=\{\(\) => warm\(/g) ?? []).length === 2 && /const WARM_TOP = 3/.test(msgs))
    check("the list's skeleton is row shaped and only for a list never read", /data-messages-skeleton=""/.test(msgs) && /rows === null && !failed \?/.test(msgs))
    check("the stream's join does not ask for the list a second time", /if \(Date\.now\(\) - askedAt\.current > 2000\) void load\(\)/.test(msgs))
    check("a conversation opened from a profile again opens at once", /keptValue<\{ id: string; other: Person \| null \}>\(`dm-with:/.test(msgs))
    const s = code("components/community/member/chat-surface.tsx")
    check("no spinner anywhere in the chat screen", !/Spinner/.test(s) && !/place-spinner/.test(s))
    check("a cold open draws skeleton bubbles where the messages land", /\{!loaded && items\.length === 0 \? \(\s*<SkeletonBubbles \/>/.test(s) && /h-\[34px\] rounded-\[18px\]/.test(s))
    check("a chat opens on its kept page and waits on the list's ask rather than asking again", /p\.initial \?\? cachedPage\(cacheKey\)/.test(s) && /void prefetchPage\(cacheKey, url, \{ force: !!start \}\)/.test(s) && /if \(start && freshFor\(cacheKey, 4000\)\) return/.test(s))
    check("the server's answer keeps every unchanged bubble as it was drawn", /function sameAsBefore\(/.test(s) && (s.match(/sameAsBefore\(cur, mergeMessages\(/g) ?? []).length === 2)
    check("the newest bubbles first, the rest when the page is idle", /const FIRST_DRAW = 24/.test(s) && /items\.slice\(-tail\)/.test(s) && /if \(!el \|\| !root \|\| !hasMore \|\| tail !== null/.test(s))
    check("bubbles memoised, keyed by the client id, their handlers one object that never changes", /const Bubble = memo\(function Bubble/.test(s) && /key=\{m\.clientId \? `c:\$\{m\.clientId\}` : m\.id\}/.test(s) && /const acts = useMemo<BubbleActs>\(/.test(s))
    check("sending: full strength, the clock only after a moment", !/opacity-70"/.test(s.slice(s.indexOf("const Bubble = memo"), s.indexOf("function Pictures"))) && /PENDING_CLOCK_MS = 400/.test(s))
    check("round 37's send stands: on screen at once, a client id, retried under the same id", /state: "sending",/.test(s) && /clientId = newClientId\(\)/.test(s) && /const retry = \(m: ChatItem\)[\s\S]{0,200}void post\(m\)/.test(s))
    check("no catch up while the first page is on its way", /if \(!last && !loadedRef\.current\) return/.test(s))
  }

  /* ── RICH ─────────────────────────────────────────────────────────────── */
  console.log("\nEmoji, GIFs, pictures, videos, links")
  {
    const s = code("components/community/member/chat-surface.tsx")
    check("emoji and GIF tools are their own chunks, loaded after the chat is up", /const EmojiTool = lazy\(\(\) => import\("@\/components\/app\/rich-text\/emoji-picker"\)/.test(s) && /const GifTool = lazy\(\(\) => import\("\.\/media-gif"\)/.test(s) && !/^import .*emoji-picker/m.test(s) && !/^import .*media-gif/m.test(s))
    check("the emoji picker is drawn on the first press, already open", /<EmojiTool [^>]*startOpen/.test(s) && /<ToolStandIn onPress=\{\(\) => setEmoji\(true\)\} \/>/.test(s) && /startOpen = false/.test(code("components/app/rich-text/emoji-picker.tsx")))
    check("a GIF search only when GIFs are connected, sent as it is picked", /hideWhenOff onPick=\{\(gif\) => onSend\("", \[gif\]\)\}/.test(s) && /if \(hideWhenOff && connected !== true\) return null/.test(code("components/community/member/media-gif.tsx")))
    check("an uploaded GIF is a GIF in the viewer (never the optimizer's one frame)", /a\.type === "image" && isGifPicture\(a\)\) list\.push\(\{ kind: "gif"/.test(s))
    check("a video is a video in the tray and in the bubble, played from the file picked while it is sent", /data-chat-upload-video=""/.test(s) && /keepLocalVideo\(media\.assetId, item\.preview\)/.test(s) && /<ChatVideo key=\{f\.assetId\}/.test(s))
    check("the link being written is previewed, and goes with the message signed as the server sent it", /useLinkDraft\(communityId, draftUrl\)/.test(s) && /\{ type: "link", \.\.\.linkCard \} as PostMedia/.test(s) && /ready\.length < CHAT_ATTACHMENTS_MAX/.test(s))
    const rich = code("components/community/member/chat-rich.tsx")
    check("a video by link: a still and a button, the player only after a press, youtube-nocookie", /\{playing \? \(\s*<iframe\s*src=\{embedPlayerSrc\(video\)\}/.test(rich) && /referrerPolicy="strict-origin-when-cross-origin"/.test(rich) && /youtube-nocookie/.test(read("lib/communities/post-media.ts")))
    check("cards and links open safely in a new tab; outside pictures send no referrer", (rich.match(/rel="noopener noreferrer nofollow ugc"/g) ?? []).length === 2 && (rich.match(/target="_blank"/g) ?? []).length === 2 && (rich.match(/referrerPolicy="no-referrer"/g) ?? []).length >= 3)
    check("a card's address is checked again where it is drawn", /const href = webUrl\(card\.url\)\s*if \(!href\) return null/.test(rich))
    check("every box has its size before it loads", /aspect-video/.test(rich) && /aspect-\[1\.91\]/.test(rich))
    check("a video file is asked for only near the screen", /new IntersectionObserver\(\(entries\) => entries\.some\(\(e\) => e\.isIntersecting\) && setNear\(true\), \{ rootMargin: "400px 0px" \}\)/.test(rich))
    check("the words' links: http and https only, rel and target set", /\(https\?:\\\/\\\/\[\^\\s<>"'\]\+/.test(read("components/community/member/body-text.tsx")) && /target="_blank" rel="noopener noreferrer nofollow ugc"/.test(read("components/community/member/body-text.tsx")))
    check("CSP already lets the privacy players in and nothing new was added", /frame-src [^;]*https:\/\/www\.youtube-nocookie\.com/.test(CONTENT_SECURITY_POLICY) && /frame-src [^;]*https:\/\/player\.vimeo\.com/.test(CONTENT_SECURITY_POLICY))
    check("no user agent sniffing in the chat screens", !/navigator\.userAgent|isIOS|iPhone/.test(s + rich + code("components/community/member/messages.tsx")))
    const files = ["components/community/member/chat-surface.tsx", "components/community/member/chat-rich.tsx", "components/community/member/chat-core.ts", "components/community/member/messages.tsx", "lib/communities/chat-links.ts", "lib/communities/server/chat-unfurl.ts", "lib/communities/server/chat-media.ts", "app/api/community/[communityId]/chat/unfurl/route.ts", "scripts/check-community-chat-speed-r38.mjs"]
    const offenders = files.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
    check("copy: no em dash, no banned word", offenders.length === 0, offenders)
    const client = ["components/community/member/chat-rich.tsx", "components/community/member/chat-core.ts", "lib/communities/chat-links.ts"]
    check("the browser's parts import nothing from the server", client.every((f) => !/server-only|lib\/communities\/server|next\/headers/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
