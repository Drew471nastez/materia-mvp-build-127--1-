/**
 * The tools a OnePage's signups can be sent to, by name: what the browser
 * needs to draw their rows (components/onepage/page-integrations). No key,
 * no request and no node module here; ./providers builds the requests on
 * the server.
 */

export const PAGE_INTEGRATIONS = ["mailchimp", "kit", "beehiiv", "zapier", "make", "sheets", "webhook"] as const
export type PageIntegration = (typeof PAGE_INTEGRATIONS)[number]
export type WebhookIntegration = "zapier" | "make" | "sheets" | "webhook"

export function isPageIntegration(v: unknown): v is PageIntegration {
  return typeof v === "string" && (PAGE_INTEGRATIONS as readonly string[]).includes(v)
}
export function isWebhookIntegration(p: PageIntegration): p is WebhookIntegration {
  return p === "zapier" || p === "make" || p === "sheets" || p === "webhook"
}

/* i18n-ignore-start: names of services. */
export const PAGE_INTEGRATION_NAME: Record<PageIntegration, string> = {
  mailchimp: "Mailchimp",
  kit: "Kit",
  beehiiv: "beehiiv",
  zapier: "Zapier",
  make: "Make",
  sheets: "Google Sheets",
  webhook: "Webhook",
}
/* i18n-ignore-end */

/** Where the key or address is found, for the connect sheet's one line of help. */
export const PAGE_INTEGRATION_DOCS: Record<PageIntegration, string> = {
  mailchimp: "https://mailchimp.com/help/about-api-keys/",
  kit: "https://help.kit.com/en/articles/9902901-kit-api-overview",
  beehiiv: "https://developers.beehiiv.com/welcome/create-an-api-key",
  zapier: "https://help.zapier.com/hc/en-us/articles/8496288690317",
  make: "https://www.make.com/en/help/tools/webhooks",
  sheets: "https://developers.google.com/apps-script/guides/web",
  webhook: "https://storelib.com/developers",
}

