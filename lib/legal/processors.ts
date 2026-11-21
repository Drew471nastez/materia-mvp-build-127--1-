/**
 * ===========================================================================
 *  WHO HANDLES PERSONAL DATA FOR STORELIB, AND WHERE THE CODE SAYS SO
 * ===========================================================================
 * The Privacy policy (components/legal/privacy-body) draws its list of
 * service providers and of the tools a creator can connect from here, never
 * from a list typed into the text. Each entry names the file that calls the
 * service, and tests/legal-documents.test.ts reads that file and checks the
 * service is really there, and that no service is named in the policy
 * without being in this list.
 *
 *   PROCESSORS       services Storelib itself uses to run Storelib
 *   creatorTools()   services a creator chooses to connect to their store;
 *                    the creator decides what goes there. The trackers, the
 *                    email platforms and the fulfilment partners are read
 *                    from the product's own tables, so a new integration is
 *                    in the policy the day it ships.
 *
 * Pure and client safe: the policy is also drawn in a OnePage's sheet.
 */
import { TRACKERS, TRACKER_ORDER } from "@/lib/store/tracking"
import { PAGE_INTEGRATIONS, PAGE_INTEGRATION_NAME } from "@/lib/onepage/integrations/catalog"
import { PROVIDERS } from "@/lib/physical/providers"

export interface Processor {
  /** The name the policy prints. */
  name: string
  /** What Storelib uses it for, in one plain sentence. */
  does: string
  /** What personal data reaches it. */
  data: string
  /** "always", or the condition under which Storelib uses it. */
  when: "always" | string
  /** A file that calls the service, read by the test. */
  source: string
  /** The word the test looks for in `source`, when it is not the name. */
  match?: string
}

export const PROCESSORS: readonly Processor[] = [
  {
    name: "Stripe",
    does: "Takes card and wallet payments, holds each creator's payout account, verifies creators' identity, bills Storelib plans and, where Storelib has turned it on, works out tax on memberships.",
    data: "Payment details, names, email addresses, billing and delivery addresses, the device and network a payment came from, and for creators identity and bank details.",
    when: "always",
    source: "lib/payments/stripe/account-attempts.ts",
  },
  {
    name: "Supabase",
    does: "Hosts Storelib's database, sign in and file storage.",
    data: "Everything Storelib stores about an account, a store, an order or a subscriber.",
    when: "always",
    source: "lib/supabase/admin.ts",
  },
  {
    name: "Vercel",
    does: "Hosts storelib.com and the websites on it, connects custom domains, and, with your consent to analytics, measures traffic and page speed (Vercel Analytics).",
    data: "IP addresses and request details while a page is served; Vercel Analytics sets no cookie.",
    when: "always",
    source: "lib/custom-domains/vercel.ts",
  },
  {
    name: "Mailgun",
    does: "Sends Storelib's emails: receipts, sign in codes, notices, and the emails creators send their subscribers. Storelib uses Mailgun's EU region.",
    data: "Email addresses, names and the content of each email.",
    when: "always",
    source: "lib/mailgun.ts",
  },
  {
    name: "Google Firebase Cloud Messaging",
    does: "Delivers push notifications to the Storelib apps.",
    data: "A device token and the text of the notification.",
    when: "When you allow notifications in the app",
    source: "lib/firebase/admin.ts",
    match: "Firebase",
  },
  {
    name: "Your browser's push service",
    does: "Delivers browser notifications you turned on (for example Apple, Google or Mozilla, depending on your browser).",
    data: "A push address for your browser and the text of the notification.",
    when: "When you allow notifications in your browser",
    source: "lib/push/web-vapid.ts",
    match: "VAPID",
  },
  {
    name: "Anthropic",
    does: "Answers Storelib AI: building and editing websites, pages and text from what the creator asks.",
    data: "What the creator types or says to Storelib AI and the store content it needs to answer.",
    when: "When a creator uses Storelib AI",
    source: "lib/sites/agent/anthropic-provider.ts",
  },
  {
    name: "OpenAI",
    does: "Answers Storelib AI when the creator picks its model, makes pictures the creator asks for, and turns spoken requests in the website builder into text.",
    data: "What the creator types, says or asks for, and the store content needed to answer.",
    when: "When a creator uses Storelib AI",
    source: "lib/sites/agent/openai-provider.ts",
  },
  {
    name: "Google Gemini",
    does: "Translates the text of a creator's website into its other languages and makes pictures the creator asks for.",
    data: "The website's text and the creator's picture requests.",
    when: "When a creator's website has more than one language, or a creator asks for a picture",
    source: "lib/markets/open-translate.ts",
    match: "gemini",
  },
  {
    name: "Cloudflare, DeepL, Hugging Face and MyMemory",
    does: "Translate website text when the main translator is unavailable or has used its allowance.",
    data: "The website's text, never visitor or buyer data.",
    when: "As a fallback for website translation",
    source: "lib/markets/open-translate.ts",
    match: "mymemory",
  },
  {
    name: "Pexels",
    does: "Finds stock photos for Storelib AI to suggest.",
    data: "The search words only.",
    when: "When a creator uses Storelib AI",
    source: "lib/storelib-ai/images/providers.ts",
  },
  {
    name: "Google and Apple sign in",
    does: "Let you sign in with an existing Google or Apple account instead of a password.",
    data: "Your name, email address and profile picture, as the provider shares them.",
    when: "When you choose to sign in that way",
    source: "lib/auth/oauth-errors.ts",
    match: "apple",
  },
  {
    name: "AfterShip and 17TRACK",
    does: "Follow parcels with the carrier, so the buyer and the creator see where an order is.",
    data: "Tracking numbers, the carrier and the destination country.",
    when: "When an order that ships has a tracking number",
    source: "lib/physical/tracking/accounts-server.ts",
    match: "17TRACK",
  },
  {
    name: "Mux and Bunny Stream",
    does: "Store and play community and course videos, when Storelib switches one of them on; otherwise videos stay in Storelib's own storage.",
    data: "The video files a creator uploads.",
    when: "Only when Storelib switches one on",
    source: "lib/video/provider.ts",
    match: "bunny",
  },
]

