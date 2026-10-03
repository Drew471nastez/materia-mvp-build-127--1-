/**
 * ===========================================================================
 *  A PICTURE HANDED TO ASK STORELIB
 * ===========================================================================
 * "Attach a photo in Ask Storelib and tell it to build a section like the
 * one in the image, and it should know how to do that precisely. Even if it
 * says nothing and uploads an image, it should try to replicate it, very
 * accurate and aware, detail by detail."
 *
 * Three things have to hold for that sentence to be true, and none of them
 * can be checked by reading the code:
 *
 *   1. Only a real image gets near a model. A data URL, a URL, a PDF, a
 *      forty-megabyte file and a fifth attachment are all refused, with a
 *      reason, and nothing about them is stored.
 *   2. Both providers put the picture in the request in the shape their API
 *      actually reads, BEFORE the words, because a model that reads the
 *      instruction first treats the image as decoration.
 *   3. A picture on its own is a whole request: it survives an empty prompt
 *      all the way from the composer to the model, and the model is told
 *      that saying nothing was the point.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  ALLOWED_IMAGE_TYPES,
  LONG_EDGE,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  base64Bytes,
  describeImages,
  isAllowedImageType,
  reviewImages,
  type AgentImage,
} from "@/lib/sites/agent/attachments"
import { toMessages } from "@/lib/sites/agent/anthropic-provider"
import { themeAgent } from "@/lib/website-builder/agent/loop"
import { writeSection } from "@/lib/website-builder/agent/write-section"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { AgentProvider, AgentTurn } from "@/lib/sites/agent/types"
import { toInput } from "@/lib/sites/agent/openai-provider"

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
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

/** A one-pixel PNG, so the fixtures are a real file and not a made-up string. */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const good = { mediaType: "image/png", data: PNG, name: "screenshot.png" }

// ---------------------------------------------------------------------------
section("What is allowed through")
// ---------------------------------------------------------------------------

{
  const { images, rejected } = reviewImages([good])
  check(
    "a PNG goes through with its bytes untouched",
    images.length === 1 && images[0].data === PNG && images[0].mediaType === "image/png" && rejected.length === 0,
    JSON.stringify(rejected),
  )
}

check(
  "every type we advertise is accepted",
  ALLOWED_IMAGE_TYPES.every((type) => reviewImages([{ ...good, mediaType: type }]).images.length === 1),
)

check(
  "and nothing else is",
  ["application/pdf", "image/svg+xml", "text/html", "image/png ", "", null, 42].every(
    (type) => !isAllowedImageType(type) && reviewImages([{ ...good, mediaType: type }]).images.length === 0,
  ),
)

{
  /**
   * The one that matters. A data URL looks like an image and is a place a
   * fetch could be pointed at; an https:// string is a request to go and get
   * something. Neither is ever unwrapped — what arrives is what the model
   * sees, or it is refused.
   */
  const sneaky = [
    `data:image/png;base64,${PNG}`,
    "https://example.com/a.png",
    "file:///etc/passwd",
    "../../etc/passwd",
    `${PNG}\n${PNG}`,
    "<svg onload=alert(1)>",
  ]
  const through = sneaky.filter((data) => reviewImages([{ ...good, data }]).images.length > 0)
  check("a data URL, a URL and a path are refused rather than unwrapped", through.length === 0, through.join(" | "))
}

check(
  "an empty or non-string payload is refused",
  [undefined, null, "", 0, {}, []].every((data) => reviewImages([{ ...good, data }]).images.length === 0),
)

{
  /** The cap is on the decoded bytes, which is what the provider bills. */
  const oversize = "A".repeat(Math.ceil(((MAX_IMAGE_BYTES + 1024) * 4) / 3))
  const { images, rejected } = reviewImages([{ ...good, data: oversize }])
  check(
    "a file over the cap is refused, measured decoded",
    images.length === 0 && /under 2MB/.test(rejected[0]?.reason ?? ""),
    rejected[0]?.reason,
  )
  check(
    "and base64Bytes reads the decoded size, not the encoded one",
    base64Bytes("QQ==") === 1 && base64Bytes(PNG) > 60 && base64Bytes(PNG) < PNG.length,
    String(base64Bytes(PNG)),
  )
}

