/**
 * ===========================================================================
 *  SIGNUP SPAM: WHAT IT LOOKS LIKE, AND WHAT IT IS ACTUALLY AFTER
 * ===========================================================================
 *
 * In August 2026 a few hundred accounts appeared on Storelib inside three
 * same-day batches. Every one of them published nothing and every one of them
 * looked like this:
 *
 *     powerokebos999          okebos999autojp2026     powerdompethoki
 *     powersanur999           dompethokiautojp2026    powerputon888
 *     sanur999autojp2026      JUNKRAYA999             JUNKBETON888
 *     beton888autojp2026      sendbeton888            puton888asix
 *     suaka999asix            beton999asix
 *
 * That is not a person choosing a handle badly. It is an Indonesian gambling
 * SEO farm, and the handles decompose the same way every time:
 *
 *     [affix]  [brand stem]  [lucky number]  [campaign tag]
 *      power     okebos           999            autojp2026
 *      send      dompethoki       888            asix
 *      junk      sanur / beton
 *
 * ---------------------------------------------------------------------------
 * WHY THEY CAME, WHICH IS THE ONLY QUESTION THAT MATTERS
 * ---------------------------------------------------------------------------
 * They did not come to sell anything — nobody published a product. They came
 * because a Storelib account used to mint, for free and instantly:
 *
 *   · an indexable page at storelib.com/u/<handle>, robots index:true,
 *   · a canonical URL and ProfilePage + BreadcrumbList structured data,
 *   · a <handle>.storelib.com subdomain,
 *   · a row in sitemap.xml handed straight to Google,
 *   · and outbound followed links from a storefront they control.
 *
 * That is a backlink. Multiplied by 360 it is a link network, built on a
 * domain with real authority, at zero cost. The handles are the product: the
 * gambling brand name IS the anchor text.
 *
 * So this module exists, but it is deliberately the SECOND line of defence.
 * Scoring handles is an arms race — they can rename. Withholding the indexable
 * surface until an account has actually published something is not an arms
 * race, because there is nothing left to win. See lib/seo/sitemaps.ts and
 * app/(marketing)/u/[username]/page.tsx for the half of this fix that removes
 * the incentive; this file is the half that raises the cost.
 *
 * Round 41 moved that line: every public page with something on it may be
 * indexed now, and what is withheld until an account has published is the
 * links' authority (trustsOutboundLinks, a page level nofollow). The farm's
 * prize was the followed link, and that is still not on offer.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THIS FILE MUST NOT BREAK
 * ---------------------------------------------------------------------------
 * A false positive is worse than a false negative. Refusing a spammer's handle
 * costs them nine seconds; refusing a real seller's own name costs Storelib the
 * seller. So NO SINGLE WEAK SIGNAL EVER BLOCKS. Every refusal needs a
 * combination, and the weak vocabulary is weighted so that two of them plus a
 * number is the minimum that can reach the threshold.
 *
 * This matters more here than it would elsewhere, because Storelib is a
 * Romanian marketplace and some of the farm's vocabulary is ordinary Romanian:
 * "beton" is concrete, and colloquially "brilliant". "depozit" is a warehouse.
 * A bare-substring blocklist would have refused betonarie, betonstar and
 * depozitul-meu on day one. Those score 2 here, and 2 never blocks.
 *
 * Everything below is pure — no imports, no I/O, no environment. It is called
 * from route handlers, from a React client component and from the test suite,
 * and all three must get the same verdict.
 */

/**
 * ---------------------------------------------------------------------------
 * TIER ONE: terms with no innocent reading
 * ---------------------------------------------------------------------------
 * Slot and sportsbook affiliate vocabulary. These are not words anybody types
 * by accident in any language Storelib serves: "gacor" (slang for a machine
 * paying out), "maxwin", "togel" (numbers racket), "autojp" (auto jackpot),
 * "okebos" and "dompethoki" (wallet-of-luck) are the farm's own brand stems.
 *
 * One of these plus any other signal at all is a refusal, which is the intent —
 * a handle containing "slotgacor" has no legitimate owner to protect.
 */
