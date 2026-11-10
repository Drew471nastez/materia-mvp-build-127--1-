/**
 * ===========================================================================
 *  ASKING FOR A SECTION TO BE WRITTEN, RATHER THAN A PAGE TO BE CHANGED
 * ===========================================================================
 * The page assistant works in operations: add this section, set that setting,
 * put a block here. Every one of those names something that already exists.
 * Writing a NEW section type is a different act — it produces a FILE, and a
 * file either compiles or it does not — so it is not a tool inside that loop.
 * It is this: one request, one file, checked before it is kept.
 *
 * THE MODEL IS NEVER TRUSTED WITH THE RESULT. What comes back is compiled by
 * the same compiler the code editor saves through, and a file that does not
 * compile is not stored. It gets up to three attempts, with the errors
 * quoted back at it.
 *
 * ---------------------------------------------------------------------------
 *  ACCURACY OVER SPEED: FIVE STEPS, NOT ONE
 * ---------------------------------------------------------------------------
 * One call that wrote the whole file at once was fast and came back plain:
 * asked for a portrait, a flag and a shimmer, it wrote a picture and a
 * paragraph. So a section is now written the way a person would write one
 * (./creative-section.ts holds the words for each step):
 *
 *   1. PLAN       what the picture shows, and every element the creator
 *                 named, one a line, and the section's name. The chat says
 *                 "New section: <name>" from here on.
 *   2. WRITE      the whole file, from the plan.
 *   3. CHECK      compiled, held to the strict gate, and drawn with its own
 *                 preset and this site's theme, so a template that compiles
 *                 and throws on a real value is caught here. Up to three
 *                 attempts, the compiler's words sent back each time.
 *   4. REVIEW     the file read against the request and the picture, element
 *                 by element: OK, or one corrected file.
 *   5. REFINE     that corrected file through the same check. It replaces
 *                 the first only when it passes; otherwise the first stands.
 *                 A file that passed is never lost to a review.
 *
 * THE PICTURE GOES WITH EVERY CALL. It is on the first user turn, and every
 * call resends the whole conversation, so the plan, each write and the
 * review all look at it (tests/ask-images-u.test.ts reads every request a
 * mock provider receives).
 */
import { describeAccountMemory } from "@/lib/ai-memory/store"
import { nativeThemeFromShopifySchemes } from "@/lib/storelib-theme/compat/native-schemes"
import { INTEGRATION_CONTRACT } from "@/lib/storelib-ai/integration"
import {
  MAX_REPAIR_ATTEMPTS,
  knowledgeBlock,
  validateSection,
  writeSectionRules,
} from "@/lib/storelib-ai"
import { themeBrief, type ThemeBriefInput } from "./theme-brief"
import { writerReference } from "@/lib/storelib-ai/reference"
import type { AgentProvider, ProviderRequest } from "@/lib/sites/agent/types"
import { describeImages, type AgentImage } from "@/lib/sites/agent/attachments"
import type { ThemeError } from "@/lib/storelib-theme/types"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { failureKind } from "@/lib/sites/agent/plain-errors"
import { instanceFromSchema } from "@/lib/website-builder/ai-placement"
import { checkSectionSource } from "./compile-feedback"
import { designContractBlock, surfaceRules } from "@/lib/storelib-ai/surfaces"
import {
  CREATIVE_RULES,
  DESIGN_CRAFT,
  IMAGE_FIDELITY_RULES,
  emptyImageSlots,
  newSectionSubject,
  planForChat,
  planRequest,
  readPlan,
  readReview,
  reviewRequest,
  writeRequest,
  type SectionPlan,
} from "./creative-section"

/**
 * A provider that was only busy, or a connection that dropped, gets one more
 * try after a short wait, and that try is not counted against the three a
 * file gets for compiling: the model never answered, so it never failed.
 */
export const BUSY_RETRY_MS = 1_500

/**
 * How long a review needs to be worth starting. Past the run's deadline less
 * this, the file that already passed is kept as it is: a review cut off by
 * the platform would lose the whole section.
 */
export const REVIEW_RESERVE_MS = 90_000

