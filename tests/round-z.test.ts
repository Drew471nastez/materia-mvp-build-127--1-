/**
 * Round Z: every documented Shopify filter, the app registering for pushes on
 * every install, and the speed work on live sites and the builder.
 *
 *   npx tsx tests/round-z.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compatFilter } from "@/lib/storelib-theme/compat/filters"
import { WEB_ONLY_SEGMENTS } from "@/lib/platform/app-links"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* Shopify's documented Liquid filters (shopify.dev/docs/api/liquid/filters), by group. */
const SHOPIFY_FILTERS = `compact concat find find_index first has join last map reject reverse size sort sort_natural sum uniq where
item_count_for_variant line_items_for
link_to_type link_to_vendor sort_by url_for_type url_for_vendor within highlight_active_tag
brightness_difference color_brightness color_contrast color_darken color_desaturate color_difference color_extract color_lighten color_mix color_modify color_saturate color_to_hex color_to_hsl color_to_oklch color_to_rgb hex_to_rgba
avatar customer_login_link customer_logout_link customer_register_link login_button
date default default_errors default_pagination
font_face font_modify font_url
json structured_data unit_price_with_measurement weight_with_unit
asset_img_url asset_url file_img_url file_url global_asset_url shopify_asset_url inline_asset_content
class_list highlight link_to placeholder_svg_tag preload_tag script_tag stylesheet_tag time_tag
currency_selector t translate format_address
abs at_least at_most ceil divided_by floor minus modulo plus round times
external_video_tag external_video_url image_tag image_url media_tag model_viewer_tag video_tag img_tag img_url product_img_url collection_img_url article_img_url
metafield_tag metafield_text
money money_with_currency money_without_currency money_without_trailing_zeros
payment_button payment_terms payment_type_img_url payment_type_svg_tag
append base64_decode base64_encode base64_url_safe_decode base64_url_safe_encode camelize capitalize downcase escape escape_once handleize handle hmac_sha1 hmac_sha256 lstrip md5 newline_to_br pluralize prepend remove remove_first remove_last replace replace_first replace_last rstrip sha1 sha256 slice split strip strip_html strip_newlines truncate truncatewords upcase url_decode url_encode url_escape url_param_escape
link_to_add_tag link_to_remove_tag link_to_tag`.split(/\s+/).filter(Boolean)

console.log("\nAn imported Shopify theme")
{
  const missing = [...new Set(SHOPIFY_FILTERS)].filter((n) => !compatFilter(n))
  check(`every one of Shopify's ${new Set(SHOPIFY_FILTERS).size} documented filters draws`, missing.length === 0, missing)
  const ctx = { registers: { compat: { currency: "RON" } } }
  const run = (name: string, v: unknown, kw: object = {}) => String((compatFilter(name) as unknown as (v: unknown, a: unknown[], k: object, c: unknown) => unknown)(v, [], kw, ctx))
  check("the old currency picker is the store's one currency, chosen", run("currency_selector", null, { class: "x" }) === '<select name="currency" class="x"><option value="RON" selected="selected">RON</option></select>')
  check("class_list draws nothing rather than an error", run("class_list", { a: 1 }) === "")
  const controls = JSON.parse(read("lib/storelib-theme/controls/storelib-controls.json")) as { types: Record<string, unknown>; shopify_aliases: Record<string, string>; legacy_aliases: Record<string, string>; unsupported: Record<string, string> }
  const types = "checkbox number radio range select text textarea article article_list blog collection collection_list color color_background color_scheme color_scheme_group font_picker html image_picker inline_richtext link_list liquid metaobject metaobject_list page product product_list richtext text_alignment url video video_url header paragraph".split(" ")
  const unplaced = types.filter((t) => !(t in controls.types) && !(t in controls.shopify_aliases) && !(t in controls.legacy_aliases) && !(t in controls.unsupported))
  check("every Shopify setting type is a control, or says plainly why not", unplaced.length === 0, unplaced)
}

console.log("\nThe app, on every install")
{
  const delegate = read("ios/App/App/AppDelegate.swift")
  check("iOS keeps the push token Firebase hands over at launch", /latestFcmToken = fcmToken/.test(delegate) && /private var latestFcmToken: String\?/.test(delegate))
  check("  leaves it on the page, and sends it when the page asks or the app comes forward",
    /window\.__storelibFcmToken=/.test(delegate) && /final class StorelibPush: NSObject, WKScriptMessageHandler/.test(delegate) && /StorelibPush\.shared\.attach\(to: webView\)/.test(delegate) && /StorelibPush\.shared\.onAsk = \{ \[weak self\] in self\?\.dispatchFcmToken\(\) \}/.test(delegate))
  const client = read("lib/push/client.ts")
  check("the page reads the kept token, asks for it, and hears every new one", /__storelibFcmToken/.test(client) && /messageHandlers\?\.storelibPush/.test(client) && !/\{ once: true \}/.test(client))
  check("  and sends it for whoever signs in, never twice for the same person and token", /if \(sentAs === key\) return/.test(client) && /if \(knownToken\) void sendToken\(knownToken, platform\)/.test(client))
  check("Android 13's prompt can show: the app declares the permission", /android\.permission\.POST_NOTIFICATIONS/.test(read("android/app/src/main/AndroidManifest.xml")))
  check("the first launch after an install asks, signed in or not", /if \(permission === "prompt"\) \{\s*const answer = await askPushPermission\(\)/.test(read("components/platform/notifications-ask.tsx")))
  check("the platform's own pages are never read as a creator handle in app links", ["order-help", "pay", "payouts-sheet", "stripe-done"].every((s) => (WEB_ONLY_SEGMENTS as readonly string[]).includes(s)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
