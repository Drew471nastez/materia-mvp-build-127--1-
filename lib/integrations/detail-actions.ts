/**
 * ===========================================================================
 *  AN INTEGRATION'S PAGE: ITS ACTIONS AND ITS SETUP STEPS (round K4)
 * ===========================================================================
 * What the header of an integration's page offers, and what pressing it
 * really calls, kept here as data so the page
 * (components/app/settings/integration-detail.tsx) and its tests read the
 * same thing. Every call is one the integration's own panel already makes
 * (the same routes, the same bodies), so the header and the panel never
 * disagree about what Disconnect means. Nothing here needs the assistant.
 *
 * Pure: no I/O.
 */
import { CATEGORY_NAMES, type Integration } from "@/lib/integrations/catalog"
import { TRACKERS } from "@/lib/store/tracking"
import { providerInfo } from "@/lib/physical/providers"

export const MARKETING_SYNC_PATH = "/api/store/integrations/marketing"

/** One request the header sends, in order. */
export interface ActionCall {
  path: string
  method: "PUT" | "POST"
  body: Record<string, unknown>
}

/** What turning it on (from the header) or taking it off sends. */
export interface RemovalPlan {
  /** The words on the button and in the confirm. */
  verb: "disconnect" | "remove" | "turn_off"
  calls: ActionCall[]
  /** What happens, in one or two short sentences, for the confirm. */
  consequence: string
  /** The kept read to fetch again before the panel is drawn again (components/physical/ui readFresh). */
  refresh: string
}

/** The facts the page has about this store's connection. */
export interface ConnectionFacts {
  installed: boolean
  /** Klaviyo or Omnisend connected with a private key for subscribers and orders. */
  marketingConnected?: boolean
  /** The pixel or site ID saved for a tracker. */
  trackerSaved?: boolean
}

export const VERB_LABEL: Record<RemovalPlan["verb"], string> = { disconnect: "Disconnect", remove: "Remove", turn_off: "Turn off" }

/**
 * How this integration is taken off, or null when it can't be: a built in
 * one with nothing saved (Courier tracking), one not installed, or one with
 * nothing to install (Coming soon).
 */
export function removalPlan(item: Integration, facts: ConnectionFacts): RemovalPlan | null {
  if (!facts.installed && !facts.marketingConnected) return null
  if (item.kind === "app" && item.appId === "storelib_reviews") {
    return {
      verb: "turn_off",
      calls: [{ path: "/api/store/reviews-app", method: "PUT", body: { enabled: false } }],
      consequence: "Reviews stop showing on your website and buyers stop getting review emails. Every review you have is kept.",
      refresh: "/api/store/reviews-app",
    }
  }
  if (item.id === "aftership") {
    return {
      verb: "disconnect",
      calls: [{ path: "/api/store/tracking-app", method: "PUT", body: { remove: true } }],
      consequence: "Your parcels go back to Storelib's own tracking. Your AfterShip account keeps what it has.",
      refresh: "/api/store/tracking-app",
    }
  }
  if (item.kind === "app" && item.appId === "marketing_sync" && item.marketingProvider) {
    if (!facts.marketingConnected) return null
    return {
      verb: "disconnect",
      calls: [{ path: MARKETING_SYNC_PATH, method: "POST", body: { provider: item.marketingProvider, disconnect: true } }],
      consequence: `Nothing more is sent to ${item.name}, and the webhook Storelib added there is removed. What's already in your ${item.name} account stays there.`,
      refresh: MARKETING_SYNC_PATH,
    }
  }
  /* Mailchimp, Zapier and Make on the OnePage's signups: the same disconnect as the OnePage editor's sheet (app/api/onepage/integrations). */
  if (item.kind === "app" && item.appId === "onepage_signups" && item.pageIntegration) {
    return {
      verb: "disconnect",
      calls: [{ path: "/api/onepage/integrations", method: "POST", body: { provider: item.pageIntegration, disconnect: true } }],
      consequence: `Your OnePage's signups stop going to ${item.name}. What's already in ${item.name} stays there.`,
      refresh: "/api/onepage/integrations",
    }
  }
  if (item.kind === "app") return null
  if (item.kind === "tracker" && item.trackerId) {
    const calls: ActionCall[] = []
    if (facts.marketingConnected) calls.push({ path: MARKETING_SYNC_PATH, method: "POST", body: { provider: item.trackerId, disconnect: true } })
    if (facts.trackerSaved) calls.push({ path: "/api/store/integrations", method: "PUT", body: { id: item.trackerId, value: null } })
    if (calls.length === 0) return null
    const marketing = !!facts.marketingConnected
    return {
      verb: marketing ? "disconnect" : "remove",
      calls,
      consequence: marketing
        ? `Nothing more is sent to ${item.name}${facts.trackerSaved ? ` and its script leaves your website` : ""}. What's already in your ${item.name} account stays there.`
        : `${item.name} stops loading on your website from the next page view. You can add it again any time.`,
      refresh: marketing ? MARKETING_SYNC_PATH : "/api/store/integrations",
    }
  }
  if (item.kind === "commerce" && item.providerId) {
    return {
      verb: "disconnect",
      calls: [{ path: `/api/physical/integrations/${item.providerId}`, method: "PUT", body: { disconnect: true } }],
      consequence: item.builtIn
        ? "New orders stop going to your address. Orders already sent are not touched."
        : `New orders stop going to ${item.name} and your key is deleted from Storelib. Orders already sent stay in ${item.name}.`,
      refresh: "/api/physical/integrations",
    }
  }
  return null
}

