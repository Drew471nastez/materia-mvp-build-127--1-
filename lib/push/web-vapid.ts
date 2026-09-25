import "server-only"
import { createECDH, createHmac } from "node:crypto"

/**
 * ===========================================================================
 *  THE KEYS A BROWSER'S PUSH SERVICE CHECKS STORELIB AGAINST
 * ===========================================================================
 * Web Push (browser notifications) needs one P-256 key pair: the browser is
 * given the public half when it subscribes, and every push is signed with the
 * private half. Set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY
 * to use a pair of your own (`npx web-push generate-vapid-keys`).
 *
 * Without them the pair is DERIVED from a secret the server already has
 * (WEB_PUSH_SECRET, else the Supabase service role key): an HMAC of it is the
 * private scalar, and the public key is computed from that. The same secret
 * gives the same pair on every instance and every deploy, so nothing has to
 * be configured, and no key is ever written anywhere. If that secret changes,
 * browsers subscribed under the old pair stop receiving pushes (their pushes
 * fail and the rows are removed) until they turn the switch on again.
 */

/** The order of the P-256 curve: a private key is a number in [1, n - 1]. */
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")

export type VapidKeys = { publicKey: string; privateKey: string; subject: string }

let cached: VapidKeys | null | undefined

export function vapidKeys(): VapidKeys | null {
  if (cached !== undefined) return cached
  const subject = process.env.WEB_PUSH_SUBJECT || "https://storelib.com"
  const pub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  const priv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  if (pub && priv) return (cached = { publicKey: pub, privateKey: priv, subject })

  const secret = process.env.WEB_PUSH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || secret === "placeholder") return (cached = null)
  const digest = createHmac("sha256", secret).update("storelib-web-push-vapid-v1").digest("hex")
  const d = (BigInt(`0x${digest}`) % (N - BigInt(1))) + BigInt(1)
  const privateKey = Buffer.from(d.toString(16).padStart(64, "0"), "hex")
  const ecdh = createECDH("prime256v1")
  ecdh.setPrivateKey(privateKey)
  return (cached = {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: privateKey.toString("base64url"),
    subject,
  })
}