{
  /**
   * THE PLATFORM'S CEILING, NOT OURS. The agent route is a Node serverless
   * function and the platform caps its request body at 4.5MB. base64 is a
   * third larger than the file it carries, so anything over ~3.2MB of
   * pictures is refused with a 413 raised before a line of our code runs —
   * a failure nobody could explain to the person who hit it. These two
   * numbers are what keep a request under that, so they are checked as
   * arithmetic and not as a preference.
   */
  check(
    "the caps keep a full request inside what the platform will carry",
    MAX_TOTAL_IMAGE_BYTES * (4 / 3) < 4.5 * 1024 * 1024 && MAX_IMAGE_BYTES <= MAX_TOTAL_IMAGE_BYTES,
    `${((MAX_TOTAL_IMAGE_BYTES * 4) / 3 / 1024 / 1024).toFixed(2)}MB on the wire`,
  )

  const half = "A".repeat(Math.ceil((1.6 * 1024 * 1024 * 4) / 3))
  const { images, rejected } = reviewImages([
    { ...good, data: half },
    { ...good, data: half },
    { ...good, data: half },
  ])
  check(
    "three pictures each inside the per-image cap can still be too much together",
    images.length === 1 && rejected.length === 2 && rejected.every((r) => /more than 3MB/.test(r.reason)),
    `${images.length} through: ${rejected.map((r) => r.reason).join(" ")}`,
  )
}

{
  const { images, rejected } = reviewImages(Array.from({ length: MAX_IMAGES + 3 }, () => good))
  check(
    `only ${MAX_IMAGES} at a time, and the rest come back with a reason`,
    images.length === MAX_IMAGES && rejected.length === 3 && rejected.every((r) => /Only 4 images/.test(r.reason)),
    `${images.length} through, ${rejected.length} refused`,
  )
}

check(
  "a refusal names the position it was in, so the person can be told which",
  (() => {
    const { images, rejected } = reviewImages([good, { ...good, mediaType: "application/pdf" }, good])
    return images.length === 2 && rejected.length === 1 && rejected[0].index === 1
  })(),
)

check(
  "garbage in the envelope is not a crash",
  [null, undefined, "no", 7, {}, [null], [undefined], ["x"], [[]]].every(
    (input) => reviewImages(input).images.length === 0,
  ),
)

check(
  "a file name is kept short and is the only thing about it that is",
  (() => {
    const { images } = reviewImages([{ ...good, name: "x".repeat(400) }])
    return images[0].name?.length === 120 && reviewImages([{ ...good, name: 5 }]).images[0].name === undefined
  })(),
)

// ---------------------------------------------------------------------------
section("What the model is told to do with it")
// ---------------------------------------------------------------------------

const one: AgentImage[] = [{ mediaType: "image/png", data: PNG }]

check("no picture, no instruction", describeImages([], true) === "" && describeImages([], false) === "")

check(
  "the reading order is spelled out, every step",
  (() => {
    const text = describeImages(one, true)
    return ["1. LAYOUT", "2. HIERARCHY", "3. SPACING", "4. TYPE", "5. COLOUR", "6. SHAPE", "7. THE PARTS"].every((step) =>
      text.includes(step),
    )
  })(),
)

/**
 * "Copy this section", "build me a section like this image": the picture is
 * the specification, layout, spacing, colours, type, imagery and the words
 * read off it, described first and then built closely with this site's
 * theme (U round). Another business's name, logo, products and prices are
 * still never put on the creator's site: those are swapped for theirs.
 */