const TIER_ONE = [
  "gacor",
  "maxwin",
  "togel",
  "autojp",
  "okebos",
  "dompethoki",
  "hokislot",
  "slotgacor",
  "situsslot",
  "linkalternatif",
  "judibola",
  "bandarbola",
  "sbobet",
  "pragmaticplay",
  "scatterhitam",
  "deposlot",
  "slotdepo",
  "rtpslot",
  "slotonline",
  "judionline",
  "agenslot",
  "daftarslot",
  "bocoran",
  "zeusslot",
  "jackpotslot",
  "pulsatanpapotongan",
] as const

/**
 * ---------------------------------------------------------------------------
 * TIER TWO: only suspicious in company
 * ---------------------------------------------------------------------------
 * The farm's connective tissue — affixes it bolts onto everything, place names
 * and stems it recycles, and campaign tags. Each is worth 2, so one alone is
 * inert and it takes three of them (or two plus a lucky number) to reach a
 * refusal.
 *
 * "beton", "raya", "power", "send" and "junk" are in here rather than in tier
 * one precisely because they have ordinary uses. That is the whole design: the
 * farm is caught by its COMBINATIONS, which is the part it cannot drop without
 * ceasing to be a recognisable link network.
 */
const TIER_TWO = [
  // Farm affixes, seen on the majority of the batch
  "power",
  "send",
  "junk",
  // Recycled brand stems
  "okebos",
  "dompet",
  "hoki",
  "puton",
  "beton",
  "sanur",
  "suaka",
  "raya",
  // Campaign tags
  "asix",
  "autojp",
  "jpslot",
  // Wider affiliate vocabulary that is weak on its own
  "slot",
  "casino",
  "kasino",
  "poker",
  "judi",
  "situs",
  "daftar",
  "bandar",
  "agen",
  "gampang",
  "cuan",
  "wede",
  "parlay",
] as const

/**
 * Runs of digits the farm uses as brand suffixes. 888 and 999 carry luck in the
 * market it targets and appear on most of the batch; 4d and 2d are lottery
 * formats. Worth 2 — a handle ending in 999 is also just a gamer, and this must
 * never be the reason on its own.
 */
const LUCKY = /(888|999|777|4d|2d|69|168|303|4dp)/

/**
 * The structural tell: letters, then a run of at least three digits, then more
 * letters. `puton888asix`, `suaka999asix`, `beton888autojp2026`. A real handle
 * that wants a number puts it at the end — `sneakers999`, `maria2026` — and
 * neither of those matches, because a trailing number leaves no letters after
 * it.
 *
 * Three digits minimum, not two, so `jordan23air` and `air4life` are untouched.
 */
const DIGIT_SANDWICH = /[a-z]{3,}\d{3,}[a-z]{3,}/

/** A campaign year bolted on, as in autojp2026. Only counted alongside a tag. */
const CAMPAIGN_YEAR = /(20\d{2})$/

export type SpamSignal = {
  /** Machine-readable, for grouping in the admin queue. */
  code: string
  /** What tripped, in plain words, for a human reading the review list. */
  detail: string
  weight: number
}

export type SpamVerdict = {
  score: number
  signals: SpamSignal[]
  /** At or above BLOCK_SCORE: refuse the handle outright. */
  blocked: boolean
  /** At or above REVIEW_SCORE: let it through, put it in front of a human. */
  review: boolean
}

/**
 * Six is two weak signals plus a lucky number, or one unambiguous term plus
 * anything. It is calibrated against the real batch — every one of the fourteen
 * handles above scores 6 or more — and against a list of legitimate handles
 * that must not, which is pinned in tests/spam-defence.test.ts.
 *
 * REVIEW_SCORE is deliberately lower. Four is "worth a human glance", not
 * "refuse": it is what surfaces a near-miss in the admin queue so the
 * vocabulary can be tuned from evidence rather than from guesswork.
 */
export const BLOCK_SCORE = 6
export const REVIEW_SCORE = 4

