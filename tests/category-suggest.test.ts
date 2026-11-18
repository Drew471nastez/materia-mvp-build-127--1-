/**
 * ===========================================================================
 *  THE CATEGORY SUGGESTION: WHAT THE ROUTE TAKES, WHAT IT GIVES BACK
 * ===========================================================================
 * "A smart suggestion of the category from what the creator has entered:
 * title, description and the uploaded images." The route
 * (app/api/app/products/category-suggestion/route.ts) asks ChatGPT to choose
 * from the fixed list and falls back to the editor's keyword guess.
 *
 * The rules live in lib/products/category-suggest.ts and are tested here
 * directly, with the model call passed in: what a request may carry, which
 * pictures may be sent on, what counts as an answer, and that every failure
 * of the model's ends in the keyword guess rather than an error.
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { CATEGORY_GROUPS, groupOfCategory, isCategory, searchCategories } from "../lib/products/category-groups"
import {
  SUGGEST_LIMITS,
  contentKey,
  isOwnStorageImage,
  keywordSuggestion,
  parseSuggestRequest,
  plainText,
  type ParsedRequest,
  readAnswer,
  resolveSuggestion,
  type SuggestInput,
} from "../lib/products/category-suggest"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

async function main() {
  const ORIGIN = "https://abcd.supabase.co"
  const ME = "c-123"
  const img = (path: string, origin = ORIGIN) => `${origin}/storage/v1/object/public/${path}`
  const opts = { storageOrigin: ORIGIN, creatorId: ME }
  const body = (b: unknown) => JSON.stringify(b)

  console.log("\nThe list")
  const names = CATEGORY_GROUPS.flatMap((g) => g.categories)
  check("every category name is in exactly one group", new Set(names).size === names.length && names.length >= 500)
  check("a category knows its group", groupOfCategory("Fonts") === "Design & Creative" && groupOfCategory("Video LUTs") === "VFX & Motion" && groupOfCategory("Photography") === null)
  check("isCategory takes names on the list and nothing else", isCategory("Fonts") && !isCategory("fonts") && !isCategory("Design & Creative") && !isCategory(3))
  check("a search reaches across every group", ["Video LUTs", "Cinematic LUTs"].every((c) => searchCategories("lut").includes(c)))

  console.log("\nWhich pictures may be sent on")
  check("the creator's own public picture", isOwnStorageImage(img(`product-images/${ME}/p1/1_a.jpg`), ORIGIN, ME))
  check("in any public bucket, as long as it is in their folder", isOwnStorageImage(img(`onepage-assets/${ME}/product-images/1-x.webp`), ORIGIN, ME))
  check("not another creator's", !isOwnStorageImage(img("product-images/c-999/p1/1_a.jpg"), ORIGIN, ME))
  check("not another host, even with the same path", !isOwnStorageImage(img(`product-images/${ME}/p1/a.jpg`, "https://evil.example"), ORIGIN, ME))
  check("not a look-alike host", !isOwnStorageImage(img(`product-images/${ME}/p1/a.jpg`, "https://abcd.supabase.co.evil.example"), ORIGIN, ME))
  check("not plain http", !isOwnStorageImage(img(`product-images/${ME}/p1/a.jpg`, "http://abcd.supabase.co"), ORIGIN, ME))
  check("not a signed or a render URL", !isOwnStorageImage(`${ORIGIN}/storage/v1/object/sign/product-images/${ME}/a.jpg?token=x`, ORIGIN, ME) && !isOwnStorageImage(`${ORIGIN}/storage/v1/render/image/public/product-images/${ME}/a.jpg`, ORIGIN, ME))
  check("not a path that climbs out", !isOwnStorageImage(img(`product-images/${ME}/../c-999/a.jpg`), ORIGIN, ME) && !isOwnStorageImage(`${ORIGIN}/storage/v1/object/public/product-images/${ME}/%2e%2e/a.jpg`.replace("%2e%2e", ".."), ORIGIN, ME))
  check("not a file that is not a picture", !isOwnStorageImage(img(`product-images/${ME}/p1/a.zip`), ORIGIN, ME))
  check("not credentials in the address", !isOwnStorageImage(`https://u:p@abcd.supabase.co/storage/v1/object/public/product-images/${ME}/a.jpg`, ORIGIN, ME))
  check("not a YouTube thumbnail", !isOwnStorageImage("https://img.youtube.com/vi/abc/hqdefault.jpg", ORIGIN, ME))
  check("nothing when the project URL is not configured", !isOwnStorageImage(img(`product-images/${ME}/a.jpg`), "", ME))

  console.log("\nWhat a request may carry")
  const good = parseSuggestRequest(body({ title: "  Film presets  ", text: "<p>Twelve <b>Lightroom</b> presets&nbsp;for film</p>", images: [img(`product-images/${ME}/p/a.jpg`), "https://evil.example/x.jpg"] }), opts)
  check("a good request is read: title trimmed, words out of their markup, foreign pictures dropped",
    good.ok && (good as { input: SuggestInput }).input.title === "Film presets" && (good as { input: SuggestInput }).input.text === "Twelve Lightroom presets for film" && (good as { input: SuggestInput }).input.images.length === 1, good)
  const bad = (b: string) => parseSuggestRequest(b, opts)
  const refused = (r: ParsedRequest, status: number) => r.ok === false && (r as { status: number }).status === status
  check("not JSON is a 400", refused(bad("{nope"), 400))
  check("an array is a 400", refused(bad("[]"), 400))
  check("wrong types are a 400", refused(bad(body({ title: 5 })), 400) && refused(bad(body({ images: "x" })), 400))
  check("a title over the limit is a 413", refused(bad(body({ title: "x".repeat(SUGGEST_LIMITS.title + 1) })), 413))
  check("a description over the limit is a 413", refused(bad(body({ title: "a", text: "x".repeat(SUGGEST_LIMITS.text + 1) })), 413))
  check("a body over the limit is a 413 before it is parsed", refused(bad("x".repeat(SUGGEST_LIMITS.body + 1)), 413))
  check("more pictures than the limit is a 400", refused(bad(body({ title: "a", images: Array(SUGGEST_LIMITS.images + 1).fill(img(`product-images/${ME}/a.jpg`)) })), 400))
  check("a picture that is not a string is a 400", refused(bad(body({ title: "a", images: [{ url: "x" }] })), 400))
  check("nothing to read is a 400", refused(bad(body({ title: "  ", text: "<p></p>" })), 400))

  console.log("\nWhat counts as an answer")
  check("a group and a category from the list", JSON.stringify(readAnswer({ group: "Design & Creative", category: "Fonts" })) === JSON.stringify({ group: "Design & Creative", category: "Fonts" }))
  check("as a JSON string too, which is how the API returns it", readAnswer('{"group":"VFX & Motion","category":"Video LUTs"}')?.category === "Video LUTs")
  check("an invented category is not", readAnswer({ group: "Design & Creative", category: "Fancy Fonts" }) === null)
  check("a real category in the wrong group is not", readAnswer({ group: "Audio & Music", category: "Fonts" }) === null)
  check("a category with no group is not", readAnswer({ category: "Fonts" }) === null)
  check("a different capitalisation is not", readAnswer({ group: "design & creative", category: "fonts" }) === null)
  check("prose, a broken string, null and an array are not", readAnswer("Fonts, in Design & Creative") === null && readAnswer("{") === null && readAnswer(null) === null && readAnswer(["Fonts"]) === null)

  console.log("\nThe model first, the keywords whenever it cannot answer")
  const input: SuggestInput = { title: "Moody film Lightroom presets", text: "Twelve presets for portraits", images: [] }
  const viaModel = await resolveSuggestion(input, async () => '{"group":"Photography & Video","category":"Portrait Presets"}')
  check("a valid answer is used, marked as the model's", viaModel.source === "ai" && viaModel.category === "Portrait Presets" && viaModel.group === "Photography & Video", viaModel)
  const noKey = await resolveSuggestion(input, null)
  check("no key: the keyword guess", noKey.source === "keywords" && noKey.category === "Lightroom Presets" && noKey.group === "Design & Creative", noKey)
  const offList = await resolveSuggestion(input, async () => '{"group":"Design & Creative","category":"Film Stuff"}')
  check("an answer off the list: the keyword guess", offList.source === "keywords" && offList.category === "Lightroom Presets", offList)
  const threw = await resolveSuggestion(input, async () => { throw new Error("529 overloaded") })
  check("an error: the keyword guess, and no throw", threw.source === "keywords" && threw.category === "Lightroom Presets", threw)
  const empty = await resolveSuggestion(input, async () => null)
  check("no answer (a refusal, a timeout): the keyword guess", empty.source === "keywords", empty)
  const nothing = await resolveSuggestion({ title: "Untitled thing", text: "", images: [] }, null)
  check("nothing to go on: no suggestion at all, said plainly", nothing.source === "none" && nothing.category === null && nothing.group === null, nothing)
  let seen: SuggestInput | null = null
  await resolveSuggestion({ ...input, images: ["https://abcd.supabase.co/storage/v1/object/public/product-images/c-123/a.jpg"] }, async (i) => { seen = i; return null })
  check("the model is handed the pictures with the words", (seen as SuggestInput | null)?.images.length === 1)

  console.log("\nThe keyword guess")
  check("finds a clear match", keywordSuggestion("A Notion template for weekly planning") === "Notion Templates")
  check("reads words, not markup", keywordSuggestion("<p class=\"font\">A set of Procreate brushes</p>") === "Procreate Brushes")
  check("under three characters, nothing", keywordSuggestion("ab") === null)
  check("every keyword category is on the list", code("lib/products/category-suggest.ts").split("const KEYWORDS")[1].split("\n}\n")[0].match(/^ {2}"([^"]+)": \[/gm)!.map((l) => l.trim().slice(1, -4)).every((c) => isCategory(c)))
  check("plain text from markup", plainText("<p>a&amp;b</p><script>x()</script><p>c</p>") === "a&b c")
  check("the cache key follows the content", contentKey(input) === contentKey({ ...input }) && contentKey(input) !== contentKey({ ...input, title: "Moody film Lightroom preset" }))

  console.log("\nThe route and the call")
  const route = code("app/api/app/products/category-suggestion/route.ts")
  const ai = code("lib/products/category-suggest-ai.ts")
  check("signed in only: a 401 before anything is read", /if \(!user\) return NextResponse\.json\([^)]*\{ status: 401/.test(route) && route.indexOf("status: 401") < route.indexOf("request.text()"))
  check("rate limited per person, before the model is asked", /await rateLimit\(\{\s*bucket: "category-suggestion",\s*subjects: \[`user:\$\{user\.id\}`\]/.test(route) && route.indexOf("rateLimit(") < route.indexOf("resolveSuggestion("))
  check("a store is needed, and its id is what pictures are checked against", /from\("creators"\)\.select\("id"\)\.eq\("user_id", user\.id\)/.test(route) && /creatorId: String\(creator\.id\)/.test(route))
  check("the body is size checked and parsed by the tested rules", /content-length/.test(route) && /parseSuggestRequest\(raw, \{\s*storageOrigin: process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(route))
  /* ChatGPT, like the rest of Storelib AI now: this asked Claude, and logged a credit refusal for every product saved. */
  check("no key: the model is not called", /resolveSuggestion\(parsed\.input, canAskAi\(\) \? askAiForCategory : null\)/.test(route) && /export const canAskAi = \(\) => !!process\.env\.OPENAI_API_KEY/.test(ai))
  check("the call uses the repo's one OpenAI client and key, and nothing of Anthropic's", /import \{ MissingKeyError, openai \} from "@\/lib\/sites\/agent\/openai-provider"/.test(ai) && /export function openai\(\): OpenAI/.test(code("lib/sites/agent/openai-provider.ts")) && !/anthropic/i.test(ai))
  check("the everyday model at low effort, with a strict JSON schema", /process\.env\.OPENAI_CATEGORY_MODEL \|\| DEFAULT_MODEL/.test(ai) && /reasoning: \{ effort: "low" \}/.test(ai) && /format: \{ type: "json_schema", name: "category", schema: SCHEMA, strict: true \}/.test(ai))
  check("pictures go as URLs, before the words", /type: "input_image" as const, image_url: url/.test(ai) && ai.indexOf('type: "input_image"') < ai.indexOf("<title>"))
  /* Production, Nov 11: a 400 with pictures attached left the creator with the keyword guess only. */
  check("a picture the model refuses (a 400) is asked again with the words only, once, and never for a billing refusal", /input\.images\.length > 0 && \(err as \{ status\?: unknown \} \| null\)\?\.status === 400 && !isBillingRefusal\(err\)/.test(ai) && /return ask\(\[\]\)/.test(ai) && (ai.match(/ask\(\[\]\)/g) ?? []).length === 1)
  check("server only: the key can never reach a browser", /^import "server-only"/m.test(readFileSync("lib/products/category-suggest-ai.ts", "utf8")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
main()
