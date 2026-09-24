/**
 * ===========================================================================
 *  SKILLS: WHAT AN AGENT NEEDS TO KNOW FOR THE TASK IN FRONT OF IT
 * ===========================================================================
 * The rules (lib/agent-rules) are how to work, the same on every task. A
 * skill is how to do ONE kind of task well: the steps, the tools to use, the
 * part of the framework it touches, what goes wrong, and the checks that say
 * it is done.
 *
 * Handing a model every skill on every request is thousands of tokens of
 * mostly irrelevant detail, and a model given everything weighs everything.
 * So `selectSkills` picks the few a request is about, and only those go in:
 *
 *   - over MCP, `storelib_skills` with the task in the agent's own words
 *     (lib/agent-access/mcp.ts), and the chosen skills' checks are what
 *     `storelib_run_tests` runs;
 *   - in the builder, Storelib AI's turn carries `skillContext(prompt)` in
 *     place of the bare reference topics (lib/website-builder/agent/loop.ts).
 *
 * THE FRAMEWORK FACTS ARE NOT REPEATED HERE. A skill names the knowledge
 * topics it needs by id and they are composed from lib/storelib-ai/knowledge,
 * which imports the control, filter and capability lists from the compiler.
 * Two accounts of the same format drift; one cannot.
 *
 * Pure and dependency-light, so the browser, the MCP route and the tests can
 * all import it.
 */

import { topicsById } from "@/lib/storelib-ai/knowledge"

/** Checks storelib_run_tests knows how to run. See lib/agent-access/checks.ts. */
export type CheckId = "compile" | "quality" | "page-types" | "page-settings" | "contrast" | "limits"

export interface Skill {
  id: string
  title: string
  /** One line: what the task is. Shown in the list. */
  summary: string
  /** Words that mean a request is this task. Scored, not just matched. */
  triggers: RegExp[]
  steps: string[]
  /** MCP tools, in the order they are used. */
  tools: string[]
  /** lib/storelib-ai/knowledge topic ids, composed in, not copied. */
  topics: string[]
  /** What goes wrong, and what to do instead. */
  pitfalls: string[]
  /** What storelib_run_tests checks for this task. */
  checks: CheckId[]
  /** Where a worked example lives, for a model that wants one. */
  examples?: string[]
}

