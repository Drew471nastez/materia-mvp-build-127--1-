/**
 * ===========================================================================
 *  A PUBLISHED FORM INSIDE A .storelib SECTION
 * ===========================================================================
 * A section's markup is one string, so it cannot hold the live form (its
 * questions, its booking times, its consent, its answers sent to Leads). A
 * section that shows one leaves a mark where it goes:
 *
 *   <div data-storelib-native-form="{{ settings.form.id }}"
 *        data-presentation="inline" data-title="Book a call"></div>
 *
 * and the page draws Storelib's own form there
 * (components/website-builder/sections/form-islands.tsx, the same
 * NativeFormBlock a native form section draws), which loads the published
 * definition from /api/forms/<id>/public and sends answers to
 * /api/forms/<id>/submit, where ownership, rate limits, spam checks and the
 * answers are all decided on the server from the form row. The section's own
 * script never sees an answer.
 *
 * `settings.form.id` is only ever one of the creator's published forms
 * (lib/storelib-theme/resolve.ts formRef); a mark holding anything that is
 * not a form id draws nothing. Pure, so the rule has a test.
 */
export const NATIVE_FORM_ATTR = "data-storelib-native-form"

export type IslandPresentation = "inline" | "card" | "expandable" | "modal"

export interface FormIslandSpec {
  formId: string
  presentation: IslandPresentation
  /** The button's words for expandable and modal. */
  title: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRESENTATIONS: readonly IslandPresentation[] = ["inline", "card", "expandable", "modal"]

/** One mark, read off its attributes; null when it names no form. */
export function formIslandOf(attr: (name: string) => string | null): FormIslandSpec | null {
  const formId = (attr(NATIVE_FORM_ATTR) ?? "").trim().toLowerCase()
  if (!UUID_RE.test(formId)) return null
  const p = (attr("data-presentation") ?? "").trim().toLowerCase() as IslandPresentation
  const title = (attr("data-title") ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
  return { formId, presentation: PRESENTATIONS.includes(p) ? p : "inline", title: title || "Open form" }
}