check(
  "the picture is the specification, its words read off it, and another brand is swapped for the creator's",
  /reference for layout, hierarchy and style, and the specification/.test(describeImages(one, true)) &&
    /8\. THE WORDS\. Read every heading, label, button and line/.test(describeImages(one, true)) &&
    /DESCRIBE IT BEFORE YOU BUILD IT/.test(describeImages(one, true)) &&
    /NEVER ANOTHER BRAND'S NAME, LOGO OR CLAIMS/.test(describeImages(one, true)) &&
    /read_store/.test(describeImages(one, true)),
)

check(
  "the browser chrome around a screenshot is not part of the design",
  /WHAT NOT TO COPY/.test(describeImages(one, false)),
)

check(
  "colours map to the site's own schemes, with the section's own colours only as a fallback",
  /Use the colour\n     scheme of this site closest to it/.test(describeImages(one, true)) && /only when no scheme is close/.test(describeImages(one, true)),
)

check(
  "a picture it cannot read is a question, not a guess",
  /IF YOU CANNOT READ IT/.test(describeImages(one, true)) && /ask_creator/.test(describeImages(one, true)),
)

{
  /** The case the request named outright. */
  const silent = describeImages(one, false)
  const spoken = describeImages(one, true)
  check(
    "a picture with nothing typed is the whole request, not an empty one",
    /THEY TYPED NOTHING, AND THAT IS THE WHOLE REQUEST/.test(silent) &&
      /Do not ask what they want or offer alternatives/.test(silent),
  )
  check("and when they did type, their words win where the two disagree", /What they typed comes first/.test(spoken))
  check("the two cases are not the same paragraph", silent !== spoken)
}

check(
  "it counts what it was given, and says so in the singular or the plural",
  /ATTACHED AN IMAGE\. It is the reference/.test(describeImages(one, true)) &&
    /ATTACHED 3 IMAGES\. They are the reference/.test(describeImages([one[0], one[0], one[0]], true)),
  describeImages(one, true).slice(0, 90),
)

// ---------------------------------------------------------------------------
section("The shape each provider actually reads")
// ---------------------------------------------------------------------------

const turns = [{ role: "user" as const, content: "Build this.", images: one }]

{
  const messages = toMessages(turns)
  const content = messages[0].content as any[]
  check(
    "Anthropic gets an image block with base64 and a media type",
    Array.isArray(content) &&
      content[0].type === "image" &&
      content[0].source.type === "base64" &&
      content[0].source.media_type === "image/png" &&
      content[0].source.data === PNG,
    JSON.stringify(content[0]).slice(0, 160),
  )
  check(
    "and the picture comes BEFORE the words",
    content[0].type === "image" && content[1].type === "text" && content[1].text === "Build this.",
  )
  check(
    "a turn with no picture is still a plain string, not a one-block array",
    typeof (toMessages([{ role: "user", content: "Hello" }])[0].content) === "string",
  )
  check(
    "an empty images array does not turn a plain turn into blocks",
    typeof (toMessages([{ role: "user", content: "Hello", images: [] }])[0].content) === "string",
  )
}

{
  const input = toInput(turns) as any[]
  const content = input[0].content
  check(
    "OpenAI gets an input_image as a data URL it never has to fetch",
    Array.isArray(content) &&
      content[0].type === "input_image" &&
      content[0].image_url === `data:image/png;base64,${PNG}`,
    JSON.stringify(content[0]).slice(0, 160),
  )
  check("at full detail, because the point is the details", content[0].detail === "high")
  check(
    "and the picture comes BEFORE the words here too",
    content[0].type === "input_image" && content[1].type === "input_text" && content[1].text === "Build this.",
  )
  check(
    "a turn with no picture stays a plain string",
    typeof (toInput([{ role: "user", content: "Hello" }])[0] as any).content === "string",
  )
}

// ---------------------------------------------------------------------------
section("A picture on its own survives the whole way")
// ---------------------------------------------------------------------------

