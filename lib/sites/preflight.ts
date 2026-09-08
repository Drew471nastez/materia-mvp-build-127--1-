import "server-only"

/**
 * What has to be true before a site goes live.
 *
 * ---------------------------------------------------------------------------
 *  PUBLISH WAS CHECKING LESS THAN THE AGENT WAS
 * ---------------------------------------------------------------------------
 * A run by the agent bundles, typechecks and renders the project, and refuses
 * to finish unless all three pass. `publishSite` ran esbuild and nothing else.
 *
 * So every path that is not an agent run went live unchecked: a hand edit in
 * the Code tab autosaves every 1.2 seconds and Publish takes whatever is
 * there. A type error, a component that throws on render, a half-finished
 * paste — all of it shippable, to a real address, with the creator's name on
 * it. The strictest gate in the system sat in front of the safest path.
 *
 * ---------------------------------------------------------------------------
 *  AND THE ONE NOBODY WAS CHECKING AT ALL
 * ---------------------------------------------------------------------------
 * A published site is STATIC FILES ON A PUBLIC BUCKET. Every byte of it is
 * served to anyone who asks, forever, and it is copied into a CDN on the way.
 * If a key is in there it is not "exposed later" — it is published, and
 * deleting the site afterwards does not recall it.
 *
 * A creator pastes a key into a component to "make the form work". A model
 * writes one because the prompt said the page should send email. Neither is
 * malice and neither is rare, and until now nothing between that and the
 * public internet looked.
 */

import { renderCheck, formatRenderFailure } from "./render-check"
import { typecheckProject, formatTypeErrors } from "./typecheck"
import type { ProjectFiles } from "./types"

export interface Finding {
  /** Blocking stops the publish. A warning is shown and the publish goes on. */
  level: "blocking" | "warning"
  kind: "secret" | "types" | "render"
  file?: string
  line?: number
  /**
   * For a person. NEVER contains the value that was found — a finding is read
   * in a browser, written to a log and stored on a row, and a message quoting
   * the key would put it in three more places than it already was.
   */
  message: string
}

export interface PreflightResult {
  ok: boolean
  findings: Finding[]
  /**
   * Which checks actually ran. A check that could not run must be VISIBLE
   * rather than silently counted as a pass — that is the difference between
   * "verified" and "nothing objected".
   */
  ran: string[]
  skipped: string[]
}

/**
 * ---------------------------------------------------------------------------
 *  WHAT COUNTS AS A SECRET, AND WHY THE LIST IS SHORT
 * ---------------------------------------------------------------------------
 * Every pattern here is a vendor's own prefix followed by enough characters
 * that it cannot be a coincidence. That is deliberate and it is the whole
 * design: a false positive BLOCKS A PUBLISH, and a creator who cannot ship
 * their site because a paragraph of copy looked like a token will not thank
 * anybody for the caution.
 *
 * So there is no "high entropy string" rule and no "looks like a password"
 * rule. Those catch more and they also catch a hash in a CSS filename, a
 * base64 image, a UUID and an id. What is here fires on the things that are
 * unambiguously credentials and nothing else.
 */
const SECRETS: Array<{ name: string; pattern: RegExp }> = [
  { name: "a Stripe secret key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { name: "an OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: "an AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "a Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "a GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "a Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "a SendGrid API key", pattern: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: "an npm token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: "a Twilio auth token", pattern: /\bSK[0-9a-fA-F]{32}\b/ },
  { name: "a private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
]

/**
 * A Supabase key is a JWT, and the ANON one is meant to be public — it is in
 * every client bundle of every Supabase app on earth. Matching "a JWT" would
 * therefore block a correct site on its most ordinary line.
 *
 * The two are told apart by what is inside them: the payload names the role.
 * So the token is decoded and only `service_role` — the key that bypasses
 * every row-level policy in the database — is a finding.
 */
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g

function decodePayload(segment: string): string {
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/")
    const decode = (globalThis as { atob?: (s: string) => string }).atob
    if (decode) return decode(padded + "=".repeat((4 - (padded.length % 4)) % 4))
    return Buffer.from(padded, "base64").toString("utf8")
  } catch {
    return ""
  }
}

/**
 * Credentials in the files, by file and line, without repeating the value.
 *
 * Pure and exported so it can be tested directly: this is the check whose
 * false NEGATIVE publishes a key and whose false POSITIVE stops somebody
 * shipping, and both need to be exercised rather than reasoned about.
 */
export function scanForSecrets(files: ProjectFiles): Finding[] {
  const findings: Finding[] = []

  for (const path of Object.keys(files).sort()) {
    const lines = files[path].split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      for (const secret of SECRETS) {
        if (!secret.pattern.test(line)) continue
        findings.push({
          level: "blocking",
          kind: "secret",
          file: path,
          line: i + 1,
          message: `${secret.name} is written into this file. A published site is public files on a CDN — remove it before publishing, and treat the key as compromised.`,
        })
        break
      }

      JWT.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = JWT.exec(line)) !== null) {
        const payload = decodePayload(match[1])
        if (!/"role"\s*:\s*"service_role"/.test(payload)) continue
        findings.push({
          level: "blocking",
          kind: "secret",
          file: path,
          line: i + 1,
          message:
            "A Supabase SERVICE ROLE key is written into this file. That key ignores every row-level security policy in the database, and a published site is public files on a CDN — remove it, rotate it, and use the anon key from the browser.",
        })
        break
      }
    }
  }

  return findings
}

/**
 * Everything that must hold before a site is served to the public.
 *
 * The bundle is not repeated here: `publishSite` builds anyway and its errors
 * are already reported, so building twice would double the slowest part of a
 * publish to say the same thing.
 */
export async function preflight(files: ProjectFiles): Promise<PreflightResult> {
  const findings: Finding[] = [...scanForSecrets(files)]
  const ran: string[] = ["secrets"]
  const skipped: string[] = []

  const types = await typecheckProject(files).catch(() => null)
  if (!types || !types.ran) {
    skipped.push("typecheck")
  } else {
    ran.push("typecheck")
    if (!types.ok) {
      findings.push({
        level: "blocking",
        kind: "types",
        message: formatTypeErrors(types),
      })
    }
  }

  const rendered = await renderCheck(files).catch(() => null)
  if (!rendered || !rendered.ran) {
    skipped.push("render")
  } else {
    ran.push("render")
    if (!rendered.ok) {
      findings.push({
        level: "blocking",
        kind: "render",
        message: formatRenderFailure(rendered),
      })
    }
  }

  return {
    ok: findings.every((f) => f.level !== "blocking"),
    findings,
    ran,
    skipped,
  }
}

/** The findings as a creator reads them, one per line. */
export function describeFindings(findings: Finding[]): string[] {
  return findings.map((f) =>
    f.file ? `${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}` : f.message,
  )
}
