/**
 * ===========================================================================
 *  THE UNSUBSCRIBE REQUEST AND THE SMALL PAGE THAT ANSWERS IT
 * ===========================================================================
 * app/api/notify/unsubscribe/route.ts reads a request with readRequest and
 * answers a person with page(). Three shapes arrive:
 *
 *   one_click   RFC 8058. A mail client posts the form body
 *               "List-Unsubscribe=One-Click" to the address in the
 *               List-Unsubscribe header, token in the query string. It can
 *               only ever unsubscribe, and wants a 200, not a page.
 *   json        the settings or a script: {token, action}.
 *   form        the button on the page itself, token and action as form
 *               fields, so the page works with no JavaScript at all.
 *
 * The page says which emails were turned off, gives one button to turn
 * them back on, and links to every setting. It never shows an address: the
 * token has none, and whoever holds the link sees only a category.
 *
 * Pure (no server imports), for tests/notify-unsubscribe.test.ts.
 */
import { unsubscribeCard, type CardButton, type CardTone } from "@/lib/unsubscribe-card"

export type UnsubscribeAction = "unsubscribe" | "resubscribe"

export interface UnsubscribeRequest {
  mode: "one_click" | "json" | "form"
  token: string | null
  action: UnsubscribeAction
}

function actionFrom(value: unknown): UnsubscribeAction {
  return value === "resubscribe" ? "resubscribe" : "unsubscribe"
}

export async function readRequest(request: Request): Promise<UnsubscribeRequest> {
  const fromQuery = new URL(request.url).searchParams.get("token")
  const type = request.headers.get("content-type") || ""
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    return { mode: "json", token: typeof body?.token === "string" ? body.token : fromQuery, action: actionFrom(body?.action) }
  }
  const form = new URLSearchParams(await request.text().catch(() => ""))
  /* A one-click request can only ever unsubscribe, whatever else it carries. */
  if (form.get("List-Unsubscribe") === "One-Click") return { mode: "one_click", token: fromQuery ?? form.get("token"), action: "unsubscribe" }
  return { mode: "form", token: form.get("token") ?? fromQuery, action: actionFrom(form.get("action")) }
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type PageState =
  | { kind: "confirm"; emails: string; token: string; preferencesUrl: string }
  | { kind: "off"; emails: string; token: string; preferencesUrl: string }
  | { kind: "on"; emails: string; token: string; preferencesUrl: string }
  | { kind: "invalid"; preferencesUrl: string }
  | { kind: "error"; preferencesUrl: string }
  | { kind: "limited"; preferencesUrl: string }

/** The words for each state: a heading, a line, and the button if there is one. */
export function pageWords(state: PageState): { title: string; body: string; button?: { label: string; action: UnsubscribeAction } } {
  switch (state.kind) {
    case "confirm":
      return {
        title: `Turn off ${state.emails}?`,
        body: `You can turn them back on any time. Security and payment notices are still sent.`,
        button: { label: "Turn them off", action: "unsubscribe" },
      }
    case "off":
      return {
        title: `${sentence(state.emails)} are off`,
        body: `You will not get ${state.emails} any more. Security and payment notices are still sent.`,
        button: { label: "Turn them back on", action: "resubscribe" },
      }
    case "on":
      return {
        title: `${sentence(state.emails)} are back on`,
        body: `You will get ${state.emails} by email again.`,
        button: { label: "Turn them off", action: "unsubscribe" },
      }
    case "invalid":
      return { title: "This link does not work", body: "It may have been copied only in part. You can change every email from your settings." }
    case "limited":
      return { title: "Too many tries just now", body: "Wait a few minutes and open the link again." }
    case "error":
      return { title: "That did not save", body: "Nothing was changed. Open the link again in a moment, or change it in your settings." }
  }
}

/** The whole page: the shared card (lib/unsubscribe-card.ts) with the Storelib mark on top. */
export function page(state: PageState): string {
  const words = pageWords(state)
  const tone: CardTone = state.kind === "confirm" ? "asked" : state.kind === "off" || state.kind === "on" ? "done" : "problem"
  const buttons: CardButton[] =
    words.button && (state.kind === "confirm" || state.kind === "off" || state.kind === "on")
      ? [
          {
            label: words.button.label,
            action: "/api/notify/unsubscribe",
            fields: { token: state.token, action: words.button.action },
            /* The question's answer is the page's one real action; undoing it afterwards is quieter. */
            look: state.kind === "confirm" ? "primary" : "secondary",
          },
        ]
      : []
  return unsubscribeCard({
    title: words.title,
    sender: { kind: "storelib" },
    tone,
    heading: words.title,
    body: words.body,
    buttons,
    link: { href: state.preferencesUrl, label: "All notification settings" },
  })
}