export const SKILLS: Skill[] = [
  {
    id: "build-section",
    title: "Build a new section",
    summary: "Write a section type that does not exist yet, from a description or a screenshot.",
    triggers: [/\b(new|create|build|make|add|write|design)\b.{0,40}\bsection/i, /screenshot|mock ?up|figma|copy (this|the) (page|design)|from (an? )?image/i],
    steps: [
      "storelib_search_components for the job. If a section already does it, use that and stop here.",
      "Read one close built-in section with storelib_read_file and keep its setting ids for the same jobs.",
      "Write the file: every visible word, picture, link and button a setting or block, a color_scheme setting, container queries, a preset that arrives filled.",
      "storelib_compile until clean, then storelib_create_section with the page to put it on.",
      "storelib_run_tests on the file and the page, then storelib_run_preview.",
    ],
    tools: ["storelib_search_components", "storelib_read_file", "storelib_compile", "storelib_create_section", "storelib_run_tests", "storelib_run_preview"],
    topics: ["blocks", "color-scheme", "responsive", "editor-state", "multi-instance"],
    pitfalls: [
      "A whole page written as one section. Split it: header, hero, features, footer, each its own file.",
      "Text or links typed into the markup. The creator cannot change them.",
      "A schema name that is already another section's name. The save refuses it.",
    ],
    checks: ["compile", "quality", "page-types"],
    examples: ["sections/faq.storelib", "https://storelib.com/developers/examples"],
  },
  {
    id: "edit-section",
    title: "Change a section file",
    summary: "Change how a section the creator already has is built: its markup, CSS, script or schema.",
    triggers: [/\b(change|edit|fix|update|modify|tweak|adjust)\b.{0,40}\b(section|markup|template|file|code|css)/i, /\bbug\b|broken|doesn'?t work|not working/i],
    steps: [
      "storelib_read_selected_section, or storelib_read_page, to find the instance and its type.",
      "storelib_read_file for the type and keep its updated_at.",
      "If it is built in, it cannot be written. Copy it under a new type with the same setting ids, place it with storelib_create_section, and hide the old instance with a set_section_visibility patch.",
      "Change only the lines the task needs. storelib_compile, then storelib_edit_section with base_updated_at.",
      "storelib_run_tests on the file.",
    ],
    tools: ["storelib_read_selected_section", "storelib_read_file", "storelib_compile", "storelib_edit_section", "storelib_run_tests"],
    topics: ["css-scoping", "settings-resolution"],
    pitfalls: [
      "Rewriting the whole file to change one thing. Every unrelated line changed is a regression waiting.",
      "Removing or renaming a setting id. The creator's content under it disappears from the page.",
      "Saving without base_updated_at. A newer save by the creator could be overwritten; the tool refuses a stale one when it is sent.",
    ],
    checks: ["compile", "quality"],
  },
  {
    id: "restyle",
    title: "Colours, schemes and buttons",
    summary: "Change how sections look using the settings they already have: colour scheme, button colours and hover, backgrounds.",
    triggers: [/colou?r|scheme|background|dark mode|light|palette|brand|contrast|button|hover|cta/i],
    steps: [
      "storelib_read_selected_section to see the section's settings and which scheme it uses.",
      "Prefer switching the section's color_scheme to a scheme the site has (storelib_read_project lists them) over per-section colours.",
      "For one section's own colours, storelib_update_styles with the setting ids the section declares. Leave a hover colour empty to let it follow the fill.",
      "For the whole site, storelib_update_styles with scope theme.",
      "storelib_run_tests on the page: contrast must be at least 4.5:1.",
    ],
    tools: ["storelib_read_selected_section", "storelib_read_project", "storelib_update_styles", "storelib_run_tests"],
    topics: ["color-scheme"],
    pitfalls: [
      "A hex value where a scheme would do. It stops following the creator's theme.",
      "A hover drawn with opacity. Hover has its own keys and follows the fill when left empty.",
      "Light text on a light scheme. The contrast check fails it.",
    ],
    checks: ["page-settings", "contrast"],
  },
  {
    id: "typography",
    title: "Type and text styling",
    summary: "Fonts, sizes, weights and text styles, for the site or one section.",
    triggers: [/font|typograph|type ?scale|heading size|text size|weight|letter ?spacing|uppercase|line height/i],
    steps: [
      "Site wide: storelib_update_styles with scope theme on the font and type scale settings.",
      "One section: only the type settings the section declares. A section never names a font family.",
      "storelib_run_preview at phone width: each size has its own phone value.",
    ],
    tools: ["storelib_read_project", "storelib_update_styles", "storelib_run_preview"],
    topics: ["typography"],
    pitfalls: ["A font-family in a section's CSS. It breaks the theme's type for that section only."],
    checks: ["page-settings"],
  },
  {
    id: "layout",
    title: "Layout, spacing and phones",
    summary: "Spacing, alignment, columns, borders and how a section behaves at phone, tablet and desktop width.",
    triggers: [/mobile|phone|tablet|responsive|breakpoint|stack|column|spacing|padding|margin|align|center|border|overflow|sideways scroll|width|gap/i],
    steps: [
      "Spacing and alignment the section declares (padding_top, padding_bottom, alignment) are settings: storelib_update_styles.",
      "Behaviour that is not a setting is the file: container queries, phone layout first.",
      "storelib_run_preview and look at 375px and 1280px.",
    ],
    tools: ["storelib_read_selected_section", "storelib_update_styles", "storelib_edit_section", "storelib_run_preview"],
    topics: ["responsive", "settings-resolution"],
    pitfalls: ["@media for width. Use @container.", "100vh. Use var(--sl-vh) so the builder and the live site agree."],
    checks: ["quality", "page-settings"],
  },
  {
    id: "compose-page",
    title: "Pages and page structure",
    summary: "Create a page, add sections to it, reorder, hide or rename them.",
    triggers: [/\bpage\b|about us|contact page|landing|reorder|move .* (up|down|above|below)|hide|show|arrange/i],
    steps: [
      "storelib_read_project for the pages that exist, storelib_search_components for sections to use.",
      "storelib_create_page with its sections from the library, or a patch of add_section, move_section and set_section_visibility operations.",
      "storelib_run_tests on the page.",
    ],
    tools: ["storelib_read_project", "storelib_search_components", "storelib_create_page", "storelib_create_safe_patch", "storelib_run_tests"],
    topics: [],
    pitfalls: ["Removing a section the creator filled in. Hide it instead unless they asked for it gone.", "A section above the header or below the footer. The operations keep them in place."],
    checks: ["page-types", "page-settings", "limits"],
  },
  {
    id: "repeated-content",
    title: "Lists, cards, FAQs and menus",
    summary: "Anything repeated: FAQ entries, cards, testimonials, logos, pricing tiers, menu links.",
    triggers: [/block|faq|question|testimonial|review|logo|tier|pricing|card|list|menu|nav|link|slide|gallery|item|entry/i],
    steps: [
      "Content in an existing section: add_block, update_block and move_block operations in a patch.",
      "A new section: declare a block type and loop over blocks, with data-block-id on each.",
    ],
    tools: ["storelib_read_selected_section", "storelib_create_safe_patch", "storelib_edit_section"],
    topics: ["blocks"],
    pitfalls: ["question_1, question_2 settings. Use blocks.", "More blocks than the section's limit. The page check refuses it."],
    checks: ["page-settings", "limits"],
  },
  {
    id: "forms",
    title: "Email sign up and forms",
    summary: "Collect emails or contact messages for the creator.",
    triggers: [/form|e-?mail|sign ?up|subscri|newsletter|waitlist|contact|input|notify/i],
    steps: ["Use the contact or newsletter section if there is one. A new one uses data-storelib-form=\"subscribe\" with no script and no action."],
    tools: ["storelib_search_components", "storelib_create_section"],
    topics: ["forms", "accessibility"],
    pitfalls: ["Asking the creator for a form URL or API key. The platform collects the submissions."],
    checks: ["compile", "quality"],
  },
  {
    id: "media",
    title: "Images and video",
    summary: "Pictures, video and embeds.",
    triggers: [/image|picture|photo|video|youtube|vimeo|embed|iframe|media|gallery/i],
    steps: ["Pictures are image_picker settings through | asset; video is the embed filter with the embed capability."],
    tools: ["storelib_read_selected_section", "storelib_update_styles", "storelib_edit_section"],
    topics: ["assets", "embed"],
    pitfalls: ["An image URL in a default. The creator picks pictures.", "An iframe whose src is not from | embed. The save refuses it."],
    checks: ["compile", "quality"],
  },
  {
    id: "interaction",
    title: "Menus, sheets, sliders and motion",
    summary: "Anything that opens, moves or responds: dropdowns, phone menus, tabs, carousels, entrance motion.",
    triggers: [/anim|motion|transition|slider|carousel|tab|accordion|modal|popup|dropdown|sheet|menu|toggle|scroll|hover effect/i],
    steps: ["HTML first: details, popover, radio :checked, scroll-snap. Script only for what they cannot do, inside root."],
    tools: ["storelib_read_file", "storelib_compile", "storelib_edit_section", "storelib_run_preview"],
    topics: ["script", "animation", "accessibility"],
    pitfalls: ["document.querySelector. Refused by name; query inside root.", "Motion that ignores prefers-reduced-motion."],
    checks: ["compile", "quality"],
  },
  {
    id: "selling",
    title: "Products and checkout",
    summary: "Show the creator's products and send buyers to checkout.",
    triggers: [/product|price|shop|store|buy|cart|checkout|sell|collection|sold out/i],
    steps: ["storelib_read_project lists the published products. Use the product list or product sections; link cards to the product URL or /checkout?productId=<id>&src=website."],
    tools: ["storelib_read_project", "storelib_search_components", "storelib_create_section"],
    topics: ["blocks"],
    pitfalls: ["A made-up product or price.", "A payment form or payment script. Checkout takes the payment."],
    checks: ["compile", "quality", "page-types"],
    examples: ["https://storelib.com/developers/selling"],
  },
  {
    id: "accessibility",
    title: "Accessibility",
    summary: "Keyboard, screen readers, labels, alt text and contrast.",
    triggers: [/accessib|a11y|screen reader|aria|keyboard|focus|alt text|contrast|label/i],
    steps: ["Buttons and links for anything clickable, alt on every image, labels on inputs, aria-expanded on anything that opens, contrast of at least 4.5:1."],
    tools: ["storelib_read_file", "storelib_run_tests"],
    topics: ["accessibility"],
    pitfalls: ["A div with a click handler."],
    checks: ["quality", "contrast"],
  },
  {
    id: "debug",
    title: "Fix a compile error or a failing check",
    summary: "A save was refused, or a check failed.",
    triggers: [/error|refused|did not compile|doesn'?t compile|failed|failing|line \d+|undeclared|not declared/i],
    steps: [
      "Read the message: it names the file and line. Open that line with storelib_read_file.",
      "Change that line only. storelib_compile. Repeat.",
      "After three rounds on the same message, stop and report it with the line.",
    ],
    tools: ["storelib_read_file", "storelib_compile", "storelib_run_tests"],
    topics: ["settings-resolution"],
    pitfalls: ["Rewriting the file to make an error go away. It brings new ones."],
    checks: ["compile", "quality"],
  },
]

/** A skill every request gets when nothing more specific matched. */
const FALLBACK = ["build-section"]

/**
 * The skills a request is about, best first.
 *
 * Scored by how many of a skill's triggers the request hits, so "make the
 * FAQ buttons darker on phones" ranks restyle and layout above everything
 * that merely mentions a list. Ties keep declaration order, which puts the
 * broad authoring skills before the narrow ones.
 */
export function selectSkills(request: string, opts: { limit?: number } = {}): Skill[] {
  const limit = opts.limit ?? 3
  const text = request.slice(0, 4_000)
  const scored = SKILLS.map((skill, order) => ({
    skill,
    order,
    score: skill.triggers.reduce((n, t) => n + (t.test(text) ? 1 : 0), 0),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.skill)
  if (scored.length) return scored
  return SKILLS.filter((s) => FALLBACK.includes(s.id))
}

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id)
}

/** The checks the chosen skills ask for, each once. */
export function checksFor(skills: Skill[]): CheckId[] {
  return [...new Set(skills.flatMap((s) => s.checks))]
}

/** One skill as the agent reads it, with its framework topics composed in. */
export function skillText(skill: Skill, opts: { withTopics?: boolean } = {}): string {
  const parts = [
    `## ${skill.title} (${skill.id})`,
    skill.summary,
    `Steps:\n${skill.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `Tools: ${skill.tools.join(", ")}`,
    `Watch for:\n${skill.pitfalls.map((p) => `- ${p}`).join("\n")}`,
    `Done when storelib_run_tests passes: ${skill.checks.join(", ")}`,
  ]
  if (skill.examples?.length) parts.push(`Examples: ${skill.examples.join(", ")}`)
  if (opts.withTopics !== false && skill.topics.length) parts.push(topicsById(skill.topics))
  return parts.join("\n\n")
}

/** The list, one line each, for an agent choosing for itself. */
export function skillIndex(): string {
  return SKILLS.map((s) => `${s.id}: ${s.summary}`).join("\n")
}

/** What an MCP agent is handed for a request: the chosen skills, whole. */
export function skillsForRequest(request: string, opts: { limit?: number } = {}): string {
  const chosen = selectSkills(request, opts)
  const topics = [...new Set(chosen.flatMap((s) => s.topics))]
  return [
    `Skills for this task: ${chosen.map((s) => s.id).join(", ")}. Run storelib_run_tests with checks ${checksFor(chosen).join(", ")} before saying it is done.`,
    ...chosen.map((s) => skillText(s, { withTopics: false })),
    topics.length ? `STORELIB REFERENCE for this task:\n\n${topicsById(topics)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * What Storelib AI's turn carries: the chosen skills' steps and pitfalls in
 * a few lines each, and the framework topics once. It replaces the bare
 * topic list the turn carried before, and is still per request, so the
 * cached system prompt is untouched.
 */
export function skillContext(request: string, opts: { limit?: number } = {}): string {
  const chosen = selectSkills(request, opts)
  const topics = [...new Set(chosen.flatMap((s) => s.topics))].slice(0, 5)
  const lines = chosen.map((s) => `${s.title}: ${s.pitfalls.join(" ")}`)
  return [
    `TASK NOTES:\n${lines.join("\n")}`,
    topics.length ? `STORELIB REFERENCE, for what you are about to do:\n\n${topicsById(topics)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}
