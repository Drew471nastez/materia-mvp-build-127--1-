/**
 * ===========================================================================
 *  A NAME THAT ASKS FOR A PASSWORD, OR SPEAKS FOR A BANK (round 51)
 * ===========================================================================
 * Every name a person picks becomes an address on a host people trust:
 * <name>.storelib.com (a website), storelib.me/<name> (a OnePage) and
 * storelib.com/<name> (a creator page). `paypal-login.storelib.com` is a
 * phishing page before anything is on it. So a NEW name is refused when it
 *
 *   - has a part that only a sign in page needs (login, signin, verify,
 *     password, recovery, 2fa...), matched as a whole hyphen part, so
 *     `blogin` and `loginov` are not caught; or
 *   - names a company people sign in to (a bank, a wallet, a mail or cloud
 *     account, a carrier) together with an account word (support, billing,
 *     secure, wallet, refund...), hyphenated or run together.
 *
 * Names already taken keep working: this is asked where a name is chosen
 * (lib/reserved-words isValidUsername, which usernames and OnePage names go
 * through, and lib/website-builder/site-address handleProblem for a
 * website's own name). Pure, safe on the client and the server.
 */

/** Words only a sign in page has a use for. */
const CREDENTIAL = new Set([
  "login", "logon", "signin", "verify", "verification", "validate", "authenticate", "authentication",
  "2fa", "mfa", "otp", "password", "passwd", "recovery", "unlock", "unsuspend", "reactivate",
  "seedphrase", "walletconnect", "webmail",
])

/** Companies whose sign in page is worth copying. Five letters or more when run together with a word, so a short one never matches by chance. */
const BRANDS = [
  "paypal", "apple", "appleid", "icloud", "microsoft", "office365", "outlook", "hotmail", "google", "gmail",
  "facebook", "instagram", "whatsapp", "tiktok", "amazon", "netflix", "coinbase", "binance", "metamask",
  "trustwallet", "stripe", "shopify", "wellsfargo", "bankofamerica", "revolut", "venmo", "cashapp", "zelle",
  "fedex", "usps", "storelib",
]

/** What a fake support desk calls itself. */
const ACCOUNT = new Set([
  "account", "accounts", "support", "helpdesk", "secure", "security", "billing", "update", "wallet",
  "refund", "refunds", "claim", "giveaway", "official", "service", "payment", "payments", "alert", "notice",
  "customer", "care", "unlock", "verify", "login", "signin",
])

export function isPhishingName(raw: string): boolean {
  const name = (raw || "").trim().toLowerCase()
  if (!name) return false
  const parts = name.split(/[-_.]+/).filter(Boolean)
  if (parts.some((p) => CREDENTIAL.has(p))) return true
  const brandPart = parts.some((p) => BRANDS.includes(p))
  if (brandPart && parts.some((p) => ACCOUNT.has(p) || CREDENTIAL.has(p))) return true
  /* Run together: paypalsupport, supportpaypal, applesecure2. */
  const flat = name.replace(/[^a-z0-9]/g, "").replace(/\d+$/, "")
  for (const b of BRANDS) {
    if (b.length < 5 || !flat.includes(b)) continue
    const rest = flat.replace(b, "")
    if (ACCOUNT.has(rest) || CREDENTIAL.has(rest)) return true
  }
  return false
}
