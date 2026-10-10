/**
 * ===========================================================================
 *  EVERY PLACE A CREATOR'S TEXT IS PUT ON A PAGE AS MARKUP
 * ===========================================================================
 * The cleaning only helps where it is pointed. `lib/website-builder/sanitize.ts`
 * holds a list of setting ids that carry HTML, and a section renderer that
 * injects a setting NOT on that list is injecting it raw, however careful
 * every other part of the system is.
 *
 * That is the regression this file exists to stop, and it is an easy one to
 * cause: adding a section with a `marquee_text` that the renderer writes with
 * `dangerouslySetInnerHTML` is two lines, looks like every other section, and
 * silently opens the hole the rest of this work closed.
 *
 * So the surface is written down. Every renderer that injects HTML is named
 * here with the settings it injects, and every one of those settings has to
 * be one the cleaner knows about. A new injection point fails because it is
 * not on the list; a new setting fails because the cleaner has never heard of
 * it. Both failures say which.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * THE WHOLE SURFACE, and the settings each one writes out as markup.
 *
 * An empty list means the file injects something that is not a creator
 * setting at all, and the third column says what makes that safe instead.
 */
const INJECTORS: Record<string, { settings: string[]; why?: string }> = {
  "CustomHtmlSection.tsx": { settings: ["html_content"] },
  "RichTextSection.tsx": { settings: ["body"] },
  "SplitContentSection.tsx": { settings: ["body"] },
  "FaqSection.tsx": { settings: ["answer"] },
  "TabsContentSection.tsx": { settings: ["content"] },
  "ChapterPreviewSection.tsx": { settings: ["preview_text"] },
  "MapEmbedSection.tsx": { settings: ["embed_code"] },
  /* The product section's blocks: a collapsible tab's rich text, custom
     code, and the product description, which the server cleans as rich
     text before it reaches the page (lib/products/product-section-data.ts). */
  "product-blocks.tsx": { settings: ["content", "html_content", "description"] },
  "StorelibSection.tsx": {
    settings: [],
    why: "the theme compiler's output, which escapes every value it prints; the only way past it is the `raw` filter, and tests/storelib-security.test.ts covers that",
  },
}

/** Where the section renderers live. */
const RENDERERS = "components/website-builder/sections"

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) filesUnder(p, out)
    else if (name.endsWith(".tsx")) out.push(p)
  }
  return out
}

function main() {
  const root = join(process.cwd(), RENDERERS)
  const injecting = filesUnder(root)
    /*
      Comments stripped first, both kinds. ProductSection carries a block
      comment saying it deliberately does NOT inject, and a scan that reads
      its own prose reports the opposite of what the file does.
    */
    .filter((p) => /dangerouslySetInnerHTML/.test(
      readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""),
    ))
    .map((p) => p.slice(root.length + 1).split("/").pop() as string)
    .sort()

  console.log("\nThe list of renderers that inject markup is the list, and nothing else does")

  const unlisted = injecting.filter((f) => !(f in INJECTORS))
  check(
    "no renderer injects HTML without being named here",
    unlisted.length === 0,
    unlisted.length
      ? `${unlisted.join(", ")} — add it with the settings it injects, and make sure the cleaner knows them`
      : undefined,
  )

  const gone = Object.keys(INJECTORS).filter((f) => !injecting.includes(f))
  check(
    "and none is named here that no longer injects any",
    gone.length === 0,
    gone.length ? `${gone.join(", ")} stopped injecting; remove them so this list stays the truth` : undefined,
  )
  console.log(`  ${injecting.length} renderers put a creator's text on the page as markup`)

  console.log("\nAnd every setting they inject is one the cleaner has a rule for")

  /*
    THE PART WITH TEETH. A renderer may inject whatever it likes as long as
    `sanitize.ts` recognises the id, because that is what decides whether the
    value was ever passed through an allow list. An id it does not know is
    never cleaned by anything, anywhere.
  */
  const sanitize = read("lib/website-builder/sanitize.ts")
  const block = sanitize.match(/const HTML_SETTING_IDS[^{]*\{([\s\S]*?)\n\}/)
  check("the cleaner's id list can be read", !!block)
  const known = new Set((block?.[1].match(/^\s{2}(\w+):/gm) ?? []).map((m) => m.trim().replace(":", "")))

  for (const [file, { settings, why }] of Object.entries(INJECTORS)) {
    if (settings.length === 0) {
      check(`${file} injects nothing from settings`, !!why, "say what makes it safe instead")
      continue
    }
    for (const id of settings) {
      check(`${file}: \`${id}\` is cleaned`, known.has(id), `add "${id}" to HTML_SETTING_IDS in lib/website-builder/sanitize.ts`)
    }
  }

  console.log("\nThe one outside the website builder is cleaned where it is saved")

  /*
    The creator profile's story is the same shape of thing on a different
    surface: rich text, injected by components/store-builder, cleaned by the
    route that writes it.
  */
  const profile = read("app/api/creator-profile/route.ts")
  check("the profile story goes through the rich text allow list on save",
    /out\.aboutContent = \/<\[a-z\]\[\\s\\S\]\*>\/i\.test\(raw\) \? sanitizeRichText\(raw\)\.trim\(\) : raw\.trim\(\)/.test(profile)
      || /sanitizeRichText\(raw\)/.test(profile))
  check("and the editor that produces it cleans on the way out too",
    /* Dynamic value chips are turned back into their values first, then the whole is cleaned. */
    /const clean = sanitizeRichText\(withoutValueChips\(el\.innerHTML\)\)/.test(read("components/website-builder/rich-text-field.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
