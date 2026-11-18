/**
 * ===========================================================================
 *  ROUND 11: + ADD, THE ADD BLOCK SHEET, BRAND MARKS, EMBEDS, SOCIAL SHEET,
 *  CHOOSE ICON
 * ===========================================================================
 * The rules behind what scripts/check-onepage-addblock-r11.mjs measures in a
 * browser: the embeds' links and frames (lib/onepage/creator-blocks
 * embedSource) and that every frame host is allowed by the one policy
 * (lib/security/csp.ts, vercel.json); brand marks in their colours
 * (components/onepage/brand-icons) and the page's choice of them; the
 * picker's catalogue, chips and presses; the social sheet's close and
 * keyboard; the icon library.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  CREATOR_BLOCK_TYPES,
  EMBED_FRAME_HOSTS,
  EMBED_PROVIDER_NAME,
  creatorBlockHasContent,
  embedFrameUrl,
  embedHeightFromMessage,
  embedSource,
} from "@/lib/onepage/creator-blocks"
import { EXTRA_BLOCK_TYPES } from "@/lib/onepage/extra-blocks"
import { createDefaultBlock, type OnePageBlock, type OnePageTheme } from "@/lib/onepage/types"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { PICKER_ENTRIES, searchEntries } from "@/components/onepage/add-block-picker"
import { BRAND_COLORS, LinkIcon, SocialIcon, brandColor } from "@/components/onepage/brand-icons"
import { LINK_BRAND_ICONS, LINK_ICONS } from "@/components/onepage/link-icons"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const theme = {
  template_id: "t", background_type: "solid", background_color: "#ffffff", text_color: "#1a1a2e",
  button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 14,
  button_border_width: 0, button_border_color: "#000000", font_family: "Inter",
} as unknown as OnePageTheme
const b = (type: string, data: unknown): OnePageBlock => ({ id: type, type, enabled: true, sort_order: 0, data }) as OnePageBlock
const html = (block: OnePageBlock) => renderToStaticMarkup(React.createElement(ExtraBlock, { block, look: { theme, scale: "live" } }))

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Embeds: each service's own public embed, from the link people copy")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const cases: [string, string, string | null][] = [
      ["instagram", "https://www.instagram.com/p/C8ZQd4dOWQk/?igsh=x", "https://www.instagram.com/p/C8ZQd4dOWQk/embed/"],
      ["instagram", "instagram.com/reel/C8ZQd4dOWQk/", "https://www.instagram.com/reel/C8ZQd4dOWQk/embed/"],
      ["x", "https://x.com/jack/status/20", "https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true"],
      ["x", "https://twitter.com/a/status/1234567890123?s=20", "https://platform.twitter.com/embed/Tweet.html?id=1234567890123&dnt=true"],
      ["typeform", "https://acme.typeform.com/to/abc123", "https://acme.typeform.com/to/abc123?typeform-embed=embed-widget"],
      ["googleforms", "https://docs.google.com/forms/d/e/1FAIpQLSf3/viewform?usp=sf_link", "https://docs.google.com/forms/d/e/1FAIpQLSf3/viewform?embedded=true"],
      /* Changed on purpose (round 42): dynamicHeight=1, so Tally says its height and the form never scrolls inside its frame. */
      ["tally", "https://tally.so/r/wMDxQr", "https://tally.so/embed/wMDxQr?alignLeft=1&hideTitle=0&transparentBackground=1&dynamicHeight=1"],
      ["substack", "https://mara.substack.com/p/hello", "https://mara.substack.com/embed"],
      ["podcasts", "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000650000000", "https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000650000000"],
      ["twitch", "https://www.twitch.tv/Shroud", "https://player.twitch.tv/?channel=shroud&autoplay=false"],
      ["twitch", "https://clips.twitch.tv/FunnyClip-abc", "https://clips.twitch.tv/embed?clip=FunnyClip-abc&autoplay=false"],
      ["loom", "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002", "https://www.loom.com/embed/e5b8c04bca094dd8a5507925ab887002"],
      ["mixcloud", "https://www.mixcloud.com/spartacus/party-time/", "https://player-widget.mixcloud.com/widget/iframe?feed=%2Fspartacus%2Fparty-time%2F&hide_cover=1&light=1"],
      ["bandcamp", '<iframe style="border: 0" src="https://bandcamp.com/EmbeddedPlayer/album=1536701931/size=large/" seamless></iframe>', "https://bandcamp.com/EmbeddedPlayer/album=1536701931/size=large/bgcol=ffffff/linkcol=1a1a2e/tracklist=false/artwork=small/transparent=true/"],
      ["deezer", "https://www.deezer.com/en/album/302127", "https://widget.deezer.com/widget/auto/album/302127"],
      ["gcal", "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0abc", "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0abc?gv=true"],
    ]
    for (const [kind, link, want] of cases) {
      const s = embedSource(link)
      check(`${EMBED_PROVIDER_NAME[kind as keyof typeof EMBED_PROVIDER_NAME]}: ${link.slice(0, 60)}`, s?.kind === kind && s.embedUrl === want, JSON.stringify(s))
    }
    for (const bad of ["", "https://example.com/x", "javascript:alert(1)", "https://www.instagram.com/mara/", "https://x.com/jack", "https://www.twitch.tv/directory/game/x", "https://forms.gle/abc", "https://www.substack.com", "https://bandcamp.com/album/x", "https://evil.com/?u=https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002"]) {
      check(`not an embed: ${bad || "(empty)"}`, embedSource(bad) === null, JSON.stringify(embedSource(bad)))
    }
    const tw = embedSource("https://www.twitch.tv/twitch")!
    check("Twitch is told the page's own host (it refuses any other)", embedFrameUrl(tw, "storelib.me") === "https://player.twitch.tv/?channel=twitch&autoplay=false&parent=storelib.me" && embedFrameUrl(tw, "links.mara.com:443")?.endsWith("parent=links.mara.com") === true)
    check("and without a host it has no frame yet (the server draws none)", embedFrameUrl(tw, null) === null && embedFrameUrl(tw, "bad host!") === null)
    check("every other embed loads as it is", embedFrameUrl(embedSource("https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002")!, null) === "https://www.loom.com/embed/e5b8c04bca094dd8a5507925ab887002")
    check("an Instagram post's height, from Instagram only", embedHeightFromMessage("instagram", "https://www.instagram.com", JSON.stringify({ type: "MEASURE", details: { height: 700 } })) === 700 && embedHeightFromMessage("instagram", "https://evil.example", JSON.stringify({ type: "MEASURE", details: { height: 700 } })) === null)
    check("an X post's height, from X only, and nothing silly", embedHeightFromMessage("x", "https://platform.twitter.com", { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 553 }] } }) === 553 && embedHeightFromMessage("x", "https://platform.twitter.com", { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 99999 }] } }) === null)

    /* The one policy: every frame host in frame-src, and vercel.json's header the same string. */
    const frameSrc = CONTENT_SECURITY_POLICY.split("; ").find((d) => d.startsWith("frame-src ")) ?? ""
    check("every embed host is in frame-src", EMBED_FRAME_HOSTS.every((h) => frameSrc.split(" ").includes(h)), EMBED_FRAME_HOSTS.filter((h) => !frameSrc.split(" ").includes(h)).join(" "))
    check("and vercel.json sends exactly that policy", read("vercel.json").includes(`"value": "${CONTENT_SECURITY_POLICY}"`))
    const hostOf = (u: string) => new URL(u).origin
    const allowed = (origin: string) => EMBED_FRAME_HOSTS.some((h) => (h.includes("*.") ? origin.endsWith(h.replace("https://*", "")) && origin.startsWith("https://") : h === origin))
    check("every frame a case above makes is from an allowed host", cases.every(([, , want]) => want && allowed(hostOf(want))))

    check("embed is a creator block, so the lists that keep the newer blocks out of a group and off an empty page have it", (CREATOR_BLOCK_TYPES as readonly string[]).includes("embed") && (EXTRA_BLOCK_TYPES as readonly string[]).includes("embed"))
    const fresh = createDefaultBlock("embed")
    check("a new embed block starts empty", fresh.type === "embed" && (fresh.data as { url: string }).url === "")
    check("an empty or unknown link is not on the page", !creatorBlockHasContent(b("embed", { url: "" })) && !creatorBlockHasContent(b("embed", { url: "https://example.com" })) && creatorBlockHasContent(b("embed", { url: "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002" })))
    const loom = html(b("embed", { url: "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002", title: "Watch this" }))
    check("drawn once for preview and live: a lazy frame with a title, at its address, in a 16:9 box", /data-onepage-embed="loom"/.test(loom) && /<iframe[^>]*src="https:\/\/www\.loom\.com\/embed\/e5b8c04bca094dd8a5507925ab887002"/.test(loom) && /loading="lazy"/.test(loom) && /aspect-ratio:16 \/ 9/.test(loom) && />Watch this</.test(loom), loom.slice(0, 300))
    const twitch = html(b("embed", { url: "https://www.twitch.tv/twitch" }))
    check("Twitch on the server: the box, no frame until the browser knows its host", /data-onepage-embed="twitch"/.test(twitch) && !/<iframe/.test(twitch))
    const form = html(b("embed", { url: "https://tally.so/r/wMDxQr" }))
    check("a form has its height before it loads, so nothing under it moves", /height:520px/.test(form))
    check("nothing drawn for a link that is not an embed", html(b("embed", { url: "https://example.com" })) === "")
    const live = read("components/onepage/public-onepage.tsx")
    check("the live page draws it with the others", /case "contact_form":\n\s*case "embed":\n\s*case "heading":/.test(live))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Brand marks in their own colours, and the page's choice of them")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("each brand's own colour", brandColor("youtube") === "#FF0000" && brandColor("spotify") === "#1ED760" && brandColor("whatsapp") === "#25D366" && brandColor("x") === null && brandColor("website") === null)
    const yt = renderToStaticMarkup(React.createElement(SocialIcon, { platform: "youtube", tone: "brand", color: "#111111" }))
    check("tone brand: YouTube in red", /data-tone="brand"/.test(yt) && /color:#FF0000/i.test(yt), yt.slice(0, 200))
    const ytMono = renderToStaticMarkup(React.createElement(SocialIcon, { platform: "youtube", color: "#111111" }))
    check("one colour (the default): the colour it is handed", !/data-tone/.test(ytMono) && /color:#111111/.test(ytMono))
    const x = renderToStaticMarkup(React.createElement(SocialIcon, { platform: "twitter", tone: "brand", color: "#f4efe9" }))
    check("a black mark keeps the page's colour, so it reads on a dark page", /color:#f4efe9/.test(x))
    const ig = renderToStaticMarkup(React.createElement(SocialIcon, { platform: "instagram", tone: "brand" }))
    const id = ig.match(/radialGradient id="([^"]+)"/)?.[1]
    check("Instagram in its own gradient, filled by its own id", !!id && ig.includes(`fill="url(#${id})"`) && /viewBox="0 0 24 24"/.test(ig))
    const snap = renderToStaticMarkup(React.createElement(SocialIcon, { platform: "snapchat", tone: "brand" }))
    check("Snapchat's yellow keeps a hairline of black, as Snapchat draws it on white", /color:#FFFC00/i.test(snap) && /stroke:#111113/.test(snap) && /paint-order:stroke/.test(snap))
    const all = LINK_BRAND_ICONS.map((k) => [k, renderToStaticMarkup(React.createElement(LinkIcon, { name: k, size: 20, tone: "brand" }))] as const)
    check("every brand a link can wear draws, crisp (an svg with a path)", all.every(([, m]) => /<svg[^>]*viewBox="0 0 \d+ \d+"/.test(m) && /<path d="M/.test(m)), all.filter(([, m]) => !/<path d="M/.test(m)).map(([k]) => k).join(","))
    check("and has a colour or is a black mark on purpose", LINK_BRAND_ICONS.every((k) => k in BRAND_COLORS))
    check("the icon library offers them", ["amazon", "etsy", "kofi", "paypal", "substack", "apple-podcasts", "google-forms"].every((k) => LINK_ICONS.some((i) => i.id === k)))
    const design = read("components/onepage/tabs/design-tab.tsx")
    check("Design › Social icons: Brand colours or One colour", /tt\("Brand colours"\)/.test(design) && /tt\("One colour"\)/.test(design) && /updateTheme\(\{ social_icon_tone: choice\.id \}/.test(design))
    const live = read("components/onepage/public-onepage.tsx")
    check("the live page (and so the preview) draws the choice; a page saved before it stays one colour", /socialIconToneOf\(theme as never\)/.test(live) && /tone=\{socialTone\}/.test(live) && /social_icon_tone === "brand" \? "brand" : "mono"/.test(read("lib/onepage/social-look.ts")))
    check("a new page starts on brand colours", /social_icon_tone: "brand"/.test(read("lib/onepage/ensure-onepage.ts")))
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("the editor's social sheet, chips and rows draw the brand marks on a white tile", (tab.match(/tone="brand"/g) ?? []).length >= 6 && !/markOn\(/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The Add block sheet: the catalogue, the open, the chips, a press")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* Changed on purpose (round AL): no Integrations category; the embed entries are found by search, and still start the block as their service. */
    const embeds = PICKER_ENTRIES.filter((e) => e.type === "embed" && e.id.startsWith("int_"))
    check("each embed entry starts the block as its service, and that service is one embedSource reads", embeds.length >= 10 && embeds.every((e) => typeof e.data?.provider === "string" && (e.data.provider as string) in EMBED_PROVIDER_NAME))
    /* Changed on purpose (round AL): "typeform" finds the listed Typeform app block first, then the embed entry; "tweet" finds the X app block and the X embed. */
    /* Changed on purpose (round AO): "one thing, one entry". Where the app block for a service is found, the old embed and link rows with its mark are left out of the search; the app block is what is found by those words. */
    check("search finds them by their names and by what people call them", searchEntries(PICKER_ENTRIES, "typeform")[0]?.id === "app_typeform" && !searchEntries(PICKER_ENTRIES, "typeform").some((e) => e.id === "int_typeform") && searchEntries(PICKER_ENTRIES, "tweet").some((e) => e.id === "app_x") && searchEntries(PICKER_ENTRIES, "podcast").some((e) => e.id === "app_podcasts") && !searchEntries(PICKER_ENTRIES, "insta").some((e) => e.id === "int_instagram" || e.id === "instagram") && searchEntries(PICKER_ENTRIES, "tip").some((e) => e.id === "kofi"))
    check("links for shops and tips wear their brand on the button", ["amazon", "etsy", "kofi", "paypal", "cashapp", "venmo"].every((id) => { const e = PICKER_ENTRIES.find((x) => x.id === id); return !!e?.preset?.icon && e.brand !== undefined }))
    const picker = read("components/onepage/add-block-picker.tsx")
    check("the open state is a store of its own, read by the sheet and the button only", /export function setAddSheetOpen/.test(picker) && /useSyncExternalStore\(addSheetSubscribe/.test(picker) && /export function AddSheetGate/.test(picker))
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("so the Links tab holds no open state for it", !/useState\(false\)[^\n]*\n?[^\n]*showAddModal/.test(tab) && !/const \[showAddModal/.test(tab) && /<AddSheetGate>\{\(showAddModal\) => \(/.test(tab) && /<AddBlockButton/.test(tab))
    check("nothing is reset on the open: after the close, once it has gone", /if \(open\) return\n\s*const t = window\.setTimeout\(\(\) => \{\n\s*setCategory\(FIRST_VIEW\)/.test(picker) /* Changed on purpose (round AL): back to Essentials, the view it opens on. */ && !/scrollTo\(\{ top: 0 \}\)/.test(picker))
    check("the rows are memoised and a chip only hides sections, kept (content-visibility)", /const EntryRow = React\.memo\(/.test(picker) && /const PickerSection = React\.memo\(/.test(picker) && /contentVisibility: "hidden"/.test(picker))
    /* The same row as every other pill row in the editor (agent MOTION's round 11: components/onepage/pill-tabs over lib/ui/pill-switch, Storelib's own pills), so they are one look and one motion. */
    check("the chips are Storelib's pills: the editor's one PillTabs row, kept in view", /<PillTabs\n\s*dataRow="add-block-categories"[\s\S]{0,300}keepInView\n\s*itemAttr="data-picker-chip"/.test(picker))
    check("and what a chip shows lands as those pills' content does (landContent)", /landContent\(listRef\.current\)/.test(picker) && /import \{ landContent \} from "@\/lib\/ui\/pill-switch"/.test(picker))
    const library = read("components/onepage/icon-library.tsx")
    for (const [file, src] of [["add-block-picker", picker], ["icon-library", library]] as const) {
      check(`${file}: no press scales, lifts or moves (a tint only)`, !/active:scale|active:translate|active:-translate|hover:scale|hover:-translate/.test(src))
      check(`${file}: no hover class Tailwind never makes ([@media(hover:hover)...]: is not generated; hover: and pointer-fine: are)`, !/["\s]\[@media\(hover:hover\)/.test(src))
    }
    check("Choose icon's categories are the same pills", /<PillTabs\n\s*dataRow="icon-categories"/.test(library))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The social sheet: Cancel closes as it is, the keyboard does not move it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const tab = read("components/onepage/tabs/links-tab.tsx")
    const close = tab.slice(tab.indexOf("const closeSocialSheet = () => {"), tab.indexOf("const closeThumbnailSheet"))
    check("the close does not empty the sheet on the frame it starts: what was typed is cleared after it has gone", /React\.startTransition\(\(\) => setShowSocialModal\(false\)\)/.test(close) && /window\.setTimeout\(\(\) => \{\n\s*if \(socialOpenRef\.current\) return/.test(close) && close.indexOf("setSelectedSocial(null)") > close.indexOf("window.setTimeout"))
    check("Cancel is the sheet's own close on a phone (the slide first)", /data-social-cancel=""\n\s*data-sheet-close=\{isMobileModalViewport \? "" : undefined\}/.test(tab) && /\{tt\("Cancel"\)\}/.test(tab))
    check("one height for the list and the field, whose top the keyboard never moves", /const SOCIAL_SHEET_HEIGHT = "calc\(\(var\(--vv-h, 100dvh\) \+ var\(--kb-inset, 0px\)\) \* 0\.75 - var\(--kb-inset, 0px\)\)"/.test(tab) && /* Changed on purpose (round 42): the list keeps that height; a platform's field is as tall as it is. */ /sheet=\{\{ keepMounted: true, height: selectedSocial \? undefined : SOCIAL_SHEET_HEIGHT, className: SOCIAL_SHEET_GLIDE \}\}/.test(tab))
    check("and KeyboardGuard leaves its field where it is", /data-social-sheet="" data-keyboard-own=""/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Choose icon")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const library = read("components/onepage/icon-library.tsx")
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("a virtual grid: only the rows near the screen are built", /function VirtualIconGrid/.test(library) && /OVERSCAN_ROWS = 3/.test(library) && /items\.slice\(first \* cols, last \* cols\)/.test(library))
    check("its search and category are its own (typing renders the library, not the tab)", /const \[query, setQuery\] = React\.useState\(""\)/.test(library) && !/iconSearchQuery/.test(tab))
    check("on a phone its own kept sheet, opened by a store", /<IconLibraryGate>\{\(libraryUp\) => \(/.test(tab) && /keepMounted: true, height: SHEET_DIALOG_MAX_HEIGHT, zIndex: 210/.test(tab) && /setIconLibraryOpen\(true\)/.test(tab))
    check("choosing applies to the link at once and closes", /const chooseLinkIcon = \(iconId: string\) => \{[\s\S]{0,300}icon: iconId, thumbnail_url: null[\s\S]{0,80}closeThumbnailSheet\(\)/.test(tab))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