{
  const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  check(
    "the route no longer demands a prompt",
    !/prompt:\s*z\.string\(\)\.min\(1/.test(route) && /prompt:\s*z\.string\(\)\.max\(MAX_PROMPT\)/.test(route),
  )
  check("it validates attachments through the one door", /reviewImages\(body\.images\)/.test(route))
  check(
    "it refuses a request that is neither words nor pictures",
    /!body\.prompt\.trim\(\) && images\.length === 0/.test(route),
  )
  check("and it hands them to the agent", /images,/.test(route))
  check(
    "the bytes are never written down, only a note that there were images",
    (() => {
      /**
       * What is persisted is `noted`, and `noted` is built out of the typed
       * text and a COUNT. If the line that builds it ever learns the word
       * `data`, a creator's screenshot has started living in a table.
       */
      const builds = route.slice(route.indexOf("const noted ="), route.indexOf("startThemeExchange("))
      /* The note is written in one place, lib/website-builder/ask-attach.ts, from the words and a count. */
      const note = read("lib/website-builder/ask-attach.ts")
      return (
        /prompt: noted/.test(route) &&
        /const noted = withPictureNote\(body\.prompt, images\.length\)/.test(builds) &&
        /n === 1 \? "an image" : `\$\{n\} images`/.test(note) && /attached\]/.test(note) &&
        !/\.data/.test(builds)
      )
    })(),
  )

  check(
    "and nothing anywhere in the route puts an image in a row",
    (() => {
      const writes = route.match(/\.(insert|update|upsert)\([^)]*\)/g) ?? []
      return writes.every((w) => !/image|\bdata\b/i.test(w))
    })(),
  )

  check(
    "a refused attachment is said out loud rather than dropped in silence",
    /rejected\.length/.test(route) && /thinking/.test(route),
  )
}

{
  const loop = read("lib/website-builder/agent/loop.ts")
  check("the loop carries images into the first turn", /describeImages\(images, /.test(loop))
  check(
    "and it tells the model whether anything was typed",
    /describeImages\(images, prompt\.trim\(\)\.length > 0\)/.test(loop),
  )
}

// ---------------------------------------------------------------------------
section("The picture reaches the model, through the real loop")
// ---------------------------------------------------------------------------

/**
 * The checks above read files. This one runs the agent: a provider that
 * records the request, the real loop, the real section schemas. It is the
 * only way to see whether an image the creator attached is in the turns the
 * model is handed, rather than in a variable somewhere near them.
 */
async function runWith(prompt: string, images: AgentImage[]) {
  const seen: AgentTurn[][] = []
  const provider: AgentProvider = {
    id: "capturing",
    async complete(request) {
      seen.push(request.turns)
      return {
        text: "Done.",
        toolCalls: [],
        raw: [],
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2 },
        stop: "done",
      }
    },
  }
  const loop = themeAgent({
    provider,
    model: "test",
    prompt,
    images,
    state: {
      sections: [
        { id: "header-1", type: "header", name: "Header", settings: {}, blocks: [] },
        { id: "hero-1", type: "hero", name: "Hero", settings: {}, blocks: [] },
      ],
      settings: {},
    },
    page: "home",
    addable: ADDABLE_SECTIONS,
    newId: (type) => `${type}-new`,
  })
  for (;;) {
    const step = await loop.next()
    if (step.done) break
  }
  const first = seen[0] ?? []
  return first.find((turn) => turn.role === "user") as { role: "user"; content: string; images?: AgentImage[] } | undefined
}

{
  const turn = await runWith("Build a pricing section like this.", one)
  check(
    "the image itself is on the user turn, not a description of it",
    turn?.images?.length === 1 && turn.images[0].data === PNG,
    JSON.stringify(turn?.images?.map((i) => i.mediaType)),
  )
  check(
    "and the reading instruction is in the same turn as the request",
    /THE CREATOR ATTACHED AN IMAGE/.test(turn?.content ?? "") &&
      (turn?.content ?? "").includes("Build a pricing section like this."),
  )
  check(
    "the instruction comes before the request, so it frames it",
    (turn?.content ?? "").indexOf("THE CREATOR ATTACHED") < (turn?.content ?? "").indexOf("Build a pricing section"),
  )
}

