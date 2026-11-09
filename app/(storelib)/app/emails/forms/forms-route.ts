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
 *
 * WAVE 7, BACK GOES UP, NEVER ROUND. The owner: "forms → website contact
 * form → back → forms → back doesn't take me back to the whole Contacts".
 * Every back arrow inside Forms used to PUSH the screen above it, so the
 * history grew forms, inbox, forms, and the Forms back arrow then went
 * back into the inbox. Now each screen has one parent (formsParent):
 *
 *   a message            → the website contact form (its inbox)
 *   the inbox            → Forms
 *   an older site form   → Forms
 *   a form, on any tab   → Forms
 *   Forms                → Contacts (People)
 *
 * and going up is a history back when the entry behind is that parent
 * (this page pushed it, and marked it: FORMS_PREV), otherwise the parent
 * replaces this entry (a link, a reload, a notification). So the browser's
 * own back walks the same way and nothing loops.
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

export const FORMS_HOME: FormsRoute = { form: null, view: "edit", response: null, message: null, inbox: false, siteform: null }

/** Where Forms sits, and the People list above it. */
export const FORMS_PATH = "/app/contacts/forms"
export const CONTACTS_PATH = "/app/contacts"

/** The key this page writes into history.state on a push: the search of the entry it pushed from. */
export const FORMS_PREV = "__formsPrev"

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

/** The address of a route, as `?…` or "" for the Forms list. The one spelling, so two routes compare as strings. */
export function searchOf(r: FormsRoute): string {
  const q = new URLSearchParams()
  if (r.message) q.set("message", r.message)
  else if (r.inbox) q.set("inbox", "1")
  else if (r.siteform) q.set("siteform", r.siteform)
  else if (r.form) {
    q.set("form", r.form)
    if (r.view !== "edit") q.set("view", r.view)
    if (r.view === "responses" && r.response) q.set("response", r.response)
  }
  const s = q.toString()
  return s ? `?${s}` : ""
}

/** The screen a route is (the list, a form on any tab, the inbox, a message, a site form). */
export function screenOf(r: FormsRoute): string {
  return r.message ? `m:${r.message}` : r.inbox ? "inbox" : r.siteform ? `s:${r.siteform}` : r.form ? `f:${r.form}` : "list"
}

/** One screen up. "contacts" is the People list, a page of its own. */
export function formsParent(r: FormsRoute): FormsRoute | "contacts" {
  if (r.message) return { ...FORMS_HOME, inbox: true }
  if (r.inbox || r.siteform || r.form) return FORMS_HOME
  return "contacts"
}

/** The whole address one screen up, for a link's href. */
export function formsParentHref(r: FormsRoute): string {
  const up = formsParent(r)
  return up === "contacts" ? CONTACTS_PATH : FORMS_PATH + searchOf(up)
}

/**
 * How to go up: `back` when the entry behind this one is the parent's
 * screen (this page pushed from it and said so in history.state), else
 * `replace` this entry with the parent. A screen reached by a link has
 * nothing of ours behind it, and a push there is what made the loop.
 */
export function upMove(behind: string | null | undefined, parent: FormsRoute): "back" | "replace" {
  if (typeof behind !== "string") return "replace"
  return screenOf(routeOf(behind)) === screenOf(parent) ? "back" : "replace"
}

/**
 * The parent of any Contacts address, for the back arrows and for the tests:
 * a person goes to the People list (as it was last shown, `listQuery`), a
 * Forms screen to the one above it, Forms to People. Null for People itself.
 */
export function contactsParentHref(pathname: string, search: string, listQuery: string = ""): string | null {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === CONTACTS_PATH) return null
  if (path === FORMS_PATH) return formsParentHref(routeOf(search))
  if (path.startsWith(CONTACTS_PATH + "/")) {
    const q = listQuery.replace(/^\?/, "")
    return q ? `${CONTACTS_PATH}?${q}` : CONTACTS_PATH
  }
  return null
}
