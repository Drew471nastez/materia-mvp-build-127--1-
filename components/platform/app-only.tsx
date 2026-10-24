"use client"

/**
 * ===========================================================================
 *  STORELIB'S OWN PIECES ARE NOT PART OF A CREATOR'S WEBSITE
 * ===========================================================================
 * The root layout mounts the app shell for every route, published websites
 * included. Five of its pieces draw nothing until the app needs them and
 * never do anything on a website: the community bar over /account, the
 * settings layer over the profile, the phone app's sign-in bridge, its push
 * set-up and its notifications ask.
 * Imported plainly, they pulled the community top bar, the platform header
 * and the Supabase client into every website's first load.
 *
 * Here each is loaded on demand, and not at all on a published website.
 *  - Whether this is a website comes from the router's segments, which the
 *    server and the browser agree on (a seller's domain is rewritten to
 *    /w/[username]), so the tree hydrates the same on both sides.
 *  - All five draw nothing on the server and on the hydrating render
 *    already, so ssr: false changes nothing that was drawn.
 *  - On Storelib's own pages the code is asked for as soon as this file
 *    runs, before hydration, so they mount when they did before.
 */
import dynamic from "next/dynamic"
import { useSelectedLayoutSegments } from "next/navigation"
import { getMainDomain } from "@/lib/url-helpers"

const community = () => import("@/components/account/account-community-chrome").then((m) => m.AccountCommunityChrome)
const settings = () => import("@/components/account/settings-subpage").then((m) => m.SettingsSubpageHost)
const oauth = () => import("@/app/NativeOAuthBridge")
const push = () => import("@/components/native-push-init").then((m) => m.NativePushInit)
const ask = () => import("@/components/platform/notifications-ask").then((m) => m.NotificationsAsk)

/** Storelib's own subdomains; any other one is a seller's (username.storelib.com). */
const PLATFORM_SUBDOMAINS = new Set(["www", "app", "help", "admin", "api", "docs", "developers"])

/** For warming only: the render decision is the segments'. A wrong guess here costs a little speed, never correctness. */
function looksLikeWebsite(): boolean {
  if (window.location.pathname.startsWith("/w/")) return true
  const host = window.location.hostname.toLowerCase()
  const main = getMainDomain().toLowerCase()
  if (host === main || host === "localhost" || host === "127.0.0.1") return false
  if (host.endsWith(`.${main}`)) return !PLATFORM_SUBDOMAINS.has(host.slice(0, -main.length - 1))
  return true /* a seller's own domain */
}

if (typeof window !== "undefined" && !looksLikeWebsite()) {
  for (const load of [community, settings, oauth, push, ask]) void load().catch(() => {})
}

const LazyCommunity = dynamic(() => community(), { ssr: false })
const LazySettings = dynamic(() => settings(), { ssr: false })
const LazyOAuth = dynamic(() => oauth(), { ssr: false })
const LazyPush = dynamic(() => push(), { ssr: false })
const LazyAsk = dynamic(() => ask(), { ssr: false })

/** A creator's published website: /w/[username], which every seller's address is rewritten to. */
export function usePublishedWebsite(): boolean {
  const segments = useSelectedLayoutSegments()
  return segments[0] === "(site)" && segments[1] === "w"
}

export function AccountCommunityChrome() {
  return usePublishedWebsite() ? null : <LazyCommunity />
}

export function SettingsSubpageHost() {
  return usePublishedWebsite() ? null : <LazySettings />
}

export function NativeOAuthBridge() {
  return usePublishedWebsite() ? null : <LazyOAuth />
}

export function NativePushInit() {
  return usePublishedWebsite() ? null : <LazyPush />
}

export function NotificationsAsk() {
  return usePublishedWebsite() ? null : <LazyAsk />
}
