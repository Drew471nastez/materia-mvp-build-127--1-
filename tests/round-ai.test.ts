/**
 * Round AI: what the owner asked for after round AH, checked in one place.
 *
 *   ASK         Storelib AI reads the page the editor sends instead of refusing it as "Describe what you want changed."
 *   WRITING     a section the AI writes takes rich text for headings and copy, and reads the theme's type
 *   LANGUAGE    the sidebar's language and currency are one clean row, not two selects
 *   CLIPBOARD   a copy survives odd blocks, Cmd/Ctrl+C and V work from inside an imported theme's page
 *   ROWS        Add section has a raised plus, the insert line fades at its ends
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { z } from "zod"
import { cleanAgentBody, cleanSections, unreadablePart } from "@/lib/website-builder/agent/request-shape"
import { BlockInstanceSchema } from "@/lib/website-builder/block-tree-schema"
import { sectionAdvice } from "@/lib/storelib-ai/integration"
import { writeSectionRules } from "@/lib/storelib-ai"
import { copySection, decodeClip, encodeClip } from "@/lib/website-builder/section-clipboard"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const src = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* The route's own section shape, as app/api/website-builder/themes/[installId]/agent/route.ts declares it. */
const SectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  name: z.string().max(256).optional().default(""),
  label: z.string().max(80).optional(),
  settings: z.record(z.unknown()),
  blocks: z.array(BlockInstanceSchema).max(500).optional(),
  hidden: z.boolean().optional(),
  group: z.enum(["header", "footer"]).optional(),
})
const Body = z.object({
  prompt: z.string().max(8000),
  page: z.string().min(1).max(200),
  sections: z.array(SectionSchema).max(500),
  settings: z.record(z.unknown()),
  selectedSectionId: z.string().max(400).optional(),
  selectedBlockId: z.string().max(400).optional(),
  conversationId: z.string().uuid().nullable().optional(),
})

