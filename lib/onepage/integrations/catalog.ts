/**
 * The tools a OnePage's signups can be sent to, by name: what the browser
 * needs to draw their rows (components/onepage/page-integrations). No key,
 * no request and no node module here; ./providers builds the requests on
 * the server.
 *
 * Round 41: MailerLite, Brevo and Flodesk joined Mailchimp, Kit and
 * beehiiv. This order is the order every screen draws them in, from the
 * first paint: it never depends on what is connected.
 */

export const PAGE_INTEGRATIONS = ["mailchimp", "kit", "beehiiv", "mailerlite", "brevo", "flodesk", "zapier", "make", "sheets", "webhook"] as const
export type PageIntegration = (typeof PAGE_INTEGRATIONS)[number]
export type WebhookIntegration = "zapier" | "make" | "sheets" | "webhook"
/** The ones connected with an API key, and a list, form, group or segment to choose. */
export type KeyIntegration = Exclude<PageIntegration, WebhookIntegration>
export const KEY_INTEGRATIONS: readonly KeyIntegration[] = ["mailchimp", "kit", "beehiiv", "mailerlite", "brevo", "flodesk"]

export function isPageIntegration(v: unknown): v is PageIntegration {
  return typeof v === "string" && (PAGE_INTEGRATIONS as readonly string[]).includes(v)
}
export function isWebhookIntegration(p: PageIntegration): p is WebhookIntegration {
  return p === "zapier" || p === "make" || p === "sheets" || p === "webhook"
}
export function isKeyIntegration(p: PageIntegration): p is KeyIntegration {
  return !isWebhookIntegration(p)
}

/* i18n-ignore-start: names of services. */
export const PAGE_INTEGRATION_NAME: Record<PageIntegration, string> = {
  mailchimp: "Mailchimp",
  kit: "Kit",
  beehiiv: "beehiiv",
  mailerlite: "MailerLite",
  brevo: "Brevo",
  flodesk: "Flodesk",
  zapier: "Zapier",
  make: "Make",
  sheets: "Google Sheets",
  webhook: "Webhook",
}
/* i18n-ignore-end */

/** Where the key or address is found, for the setup sheet's link. */
export const PAGE_INTEGRATION_DOCS: Record<PageIntegration, string> = {
  mailchimp: "https://mailchimp.com/help/about-api-keys/",
  kit: "https://help.kit.com/en/articles/9902901-kit-api-overview",
  beehiiv: "https://developers.beehiiv.com/welcome/create-an-api-key",
  mailerlite: "https://www.mailerlite.com/help/where-to-find-the-mailerlite-api-key-groupid-and-documentation",
  brevo: "https://help.brevo.com/hc/en-us/articles/209467485",
  flodesk: "https://help.flodesk.com/en/articles/8128775-about-api-keys",
  zapier: "https://help.zapier.com/hc/en-us/articles/8496288690317",
  make: "https://www.make.com/en/help/tools/webhooks",
  sheets: "https://developers.google.com/apps-script/guides/web",
  webhook: "https://storelib.com/developers",
}

/** What a key integration calls the thing a signup is put on. */
export const PAGE_INTEGRATION_LIST: Record<KeyIntegration, "audience" | "form" | "publication" | "group" | "list" | "segment"> = {
  mailchimp: "audience",
  kit: "form",
  beehiiv: "publication",
  mailerlite: "group",
  brevo: "list",
  flodesk: "segment",
}

/** A list must be chosen before signups can go (the others can take a subscriber on the account alone). */
export function needsList(p: KeyIntegration): boolean {
  return p === "mailchimp" || p === "beehiiv" || p === "brevo"
}

/** The provider sends its own confirmation email first when asked to (Mailchimp pending, Flodesk double_optin). */
export function offersDoubleOptin(p: KeyIntegration): boolean {
  return p === "mailchimp" || p === "flodesk"
}
