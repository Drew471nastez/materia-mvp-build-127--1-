/**
 * ===========================================================================
 *  THE SHARED BRAIN, CHECKED RATHER THAN READ
 * ===========================================================================
 * Two kinds of check live here, and the split matters.
 *
 * The quality contract and the validation gate are CODE. They are driven with
 * real section sources through the real compiler, because that is the half of
 * the system that does not depend on a model doing as it was told.
 *
 * The rules are TEXT, and text can only be checked for the properties that
 * actually matter: that every surface receives it, that both providers get
 * the same string, that the specific sentences this work exists to delete are
 * gone, and that it is small enough to send on every request. A test cannot
 * check that a prompt works; it can check that the prompt is where it is
 * supposed to be, which is what kept silently not being true.
 *
 * Run with:  npm run test:push
 */

import {
  DESIGN_RULES,
  SECTION_CONTRACT,
  checkSectionQuality,
  editSectionRules,
  knowledgeFor,
  pageAgentRules,
  qualityErrors,
  sitesAgentRules,
  validateSection,
  writeSectionRules,
  describeThemeForAuthoring,
  MAX_REPAIR_ATTEMPTS,
  CORE_FORMAT,
} from "@/lib/storelib-ai"
import { CONTROL_TYPES } from "@/lib/storelib-theme/controls/registry"
import { SCHEME_COLOR_KEYS, resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { FILTER_NAMES } from "@/lib/storelib-theme/storelib/template"
import { CAPABILITIES } from "@/lib/storelib-theme/storelib/script"
import { writeSection, writeSectionSystem } from "@/lib/website-builder/agent/write-section"
import { themeAgent } from "@/lib/website-builder/agent/loop"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { AgentProvider, ProviderTurn } from "@/lib/sites/agent/types"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
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

const read = (p: string) => readFileSync(join(root, p), "utf8")

/** A section that is correct, as the baseline every bad one is a variant of. */
const GOOD = `<template>
  <div class="wrap" data-wrap data-scheme="{{ settings.scheme }}" style="--pt: {{ settings.padding_top }}px; --pb: {{ settings.padding_bottom }}px;">
    <h2>{{ settings.heading }}</h2>
    {% for block in blocks %}
      <details data-block-id="{{ block.id }}">
        <summary>{{ block.settings.q }}</summary>
        <div class="a">{{ block.settings.a }}</div>
      </details>
    {% endfor %}
  </div>
</template>
<style>
  .wrap { container-type: inline-size; background: {{ scheme.bg }}; color: {{ scheme.text }}; }
  .a { transition: opacity 200ms ease; }
  .inner-pad { padding: var(--pt) 20px var(--pb); }
  h2 { font-size: var(--section-heading-size, 32px); }
  @container (min-width: 640px) { .wrap { padding: 40px; } }
  @media (prefers-reduced-motion: reduce) { .a { transition: none; } }
</style>
<schema>
{
  "name": "Questions",
  "type": "questions",
  "settings": [
    { "id": "scheme", "type": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "id": "heading", "type": "text", "label": "Heading", "default": "Questions" },
    { "id": "padding_top", "type": "range", "label": "Top padding", "default": 60, "min": 0, "max": 160, "step": 4, "unit": "px" },
    { "id": "padding_bottom", "type": "range", "label": "Bottom padding", "default": 60, "min": 0, "max": 160, "step": 4, "unit": "px" }
  ],
  "blocks": [
    { "type": "item", "name": "Question", "settings": [
      { "id": "q", "type": "text", "label": "Question" },
      { "id": "a", "type": "textarea", "label": "Answer" }
    ] }
  ],
  "presets": [{ "name": "Questions", "blocks": [{ "type": "item" }, { "type": "item" }] }]
}
</schema>`

/** The same file with one thing wrong in it. */
function variant(replace: [string, string][]): string {
  return replace.reduce((acc, [from, to]) => acc.replace(from, to), GOOD)
}

const idsOf = (src: string) => qualityErrors(checkSectionQuality(src)).map((f) => f.id)

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The quality contract is checked, not promised")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a correct section raises nothing", idsOf(GOOD).length === 0, idsOf(GOOD).join(", "))

    check(
      "a fixed id is caught, because a second copy of the section would duplicate it",
      idsOf(variant([['<details data-block-id', '<details id="panel" data-block-id']])).includes("literal-id"),
    )
    check(
      "an id built from the instance is fine",
      !idsOf(variant([['<details data-block-id', '<details id="{{ section.id }}-panel" data-block-id']])).includes("literal-id"),
    )

    const moving = checkSectionQuality(variant([["@media (prefers-reduced-motion: reduce) { .a { transition: none; } }", ""]]))
    check(
      "motion with no reduced-motion escape is a warning, not a refusal",
      moving.some((f) => f.id === "reduced-motion" && f.severity === "warning") && !idsOf(variant([["@media (prefers-reduced-motion: reduce) { .a { transition: none; } }", ""]])).includes("reduced-motion"),
    )
    check(
      "a section that does not move is not asked for a reduced-motion rule",
      !checkSectionQuality(
        variant([
          ["  .a { transition: opacity 200ms ease; }\n", ""],
          ["@media (prefers-reduced-motion: reduce) { .a { transition: none; } }", ""],
        ]),
      ).some((f) => f.id === "reduced-motion"),
    )

    /* Round 25: noted, not refused, since the compiler rewrites it into the same container query. */
    check(
      "a width media query is noted, because a section is as wide as its column",
      checkSectionQuality(variant([["@container (min-width: 640px)", "@media (min-width: 640px)"]])).some((f) => f.id === "media-query" && f.severity === "warning") &&
        !idsOf(variant([["@container (min-width: 640px)", "@media (min-width: 640px)"]])).includes("media-query"),
    )
    check(
      "prefers-reduced-motion is not mistaken for a width query",
      !idsOf(GOOD).includes("media-query"),
    )
    check(
      "@container with no container-type is noted (every section is drawn in a container already)",
      checkSectionQuality(variant([["container-type: inline-size; ", ""]])).some((f) => f.id === "container-type" && f.severity === "warning"),
    )

    check(
      "a script that searches the whole page is caught",
      idsOf(
        variant([["<style>", "<script>\n  const x = querySelector('.a')\n</script>\n<style>"]]),
      ).includes("unscoped-query"),
    )
    check(
      "a script that searches inside its own root is fine",
      !idsOf(
        variant([["<style>", "<script>\n  const x = root.querySelector('.a')\n</script>\n<style>"]]),
      ).includes("unscoped-query"),
    )
    check(
      "a timer without the capability that grants it is caught",
      idsOf(
        variant([["<style>", "<script>\n  setInterval(() => {}, 100)\n</script>\n<style>"]]),
      ).includes("timers-capability"),
    )

    check(
      "a setting declared twice is caught",
      idsOf(
        variant([
          [
            '{ "id": "heading", "type": "text", "label": "Heading", "default": "Questions" }',
            '{ "id": "heading", "type": "text", "label": "Heading" },\n    { "id": "heading", "type": "text", "label": "Again" }',
          ],
        ]),
      ).includes("duplicate-setting"),
    )

    // Warnings say something and block nothing.
    const hardcoded = checkSectionQuality(variant([["{{ scheme.bg }}", "#ffffff"]]))
    check(
      "a hardcoded colour beside a colour scheme is reported",
      hardcoded.some((f) => f.id === "hardcoded-colour"),
    )
    check("and it is a warning, so it does not block a save", !idsOf(variant([["{{ scheme.bg }}", "#ffffff"]])).includes("hardcoded-colour"))

    check(
      "an image with no alt text is reported",
      checkSectionQuality(variant([["<h2>", '<img src="{{ settings.heading }}"><h2>']])).some((f) => f.id === "img-alt"),
    )

    check(
      "a file that does not even parse is left to the compiler",
      checkSectionQuality("not a section at all").length === 0,
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("One gate in front of every way a section can be written")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ok = validateSection(GOOD, { path: "sections/questions.storelib", expectType: "questions" })
    check("a correct section passes", ok.ok === true)
    check("and it reports the type and name the compiler read", ok.ok === true && ok.type === "questions" && ok.name === "Questions")

    const broken = validateSection(GOOD.replace("{{ settings.heading }}", "{{ settings.headng }}"), {
      path: "sections/questions.storelib",
      expectType: "questions",
    })
    check("a name the schema does not declare fails", broken.ok === false && broken.reason === "compile")
    check(
      "and the feedback quotes the compiler rather than paraphrasing it",
      broken.ok === false && broken.feedback.includes("headng"),
    )

    const poor = validateSection(variant([["<details data-block-id", '<details id="panel" data-block-id']]), {
      path: "sections/questions.storelib",
      expectType: "questions",
    })
    check("a section that compiles and would still be wrong fails", poor.ok === false && poor.reason === "quality")
    check(
      "and the feedback says what to do about it",
      poor.ok === false && /id/.test(poor.feedback),
    )
    const motionOk = validateSection(variant([["@media (prefers-reduced-motion: reduce) { .a { transition: none; } }", ""]]), {
      path: "sections/questions.storelib",
      expectType: "questions",
    })
    check("a section's own animation still saves", motionOk.ok === true)

    check("three attempts, not one", MAX_REPAIR_ATTEMPTS === 3)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Storelib knowledge is retrieved, not dumped")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const anim = knowledgeFor("make the FAQ opening smoother").map((t) => t.id)
    check("a request about an opening gets the animation facts", anim.includes("animation"), anim.join(", "))
    check("and it does not get everything else as well", anim.length <= 4, `${anim.length} topics`)

    const colour = knowledgeFor("use the dark colour scheme").map((t) => t.id)
    check("a request about colour gets the scheme facts", colour.includes("color-scheme"), colour.join(", "))

    check("a request about nothing in particular retrieves nothing", knowledgeFor("hello").length === 0)

    // The facts that can drift are imported, so they cannot.
    check("the control list in the prompt is the registry's", CONTROL_TYPES.every((t) => CORE_FORMAT.includes(t)))
    check("the filter list in the prompt is the template engine's", FILTER_NAMES.every((f) => CORE_FORMAT.includes(f)))
    const scriptTopic = knowledgeFor("write a slider script").find((t) => t.id === "script")
    check(
      "the capability list in the prompt is the script checker's",
      !!scriptTopic && CAPABILITIES.every((c) => scriptTopic.text.includes(c)),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The site the section is for reaches the model that writes it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const described = describeThemeForAuthoring({
      settings: { color_schemes: { white: { bg: "#ffffff", text: "#111111" } } },
      neighbours: [{ type: "hero_split", name: "Hero" }, { type: "faq" }],
    })
    check("the colour schemes are named", /COLOUR SCHEMES/.test(described))
    check("and what the site is already built out of", described.includes("Hero") && described.includes("faq"))
    /**
     * With no theme saved, the built-in schemes ARE this site's schemes, so
     * naming them is right. What would be wrong is printing a key with no
     * value beside it, which is what the first version of this did for every
     * line: it read `bg` and `primary_btn_bg`, which are names a TEMPLATE can
     * read but not keys a ColorScheme holds.
     */
    const bare = describeThemeForAuthoring({ settings: null })
    check("with no theme saved, the built-in schemes are still named", /white \(the theme's default\)/.test(bare))
    check("and every colour named has a value beside it", !/[a-z_]+ ,|[a-z_]+ $/m.test(bare), bare.slice(0, 200))
    check("including the background, which is the one that says what a scheme looks like", /background #ffffff/.test(bare))

    /**
     * THE NAMES IN THE PROMPT ARE NAMES A TEMPLATE CAN ACTUALLY READ.
     *
     * "Never let the AI invent schema properties" is only true if the names
     * we hand it are real. Checked against the renderer's own merge of the
     * scheme and its legacy aliases, which is exactly what a template sees.
     */
    const readable = new Set(
      Object.keys({
        ...resolveSectionColors(null, { color_scheme: "white" }).legacy,
        ...resolveSectionColors(null, { color_scheme: "white" }).scheme,
      }),
    )
    const named = [...DESIGN_RULES.matchAll(/scheme\.([a-z_]+)/g)].map((m) => m[1])
    check("every scheme name the design rules quote is one a template can read", named.length > 4 && named.every((n) => readable.has(n)), named.filter((n) => !readable.has(n)).join(", "))
    const schemeTopic = knowledgeFor("colour scheme").find((t) => t.id === "color-scheme")
    check(
      "and so is every key the reference lists",
      !!schemeTopic && SCHEME_COLOR_KEYS.every((k) => readable.has(k) && schemeTopic.text.includes(k)),
    )

    /**
     * Driven, not read: the theme has to arrive in the TURN, because the turn
     * is the half that is allowed to change per request. In the system prompt
     * it would cost the prompt cache on every call.
     */
    let sawSystem = ""
    let sawTurn = ""
    const provider: AgentProvider = {
      id: "scripted",
      async complete(request): Promise<ProviderTurn> {
        sawSystem = request.system
        const first = request.turns[0] as { content?: string }
        sawTurn = String(first?.content ?? "")
        return {
          text: GOOD.replace('"type": "questions"', '"type": "brand_new"'),
          toolCalls: [],
          raw: [],
          usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
          stop: "done",
        }
      },
    }
    const written = await writeSection({
      provider,
      model: "test",
      prompt: "a smooth FAQ",
      takenTypes: [],
      takenNames: [],
      theme: { settings: { color_schemes: { white: { bg: "#ffffff", text: "#111111" } } }, neighbours: [{ type: "hero_split" }] },
    })
    check("the section is written and accepted", written.ok === true, written.ok === false ? written.error : "")
    check("the theme arrived in the turn", /COLOUR SCHEMES/.test(sawTurn))
    check("and NOT in the system prompt, which both providers cache", !/COLOUR SCHEMES/.test(sawSystem))
    check("the retrieved facts arrived in the turn too", /STORELIB REFERENCE/.test(sawTurn))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Writing a section: an answer when it is not one, and room to finish")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const scripted = (answers: { text: string; stop?: ProviderTurn["stop"] }[]) => {
      const seen: { turns: number; maxOutputTokens?: number; last: string }[] = []
      let i = 0
      const provider: AgentProvider = {
        id: "scripted",
        async complete(request): Promise<ProviderTurn> {
          const turns = request.turns as { content?: string }[]
          seen.push({ turns: turns.length, maxOutputTokens: request.maxOutputTokens, last: String(turns[turns.length - 1]?.content ?? "") })
          const a = answers[Math.min(i++, answers.length - 1)]
          return {
            text: a.text,
            toolCalls: [],
            raw: [],
            usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
            stop: a.stop ?? "done",
          }
        },
      }
      return { provider, seen }
    }

    /* "hi" is not a section. It used to be written as one anyway, or fail
       to compile, and the chat showed the compiler's report. */
    {
      const { provider, seen } = scripted([{ text: "REPLY: Tell me what the section should show. Try: a pricing section with three plans." }])
      const stages: string[] = []
      const out = await writeSection({ provider, model: "test", prompt: "hi", takenTypes: [], takenNames: [], onStage: (s) => stages.push(s) })
      check("a message that is not a section gets an answer, not a file", out.ok === false && out.reply?.startsWith("Tell me what the section should show") === true)
      check("and it asked the model once", seen.length === 1)
      check("the writer is told it may answer instead", /THE ONE EXCEPTION/.test(writeSectionSystem()) && /REPLY:/.test(writeSectionSystem()))
      check("it said it was thinking before it answered", stages[0] === "thinking")
    }

    /* A long file stopped by the length limit ends inside its <schema>: the
       "Line 331: <schema> is never closed" a creator was shown. It is sent
       back asking for a shorter whole file, not quoted the compiler. */
    {
      const good = GOOD.replace('"type": "questions"', '"type": "long_one"')
      const { provider, seen } = scripted([
        { text: good.slice(0, Math.floor(good.length * 0.8)), stop: "length" },
        { text: good },
      ])
      const stages: string[] = []
      /* The write loop on its own: the plan before it and the review after it are driven in tests/ask-images-u.test.ts. */
      const out = await writeSection({ provider, model: "test", prompt: "a long FAQ", takenTypes: [], takenNames: [], plan: false, review: false, onStage: (s) => stages.push(s) })
      check("a cut-off file is asked for again, and the second is kept", out.ok === true && seen.length === 2)
      check("with the reason being its length, not a compile error", /cut off at the length limit/.test(seen[1].last) && /shorter/.test(seen[1].last))
      check("there is room for a whole file", (seen[0].maxOutputTokens ?? 0) >= 16000)
      check("the stages were reported in order", stages.join(",") === "thinking,checking,fixing,checking")
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Editing a section's source, driven end to end")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * THE FAILURE THIS WORK EXISTS TO END, as far as a test can reach it.
     *
     * A model cannot be made to behave in a test, so what is driven here is
     * everything AROUND its answer: that it is handed the section's real
     * source when it asks, that a write which would break the page is sent
     * back with the reason, that a defect the file already had does not block
     * an unrelated fix, and that a write which is accepted reaches the store.
     */
    const BASE = GOOD.replace('"type": "questions"', '"type": "faq"').replace('"name": "Questions"', '"name": "FAQ"')
    /** The same file with a pre-existing fault in it: a fixed id. */
    const ALREADY_BROKEN = BASE.replace("<details data-block-id", '<details id="q" data-block-id')

    async function run(stored: string, sent: string) {
      const files = new Map<string, string>([["faq", stored]])
      const calls: string[] = []
      let step = 0
      const provider: AgentProvider = {
        id: "scripted",
        async complete(): Promise<ProviderTurn> {
          step++
          const toolCalls =
            step === 1
              ? [{ id: "c1", name: "read_section_code", argumentsJson: JSON.stringify({ sectionType: "faq" }) }]
              : step === 2
                ? [{ id: "c2", name: "write_section_code", argumentsJson: JSON.stringify({ sectionType: "faq", source: sent }) }]
                : []
          return {
            text: toolCalls.length ? "" : "Smoothed the accordion's opening.",
            toolCalls,
            raw: [],
            usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
            stop: toolCalls.length ? "tool_calls" : "done",
          }
        },
      }
      const loop = themeAgent({
        provider,
        model: "test",
        prompt: "I meant the opening animation",
        state: { sections: [{ id: "s1", type: "faq", settings: {} } as SectionInstance], settings: {} },
        page: "home",
        addable: [],
        maxTurns: 6,
        maxReviews: 0,
        newId: (t) => `${t}-1`,
        code: {
          read: (type) => files.get(type) ?? null,
          async write(type, source) {
            files.set(type, source)
            calls.push(type)
            return { ok: true }
          },
        },
      })
      const outputs: string[] = []
      for (;;) {
        const next = await loop.next()
        if (next.done) return { result: next.value, files, calls, outputs }
        const ev = next.value as { type: string }
        if (ev.type === "tool") outputs.push(JSON.stringify(ev))
      }
    }

    // A smooth opening, done properly: it keeps the reduced-motion escape.
    const good = await run(BASE, BASE.replace("transition: opacity 200ms ease", "transition: opacity 320ms cubic-bezier(.2,.7,.2,1)"))
    check("an edit to the section's CSS is written", good.calls.includes("faq"))
    check("and what was stored is what the model sent", /320ms/.test(good.files.get("faq") ?? ""))
    check("the run reports that source was rewritten", good.result.wroteCode === true)

    // The same edit, with the section's own motion and no reduced-motion rule. That is allowed.
    const motion = await run(
      BASE,
      BASE.replace("@media (prefers-reduced-motion: reduce) { .a { transition: none; } }", "").replace(
        "transition: opacity 200ms ease",
        "transition: opacity 320ms ease",
      ),
    )
    check("a section's own animation is saved", motion.calls.includes("faq") && /320ms/.test(motion.files.get("faq") ?? ""))

    // A new fixed id is still a real fault, and the write does not land.
    const bad = await run(BASE, BASE.replace("<details data-block-id", '<details id="q" data-block-id'))
    check("a write that adds a fixed id is refused", !bad.calls.includes("faq"))
    check("and the stored file is untouched", (bad.files.get("faq") ?? "") === BASE)

    // A file that ALREADY had a fixed id: an unrelated fix must still land.
    const inherited = await run(ALREADY_BROKEN, ALREADY_BROKEN.replace("200ms", "320ms"))
    check(
      "a fault the file already had does not block an unrelated change",
      inherited.calls.includes("faq") && /320ms/.test(inherited.files.get("faq") ?? ""),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every surface draws on the same brain")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const loop = read("lib/website-builder/agent/loop.ts")
    const sites = read("lib/sites/agent/loop.ts")
    const fix = read("lib/website-builder/agent/fix-section.ts")

    check("the page assistant composes the shared rules", /\$\{pageAgentRules\(\)\}/.test(loop))
    check("Code a section composes the shared rules", writeSectionSystem().includes(SECTION_CONTRACT))
    check("repairing a section composes the shared rules", /editSectionRules\(\)/.test(fix))
    check("the sites agent gets the taste and not the section format", /\$\{sitesAgentRules\(\)\}/.test(sites))
    check("and the sites agent is not sent rules about a format it cannot produce", !sitesAgentRules().includes(SECTION_CONTRACT))

    /**
     * ONE STRING, BOTH VENDORS. Neither provider adds a word: Anthropic sends
     * `request.system` as its cached system block, OpenAI as `instructions`.
     * So this is what makes the rules shared, and it is worth asserting that
     * it stays true.
     */
    const anthropic = read("lib/sites/agent/anthropic-provider.ts")
    const openai = read("lib/sites/agent/openai-provider.ts")
    check("Anthropic sends the system prompt unchanged", /text:\s*request\.system/.test(anthropic))
    check("OpenAI sends the same string unchanged", /instructions:\s*request\.system/.test(openai))
    check(
      "and Anthropic still caches it as a prefix block",
      /cache_control:\s*\{\s*type:\s*"ephemeral"/.test(anthropic),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The answers this work exists to delete")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const rules = pageAgentRules()

    check("a request is classified before anything is edited", /BEFORE YOU TOUCH ANYTHING/.test(rules))
    check("and the five kinds are named", ["CONTENT", "DESIGN", "BEHAVIOUR", "STRUCTURE", "SETTINGS"].every((k) => rules.includes(`- ${k} `)))
    check(
      "editing the copy because the copy contains the word is named as the mistake",
      /NEVER EDIT THE CONTENT BECAUSE THE CONTENT CONTAINS THE WORD/.test(rules),
    )
    check(
      '"this section exposes no control for that" is named as not an answer',
      /NEVER answers while the source is editable/.test(rules) && rules.includes("no control for that"),
    )
    check("a short follow-up is a correction of the last thing done", /A SHORT MESSAGE AFTER A CHANGE IS ABOUT THAT CHANGE/.test(rules))
    check('"I meant the animation" is handled by name', rules.includes("I meant the animation"))
    check("a setting is not added for every one-off", /DO NOT ADD A SETTING FOR EVERY ONE-OFF/.test(rules))
    check("an existing control is preferred when one already does the job", /PREFER A SETTING WHEN ONE ALREADY DOES THE JOB/.test(rules))

    const loop = read("lib/website-builder/agent/loop.ts")
    check(
      "and the page assistant's own prompt says which tools reach the source",
      /read_section_code/.test(loop) && /write_section_code/.test(loop),
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Guardrails, and small enough to send every time")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check(
      "the creator's own request outranks every design rule",
      /OUTRANK EVERY DESIGN RULE/.test(DESIGN_RULES) && /asks for a gradient gets a gradient/.test(DESIGN_RULES),
    )
    check("and so does the site's existing design", /already established/.test(DESIGN_RULES))
    check("invented social proof is named", /Invented social proof/.test(DESIGN_RULES))
    check("settings are merchant choices, not CSS", /SETTINGS ARE MERCHANT CHOICES, NOT CSS PROPERTIES/.test(DESIGN_RULES))
    check("mobile is designed rather than shrunk", /MOBILE IS DESIGNED, NOT SHRUNK/.test(DESIGN_RULES))

    /**
     * A BUDGET, BECAUSE THIS IS PAID FOR ON EVERY REQUEST. Cached, so it is
     * paid at a discount, but a prefix that grows without anybody noticing is
     * how a prompt reaches twenty thousand tokens. Roughly four characters to
     * a token.
     */
    const budget = (name: string, text: string, maxChars: number) =>
      check(`${name} stays under ~${Math.round(maxChars / 4 / 100) / 10}k tokens`, text.length <= maxChars, `${text.length} chars`)
    /* Blocks only for a list the creator grows; single-purpose sections are plain settings, and arrive with the theme's motion. */
    check("the writer is told a hero is plain settings, not blocks", /One of each thing \(a hero, a banner, a call to action\) is plain settings, NO blocks/.test(writeSectionRules()))
    check("  and that motion is the section's own, not a required fade", /Motion is the section's own CSS/.test(writeSectionRules()))
    budget("the page assistant's shared rules", pageAgentRules(), 10_000)
    /* 11,000 until the framework's own lists grew: eight setting types and the
       `lines` filter, which CORE_FORMAT names from the registry. Still a budget. */
    /* 11,400 until CORE_FORMAT said which type a picture, a menu and a colour are, and colour per element: 400 characters. */
    /* 11,810 since wave 5 design: the filter list names `split`. */
    budget("the section writer's rules", writeSectionRules(), 11_810)
    budget("the section editor's rules", editSectionRules(), 8_000)
    budget("the sites agent's rules", sitesAgentRules(), 6_000)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
