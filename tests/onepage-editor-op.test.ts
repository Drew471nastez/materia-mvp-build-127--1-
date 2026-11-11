/**
 * The OnePage editor round after AR: invisible click to select in the
 * phone preview, no AI in the editor, and the block inputs a creator types
 * into (Instagram handle, posts added by hand, the booking message and its
 * placeholders, YouTube autoplay, the Canva mark, addresses and phone
 * numbers).
 *
 * scripts/check-onepage-pick-op.mjs measures the click to select in
 * Chromium.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { nearestBlock, pickAction, pickStyle } from "@/lib/onepage/preview-select"
import { appAddressFromInput, appAddressShown, appTarget, appUrlProblem } from "@/lib/onepage/app-blocks"
import { storelibBlockHasContent, pastedPosts } from "@/lib/onepage/storelib-blocks"
import { isLinkBrandIcon, linkIconFromUrl, linkIconLabel } from "@/components/onepage/link-icons"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function section(name: string) { console.log(`\n${name}`) }
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

section("Click a block in the phone preview, nothing drawn")
{
  const rects = [
    { id: "a", left: 20, top: 100, right: 370, bottom: 150 },
    { id: "b", left: 20, top: 166, right: 370, bottom: 216 },
  ]
  check("a point on a block is that block", nearestBlock(rects, 100, 120) === "a")
  check("a point in the gap goes to the nearer block", nearestBlock(rects, 100, 154) === "a" && nearestBlock(rects, 100, 162) === "b")
  check("far from every block is nothing", nearestBlock(rects, 100, 400) === null && nearestBlock(rects, 100, 40) === null)
  check("a page margin wider than the slack is nothing", nearestBlock(rects, 2, 120, 8) === null)
  check("an empty box is never picked", nearestBlock([{ id: "z", left: 0, top: 0, right: 0, bottom: 0 }], 0, 0) === null)
  check("the open block's click goes to the page and brings the list back", pickAction({ mode: true, selected: "a", hit: "a" }) === "reveal")
  check("another block's click is taken", pickAction({ mode: true, selected: "a", hit: "b" }) === "select")
  const css = pickStyle("blk_1")
  check("frames in blocks give their clicks to the block, except the open block's", /\[data-op-block\] iframe\{pointer-events:none\}/.test(css) && /\[data-op-block="blk_1"\] iframe\{pointer-events:auto\}/.test(css))
  check("a hand over every block, nothing else in the style", /cursor:pointer/.test(css) && !/outline|box-shadow|border/.test(css))
  check("an id that is not the editor's never reaches the style", !/<|"\]\{/.test(pickStyle('x"]{color:red}')) && pickStyle(null).indexOf("auto") === -1)
  const doc = code("components/onepage/preview-document.tsx")
  const picker = doc.slice(doc.indexOf("function BlockPicker"), doc.indexOf("A NEW THEME IS DRAWN"))
  check("the frame draws no ring or outline", !/data-pick-hover|data-pick-open|boxShadow|\bring\b|outline/.test(picker))
  check("a gap click only counts on the page round the blocks, never in a sheet over it", /querySelector\("\[data-op-block\]"\)\) return null/.test(picker))
  const list = code("components/onepage/tabs/links-tab.tsx")
  check("the list glides again on a second click of the open block", /setPickTick\(\(n\) => n \+ 1\)/.test(list) && /\[selectedBlockId, pickTick\]/.test(list))
}

section("No AI in the OnePage editor")
{
  check("the AI line is gone, with its edits and route", !existsSync(join(process.cwd(), "components/onepage/ai-edit-bar.tsx")) && !existsSync(join(process.cwd(), "lib/onepage/ai-edits.ts")) && !existsSync(join(process.cwd(), "app/api/onepage/ai")))
  check("nothing in the OnePage editor asks for it", !/AiEditBar|api\/onepage\/ai/.test(code("components/onepage/tabs/links-tab.tsx") + code("components/onepage/onepage-editor.tsx")))
}

section("Instagram: @handle, a bare handle or a link")
{
  const ig = (raw: string) => appAddressFromInput("instagram", raw).url
  check("@handle becomes the profile", ig("@ana.studio") === "https://instagram.com/ana.studio")
  check("a bare handle too", ig("ana_studio") === "https://instagram.com/ana_studio")
  check("a link without https", ig("instagram.com/ana") === "https://instagram.com/ana")
  check("a shared link loses www., its tracking and its slash", ig("https://www.instagram.com/ana/?igsh=abc123") === "https://instagram.com/ana" && ig("m.instagram.com/ana") === "https://instagram.com/ana" && ig("http://instagram.com/ana") === "https://instagram.com/ana")
  check("a post or reel is kept whole, so it plays", ig("https://www.instagram.com/p/C0abcDEF12/") === "https://www.instagram.com/p/C0abcDEF12/" && ig("instagram.com/reel/C0abcDEF12") === "https://instagram.com/reel/C0abcDEF12")
  check("a name with a space is not a handle", appAddressFromInput("instagram", "@bad name").valid === false)
  check("shown as @handle", appAddressShown("instagram", "https://instagram.com/ana") === "@ana" && appAddressShown("instagram", "https://www.instagram.com/ana/") === "@ana")
  check("a post is shown as its link", appAddressShown("instagram", "https://www.instagram.com/p/C0abcDEF12/") === "https://www.instagram.com/p/C0abcDEF12/")
  check("a handle saved as typed before still draws its profile", appTarget({ provider: "instagram", url: "@ana" } as never)?.href === "https://instagram.com/ana" && !appUrlProblem({ provider: "instagram", url: "ana" } as never))
  check("another site in the Instagram field is a problem", appUrlProblem({ provider: "instagram", url: appAddressFromInput("instagram", "tiktok.com/@ana").url } as never))
  check("TikTok, X and Threads read handles the same way", appAddressFromInput("tiktok", "@ana").url === "https://tiktok.com/@ana" && appAddressFromInput("x", "jack").url === "https://x.com/jack" && appAddressShown("tiktok", "https://tiktok.com/@ana") === "@ana")
  check("an X post stays a post", appAddressFromInput("x", "https://x.com/jack/status/20").url === "https://x.com/jack/status/20")
  check("a service without handles is left as typed", appAddressFromInput("facebook", "facebook.com/page").url === "facebook.com/page")
  const ed = code("components/onepage/app-block-editor.tsx")
  check("the editor's field reads handles and shows @handle once left", /HandleAddressInput/.test(ed) && /appAddressShown\(providerId, appAddressFromInput\(providerId, text\)\.url\)/.test(ed))
}

section("Posts: only what the creator pastes")
{
  check("a YouTube channel alone draws nothing (no videos pulled by themselves)", !storelibBlockHasContent({ type: "social_posts", data: { network: "youtube", channel_url: "https://www.youtube.com/@mkbhd" } } as never))
  check("pasted posts draw", storelibBlockHasContent({ type: "social_posts", data: { network: "youtube", post_urls: ["https://youtu.be/dQw4w9WgXcQ"] } } as never) && pastedPosts({ network: "instagram", post_urls: ["https://www.instagram.com/p/C0abcDEF12/"] }).length === 1)
  const server = code("lib/onepage/storelib-blocks-server.ts")
  check("the server reads no channel feed for posts", !/channelVideos|feeds\/videos\.xml|youtubeFeedUrl/.test(server))
  const editor = code("components/onepage/storelib-blocks.tsx")
  check("the editor asks for links, optional, and no channel", /Video links \(optional, one a line\)/.test(editor) && !/Your latest videos show by themselves/.test(editor) && !/tt\("Your channel"\)/.test(editor))
  check("the Add block sheet promises no syncing", !/Your latest videos, synced|A row of your latest posts/.test(code("components/onepage/add-block-picker.tsx")))
}

section("Canva has its own mark")
{
  check("Canva is a brand mark with its name", isLinkBrandIcon("canva") && linkIconLabel("canva") === "Canva")
  check("a canva.com link draws it", linkIconFromUrl("https://www.canva.com/design/DAF123/view") === "canva" && linkIconFromUrl("ana.my.canva.site") === "canva")
  check("the mark is in the trimmed set, from Simple Icons", /export function SiCanva\(/.test(code("components/icons/brand-icons.generated.ts")))
  const icons = code("components/onepage/brand-icons.tsx")
  check("drawn from SiCanva, in Canva's teal, whole", /canva: SiCanva/.test(icons) && /canva: "#00C4CC"/.test(icons) && /canva: \{ draw:/.test(icons))
  check("the Add block sheet shows it", /embed\("int_canva", "Canva", "canva", "canva"/.test(code("components/onepage/add-block-picker.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