{
  /** The request's own case: a picture, nothing typed. */
  const turn = await runWith("", one)
  check(
    "an empty prompt with a picture still reaches the model as a request",
    turn?.images?.length === 1 && /THEY TYPED NOTHING, AND THAT IS THE WHOLE REQUEST/.test(turn?.content ?? ""),
  )
}

{
  const turn = await runWith("Make the hero taller.", [])
  check(
    "and a request with no picture carries no image and no instruction about one",
    turn?.images === undefined && !/THE CREATOR ATTACHED/.test(turn?.content ?? ""),
  )
}

// ---------------------------------------------------------------------------
section("Code a section: the picture reaches that model too")
// ---------------------------------------------------------------------------

/**
 * THE BUG THIS SECTION EXISTS FOR.
 *
 * "Code a section" is a different path from "Change this page": it writes a
 * FILE rather than calling tools, and it had its own request shape that took
 * the words and nothing else. So a creator who attached a screenshot and
 * typed nothing sent an empty prompt, failed the route's own `.min(3)`, and
 * was told "the assistant could not produce a section that compiles" — a
 * true sentence about the wrong thing, and unanswerable.
 *
 * Both halves are checked: what writeSection actually sends, and that the
 * composer no longer drops the attachment on the floor before it gets there.
 */
{
  const seen: AgentTurn[][] = []
  const provider: AgentProvider = {
    id: "capturing",
    async complete(request) {
      seen.push(request.turns)
      /* Enough to end the loop; what it produces is not what is under test. */
      return {
        text: "no file here",
        toolCalls: [],
        raw: [],
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 2 },
        stop: "done",
      }
    },
  }

  await writeSection({
    provider,
    model: "test",
    prompt: "",
    images: one,
    takenTypes: [],
    takenNames: [],
  })

  const turn = (seen[0] ?? []).find((t) => t.role === "user") as
    | { role: "user"; content: string; images?: AgentImage[] }
    | undefined

  check(
    "a picture with no words reaches the section writer",
    turn?.images?.length === 1 && turn.images[0].data === PNG,
    JSON.stringify(turn?.images?.map((i) => i.mediaType)),
  )
  check(
    "and it is told that typing nothing was the whole request",
    /THEY TYPED NOTHING, AND THAT IS THE WHOLE REQUEST/.test(turn?.content ?? ""),
  )
  check(
    "an empty request does not reach it as an empty string",
    (turn?.content ?? "").trim().length > 100,
    `${(turn?.content ?? "").length} characters`,
  )
}

{
  const seen: AgentTurn[][] = []
  const provider: AgentProvider = {
    id: "capturing",
    async complete(request) {
      seen.push(request.turns)
      return { text: "", toolCalls: [], raw: [], usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }, stop: "done" }
    },
  }
  await writeSection({ provider, model: "test", prompt: "A pricing table", images: [], takenTypes: [], takenNames: [] })
  const turn = (seen[0] ?? []).find((t) => t.role === "user") as { role: "user"; content: string; images?: AgentImage[] } | undefined
  check(
    "and words with no picture still arrive as just the request",
    turn?.images === undefined && turn?.content.includes("A pricing table") === true && !/THE CREATOR ATTACHED/.test(turn?.content ?? ""),
  )
}

{
  const route = read("app/api/website-builder/themes/[installId]/sections/code/route.ts")
  check(
    "the code route no longer refuses a request that is only a picture",
    !/prompt: z\.string\(\)\.min\(3\)/.test(route) && /prompt: z\.string\(\)\.max\(2000\)/.test(route),
  )
  check("it checks attachments through the one door", /reviewImages\(parsed\.data\.images\)/.test(route))
  check("and hands them to the writer", /prompt: parsed\.data\.prompt,\n\s*images,/.test(route))
  check(
    "it still refuses a request that is neither words nor pictures",
    /!parsed\.data\.prompt\.trim\(\) && images\.length === 0/.test(route),
  )
}

