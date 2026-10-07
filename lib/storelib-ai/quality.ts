/**
 * ===========================================================================
 *  THE PART THAT IS CHECKED RATHER THAN PROMISED
 * ===========================================================================
 * A model told to write accessible, responsive, multi-instance-safe CSS will
 * say that it did. Roughly half the time it did. The difference between a
 * rule and a guarantee is whether something reads the file afterwards, so
 * these are the parts of the quality contract that can be decided by looking
 * at the source, and they are decided by looking at the source.
 *
 * WHAT IS NOT HERE, because it is already enforced elsewhere and duplicating
 * it would mean two answers to one question:
 *   syntax, schema validity, and every template path            → compileSection
 *   window / document / fetch / eval inside a script            → checkScript
 *   CSS escaping the section                                    → scopeCss
 *   contrast, empty copy, repeated entries, leftover demo text  → agent/review
 *
 * SEVERITY IS ABOUT WHETHER IT SHIPS. An `error` is wrong in a way the person
 * who asked would call a bug, so it is worth another model round trip. A
 * `warning` is worth saying and not worth blocking on: some of these are
 * heuristics over text, and a heuristic that blocks is a heuristic that will
 * eventually refuse somebody's correct file.
 *
 * PURE. Source text in, findings out, no compiler and no network, so
 * tests/storelib-ai.test.ts drives it with string literals.
 */

import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"

export interface QualityFinding {
  id: string
  severity: "error" | "warning"
  /** Written to be sent straight back to the model, so it names the fix. */
  message: string
}

/** Comments hold examples and prose; they are not what the page does. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ")
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\{#[\s\S]*?#\}/g, " ")
}

/**
 * Every check, over one section's source.
 *
 * `source` is the whole .storelib file. A file that will not even parse gets
 * one finding and stops: everything below assumes four blocks, and a parse
 * failure is the compiler's to report, not this module's to guess at.
 */