async function waitOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true },
    )
  })
}

/**
 * What the model is told about the format and about taste, and shown of it:
 * the framework, a checklist and three of Storelib's own sections
 * (lib/storelib-ai/reference.ts), and what a section can draw beyond text
 * and a picture (./creative-section.ts).
 *
 * STABLE, EVERY WORD OF IT, because it is the cached prefix on both
 * providers and the same on every website. The names already taken on this
 * website used to end it, which made the prefix one per website; they go in
 * the turn now (takenNote), with everything else about THIS site
 * (describeThemeForAuthoring).
 */
export function writeSectionSystem(): string {
  return [
    "You write one Storelib section and nothing else.",
    writeSectionRules(),
    /* Round O: the design rules every Storelib AI carries (lib/storelib-ai/surfaces.ts). Stable, like the rest of the prefix. */
    surfaceRules("section_writer"),
    INTEGRATION_CONTRACT,
    "PADDING AND SPACING ARE SETTINGS (a range, in px), not fixed numbers in the CSS.",
    CREATIVE_RULES,
    DESIGN_CRAFT,
    IMAGE_FIDELITY_RULES,
    writerReference(),
    [
      "You work in three steps, each asked for in turn: PLAN, then WRITE, then CHECK. When the file is asked for:",
      "Answer with the file ONLY. No markdown fence, no explanation, no preamble.",
      "The first characters of your answer are `{#` or `<template>`.",
    ].join("\n"),
    [
      "THE ONE EXCEPTION. If the message is not a description of a section to build (a greeting, a question, a request",
      "to change something already on the page, or too vague to design from), do not write a file. Answer with `REPLY:`",
      "followed by one to three plain sentences: answer the question, or say what you need to know, with one example of",
      "a request that would work (\"A pricing section with three plans and a monthly or yearly switch\").",
    ].join("\n"),
  ].join("\n\n")
}

/**
 * The types and names this website already has, which the new section may
 * not take. Per website, so it is part of the request, not the prefix.
 */