export interface ToolGroup {
  /** What the tools are for, as the policy heads them. */
  title: string
  names: string[]
  /** What leaves Storelib when a creator connects one. */
  sends: string
}

/** Fulfilment partners a creator can connect (lib/physical/providers, "connect"). */
function fulfilmentNames(): string[] {
  return PROVIDERS.filter((p) => p.availability === "connect").map((p) => p.name)
}

/**
 * The tools a creator can connect to their store, by what they are for. The
 * creator chooses them and is responsible for them; Storelib sends what the
 * integration needs and nothing else.
 */
export function creatorTools(): ToolGroup[] {
  const pageTools = PAGE_INTEGRATIONS.map((id) => PAGE_INTEGRATION_NAME[id]).filter((n) => n !== "Webhook")
  return [
    {
      title: "Analytics and advertising on the creator's website",
      names: TRACKER_ORDER.map((id) => TRACKERS[id].name),
      sends: "Page views and, for most, each paid order (its value and items). In the EEA, the UK and Switzerland they wait for the visitor's consent; see Cookies below.",
    },
    {
      title: "Analytics the creator forwards from Storelib",
      names: ["Google Analytics", "Meta", "PostHog"],
      sends: "The visits, views, signups, purchases and refunds the creator chooses to send, as each visitor's consent allows.",
    },
    {
      title: "Email marketing and automation",
      names: [...new Set([...pageTools, "Brevo", "MailerLite", "Kit"])],
      sends: "The email address and name of people who sign up or buy, and for some, order events.",
    },
    {
      title: "Print on demand, fulfilment and shipping",
      names: fulfilmentNames(),
      sends: "Each paid order the creator sends them: the items, the buyer's name, delivery address and, where the carrier needs it, phone number.",
    },
    {
      title: "Bookings and calendars",
      names: ["Calendly", "Cal.com", "Google Calendar"],
      sends: "Booking times and the details the visitor gave when booking.",
    },
    {
      title: "Communities",
      names: ["Discord", "Telegram"],
      sends: "The member's Discord or Telegram account, so a paying member gets the role or the chat, and loses it when access ends.",
    },
    {
      title: "The creator's own systems",
      names: ["Webhooks", "GitHub"],
      sends: "What the creator configures: order, signup or form data to an address they own, or their website's files to their own repository.",
    },
  ]
}

/** Every service name the policy can print, for the test. */
export function namedServices(): string[] {
  return [...PROCESSORS.map((p) => p.name), "Airwallex", ...creatorTools().flatMap((g) => g.names)]
}
