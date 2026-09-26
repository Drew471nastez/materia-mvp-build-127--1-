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

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
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
        title: `Stop ${state.emails} by email?`,
        body: `You can turn them back on any time in your settings. Security and payment notices are still sent.`,
        button: { label: "Turn them off", action: "unsubscribe" },
      }
    case "off":
      return {
        title: `${sentence(state.emails)} are off`,
        body: `You will not get ${state.emails} by email any more. Security and payment notices are still sent.`,
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

export function page(state: PageState): string {
  const words = pageWords(state)
  const form =
    words.button && (state.kind === "confirm" || state.kind === "off" || state.kind === "on")
      ? `<form method="post" action="/api/notify/unsubscribe">
      <input type="hidden" name="token" value="${escape(state.token)}">
      <input type="hidden" name="action" value="${words.button.action}">
      <button type="submit">${escape(words.button.label)}</button>
    </form>`
      : ""
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escape(words.title)} | Storelib</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
    background: #f8f9fa; color: #1a1a2e; font: 15px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { width: 100%; max-width: 420px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 28px 24px;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04); }
  .brand { font-size: 13px; font-weight: 600; color: #6b7280; letter-spacing: 0.01em; margin-bottom: 20px; }
  h1 { font-size: 20px; line-height: 1.3; font-weight: 600; }
  p { margin-top: 8px; color: #4b5563; font-size: 14px; }
  form { margin-top: 20px; }
  button { height: 44px; width: 100%; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; color: #1a1a2e;
    font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; box-shadow: 0 1px 0 rgba(16, 24, 40, 0.06); }
  button:hover { background: #f9fafb; }
  button:focus-visible, a:focus-visible { outline: 2px solid #1a1a2e; outline-offset: 2px; }
  a { display: inline-block; margin-top: 16px; color: #4b5563; font-size: 14px; text-underline-offset: 3px; }
  a:hover { color: #1a1a2e; }
</style>
</head>
<body>
<main>
  <p class="brand">Storelib</p>
  <h1>${escape(words.title)}</h1>
  <p>${escape(words.body)}</p>
  ${form}
  <a href="${escape(state.preferencesUrl)}">All notification settings</a>
</main>
</body>
</html>`
}