async function main() {
  console.log("\nStorelib AI reads the page it is sent")
  {
    const messy = {
      prompt: "Make the hero warmer",
      page: "home",
      settings: {},
      selectedSectionId: null,
      selectedBlockId: null,
      conversationId: null,
      sections: [
        { id: "hero-1", type: "hero", name: null, label: "A label a creator typed that runs on far longer than the eighty characters the field holds, really", settings: { heading: "Hi" }, hidden: null },
        { id: "app-1", type: "apps", settings: null, blocks: [{ id: "b1", type: "shopify://apps/judge-me-reviews/blocks/preview_badge/61ccd3b1-a9f2-4160-9fe9-4fec8413e5d8", settings: {} }, { id: "b2", type: "_card", settings: null }, { type: "no-id" }] },
        "not a section",
      ],
    }
    check("the raw page was refused before (the bug)", !Body.safeParse(messy).success)
    const parsed = Body.safeParse(cleanAgentBody(messy))
    check("tidied, the same page is read", parsed.success, parsed.success ? undefined : parsed.error.issues.slice(0, 2))
    const sections = cleanSections(messy.sections)
    check("both real sections are kept, the junk is not", sections.length === 2)
    check("a long label is clipped, not refused", (sections[0].label ?? "").length === 80)
    check("a section with no settings gets an empty set", JSON.stringify(sections[1].settings) === "{}")
    check("an app block's long type is kept by its name", sections[1].blocks?.[0]?.type.length !== undefined && sections[1].blocks![0].type.length <= 64)
    check("a block with no id is left out", sections[1].blocks?.length === 2)
    check("a long message says to split it, not to describe it", /too long/.test(unreadablePart([{ path: ["prompt"], message: "" }])))
    check("any other failure names the part", /sections\.3/.test(unreadablePart([{ path: ["sections", 3, "type"], message: "" }])))
    for (const route of ["app/api/website-builder/themes/[installId]/agent/route.ts", "app/api/website-builder/themes/[installId]/agent/decide/route.ts", "app/api/website-builder/themes/[installId]/sections/code/route.ts"]) {
      const c = code(route)
      check(`${route.split("/").slice(-2).join("/")} tidies before it checks`, /safeParse\(cleanAgentBody\(/.test(c))
      check(`${route.split("/").slice(-2).join("/")} never answers a broken page with "Describe what you want changed."`, !/!parsed\.success[\s\S]{0,120}Describe what you want changed\./.test(c))
    }
    check("a long brief fits (8,000 characters)", /MAX_PROMPT = 8_000/.test(code("app/api/website-builder/themes/[installId]/agent/route.ts")))
  }

  console.log("\nSections the AI writes use rich text and the theme")
  {
    const file = (settings: unknown[]) => `<template><h2>{{ section.settings.heading }}</h2></template>\n<style></style>\n<schema>${JSON.stringify({ name: "X", settings, presets: [{ name: "X" }] })}</schema>`
    const ids = (f: string) => sectionAdvice(f).map((x) => x.id)
    check("a heading typed as text gets a note", ids(file([{ type: "text", id: "heading", label: "Heading" }])).includes("advice-rich-heading"))
    check("a heading as inline_richtext passes", !ids(file([{ type: "inline_richtext", id: "heading", label: "Heading" }])).includes("advice-rich-heading"))
    check("a description as a textarea gets a note", ids(file([{ type: "textarea", id: "description", label: "Text" }])).includes("advice-rich-body"))
    check("a button label stays plain text", !ids(file([{ type: "text", id: "button_label", label: "Button" }])).some((i) => i.startsWith("advice-rich")))
    check("the review step hands those notes back to the writer", /"advice-rich-heading", "advice-rich-body"/.test(src("lib/website-builder/agent/write-section.ts")))
    const rules = writeSectionRules()
    check("writing a section always carries the rich text rule", /A heading or title is inline_richtext \(never text\)/.test(rules))
    const { ALL_TOPICS } = await import("@/lib/storelib-ai")
    const typo = ALL_TOPICS.find((t) => t.id === "typography")
    check("a request about headings is told to follow the theme's type", !!typo && typo.triggers.test("a hero with a big heading") && /var\(--type-h2-font\)/.test(typo.text))
    check("a settings-only change edits the schema alone", /edits inside <schema> alone/.test(src("lib/website-builder/agent/loop.ts")))
  }

  console.log("\nThe sidebar's language and currency")
  {
    const c = code("components/website-builder/preview-locale-switch.tsx")
    const bar = c.slice(c.indexOf("export function SidebarLanguageBar"))
    check("one row opens a light list", /data-wb-locale-trigger/.test(bar) && /<LocaleMenuBody model=\{model\} tone="light"/.test(bar))
    check("no plain selects in the sidebar", !/PreviewLocaleSelects|<select/.test(bar))
    check("the top bar's menu draws the same list", /<LocaleMenuBody model=\{model\} tone="dark"/.test(c))
  }

  console.log("\nCopy and paste")
  {
    const clip = copySection(
      { id: "s1", type: "testimonials", name: "Testimonials", settings: { heading: "Kind words" }, blocks: [{ id: "a", type: "_card", settings: { quote: "Yes" } }, { id: "b", type: "@app", settings: {} }] } as never,
      { owner: "c1", from: { installId: "i1", page: "home" }, typeName: "Testimonials" },
    )
    const back = decodeClip(encodeClip(clip))
    check("a copy with a private block reads back (it was lost before)", back?.kind === "section" && back.section.blocks.length === 2)
    const raw = JSON.parse(encodeClip(clip)) as { section: { blocks: unknown[] } }
    raw.section.blocks.push({ id: "", type: "???" })
    const kept = decodeClip(JSON.stringify(raw))
    check("one unreadable block is left out, the copy is kept", kept?.kind === "section" && kept.section.blocks.length === 2)
    const bridge = src("lib/storelib-theme/compat/canvas-bridge.ts")
    check("Cmd/Ctrl+C and V inside an imported theme's page reach the builder", /type: "clip-key"/.test(bridge))
    check("the canvas hands them on", /storelib:clip-key/.test(src("components/website-builder/compat/compat-canvas.tsx")))
    const page = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("the editor copies or pastes on them", /addEventListener\("storelib:clip-key", onFrameKey\)/.test(page))
    check("pasting with the header open lands at the top of the page, never in the header", /groupOf\(opened\) !== "template"/.test(page))
    check("pasting with nothing copied says so", /if \(!from\) \{ toast\.error\("Copy a section first"\)/.test(page))
  }

  console.log("\nAdd section and the insert line")
  {
    check("Add section's plus sits in a raised key", /group-hover\/add:shadow/.test(src("components/website-builder/editor/tree-parts.tsx")))
    const list = src("components/website-builder/editor/sections-list.tsx")
    check("the insert line fades out at both ends", /* round AJ: shared with blocks, tree-parts.tsx */ /linear-gradient\(90deg,transparent_0%/.test(src("components/website-builder/editor/tree-parts.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