{
  const chat = read("components/website-builder/theme-chat.tsx")
  check(
    "the composer sends the pictures in code mode instead of dropping them",
    /else void writeOne\(prompt, images, quiet\)/.test(chat) &&
      /images: images\.map\(\(a\) => \(\{ mediaType: a\.mediaType, data: a\.data, name: a\.name \}\)\),/.test(chat),
  )
}

// ---------------------------------------------------------------------------
section("Kept for thirty days, and then not")
// ---------------------------------------------------------------------------

/**
 * A picture is now stored so a conversation read back next week shows what
 * was asked about, rather than a sentence saying there was a picture. That
 * puts one creator's screenshots — of their unreleased work, and of other
 * people's pages — in a bucket, so the rules around that bucket are the
 * thing worth checking. These are assertions about configuration and about
 * the shape of the code that touches it; the migration itself is SQL this
 * suite cannot execute.
 */
{
  const sql = read("sql/20260924_theme_chat_attachments.sql")

  check(
    "the bucket is private, unlike the one for a website's own images",
    /'theme-chat-attachments',\s*'theme-chat-attachments',\s*false/.test(sql),
  )
  check(
    "and a re-run cannot quietly make it public",
    /on conflict \(id\) do update/.test(sql) && /set public = false/.test(sql),
  )
  check(
    "it takes images and nothing else",
    /allowed_mime_types/.test(sql) && /'image\/png', 'image\/jpeg', 'image\/webp', 'image\/gif'/.test(sql),
  )
  check(
    "no storage policy is granted, so there is no client-side path to the bytes",
    !/create policy[^;]*storage\.objects/i.test(sql) && /NO POLICY ON storage\.objects/.test(sql),
  )
  check(
    "rows are readable only by the creator who owns the theme",
    /create policy tca_own/.test(sql) &&
      /join public\.creators c on c\.id = i\.creator_id/.test(sql) &&
      /where c\.user_id = auth\.uid\(\)/.test(sql),
  )
  check(
    "a picture expires thirty days out, by default rather than by a caller remembering",
    /expires_at timestamptz not null default \(now\(\) \+ interval '30 days'\)/.test(sql),
  )
  check(
    "the collector has an index to find them by",
    /theme_chat_attachments_expiry_idx/.test(sql) && /\(expires_at\)/.test(sql),
  )
  check(
    "deleting a theme takes its pictures with it",
    /references public\.store_theme_installs\(id\) on delete cascade/.test(sql),
  )
}

