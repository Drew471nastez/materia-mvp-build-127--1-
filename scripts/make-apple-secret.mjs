/**
 * ===========================================================================
 *  MINTING THE APPLE CLIENT SECRET
 * ===========================================================================
 * Apple does not give you a client secret. You sign one yourself, as a JWT,
 * with the .p8 key from the Apple Developer portal, and Apple refuses to
 * honour it past six months. That is why Sign in with Apple stops working on
 * a date nobody wrote down.
 *
 * This makes one. Everything happens on this machine: the .p8 is read,
 * a JWT is signed with it, and the key is never printed, never copied and
 * never sent anywhere.
 *
 * ---------------------------------------------------------------------------
 *  THE FOUR THINGS IT NEEDS, AND WHERE EACH ONE IS
 * ---------------------------------------------------------------------------
 *   --p8         the key file. Apple Developer → Certificates, Identifiers &
 *                Profiles → Keys → a key with "Sign in with Apple" enabled.
 *                Apple lets you download it ONCE. If it is lost, make a new
 *                key; the old one can be revoked afterwards.
 *   --key-id     shown beside that key. Ten characters.
 *   --team-id    top right of the Apple Developer portal, or the Membership
 *                page. Ten characters.
 *   --services-id  Identifiers → the "Services IDs" filter. This is the one
 *                that must match what Supabase sends to Apple, which
 *                scripts/check-apple-login.mjs prints.
 *
 *   node scripts/make-apple-secret.mjs \
 *     --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \
 *     --key-id ABC123DEFG --team-id XYZ9876543 \
 *     --services-id com.storelib.auth
 *
 * Paste the result into Supabase → Authentication → Providers → Apple →
 * "Secret Key (for OAuth)", in the project that actually serves the site,
 * then run check-apple-login.mjs to confirm.
 */

import { createSign, createPrivateKey } from "node:crypto"
import { readFileSync } from "node:fs"

/** Apple's own cap, in seconds. Anything longer is rejected outright. */
const MAX_LIFETIME = 15777000

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, "")
  if (key) args[key] = process.argv[i + 1]
}

const p8Path = args.p8
const keyId = args["key-id"]
const teamId = args["team-id"]
const servicesId = args["services-id"]

if (!p8Path || !keyId || !teamId || !servicesId) {
  console.log(`
  Missing something. All four are required:

    node scripts/make-apple-secret.mjs \\
      --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \\
      --key-id ABC123DEFG \\
      --team-id XYZ9876543 \\
      --services-id com.storelib.auth

  See the header of this file for where each one lives in the Apple
  Developer portal.
`)
  process.exit(2)
}

let privateKey
try {
  /**
   * Read as a key object rather than a string, so a malformed file fails
   * here with something readable instead of producing a JWT that Apple
   * silently refuses months from now.
   */
  privateKey = createPrivateKey(readFileSync(p8Path.replace(/^~/, process.env.HOME ?? "~"), "utf8"))
} catch (e) {
  console.log(`\n  ✗   Could not read the key at ${p8Path}\n      ${e.message}\n`)
  process.exit(1)
}

if (privateKey.asymmetricKeyType !== "ec") {
  console.log(`\n  ✗   That is not an Apple .p8 signing key (it is ${privateKey.asymmetricKeyType}).\n`)
  process.exit(1)
}

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url")

const now = Math.floor(Date.now() / 1000)
const header = { alg: "ES256", kid: keyId }
const claims = {
  iss: teamId,
  iat: now,
  exp: now + MAX_LIFETIME,
  aud: "https://appleid.apple.com",
  /** The client this secret speaks for. Must equal the client_id Supabase sends. */
  sub: servicesId,
}

const signingInput = `${b64url(header)}.${b64url(claims)}`

/**
 * ES256 in a JWT is the raw r||s pair, not the DER structure OpenSSL returns
 * by default. `ieee-p1363` is that raw encoding; without it Apple rejects
 * every signature and the reason is not obvious from anything it says.
 */
const signature = createSign("SHA256").update(signingInput).sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")

const token = `${signingInput}.${signature}`
const expires = new Date(claims.exp * 1000).toISOString().slice(0, 10)

console.log(`
══ Apple client secret ══

  team          ${teamId}
  key           ${keyId}
  signed for    ${servicesId}
  expires       ${expires}   (${Math.round(MAX_LIFETIME / 86400)} days, Apple's maximum)

  Paste this into Supabase → Authentication → Providers → Apple →
  "Secret Key (for OAuth)", then Save:

${token}

  Then confirm it:

    APPLE_CLIENT_SECRET='${"<paste it here>"}' node scripts/check-apple-login.mjs

  Put a reminder in a calendar for ${expires}. When it passes, Sign in with
  Apple stops working for everyone at once and nothing in the code will have
  changed.
`)
