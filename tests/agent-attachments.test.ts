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
    return ["1. LAYOUT", "2. SPACING", "3. TYPE", "4. COLOUR", "5. SHAPE", "6. THE PARTS"].every((step) =>
      text.includes(step),
    )
  })(),
)

check(
  "the words in the picture are the words in the section",
  /WRITE THE WORDS THAT ARE IN THE PICTURE/.test(describeImages(one, true)),
)

check(
  "the browser chrome around a screenshot is not part of the design",
  /WHAT NOT TO COPY/.test(describeImages(one, false)),
)

check(
  "colours come off the image but stay the creator's to change",
  /set them as the\n     section's own colours/.test(describeImages(one, true)),
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
      return (
        /prompt: noted/.test(route) &&
        /attached\]/.test(builds) &&
        /images\.length === 1 \? "an image"/.test(builds) &&
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
  check("and hands them to the writer", /prompt: parsed\.data\.prompt,\n    images,/.test(route))
  check(
    "it still refuses a request that is neither words nor pictures",
    /!parsed\.data\.prompt\.trim\(\) && images\.length === 0/.test(route),
  )
}

{
  const chat = read("components/website-builder/theme-chat.tsx")
  check(
    "the composer sends the pictures in code mode instead of dropping them",
    /void writeOne\(prompt, images\)/.test(chat) &&
      /images: images\.map\(\(a\) => \(\{ mediaType: a\.mediaType, data: a\.data, name: a\.name \}\)\),/.test(chat),
  )
}

// ---------------------------------------------------------------------------
section("The composer")
// ---------------------------------------------------------------------------

{
  const chat = read("components/website-builder/theme-chat.tsx")
  check(
    "Send is live when there is a picture and no words",
    /disabled=\{draft\.trim\(\)\.length === 0 && attached\.length === 0\}/.test(chat),
  )
  check("there is a file picker restricted to the types we accept", /accept=\{ALLOWED_IMAGE_TYPES\.join\(","\)\}/.test(chat))
  check("a pasted screenshot lands in it", /onPaste=/.test(chat) && /clipboardData\.files/.test(chat))
  check("so does a dragged file", /onDrop=/.test(chat) && /dataTransfer\.files/.test(chat))
  check("each attached picture can be taken back off", /removeAttachment\(image\.id\)/.test(chat))
  check(
    "a screenshot is shrunk before it is sent, to the size the model reads at",
    /LONG_EDGE \/ long/.test(chat) && /canvas\.toDataURL\("image\/jpeg", 0\.92\)/.test(chat),
  )
  check(
    "a picture already small enough is left exactly as it is",
    /if \(long <= LONG_EDGE &&/.test(chat) && /out\.length < url\.length \? \{ url: out/.test(chat),
  )
  check(
    "and a transparent PNG is not flattened onto black",
    /fillStyle = "#ffffff"/.test(chat) && /fillRect\(0, 0, canvas\.width, canvas\.height\)/.test(chat),
  )
  check(
    "the composer says the request is too big rather than letting it fail on the wire",
    /MAX_TOTAL_IMAGE_BYTES/.test(chat),
  )
  check(
    "the limits shown in the UI are the server's limits, not a second copy",
    /MAX_IMAGES/.test(chat) && /MAX_IMAGE_BYTES/.test(chat) && /LONG_EDGE/.test(chat) && !/\d \* 1024 \* 1024/.test(chat),
  )
  check(
    "an image alone still reads as a request in the thread",
    /images\.length === 1 \? "Build this\." : "Build these\."/.test(chat),
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
