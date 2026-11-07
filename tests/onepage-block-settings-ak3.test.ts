/**
 * Round AK3: one Settings | Layout pair for every OnePage block, the link
 * layouts read as one choice, previews that never overwrite what the creator
 * changed, and saved presentation fields read without loss.
 */
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LINK_LAYOUTS, blockTakesDescription, layoutControlsFor, linkLayoutOf, linkLayoutPatch, presentationOf, presentationVars, socialProfile } from "../lib/onepage/block-presentation"
import { mergeLinkPreview, restorePreview, editedMark } from "../lib/onepage/link-preview"
import { shelfUsesProductCards } from "../lib/onepage/storelib-blocks"
import { BlockPresentationFrame, VisualLinkCard } from "../components/onepage/block-presentation"
import { defaultTheme, type OnePageBlock, type LinkButtonBlockData } from "../lib/onepage/types"

const link = (data: Partial<LinkButtonBlockData>, presentation?: Record<string, unknown>): OnePageBlock =>
  ({ id: "l", type: "link_button", enabled: true, sort_order: 0, data: { label: "My Link", url: "https://example.com", ...data }, ...(presentation ? { style: { presentation } } : {}) }) as OnePageBlock

/* ── One link layout picker over the two saved fields ── */
assert.equal(linkLayoutOf(link({})), "classic")
assert.equal(linkLayoutOf(link({ layout_type: "pro" })), "featured")
assert.equal(linkLayoutOf(link({}, { variant: "featured" })), "cover", "the old tall Featured card keeps its own choice")
assert.equal(linkLayoutOf(link({}, { variant: "image-first" })), "image-first")
assert.equal(linkLayoutOf(link({}, { media_mode: "card" })), "visual", "Open link on a social card was drawn as the card")
for (const id of LINK_LAYOUTS) {
  const patch = linkLayoutPatch(id)
  const b = link({ layout_type: patch.layout_type }, patch.variant ? { variant: patch.variant } : undefined)
  assert.equal(linkLayoutOf(b), id, `${id} round-trips`)
}

/* ── Saved presentation is read, clamped, never dropped ── */
const legacy = { subtitle: "Old line", variant: "compact", gradient_from: "#111111", gradient_to: "#222222", overlay: 40, unknown_future_field: 7 }
const p = presentationOf(link({}, legacy))
assert.equal(p.subtitle, "Old line")
assert.equal(p.variant, "compact")
assert.equal(p.gradient_from, "#111111")
const fresh = presentationOf(link({}, { background: "#ffeedd", radius: 99, shadow: "lifted", fade: false, aspect: "4/5" }))
assert.deepEqual([fresh.background, fresh.radius, fresh.shadow, fresh.fade, fresh.aspect], ["#ffeedd", 40, "lifted", false, "4/5"])
assert.equal(presentationOf(link({}, { background: "red;x", shadow: "huge", aspect: "3/1" })).background, undefined)
assert.equal((presentationVars(fresh) as Record<string, string>)["--op-block-radius"], "40px")

/* ── Only the controls a block uses ── */
assert.deepEqual(layoutControlsFor("product"), ["radius", "shadow"], "a product keeps its own colour rows")
assert.ok(layoutControlsFor("storelib_shelf").includes("background"))
assert.deepEqual(layoutControlsFor("divider"), [])
assert.equal(blockTakesDescription("product"), false)
assert.equal(blockTakesDescription("storelib_shelf"), true)

/* ── The frame: identical markup until something is set, then the surface attributes ── */
const plain = renderToStaticMarkup(React.createElement(BlockPresentationFrame, { block: link({}), children: React.createElement("a", null, "x") }))
assert.equal(plain, "<a>x</a>")
const framed = renderToStaticMarkup(React.createElement(BlockPresentationFrame, { block: { ...link({}), type: "faq", style: { presentation: { background: "#fafafa", radius: 12 } } } as OnePageBlock, children: "x" }))
assert.ok(framed.includes('data-block-surface="panel"') && framed.includes('data-block-bg="#fafafa"') && framed.includes('data-block-radius="12"'))

/* ── Link cards: profile, media tile, fade and aspect ── */
const html = (b: OnePageBlock) => renderToStaticMarkup(React.createElement(VisualLinkCard, { block: b, theme: defaultTheme, onClick: () => {} }))
const profile = html(link({ url: "https://www.instagram.com/satori.studio/", label: "Satori", thumbnail_url: "https://cdn.example.com/a.jpg" }, { variant: "profile" }))
assert.ok(profile.includes('data-visual-link="profile"') && profile.includes("@satori.studio"))
const tile = html(link({ thumbnail_url: "https://cdn.example.com/a.jpg" }, { variant: "tile" }))
assert.ok(tile.includes('data-visual-link="tile"') && tile.includes("aspect-ratio:1 / 1") && tile.includes("data-image-fade"))
const noFade = html(link({ thumbnail_url: "https://cdn.example.com/a.jpg" }, { variant: "visual", fade: false }))
assert.ok(!noFade.includes("data-image-fade"), "the fade can be turned off")
const photoFade = html(link({ thumbnail_url: "https://cdn.example.com/a.jpg" }, { variant: "image-first", fade: true, aspect: "1/1" }))
assert.ok(photoFade.includes("data-image-fade") && photoFade.includes("aspect-ratio:1 / 1"))
assert.deepEqual(socialProfile("https://www.tiktok.com/@maker"), { platform: "TikTok", handle: "maker" })
assert.equal(socialProfile("https://www.instagram.com/p/ABC/"), null, "a post is not a profile")
assert.equal(socialProfile("https://evil.example/instagram.com/x"), null)