/** Cap so a handle stuffed with ten stems does not report a score of 40. */
const MAX_SCORE = 20

/**
 * Score a handle.
 *
 * Case and separators are stripped first, because `JUNKBETON888`,
 * `junk-beton-888` and `junkbeton888` are the same handle wearing different
 * clothes, and the farm has used at least two of the three.
 */
export function scoreHandle(handle: string | null | undefined): SpamVerdict {
  const raw = (handle ?? "").toLowerCase()
  const flat = raw.replace(/[^a-z0-9]/g, "")
  const signals: SpamSignal[] = []

  if (flat.length < 3) return verdictFrom(signals)

  for (const term of TIER_ONE) {
    if (flat.includes(term)) {
      signals.push({ code: `lex1:${term}`, detail: `contains "${term}"`, weight: 5 })
    }
  }

  for (const term of TIER_TWO) {
    // A tier-one hit already counted this run of characters; charging for both
    // would make "dompethoki" worth 7 on its own and put a single term over the
    // threshold, which is the exact thing this design forbids.
    if (flat.includes(term) && !signals.some((s) => s.code.startsWith("lex1:") && s.code.includes(term))) {
      signals.push({ code: `lex2:${term}`, detail: `contains "${term}"`, weight: 2 })
    }
  }

  if (LUCKY.test(flat)) {
    signals.push({ code: "lucky", detail: "carries a lucky-number suffix", weight: 2 })
  }

  if (DIGIT_SANDWICH.test(flat)) {
    signals.push({ code: "shape", detail: "letters, digits, then letters again", weight: 2 })
  }

  // A year is only evidence in the company of the vocabulary that puts it
  // there. On its own it is somebody's graduation, and worth nothing.
  if (CAMPAIGN_YEAR.test(flat) && signals.some((s) => s.code.startsWith("lex"))) {
    signals.push({ code: "year", detail: "ends in a campaign year", weight: 2 })
  }

  return verdictFrom(signals)
}

/**
 * ---------------------------------------------------------------------------
 * DISPOSABLE EMAIL
 * ---------------------------------------------------------------------------
 * Modest on purpose. This list is never complete and never can be, so it is
 * worth 3 — enough to push a suspicious handle over on its own, never enough to
 * refuse an ordinary one. The farm mostly used real mailboxes anyway; the
 * throwaway domains are the tail, not the body.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "getnada.com",
  "dispostable.com",
  "trashmail.com",
  "fakeinbox.com",
  "maildrop.cc",
  "mohmal.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mailnesia.com",
  "tempr.email",
  "moakt.com",
  "grr.la",
  "spam4.me",
  "byom.de",
  "dropmail.me",
  "inboxkitten.com",
  "mailpoof.com",
])

/** The domain part, lowercased, or "" when the address is unparseable. */
export function emailDomain(email: string | null | undefined): string {
  const at = (email ?? "").lastIndexOf("@")
  if (at < 0) return ""
  return (email ?? "")
    .slice(at + 1)
    .trim()
    .toLowerCase()
}

export function isDisposableEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email)
  if (!domain) return false
  if (DISPOSABLE_DOMAINS.has(domain)) return true
  // One level of subdomain, so mail.yopmail.com is caught with the parent.
  const parent = domain.split(".").slice(-2).join(".")
  return DISPOSABLE_DOMAINS.has(parent)
}

/**
 * Score a whole signup attempt: the handle it wants, the address behind it, and
 * the local part of that address, which the farm also fills with its own
 * vocabulary.
 *
 * `plusTagged` is not scored. Address tagging is what careful people do, and
 * treating it as a signal punishes exactly the users who take their own
 * security seriously.
 */