{
  const store = read("lib/website-builder/agent/attachment-store.ts")

  check("the bytes never reach a browser except through a signed URL", /createSignedUrls/.test(store) && !/getPublicUrl/.test(store))
  check(
    "the signature is short-lived rather than a permanent link",
    /SIGNED_FOR_SECONDS = 60 \* 60/.test(store),
  )
  check(
    "rows are read through the USER's client, so RLS decides what comes back",
    /const \{ user, admin \} = clients \?\? \(await realClients\(\)\)\s*\n\s*const \{ data, error \} = await user\s*\n\s*\.from\("theme_chat_attachments"\)/.test(store) &&
      /user: \(await createClient\(\)\) as unknown as Db/.test(store),
  )
  check(
    "and the signer only ever sees paths that read already returned",
    /rows\.map\(\(r\) => r\.storage_path\), SIGNED_FOR_SECONDS/.test(store),
  )
  check(
    "a caller cannot hand it a storage path of their own choosing",
    !/storage_path:\s*(input|opts|body|params)\./.test(store),
  )
  check(
    "one theme's pictures are one prefix, and no path can be built across to another",
    /\$\{input\.installId\}\/\$\{crypto\.randomUUID\(\)\}/.test(store),
  )
  check(
    "bytes whose row did not land are taken back rather than left uncollectable",
    /if \(rowError\) \{\s*\n\s*await admin\.storage\.from\(BUCKET\)\.remove\(rows\.map\(\(row\) => row\.storage_path\)\)/.test(store),
  )
  check(
    "the collector removes the object BEFORE the row",
    (() => {
      const purge = store.slice(store.indexOf("export async function purgeExpiredAttachments"))
      const object = purge.indexOf(".remove(")
      const row = purge.indexOf(".delete()")
      /* A row deleted first leaves bytes nobody will ever collect again. */
      return object > 0 && row > 0 && object < row
    })(),
  )
  check(
    "and it never deletes rows whose bytes it failed to remove",
    /if \(removeError\) return \{ removed: 0, failed: rows\.length \}/.test(store),
  )
  check(
    "storing a picture can never fail an edit somebody already asked for",
    /export async function keepImages[\s\S]{0,4000}\} catch \{\s*\n\s*\/\* Evidence, not enforcement\. \*\/\s*\n\s*return \{ kept: 0, of, problem: "failed" \}/.test(store),
  )
  check("it is server-only", store.startsWith('import "server-only"'))
}

{
  const cron = read("app/api/cron/purge-chat-attachments/route.ts")
  /*
    This used to assert the comparison it was written against:

        headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`

    which is the shape that lets a stranger in. With CRON_SECRET unset the
    template is the literal string "Bearer undefined", and that is then a
    working password. The pin was holding the bug in place, so it now names
    the shared guard, which refuses when the variable is missing.
    tests/admin-key-routes.test.ts checks no route goes back to the old one.
  */
  check(
    "the collector is behind the same secret as every other job here",
    /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron),
  )
  check("and it actually runs on a schedule", /purge-chat-attachments/.test(read("vercel.json")))
}