/** Turning on from the header, where one press is the whole install (Storelib Reviews). Everything else installs in its own panel, with its key or ID. */
export function oneTapInstall(item: Integration): ActionCall | null {
  if (item.kind === "app" && item.appId === "storelib_reviews") return { path: "/api/store/reviews-app", method: "PUT", body: { enabled: true } }
  return null
}

/** The header's main word before it is installed. */
export function installVerb(item: Integration): "Turn on" | "Connect" | "Install" | null {
  if (oneTapInstall(item)) return "Turn on"
  if (item.kind === "listed" || item.comingSoon) return null
  if (item.kind === "tracker") return item.trackerId === "klaviyo" || item.trackerId === "omnisend" ? "Connect" : "Install"
  if (item.kind === "commerce") return item.builtIn ? "Install" : "Connect"
  if (item.id === "aftership" || item.appId === "marketing_sync" || item.appId === "onepage_signups") return "Connect"
  return null
}

/**
 * GUIDED SETUP. A few plain steps above the fields, so a store can connect
 * any of them on its own, with nothing to ask. Never more than four.
 */
export function setupSteps(item: Integration): string[] {
  if (item.kind === "listed" || item.comingSoon) return []
  if (item.kind === "app" && item.appId === "storelib_reviews") return ["Turn it on below.", "Choose when buyers get the email asking for a review.", "Reviews and stars show on your product pages."]
  if (item.id === "aftership") return ["In AfterShip, go to Settings › API keys and create a key.", "Paste it below, with the webhook secret for instant updates.", "Your parcels are followed with your AfterShip account from then on."]
  if (item.kind === "app" && item.appId === "marketing_sync") return [`Create an API key in ${item.name} and paste it below.`, item.marketingProvider === "kit" ? "Pick the tag your subscribers get." : item.marketingProvider === "mailerlite" ? "Pick the group your subscribers join." : "Pick the list your subscribers join.", "New subscribers go there within a minute. Unsubscribes come back."]
  if (item.kind === "app" && item.appId === "onepage_signups") {
    if (item.pageIntegration === "mailchimp") return ["In Mailchimp, create an API key (Profile, Extras, API keys) and paste it below.", "Pick the audience your signups join.", "Each signup on your OnePage goes there as it happens."]
    return [item.pageIntegration === "zapier" ? "In Zapier, start a Zap with Webhooks by Zapier, Catch Hook, and copy its address." : "In Make, add a Webhooks module, Custom webhook, and copy its address.", "Paste it below. A test event is sent to it.", "Each signup on your OnePage goes there as it happens."]
  }
  if (item.kind === "app") return []
  if (item.kind === "tracker" && item.trackerId) {
    const t = TRACKERS[item.trackerId]
    if (item.trackerId === "klaviyo" || item.trackerId === "omnisend")
      return [`Create a private API key in ${item.name} and paste it under Subscribers and orders.`, "Pick the list your subscribers join.", `Add your ${t.label} too if you want ${item.name}'s sign up forms on your website.`]
    return [`Find your ${t.label}: ${t.where.replace(/\.$/, "")}.`, "Paste it below and press Install.", `${item.name} loads on your website from the next page view.`]
  }
  if (item.kind === "commerce" && item.providerId) {
    const p = providerInfo(item.providerId)
    if (!p) return []
    if (p.fields.includes("url")) return ["Enter the https address of your system and a signing secret.", "Save, then send a test to check it answers.", "Every paid order is sent there from then on."]
    if (p.fields.includes("email")) return ["Enter your supplier's email address.", "Every paid order is emailed to them with the items and the address."]
    if (p.fields.includes("api_key")) {
      const what = p.id === "printful" ? "a private token" : p.id === "printify" ? "a personal access token" : p.fields.includes("api_secret") ? "an API key and secret" : "an API key"
      return [`In your ${item.name} account, create ${what}.`, `Paste it below and press Connect. Storelib checks it with ${item.name}.`, CATEGORY_NAMES[item.category] === "Shipping" ? "Labels and tracking work from the order page." : "Paid orders go there and tracking comes back."]
    }
  }
  return []
}