export function scoreSignup(input: {
  handle?: string | null
  email?: string | null
  displayName?: string | null
}): SpamVerdict {
  const signals: SpamSignal[] = [...scoreHandle(input.handle).signals]

  const local = (input.email ?? "").split("@")[0]?.toLowerCase() ?? ""
  if (local) {
    // The local part is scored with the same vocabulary but at half weight,
    // because an address is chosen once and reused, and a person whose mailbox
    // predates their interest in Storelib should not be judged on it as hard as
    // on the handle they are choosing right now.
    for (const s of scoreHandle(local).signals) {
      signals.push({ ...s, code: `email:${s.code}`, detail: `email ${s.detail}`, weight: Math.ceil(s.weight / 2) })
    }
  }

  if (isDisposableEmail(input.email)) {
    signals.push({ code: "disposable", detail: "disposable email domain", weight: 3 })
  }

  for (const s of scoreHandle(input.displayName).signals) {
    if (s.code.startsWith("lex1:")) {
      signals.push({ ...s, code: `name:${s.code}`, detail: `display name ${s.detail}`, weight: 3 })
    }
  }

  return verdictFrom(signals)
}

function verdictFrom(signals: SpamSignal[]): SpamVerdict {
  const score = Math.min(
    MAX_SCORE,
    signals.reduce((sum, s) => sum + s.weight, 0),
  )
  return { score, signals, blocked: score >= BLOCK_SCORE, review: score >= REVIEW_SCORE }
}

/**
 * ---------------------------------------------------------------------------
 * COHORT SIGNATURE, FOR CLEANING UP WHAT IS ALREADY HERE
 * ---------------------------------------------------------------------------
 * The 360 accounts that already exist are not going to be caught one at a time.
 * They will be caught in groups, because a farm generates from a template and
 * the template shows: `powersanur999` and `powerputon888` reduce to the same
 * skeleton.
 *
 * Letters collapse to `a`, digit runs to `#`, so an operator sorting the admin
 * queue by signature sees the batches stand up on their own — including the
 * batches whose vocabulary this file has never heard of, which is the point.
 * This is the part that keeps working after they rename.
 */
export function handleSignature(handle: string | null | undefined): string {
  const flat = (handle ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!flat) return ""
  return flat.replace(/[a-z]+/g, "a").replace(/\d+/g, "#")
}

/**
 * An operator's decision about an account (profiles.spam_state, part
 * 20260815_signup_abuse): "confirmed" is a farm, "clear" is a person the
 * score got wrong, "suspect" and null are no decision yet.
 */
export type SpamState = "clear" | "suspect" | "confirmed" | null | undefined

/**
 * Whether an account's public pages may be indexed at all.
 *
 * ROUND 41: PUBLISHING IS NO LONGER THE GATE. It used to be: no published
 * product, no index, which kept the August 2026 farm out but also kept out
 * every creator whose OnePage is their whole presence (a musician's links, a
 * coach's booking page). Those are the pages people search a name for.
 *
 * What keeps a farm out now is, in order:
 *   1. an operator's verdict: "confirmed" is never indexed, "clear" always
 *      is (the operator overrides the score, both ways);
 *   2. the handle and email score, as before (scoreSignup);
 *   3. at the page, not here: a page that shows nothing past a name and a
 *      photo is not indexed (lib/onepage/page-presence), and the links on the
 *      page of an account that has not earned trust carry no authority
 *      (trustsOutboundLinks below). A farm came for the links; an indexed page
 *      whose links pass nothing is not what it came for.
 * A ban is checked by the caller (lib/seo/bans.ts), as it always was.
 */
export function deservesIndexing(account: {
  handle?: string | null
  email?: string | null
  spamState?: SpamState
}): boolean {
  if (account.spamState === "confirmed") return false
  if (account.spamState === "clear") return true
  return !scoreSignup({ handle: account.handle, email: account.email }).blocked
}

/**
 * Whether search engines may follow the links on an account's pages and
 * count them. A link farm's whole product is a followed link, so this is
 * where the old publication gate lives now: an account has put something on
 * sale (any product, a physical one too), or an operator cleared it. Until
 * then its pages are indexed and say nofollow, which Google reads as "do not
 * pass authority through these links" for every link on the page at once.
 */
export function trustsOutboundLinks(account: { publishedProducts: number; spamState?: SpamState }): boolean {
  if (account.spamState === "confirmed") return false
  if (account.spamState === "clear") return true
  return account.publishedProducts >= 1
}
