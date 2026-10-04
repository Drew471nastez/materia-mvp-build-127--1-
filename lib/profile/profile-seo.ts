/**
 * ===========================================================================
 *  A PROFILE IN SEARCH AND IN A SHARED LINK
 * ===========================================================================
 * /@handle for somebody without a store (a creator's is a redirect to their
 * page, lib/profile/profile-redirect.ts). The owner: "indexable,
 * title/description from the person, a dynamic social image".
 *
 *   TITLE        their name and @handle ("Maya Ortiz (@maya)"); the root
 *                layout adds "| Storelib"
 *   DESCRIPTION  their bio, cut on a word, else one plain sentence naming
 *                them and Storelib
 *   PICTURE      /member/<handle>/share.png?v=<fingerprint>, drawn per
 *                request (components/profile/profile-share-card.tsx); `v`
 *                changes with what it is drawn from, so a chat app that kept
 *                the old one asks again after an edit
 *   ROBOTS       indexed and followed. The page carries no link a visitor
 *                typed (the bio is text, never a link), so a profile made
 *                to pass authority to somebody else's site has none to pass;
 *                a handle the sign up guard calls spam is left out of search
 *                all the same (lib/security/spam-signals).
 *
 * Under /member/, not /@handle/: next.config rewrites `/@:handle` alone, one
 * segment, and the proxy lets .png addresses through without a session.
 * Pure, so the tests read it without a server.
 */
import type { Metadata } from "next"
import { plainSummary } from "@/lib/html-entities"
import { memberProfilePublicPath } from "@/lib/profile/member-url"

const SITE = "https://storelib.com"
export const PROFILE_SHARE_IMAGE = { width: 1200, height: 630 } as const

/** A short fingerprint of what the picture is drawn from (FNV-1a), so its address changes when it would. */
export function profileShareVersion(parts: ReadonlyArray<string | number | null | undefined>): string {
  let h = 0x811c9dc5
  for (const ch of parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|")) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function profileShareImageUrl(username: string, version: string | null | undefined): string {
  const handle = encodeURIComponent((username || "").trim().toLowerCase())
  return `${SITE}/member/${handle}/share.png${version ? `?v=${version}` : ""}`
}

export interface ProfileSeoFacts {
  name: string
  username: string
  bio: string | null
  avatarUrl: string | null
  coverUrl: string | null
  followers: number
  /** False for a handle the sign up guard blocks: kept out of search. */
  indexable: boolean
}

export function profileMetadata(f: ProfileSeoFacts): Metadata {
  const name = f.name.trim() || f.username
  const title = `${name} (@${f.username})`
  const description = plainSummary(f.bio || "", 200) || `${name} is on Storelib. See the communities they are in and what they share.`
  const canonical = memberProfilePublicPath(f.username)
  const image = profileShareImageUrl(f.username, profileShareVersion([f.name, f.username, f.bio, f.avatarUrl, f.coverUrl, f.followers]))
  const robots = f.indexable
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" as const } }
    : { index: false, follow: false, googleBot: { index: false, follow: false } }
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "profile",
      siteName: "Storelib",
      url: `${SITE}${canonical}`,
      username: f.username,
      images: [{ url: image, width: PROFILE_SHARE_IMAGE.width, height: PROFILE_SHARE_IMAGE.height, alt: `${name} on Storelib`, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots,
  }
}