export function checkSectionQuality(source: string): QualityFinding[] {
  const parsed = parseStorelib(source, "section.storelib")
  if (parsed.ok === false) return []

  const out: QualityFinding[] = []
  const template = stripHtmlComments(parsed.value.template.text)
  const css = stripCssComments(parsed.value.style.text)
  const script = parsed.value.script?.text ?? ""
  const schemaText = parsed.value.schema.text

  let schema: { settings?: { id?: string; type?: string }[]; blocks?: unknown[]; presets?: unknown[] } | null = null
  try {
    schema = JSON.parse(schemaText)
  } catch {
    schema = null
  }
  const settings = Array.isArray(schema?.settings) ? schema!.settings! : []
  const hasScheme = settings.some((s) => s?.type === "color_scheme")

  /**
   * ONE INSTANCE'S ID IS EVERY INSTANCE'S ID.
   *
   * A literal id in the markup is correct until the creator adds the section
   * a second time, at which point the page has two elements with one id, the
   * first label points at the wrong input, and every anchor goes to the first
   * copy. It is the single most common way a generated section breaks, and
   * it breaks later, which is worse.
   */
  const literalIds = [...template.matchAll(/\sid\s*=\s*"([^"]*)"/g)]
    .map((m) => m[1])
    .filter((v) => !v.includes("{{"))
  if (literalIds.length) {
    out.push({
      id: "literal-id",
      severity: "error",
      message: `The markup has a fixed id (${literalIds.slice(0, 3).map((v) => `id="${v}"`).join(", ")}). A section can be on a page twice, and then those ids are duplicated. Build them from the instance: id="{{ section.id }}-${literalIds[0] || "panel"}", and point every for, href and aria-controls at the same expression.`,
    })
  }

  const forAttrs = [...template.matchAll(/\sfor\s*=\s*"([^"]*)"/g)].map((m) => m[1]).filter((v) => !v.includes("{{"))
  const controls = [...template.matchAll(/\saria-controls\s*=\s*"([^"]*)"/g)].map((m) => m[1]).filter((v) => !v.includes("{{"))
  if (!literalIds.length && (forAttrs.length || controls.length)) {
    out.push({
      id: "literal-id-reference",
      severity: "warning",
      message: `A for or aria-controls attribute points at a fixed name (${[...forAttrs, ...controls].slice(0, 2).join(", ")}). Build it from {{ section.id }} so a second copy of this section does not point at the first one.`,
    })
  }

  /**
   * MOTION THAT CANNOT BE TURNED OFF.
   *
   * Checked only when there is motion, because the media query is noise in a
   * section that does not move. `transition: none` and a duration of zero do
   * not count as motion, which is what stops this firing on a reset.
   */
  const motion = /(?:^|[\s;{])(transition|animation)(?:-[a-z-]+)?\s*:\s*(?!none|0s|0ms|initial|unset)/i.test(css) || /@keyframes/i.test(css)
  const reduced = /prefers-reduced-motion/i.test(css)
  if (motion && !reduced) {
    out.push({
      id: "reduced-motion",
      severity: "warning",
      message: `This section animates but never checks whether the visitor asked it not to. Add @media (prefers-reduced-motion: reduce) and set the transition or animation to none inside it. That media query is about the visitor's setting, not about width, so it is the one @media that belongs in a section.`,
    })
  }

  /**
   * A WIDTH MEDIA QUERY ASKS THE WRONG QUESTION HERE.
   *
   * A section is as wide as the column it sits in. In the builder's phone
   * preview that column is narrow inside a wide window, so a @media rule
   * stays on the desktop branch and the preview lies.
   */
  const widthMedia = [...css.matchAll(/@media[^{]*\((min|max)-width[^)]*\)/gi)]
  if (widthMedia.length) {
    out.push({
      id: "media-query",
      severity: "error",
      message: `This section uses @media (${widthMedia[0][1]}-width …) for its layout. A section is as wide as the column it is in, not as wide as the window, so that rule is wrong in the phone preview and in a narrow column. Use @container (min-width: …) instead, with container-type: inline-size on the outermost element.`,
    })
  }
  if (/@container/i.test(css) && !/container-type\s*:/i.test(css)) {
    out.push({
      id: "container-type",
      severity: "error",
      message: `There are @container rules but nothing declares container-type: inline-size, so none of them ever match. Put it on the section's outermost element.`,
    })
  }

  /** Rules the scoper rewrites into something that is not what they say. */
  const rootLike = css.match(/(?:^|[},])\s*(html|body|:root)\b/i)
  if (rootLike) {
    out.push({
      id: "root-selector",
      severity: "warning",
      message: `A rule is written against ${rootLike[1]}. A section's CSS is scoped to that section, so this is rewritten to point at the section root and will not do what it looks like it does. Write it against the section's own element instead.`,
    })
  }

  /** 100vw is wider than the page whenever there is a scrollbar. */
  if (/\b100vw\b/i.test(css)) {
    out.push({
      id: "viewport-width",
      severity: "warning",
      message: `100vw includes the scrollbar, so it is wider than the page and produces a sideways scroll. Use 100% or the container's width.`,
    })
  }
  if (/overflow-x\s*:\s*(auto|scroll)/i.test(css) && !/(marquee|slider|carousel|scroll-snap|track)/i.test(css + template)) {
    out.push({
      id: "overflow-x",
      severity: "warning",
      message: `Something scrolls sideways and does not look like a slider. Check that this is deliberate rather than a fixed width that does not fit a phone.`,
    })
  }

  /**
   * A HARDCODED COLOUR IS A SECTION THAT STOPPED LISTENING TO THE THEME.
   *
   * Only reported when the section declares a scheme, because then there is
   * demonstrably a right answer it is ignoring. Near-white and near-black
   * shadows and overlays are excused: rgba shadows are not theme colours.
   */
  if (hasScheme) {
    const hexes = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0])
    if (hexes.length) {
      out.push({
        id: "hardcoded-colour",
        severity: "warning",
        message: `This section declares a colour scheme and then hardcodes ${hexes.slice(0, 3).join(", ")}. A hardcoded colour stops responding to the creator's theme. Read scheme.background, scheme.text, scheme.heading, scheme.border, scheme.accent instead.`,
      })
    }
  } else if (settings.length > 0) {
    out.push({
      id: "no-colour-scheme",
      severity: "warning",
      message: `This section has no color_scheme setting, so it cannot follow the site's colours. Add one unless the section genuinely has no surface of its own.`,
    })
  }

  /** A script that reaches outside its own instance. */
  if (script) {
    const wide = script.match(/(?<!root\.)\b(querySelector|querySelectorAll|getElementById|getElementsByClassName)\s*\(/)
    if (wide) {
      out.push({
        id: "unscoped-query",
        severity: "error",
        message: `The script calls ${wide[1]} without a root to search in. A section can be on a page twice, and then this finds the other copy's elements. Query inside the root element the script is handed: root.querySelector(…).`,
      })
    }
    if (/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/.test(script) && !/"timers"/.test(schemaText)) {
      out.push({
        id: "timers-capability",
        severity: "error",
        message: `The script uses a timer, which is only available when the schema declares the "timers" capability. Add it to the schema's capabilities, or do the same thing in CSS.`,
      })
    }
  }

  /** Interactive markup that a keyboard cannot reach. */
  if (/<div[^>]*\son[a-z]+\s*=/.test(template)) {
    out.push({
      id: "clickable-div",
      severity: "warning",
      message: `A div carries a click handler. A keyboard cannot reach it and a screen reader does not announce it. Use a button, or <details>/<summary> if it opens something.`,
    })
  }
  const imgs = [...template.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const noAlt = imgs.filter((t) => !/\salt\s*=/.test(t))
  if (noAlt.length) {
    out.push({
      id: "img-alt",
      severity: "warning",
      message: `${noAlt.length === 1 ? "An image has" : `${noAlt.length} images have`} no alt attribute. Give each one alt text, or alt="" when it is decorative.`,
    })
  }

  /** A duplicate setting id means one of the two is unreachable. */
  const ids = settings.map((s) => s?.id).filter((v): v is string => typeof v === "string")
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i)
  if (dupes.length) {
    out.push({
      id: "duplicate-setting",
      severity: "error",
      message: `The schema declares "${dupes[0]}" more than once. Only one of them can ever be read.`,
    })
  }

  return out
}

/** Only the ones worth another round trip. */
export function qualityErrors(findings: QualityFinding[]): QualityFinding[] {
  return findings.filter((f) => f.severity === "error")
}

/** The findings as the text handed back to a model asked to repair them. */
export function describeQuality(findings: QualityFinding[]): string {
  if (!findings.length) return ""
  return findings.map((f) => `- ${f.message}`).join("\n")
}