{
  const chat = read("lib/website-builder/agent/chat.ts")
  check(
    "the history asks for every message's pictures in one query, not one per message, and only for questions that had some",
    /const asked = rows\.filter\(\(row\) => row\.role === "user" && readPictureNote\(row\.content\)\.count > 0\)\.map\(\(row\) => row\.id\)\s*\n\s*const pictures = await attachmentsFor\(installId, asked\)/.test(chat),
  )
  const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
  check(
    "the picture is kept against the message it was attached to, and what could not be kept is said on the stream",
    /const recorded = await startThemeExchange/.test(route) && /const messageId = recorded\.id/.test(route) &&
      /const kept = await keepImages\(\{ installId, messageId, images \}\)/.test(route) &&
      /if \(messageId && kept\.problem\) send\(\{ type: "unsaved", what: "pictures", reason: kept\.problem/.test(route),
  )
  const panel = read("components/website-builder/theme-chat.tsx")
  const restore = read("lib/website-builder/ask-restore.ts")
  check(
    "a restored conversation shows the picture rather than a note about it, and a tile where one is gone",
    /restoreExchanges\(body\.messages\)/.test(panel) && /const \{ text, count \} = readPictureNote\(message\.content \?\? ""\)/.test(restore) &&
      /missingImages: Math\.max\(0, count - images\.length\)/.test(restore) && /data-ask-missing-image=""/.test(panel) &&
      !/\[an image attached\]|an image\|\\d\+ images\) attached/.test(panel),
  )
}

// ---------------------------------------------------------------------------
section("The composer")
// ---------------------------------------------------------------------------

{
  /*
    The composer's pictures are made ready in components/website-builder/
    ask-attach-prepare.ts (decode, shrink, encode, off the main thread where
    it can be), by the rules in lib/website-builder/ask-attach.ts, and drawn
    by ask-attachments.tsx. The chat holds the state and the request.
  */
  const chat = read("components/website-builder/theme-chat.tsx")
  const prepare = read("components/website-builder/ask-attach-prepare.ts")
  const rules = read("lib/website-builder/ask-attach.ts")
  const tray = read("components/website-builder/ask-attachments.tsx")
  check(
    "Send is live when there is a picture and no words, and waits while one is still being made ready",
    /disabled=\{\(draft\.trim\(\)\.length === 0 && attached\.length === 0\) \|\| preparing\}/.test(chat),
  )
  check(
    "the file picker offers the types the model reads, and video, which becomes stills; not HEIC by name, so an iPhone converts its photos to JPEG itself",
    /accept=\{\[\.\.\.ALLOWED_IMAGE_TYPES, "video\/\*"\]\.join\(","\)\}/.test(chat) && !/accept=\{[^}]*heic/.test(chat),
  )
  check("a pasted screenshot lands in it", /onPaste=/.test(chat) && /clipboardData\.files/.test(chat))
  /* Once: the panel's handler, which the composer's drops bubble to. The composer had its own as well, and attached every dropped picture twice. */
  check(
    "so does a dragged file, once",
    /onDrop: \(event: React\.DragEvent\) => \{[\s\S]{0,200}void attach\(event\.dataTransfer\.files\)/.test(chat) && (chat.match(/void attach\(event\.dataTransfer\.files\)/g) ?? []).length === 1,
  )
  check("each attached picture can be taken back off", /onClick=\{\(\) => onRemove\(item\.id\)\}/.test(tray) && /onRemove=\{removeAttachment\}/.test(chat))
  check(
    "a screenshot is shrunk before it is sent, to the size the model reads at, as JPEG at 0.92 first",
    /const size = fitWithin\(decoded\.width, decoded\.height, LONG_EDGE\)/.test(prepare) &&
      /const JPEG_QUALITY = 0\.92/.test(prepare) && /const scale = edge \/ long/.test(rules),
  )
  check(
    "a picture already small enough is left exactly as it is, and so is one the JPEG would not make smaller",
    /if \(allowed && long <= LONG_EDGE && file\.size <= KEEP_BELOW_BYTES\)/.test(prepare) &&
      /const url = await readAsDataUrl\(smaller \? blob : file\)/.test(prepare),
  )
  check(
    "and a transparent PNG is not flattened onto black",
    (prepare.match(/fillStyle = "#ffffff"/g) ?? []).length === 2 && (prepare.match(/fillRect\(0, 0, canvas\.width, canvas\.height\)/g) ?? []).length === 2,
  )
  check(
    "a very detailed photo is encoded again a notch lower rather than sent over the per-picture limit",
    /if \(blob\.size <= MAX_IMAGE_BYTES \* 0\.9\) return blob/.test(prepare),
  )
  check(
    "the encode is asynchronous (toBlob, convertToBlob), never toDataURL, which stops the page for a large picture",
    /convertToBlob\(/.test(prepare) && /canvas\.toBlob\(/.test(prepare) && !/toDataURL\(/.test(prepare) && !/toDataURL\(/.test(chat),
  )
  check(
    "the composer says the request is too big rather than letting it fail on the wire",
    /MAX_TOTAL_IMAGE_BYTES/.test(chat),
  )
  check(
    "the limits shown in the UI are the server's limits, not a second copy",
    /MAX_IMAGES/.test(chat) && /MAX_IMAGE_BYTES/.test(prepare) && /LONG_EDGE/.test(prepare) &&
      ![chat, prepare, tray].some((s) => /\d \* 1024 \* 1024/.test(s)),
  )
  check(
    "an image alone still reads as a request in the thread, live and read back",
    /prompt: prompt \|\| promptForPictures\(images\.length\)/.test(chat) &&
      /return count === 1 \? "Build this\." : "Build these\."/.test(read("lib/website-builder/ask-restore.ts")),
  )
  check(
    "only the three fields the server reads are sent",
    /images\.map\(\(a\) => \(\{ mediaType: a\.mediaType, data: a\.data, name: a\.name \}\)\)/.test(chat),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
