/**
 * ===========================================================================
 *  KEYS STAY IN STORELIB, THE REST OF THE FILE GOES TO GITHUB
 * ===========================================================================
 * Materia's store locator script carries a map key, as many bought themes
 * do. GitHub's push protection turns down any commit holding one, so the
 * file never reached the repository and the card said the sync failed.
 *
 * Push protection is right to look, and it is never bypassed. Instead the
 * key does not travel: in the copy sent to GitHub each key is replaced by a
 * marker that names it (`storelib-key-kept-out-<id>`), every other byte as
 * it is. The site keeps drawing from Storelib's own copy, key included. When
 * the file comes back from GitHub (an agent edited it, a Pull), each marker
 * is swapped for the key Storelib still holds, so an edit around it keeps
 * working and the key is never lost.
 *
 * Pure. Only shapes GitHub's push protection blocks, written strictly, so a
 * class name or a hash in a stylesheet is never taken for one.
 */
import { createHash } from "node:crypto"

export interface KeyKind {
  id: string
  /** What it is, for the note in the builder. */
  label: string
  /** Meant to be seen by browsers (a map or Maps key): restrict it to the site's address, no need to rotate. */
  public: boolean
  pattern: RegExp
}

export const KEY_KINDS: KeyKind[] = [
  { id: "mapbox_public", label: "Mapbox access token", public: true, pattern: /\bpk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g },
  { id: "mapbox_secret", label: "Mapbox secret token", public: false, pattern: /\bsk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g },
  { id: "google_api", label: "Google API key", public: true, pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "stripe_secret", label: "Stripe secret key", public: false, pattern: /\b[sr]k_live_[0-9A-Za-z]{24,}\b/g },
  { id: "github_token", label: "GitHub token", public: false, pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { id: "aws_key", label: "AWS access key", public: false, pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "slack_token", label: "Slack token", public: false, pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g },
  { id: "slack_webhook", label: "Slack webhook", public: false, pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g },
  { id: "shopify_token", label: "Shopify access token", public: false, pattern: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g },
  { id: "sendgrid", label: "SendGrid key", public: false, pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { id: "openai", label: "OpenAI key", public: false, pattern: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}/g },
  { id: "anthropic", label: "Anthropic key", public: false, pattern: /\bsk-ant-[A-Za-z0-9_-]{40,}/g },
  { id: "mailchimp", label: "Mailchimp key", public: false, pattern: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g },
  { id: "private_key", label: "private key", public: false, pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]{20,}?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g },
]

const MARKER = /storelib-key-kept-out-([a-z_]+)-([0-9a-f]{12})/g

function markerFor(kind: KeyKind, secret: string): string {
  return `storelib-key-kept-out-${kind.id}-${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`
}

export interface KeptKey {
  kind: string
  label: string
  public: boolean
  marker: string
}

/** The text as GitHub gets it: every key replaced by its marker, nothing else changed. */
export function keepKeysOut(text: string): { text: string; kept: KeptKey[] } {
  if (!text || text.startsWith("base64:")) return { text, kept: [] }
  const kept = new Map<string, KeptKey>()
  let out = text
  for (const kind of KEY_KINDS) {
    out = out.replace(kind.pattern, (secret) => {
      const marker = markerFor(kind, secret)
      kept.set(marker, { kind: kind.id, label: kind.label, public: kind.public, marker })
      return marker
    })
  }
  return { text: out, kept: [...kept.values()] }
}

/** Every marker in text from GitHub, swapped back for the key Storelib holds in its own copy of the file. */
export function putKeysBack(incoming: string, stored: string | null | undefined): { text: string; missing: string[] } {
  if (!incoming.includes("storelib-key-kept-out-")) return { text: incoming, missing: [] }
  const keys = new Map<string, string>()
  if (stored) {
    for (const kind of KEY_KINDS) for (const m of stored.matchAll(kind.pattern)) keys.set(markerFor(kind, m[0]), m[0])
  }
  const missing: string[] = []
  const text = incoming.replace(MARKER, (marker) => {
    const key = keys.get(marker)
    if (key) return key
    missing.push(marker)
    return marker
  })
  return { text, missing }
}

/** The note shown for a file whose keys stayed in Storelib. Never an error: the file is in the repository and the site works. */
export function keptNote(path: string, kept: KeptKey[]): string {
  const labels = [...new Set(kept.map((k) => k.label))].join(", ")
  const allPublic = kept.every((k) => k.public)
  return allPublic
    ? `${path}: its ${labels} stays in Storelib, so GitHub's secret scanning has nothing to stop. The site still uses it. Restrict the key to your site's address with its provider.`
    : `${path}: its ${labels} stays in Storelib, so it is not in the repository. The site still uses it. A key like this should not be in a theme file: move it to a setting and create a new one with its provider, since anyone with the theme files had it.`
}
