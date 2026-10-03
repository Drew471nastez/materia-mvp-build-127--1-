/**
 * ===========================================================================
 *  A TOOL CALL, SAID THE WAY A PERSON WOULD SAY IT
 * ===========================================================================
 * "read_section" is not a step anybody asked for. "Reading the Hero section"
 * is the same step described to the person waiting on it, and "Writing
 * pricing.storelib" says which file is being touched. Every label the chat
 * shows for a tool call comes from here, so there is one place that decides
 * the words and one test that holds them (tests/ask-section-edit.test.ts):
 * no label is ever a raw tool name, and an unknown tool still reads as
 * plain words rather than as `snake_case`.
 *
 * Named against the page as it stands WHEN THE CALL IS MADE, so a section
 * about to be removed can still be called by its name.
 *
 * Pure: no schema import of its own. The caller passes how a section and a
 * section type are named, so the same words come out in a test.
 */

export interface StepNames {
  /** The name the sidebar shows for a section on this page, or null when there is no such id. */
  section(id: string): string | null
  /** The name of a KIND of section, e.g. "Pricing table" for "pricing". */
  type(type: string): string
}

/** A section type is only ever letters, digits, `_` and `-`; anything else is not a file name. */
const TYPE = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** "pricing.storelib", the file a type lives in, or "the section's code" for a type that cannot be a file. */
export function fileLabel(type: unknown): string {
  return typeof type === "string" && TYPE.test(type.trim()) ? `${type.trim()}.storelib` : "the section's code"
}

/** "the Hero section", without doubling a name that already ends in "section". */
export function sectionPhrase(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim()
  if (!clean) return "a section"
  return /\bsection$/i.test(clean) ? `the ${clean}` : `the ${clean} section`
}

function parse(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson || "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    /* A call whose arguments will not parse still gets words. */
    return {}
  }
}

/**
 * The words for one tool call. `attempt` is how many times a write to this
 * file has already been refused in this run: the second try is "Fixing",
 * not "Writing" again, so the list says what is actually happening.
 */
export function toolStepLabel(name: string, argumentsJson: string, names: StepNames, opts: { attempt?: number } = {}): string {
  const args = parse(argumentsJson)
  const section = (id: unknown) => {
    const found = typeof id === "string" ? names.section(id) : null
    return found ? sectionPhrase(found) : "a section"
  }
  const kind = (type: unknown) => (typeof type === "string" && type.trim() ? sectionPhrase(names.type(type.trim())) : "a section")
  const retry = (opts.attempt ?? 0) > 0

  switch (name) {
    case "read_section": return `Reading ${section(args.id)}`
    case "read_section_type": return `Looking at what ${kind(args.sectionType)} can do`
    case "read_section_code": return `Reading ${fileLabel(args.sectionType)}`
    case "write_section_code": return retry ? `Fixing ${fileLabel(args.sectionType)}` : `Writing ${fileLabel(args.sectionType)}`
    case "edit_section_code": return retry ? `Fixing ${fileLabel(args.sectionType)}` : `Editing ${fileLabel(args.sectionType)}`
    case "copy_section_to_code": return `Making an editable copy of ${section(args.id)}`
    case "ask_creator": return "Asking you a question"
    case "read_store": return "Reading your products"
    case "add_section": return `Adding ${kind(args.sectionType)}`
    case "remove_section": return `Removing ${section(args.id)}`
    case "move_section": return `Moving ${section(args.id)}`
    case "rename_section": return `Renaming ${section(args.id)}`
    case "update_section": return `Changing ${section(args.id)}`
    case "set_section_visibility": return args.hidden === true ? `Hiding ${section(args.id)}` : `Showing ${section(args.id)}`
    case "add_block": return `Adding to ${section(args.sectionId)}`
    case "update_block": return `Editing ${section(args.sectionId)}`
    case "remove_block": return `Removing an item from ${section(args.sectionId)}`
    case "move_block": return `Reordering ${section(args.sectionId)}`
    case "update_theme": return "Changing the site's settings"
    case "read_menus": return "Reading the menus"
    case "edit_menu": return args.menu === "main-menu" || !args.menu ? "Changing the Main menu" : "Changing a menu"
    /* A tool added later and not named here still reads as words, never as snake_case. */
    default: return "Working on the page"
  }
}

/** The step a code write gets after it, while the compiler reads it. */
export const COMPILE_CHECK_LABEL = "Checking it compiles"