/* ── Previews never overwrite what the creator changed ── */
const meta = { url: "https://example.com", title: "Example site", description: "What it is", image: "https://example.com/og.jpg", favicon: "https://example.com/favicon.ico" }
const first = mergeLinkPreview({ label: "My Link", url: "https://example.com" }, undefined, meta)
assert.equal(first.data.label, "Example site")
assert.equal(first.data.thumbnail_url, "https://example.com/og.jpg")
assert.equal(first.subtitle, "What it is")
assert.equal(first.data.link_preview?.favicon, "https://example.com/favicon.ico")
const filled = { label: "Example site", url: "https://example.com", thumbnail_url: meta.image, link_preview: first.data.link_preview }
const refreshed = mergeLinkPreview(filled, "What it is", { ...meta, title: "New title", description: "New line", image: "https://example.com/new.jpg" })
assert.equal(refreshed.data.label, "New title", "an untouched title follows the site")
assert.equal(refreshed.subtitle, "New line")
assert.equal(refreshed.data.thumbnail_url, "https://example.com/new.jpg")
const custom = {
  label: "Mine",
  url: "https://example.com",
  thumbnail_url: "https://cdn.storelib.com/upload.jpg",
  link_preview: { ...editedMark.image(editedMark.description(editedMark.title(first.data.link_preview))) },
}
const kept = mergeLinkPreview(custom, "My words", { ...meta, title: "New title", description: "New line" })
assert.equal(kept.data.label, undefined, "a typed title stays")
assert.equal(kept.data.thumbnail_url, undefined, "an uploaded picture stays")
assert.equal(kept.subtitle, undefined, "a typed description stays")
const cleared = mergeLinkPreview({ label: "", url: "https://example.com", link_preview: { ...first.data.link_preview, title_edited: true } }, undefined, meta)
assert.equal(cleared.data.label, undefined, "a title removed by hand stays removed")
const removed = mergeLinkPreview({ label: "x", url: "https://example.com", thumbnail_url: null, link_preview: editedMark.imageRemoved(first.data.link_preview) }, undefined, meta)
assert.equal(removed.data.thumbnail_url, undefined, "a removed picture is not brought back")
assert.deepEqual(mergeLinkPreview({ label: "x", url: "u", link_preview: { enabled: false } }, undefined, meta).data, {}, "preview off: nothing changes")
const restored = restorePreview(custom as LinkButtonBlockData)
assert.equal(restored.data.label, "Example site")
assert.equal(restored.data.link_preview?.title_edited, false)

/* ── Shelf cards: saved product settings are kept when Simple is picked ── */
assert.equal(shelfUsesProductCards({ product_settings: { style: "side" } }), true)
assert.equal(shelfUsesProductCards({ product_settings: { style: "side" }, card_style: "simple" }), false)
assert.equal(shelfUsesProductCards({}), false)

/* ── Source truths: the old panel is gone, every block editor uses the shared tabs ── */
assert.equal(existsSync("components/onepage/block-presentation-editor.tsx"), false, "the old Appearance and description panel is removed")
const tab = readFileSync("components/onepage/tabs/links-tab.tsx", "utf8")
assert.ok(!/BlockPresentationEditor/.test(tab))
assert.ok(/<BlockEditorTabs/.test(tab) && /BlockDescriptionField/.test(tab) && /BlockStyleControls/.test(tab))
assert.ok(!/classList\.(toggle|add|remove)/.test(tab), "no block editor shows or hides its controls by editing the DOM")
assert.ok(/data-email-button-preset/.test(tab), "the signup's button words are a select in React state")
assert.ok(!/renderChildSettings/.test(tab) && /<BlockEditor\s+block=\{selectedChild\}/.test(tab), "a block inside a group uses the one block editor")
assert.ok(/updateBlockOverride\(block\.id, \{ data: updates/.test(tab), "a group child's edit sends only what changed")
assert.ok(/PART_AWARE = new Set\(\[[^\]]*"storelib_shelf"[^\]]*"social_posts"/.test(tab))
const shelf = readFileSync("components/onepage/storelib-blocks.tsx", "utf8")
assert.ok(/useBlockPart\(\)/.test(shelf) && /data-shelf-cards/.test(shelf) && /data-shelf-layout/.test(shelf))
const route = readFileSync("app/api/onepage/link-preview/route.ts", "utf8")
assert.ok(/routeUser\(\)/.test(route) && /rateLimit\(/.test(route) && /maxBytes: 524_288/.test(route) && /TOTAL_MS/.test(route) && /maxRedirects: 2/.test(route))

console.log("AK3 block settings: link layouts, presentation migration, surfaces, previews kept, shelf cards and shared tabs passed")