export function takenNote(existingNames: string[], existingTypes: string[]): string {
  return [
    existingTypes.length ? `Types already taken, pick a different one: ${existingTypes.join(", ")}` : "",
    existingNames.length ? `Names already taken, pick a different one: ${existingNames.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** What the writer is doing, for a panel that wants to say so while it waits. */
export type WriteStage = "thinking" | "checking" | "fixing"

/**
 * THE STEPS, as the chat draws them: the same line shapes the page
 * assistant streams (lib/website-builder/agent/loop.ts, ThemeAgentEvent), so
 * one reader (lib/website-builder/ask-activity.ts) draws both.
 *
 *   subject   what the run is about: "New section: Hero with flag"
 *   plan      the elements it will build, one a line
 *   step      one piece of work, running then done or failed
 */
export type WriteEvent =
  | { type: "subject"; text: string }
  | { type: "plan"; text: string }
  | { type: "step"; id: string; label: string; state: "running" | "done" | "failed" }

/** A cut-off answer is a file that stops mid-way; asking for the same again gets the same again. */
const TOO_LONG =
  "Your answer was cut off at the length limit before the file ended, so it cannot compile. Send the whole file again, complete and shorter: the same design, with less CSS, fewer settings and no comments."

/** Strip a fence if the model added one anyway, which they do. */
export function unfence(text: string): string {
  const t = text.trim()
  const fenced = t.match(/^```(?:[a-z]*)\n([\s\S]*?)\n```$/i)
  return (fenced ? fenced[1] : t).trim()
}

export interface WrittenSection {
  /** `sections/<type>.storelib` */
  path: string
  type: string
  name: string
  source: string
  /** The plan it was written from, when there was one. */
  plan?: SectionPlan
  /** What the self check did: passed it, replaced it with a refined file, or did not run. */
  reviewed?: "ok" | "refined" | "kept" | "skipped"
  /** Picture settings it leaves for the creator to fill, which the chat offers to upload. */
  imageSlots?: { setting: string; label: string }[]
}

export type WriteResult =
  | { ok: true; value: WrittenSection }
  /**
   * `reply` is set when the model answered rather than wrote: the message was
   * a question, or too unclear to build. It is a conversation, not a failure,
   * and the panel shows it as one.
   */
  | { ok: false; error: string; errors?: ThemeError[]; source?: string; reply?: string }

/** The whole gate a file passes before it is kept, written once for the write and the refine. */
type Gate =
  /* `notes`: what the drawn section still shows (a picture with no size, a colour hard to read): handed to the review. */
  | { ok: true; type: string; name: string; path: string; slots: { setting: string; label: string }[]; notes: string[] }
  | { ok: false; feedback: string; final: { error: string; errors?: ThemeError[] } }

/** Round AH: what the writer is told when the website runs a theme imported from Shopify. */
export const IMPORTED_THEME_NOTE =
  "IMPORTED THEME\nThis website runs a theme imported from Shopify, and your section is drawn inside it by Storelib. Write no <script>: it does not run there. Keep any motion in CSS (transitions, keyframes, :hover). The theme's own font and text colour are inherited, so set colours through the colour scheme and the settings, never a page background of your own."

/**
 * ===========================================================================
 *  THE IMPORTED THEME ITSELF, FOR THE WRITER (round AK)
 * ===========================================================================
 * The owner: a section the AI wrote into an imported theme "doesn't know the
 * theme it's coding into: the colour schemes don't work, the layout isn't
 * consistent, the typography". The writer was told only that the theme was
 * imported. Now it is told the theme itself, from its own settings: each
 * colour scheme by the id the sidebar's Colour scheme field saves, with its
 * colours; the heading and body fonts; the page width, the spacing between
 * sections and the button corners. The section is drawn with those schemes
 * (lib/storelib-theme/compat/theme.ts nativeThemeFromShopifySchemes) and the
 * theme's fonts and width (nativeBlendVars), so a section written to them
 * matches the page around it and repaints when another scheme is picked.
 * Pure.
 */
export function importedThemeNote(settings?: Record<string, unknown> | null): string {
  const s = settings ?? {}
  const native = nativeThemeFromShopifySchemes(s.color_schemes) as { color_schemes?: Record<string, Record<string, string>>; default_color_scheme?: string }
  const schemes = Object.entries(native.color_schemes ?? {}).slice(0, 10)
  const num = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = s[k]
      const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN
      if (Number.isFinite(n)) return n
    }
    return null
  }
  const font = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = s[k]
      if (typeof v === "string" && v.trim()) return v.replace(/_[nib]\d+$/i, "").replace(/[_-]+/g, " ").trim()
    }
    return null
  }
  const heading = font("type_header_font", "type_heading_font", "type_font_heading", "heading_font")
  const body = font("type_body_font", "type_font_body", "body_font")
  const width = num("page_width", "max_page_width")
  const spacing = num("spacing_sections", "section_spacing")
  const radius = num("buttons_radius", "button_border_radius", "button_radius")
  const lines = [IMPORTED_THEME_NOTE]
  if (schemes.length) {
    lines.push(
      "THE THEME'S COLOUR SCHEMES (the Colour scheme field in the sidebar saves one of these ids):",
      ...schemes.map(([id, c]) => `- ${id}: background ${c.background ?? "unset"}, text ${c.text ?? "unset"}, headings ${c.heading ?? c.text ?? "unset"}, button ${c.primary_button_background ?? "unset"} with ${c.primary_button_text ?? "unset"} text`),
      `Give the section a setting {"type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "${native.default_color_scheme ?? schemes[0][0]}"} and paint ONLY from the scheme's variables on the section root (var(--scheme-background), var(--scheme-text), var(--scheme-heading), var(--scheme-accent), var(--scheme-border), var(--scheme-button-primary), var(--scheme-button-primary-text), var(--scheme-button-secondary), var(--scheme-button-secondary-text)): choosing another scheme in the sidebar then repaints the whole section, as the theme's own sections do. No colour of your own except as a color setting that defaults to a scheme colour.`,
    )
  }
  lines.push(
    `TYPE: headings in var(--theme-font-heading)${heading ? ` (the theme's ${heading})` : ""}, everything else in var(--theme-font-body)${body ? ` (${body})` : ""}. Never name a font family. Sizes follow the theme's scale: a section title is the size of the theme's own section titles, not a hero's.`,
    `LAYOUT: the content sits in a centred wrapper, max-width: var(--theme-page-width)${width ? ` (${width}px)` : ""}, with the theme's side padding, like the theme's own sections. Top and bottom padding are range settings (padding_top, padding_bottom)${spacing !== null ? `, default ${Math.max(24, Math.min(96, Math.round(spacing || 36)))}px` : ", default 36px"}, so the section sits in the page's rhythm.`,
    radius !== null ? `BUTTONS: corners of ${radius}px, the theme's.` : "",
  )
  return lines.filter(Boolean).join("\n")
}

function gate(text: string, opts: { takenTypes: string[]; takenNames: string[]; theme?: ThemeBriefInput; importedTheme?: boolean }): Gate {
  /**
   * The type comes from the file's own schema, and the file name follows it
   * rather than the other way round: the compiler insists the two agree, so
   * deriving the name from anything else only invents a disagreement.
   */
  const declared = text.match(/"type"\s*:\s*"([a-z0-9_-]+)"/)
  if (!declared) {
    return {
      ok: false,
      feedback: 'The schema needs a "type", lower case, letters, digits and underscores. Send the whole file again.',
      final: { error: "The assistant could not produce a section that compiles." },
    }
  }
  const type = declared[1]
  const path = `sections/${type}.storelib`
  if (opts.importedTheme && /^\s*<script[\s>]/m.test(text)) {
    return {
      ok: false,
      feedback: "This website runs an imported theme, where a section's <script> does not run. Leave the <script> block out, keep any motion in CSS, and send the whole file again.",
      final: { error: "The assistant could not produce a section that works in this theme." },
    }
  }
  if (opts.takenTypes.includes(type)) {
    return {
      ok: false,
      feedback: `"${type}" is already a section here. Pick another type and send the whole file again.`,
      final: { error: "The assistant could not produce a section that compiles." },
    }
  }
  /**
   * ONE GATE: it compiles AND it would be correct on a real page. The
   * quality half is what stops a section that compiles perfectly and then
   * breaks the moment somebody adds it twice, or animates at somebody who
   * asked for no animation. See lib/storelib-ai/quality.ts.
   */
  const checked = validateSection(text, { path, expectType: type, strict: true })
  if (checked.ok === false) {
    return {
      ok: false,
      feedback: checked.feedback,
      final:
        checked.reason === "compile"
          ? { error: "The section did not compile.", errors: checked.errors }
          : { error: "The section compiled but would not be correct on a real page." },
    }
  }
  const name = checked.name
  if (opts.takenNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return {
      ok: false,
      feedback: `Another section is already called "${name}". Give this one a different name and send the whole file again.`,
      final: { error: `Another section is already called "${name}".` },
    }
  }
  /**
   * AND IT DRAWS. Rendered once with its own preset and this site's theme,
   * the way it will arrive on the page: a template that compiles and then
   * throws on its own default values is caught here, not on the canvas.
   */
  const compiled = compileSection(text, { file: path, expectType: type })
  if (compiled.ok === false) {
    return { ok: false, feedback: "That did not compile. Send the whole file again.", final: { error: "The section did not compile.", errors: compiled.errors } }
  }
  const schema = compiled.value.schema as unknown as Parameters<typeof instanceFromSchema>[2] & Parameters<typeof emptyImageSlots>[0]
  const drawn = checkSectionSource({
    path,
    type,
    source: text,
    instances: [instanceFromSchema(`${type}-check`, type, schema)],
    theme: (opts.theme?.settings ?? {}) as Record<string, unknown>,
    strict: false,
    lenient: true,
  })
  if (drawn.ok === false) {
    return { ok: false, feedback: drawn.feedback, final: { error: "The section did not compile.", errors: drawn.errors } }
  }
  /* Worth saying in the review, never a refusal: the drawn section's notes, and the advice the strict gate passed with. */
  const worth = new Set(["advice-rich-heading", "advice-rich-body", "reduced-motion", "img-alt", "advice-colour-settings", "integration-responsive", "integration-button-hover"])
  const notes = [
    ...((drawn as { notes?: { message: string }[] }).notes ?? []).map((n) => n.message),
    ...((checked as { findings?: { id: string; severity: string; message: string }[] }).findings ?? []).filter((f) => f.severity === "warning" && worth.has(f.id)).map((f) => f.message),
  ].slice(0, 6)
  return { ok: true, type, name, path, slots: emptyImageSlots(schema), notes }
}

/**
 * One request, up to three attempts at the file, one answer. `taken` is every
 * type and name already in this install, so the model is told what it may
 * not call the section and the result is checked against the same list
 * rather than trusted.
 */
export async function writeSection(opts: {
  provider: AgentProvider
  model: string
  prompt: string
  /**
   * A picture of the section they want, if they attached one. It rides on
   * the first turn, which every call resends: the plan, the write and the
   * review all see it.
   */
  images?: AgentImage[]
  takenTypes: string[]
  takenNames: string[]
  /**
   * The site this section is being written FOR (./theme-brief.ts, read once per theme version): its colour schemes, type, tokens, own sections,
   * buttons and what it is already built out of.
   */
  theme?: ThemeBriefInput
  signal?: AbortSignal
  /** How hard it thinks: medium for every Ask Storelib run (lib/website-builder/ask-engines.ts, EFFORT). */
  effort?: ProviderRequest["effort"]
  /** Groups this website's requests for the provider's prompt cache. */
  cacheKey?: string
  /** Plan first (default). Off only where a caller wants the bare write loop. */
  plan?: boolean
  /** Review and refine once after the file passes (default). */
  review?: boolean
  /** When the caller's own deadline is, in epoch milliseconds: a review is not started too close to it. */
  deadlineAt?: number
  /** Told each time the work moves on, so a waiting panel can say what is happening. */
  onStage?: (stage: WriteStage, attempt: number) => void
  /** The steps, in the page assistant's line shapes. */
  onEvent?: (event: WriteEvent) => void
  /** What the creator asked Storelib AI to remember on every website (lib/ai-memory/store.ts). */
  accountMemory?: string[]
  /** AI Memory as one block, this website's notes and the everywhere ones (lib/ai-memory/store.ts describeMemory). Used instead of `accountMemory` when given. */
  memoryText?: string
  /** Round AH: the website runs a theme imported from Shopify, which draws a Storelib section without its script. */
  importedTheme?: boolean
  /**
   * Round O: the section is for an EXISTING site (Code a section, Ask for a change): its DESIGN.md when it has one
   * (lib/storelib-ai/design-contract-server.ts), null when it has none. Either way the writer keeps the site's brand
   * tokens unless asked (spec I.5). Left out by the classic job's coder, which writes a new site to its own plan.
   */
  designContract?: { path: string; text: string } | null
}): Promise<WriteResult> {
  const system = writeSectionSystem()
  const images = opts.images ?? []
  const hasImages = images.length > 0
  const asked = opts.prompt.trim()
  const emit = (event: WriteEvent) => opts.onEvent?.(event)
  const step = (id: string, label: string, state: "running" | "done" | "failed") => emit({ type: "step", id, label, state })

  /**
   * The instruction about the picture goes BEFORE the request, so what they
   * typed is read in the light of the image rather than the other way round.
   * With no words at all it carries the whole request on its own.
   */
  const opening = [
    /**
     * The site FIRST, because it is the frame the request is read in. A model
     * told afterwards what the colours are has already chosen them.
     */
    opts.theme ? themeBrief({ ...opts.theme, for: "writer" }).text : "",
    opts.importedTheme ? importedThemeNote(opts.theme?.settings as Record<string, unknown> | null | undefined) : "",
    opts.designContract !== undefined ? designContractBlock(opts.designContract, { editing: true }) : "",
    opts.memoryText !== undefined ? opts.memoryText : describeAccountMemory(opts.accountMemory ?? []),
    describeImages(images, asked.length > 0, {
      ask: "answer REPLY: with one short question",
      content: "the site described above and the creator's own business",
    }),
    knowledgeBlock(asked),
    takenNote(opts.takenNames, opts.takenTypes),
    asked && `REQUEST\n${asked}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const call = async (turns: ProviderRequest["turns"], maxOutputTokens: number) => {
    const request: ProviderRequest = {
      model: opts.model,
      system,
      /* A copy: the provider holds what it was sent, and this list grows after. */
      turns: [...turns],
      tools: [],
      maxOutputTokens,
      signal: opts.signal,
      ...(opts.effort ? { effort: opts.effort } : {}),
      ...(opts.cacheKey ? { cacheKey: opts.cacheKey } : {}),
    }
    return opts.provider.complete(request).catch(async (thrown: unknown) => {
      const kind = failureKind(thrown)
      if (kind !== "busy" && kind !== "network") throw thrown
      await waitOrAbort(BUSY_RETRY_MS, opts.signal)
      return opts.provider.complete(request)
    })
  }
  const failed = (e: unknown): WriteResult => {
    /* Plain already: the provider is wrapped where it is chosen (lib/sites/agent/plain-errors, plainFailures). */
    if (e instanceof Error && e.name === "AbortError") return { ok: false, error: "Writing that section took too long." }
    return { ok: false, error: e instanceof Error ? e.message : "The assistant could not be reached." }
  }

  emit({ type: "subject", text: newSectionSubject("") })

  /* ── 1. THE PLAN ──────────────────────────────────────────────────── */
  let plan: SectionPlan | null = null
  const turns: ProviderRequest["turns"] = []
  if (opts.plan !== false) {
    const planLabel = hasImages ? "Reading your picture and planning" : "Planning the section"
    opts.onStage?.("thinking", 0)
    step("plan", planLabel, "running")
    const first = { role: "user" as const, content: `${opening}\n\n${planRequest(hasImages)}`, images: hasImages ? images : undefined }
    let text: string
    try {
      const turn = await call([first], 3_000)
      if (turn.stop === "refusal") return { ok: false, error: "The assistant declined to write that." }
      text = (turn.text ?? "").trim()
    } catch (e) {
      step("plan", planLabel, "failed")
      return failed(e)
    }
    const reply = text.match(/^REPLY:\s*([\s\S]+)$/)
    if (reply) {
      step("plan", planLabel, "done")
      const said = reply[1].trim().slice(0, 600)
      return { ok: false, error: said, reply: said }
    }
    plan = readPlan(text)
    step("plan", planLabel, "done")
    if (plan.name) emit({ type: "subject", text: newSectionSubject(plan.name) })
    const forChat = planForChat(plan)
    if (forChat) emit({ type: "plan", text: forChat })
    turns.push(first, { role: "assistant", content: text, toolCalls: [] }, { role: "user", content: writeRequest() })
  } else {
    turns.push({ role: "user", content: opening, images: hasImages ? images : undefined })
  }

  /* ── 2 and 3. WRITE, AND CHECK ────────────────────────────────────── */
  const named = () => (plan?.name ? plan.name : "the section")
  let kept: { text: string; gate: Extract<Gate, { ok: true }> } | null = null
  let lastFailure: { error: string; errors?: ThemeError[]; source?: string } = { error: "The assistant could not produce a section that compiles." }

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    const last = attempt === MAX_REPAIR_ATTEMPTS - 1
    const writeId = `write-${attempt}`
    const writeLabel = attempt === 0 ? `Writing ${named()}` : `Fixing ${named()}`
    opts.onStage?.(attempt === 0 ? "thinking" : "fixing", attempt)
    step(writeId, writeLabel, "running")
    let text: string
    let cutOff = false
    try {
      /**
       * ROOM FOR A WHOLE FILE. At 8000 a long section was cut off mid-way,
       * so it ended inside its <schema> and "never closed" came back from
       * the compiler on every attempt.
       */
      const turn = await call(turns, 16_000)
      if (turn.stop === "refusal") return { ok: false, error: "The assistant declined to write that." }
      text = unfence(turn.text ?? "")
      cutOff = turn.stop === "length"
    } catch (e) {
      step(writeId, writeLabel, "failed")
      return failed(e)
    }

    if (!text) {
      step(writeId, writeLabel, "failed")
      return { ok: false, error: "The assistant sent nothing back." }
    }

    /* An answer instead of a file: the message was not something to build. */
    const reply = text.match(/^REPLY:\s*([\s\S]+)$/)
    if (reply) {
      step(writeId, writeLabel, "done")
      const said = reply[1].trim().slice(0, 600)
      return { ok: false, error: said, reply: said }
    }
    step(writeId, writeLabel, "done")

    opts.onStage?.("checking", attempt)
    const checkId = `check-${attempt}`
    step(checkId, "Checking it compiles and draws", "running")

    if (cutOff) {
      step(checkId, "Checking it compiles and draws", "failed")
      lastFailure = { error: "The section was too long to finish.", source: text }
      if (last) return { ok: false, ...lastFailure }
      turns.push({ role: "assistant", content: text, toolCalls: [] })
      turns.push({ role: "user", content: TOO_LONG })
      continue
    }

    const passed = gate(text, opts)
    if (passed.ok === false) {
      step(checkId, "Checking it compiles and draws", "failed")
      lastFailure = { ...passed.final, source: text }
      if (last) return { ok: false, ...lastFailure }
      turns.push({ role: "assistant", content: text, toolCalls: [] })
      turns.push({ role: "user", content: passed.feedback })
      continue
    }
    step(checkId, "Checking it compiles and draws", "done")
    kept = { text, gate: passed }
    turns.push({ role: "assistant", content: text, toolCalls: [] })
    break
  }

  if (!kept) return { ok: false, ...lastFailure }
  if (!plan?.name) emit({ type: "subject", text: newSectionSubject(kept.gate.name) })

  /* ── 4 and 5. REVIEW, AND REFINE ONCE ─────────────────────────────── */
  let reviewed: WrittenSection["reviewed"] = "skipped"
  const room = opts.deadlineAt === undefined || Date.now() < opts.deadlineAt - REVIEW_RESERVE_MS
  if (opts.review !== false && room && !opts.signal?.aborted) {
    const reviewLabel = hasImages ? "Comparing it with your picture" : "Checking every part you asked for"
    step("review", reviewLabel, "running")
    turns.push({ role: "user", content: reviewRequest(plan, hasImages, kept.gate.notes) })
    try {
      const turn = await call(turns, 16_000)
      const answer = turn.stop === "length" || turn.stop === "refusal" ? ({ kind: "unclear" } as const) : readReview(unfence(turn.text ?? ""))
      if (answer.kind === "ok") {
        reviewed = "ok"
        step("review", reviewLabel, "done")
      } else if (answer.kind === "file") {
        step("review", reviewLabel, "done")
        const refineLabel = `Refining ${kept.gate.name}`
        step("refine", refineLabel, "running")
        /* The type and name the first file took are this file's own now: it may keep them. */
        const own = {
          ...opts,
          takenTypes: opts.takenTypes.filter((t) => t !== kept!.gate.type),
          takenNames: opts.takenNames.filter((n) => n.toLowerCase() !== kept!.gate.name.toLowerCase()),
        }
        const refined = gate(answer.source, own)
        if (refined.ok && !opts.takenTypes.includes(refined.type)) {
          kept = { text: answer.source, gate: refined }
          reviewed = "refined"
          step("refine", refineLabel, "done")
        } else {
          /* The first file passed and stands: a review never costs the creator a working section. */
          reviewed = "kept"
          step("refine", refineLabel, "failed")
        }
      } else {
        reviewed = "kept"
        step("review", reviewLabel, "done")
      }
    } catch {
      /* Out of time, or the provider failed on the review: the file that passed is what they get. */
      reviewed = "kept"
      step("review", reviewLabel, "failed")
    }
  }

  return {
    ok: true,
    value: {
      path: kept.gate.path,
      type: kept.gate.type,
      name: kept.gate.name,
      source: kept.text,
      ...(plan ? { plan } : {}),
      reviewed,
      imageSlots: kept.gate.slots,
    },
  }
}
