/**
 * What the Contacts › Forms address opens (./forms-list.tsx), on its own so
 * the tests read it without the page:
 *
 *   ?form=<id>&view=edit|responses|insights|settings[&response=<id>]
 *   ?message=<id>     one message from the website contact form inbox
 *                     (the old /app/emails?tab=messages&message=<id>)
 *   ?inbox=1          that inbox
 *   ?siteform=<id>    a form from the older website builder
 *
 * Anything that is not an id is ignored, never passed on.
 */
export type FormView = "edit" | "responses" | "insights" | "settings"
export const FORM_VIEWS: FormView[] = ["edit", "responses", "insights", "settings"]

export interface FormsRoute {
  form: string | null
  view: FormView
  response: string | null
  message: string | null
  inbox: boolean
  siteform: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function routeOf(search: string): FormsRoute {
  const p = new URLSearchParams(search)
  const id = (k: string) => {
    const v = p.get(k)
    return v && UUID.test(v) ? v : null
  }
  const view = p.get("view") as FormView
  return { form: id("form"), view: FORM_VIEWS.includes(view) ? view : "edit", response: id("response"), message: id("message"), inbox: p.get("inbox") === "1", siteform: id("siteform") }
}
