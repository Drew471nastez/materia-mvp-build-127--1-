/**
 * ===========================================================================
 *  THE LINK LISTS: WHAT IS REFUSED, WHAT IS A SHORTENER, WHO IS IMITATED
 * ===========================================================================
 * Read by lib/communities/link-check.ts for every link in a community post,
 * comment, chat message and direct message. Kept by hand, in the repository,
 * on purpose: no paid reputation service, no outside call to ask whether a
 * domain is bad, nothing that goes down or sends a member's words anywhere.
 *
 * HOW TO MAINTAIN IT. Add a domain in lowercase, without "www." and without
 * a path. A domain covers its subdomains (grabify.link also refuses
 * x.grabify.link). Keep each list sorted, and say in the commit why a domain
 * was added: a report from a community, a scam seen on another platform.
 * Removing one is as normal as adding one; a list nobody prunes is a list
 * that refuses innocent people.
 *
 * Browser safe and pure: data only.
 */

/**
 * REFUSED OUTRIGHT, everywhere, for everyone. Only domains with no innocent
 * use in a community: address grabbers (they log the IP of whoever clicks),
 * and the phishing kits and fake giveaway hosts that keep coming back under
 * the same names.
 */
export const BLOCKED_DOMAINS: readonly string[] = [
  "2no.co",
  "blasze.com",
  "bmwforum.co",
  "curiouscat.club",
  "discord-gift.com",
  "discord-nitro.gift",
  "discordgift.site",
  "discordnitro.gift",
  "gift-nitro.com",
  "grabify.icu",
  "grabify.link",
  "headphones.pw",
  "iplis.ru",
  "iplogger.co",
  "iplogger.com",
  "iplogger.info",
  "iplogger.org",
  "iplogger.ru",
  "joinmy.site",
  "leancoding.co",
  "lovebird.guru",
  "myprivate.pics",
  "ps3cfw.com",
  "quickmessage.us",
  "screenshare.host",
  "spottyfly.com",
  "stopify.co",
  "trulove.guru",
  "wheresmyip.com",
  "yip.su",
]

/**
 * KNOWN SHORTENERS. A short link hides where it goes, which is the whole
 * reason a scam uses one. The server asks where it leads (one step at a time,
 * public addresses only) and checks the destination like any other link; one
 * it cannot see through is held for a moderator.
 */
export const SHORTENER_DOMAINS: readonly string[] = [
  "adf.ly",
  "bc.vc",
  "bit.do",
  "bit.ly",
  "bitly.com",
  "bl.ink",
  "buff.ly",
  "clck.ru",
  "cutt.ly",
  "cutt.us",
  "db.tt",
  "dub.sh",
  "gg.gg",
  "goo.gl",
  "is.gd",
  "lnkd.in",
  "msha.ke",
  "ouo.io",
  "ow.ly",
  "qr.ae",
  "rb.gy",
  "rebrand.ly",
  "s.id",
  "shorte.st",
  "shorturl.at",
  "snip.ly",
  "soo.gd",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tinyurl.com",
  "u.to",
  "v.gd",
  "x.co",
  "zpr.io",
]

/**
 * NAMES THAT GET IMITATED, with the domains that really are theirs. A link
 * whose name reads as one of these (paypa1, rnicrosoft, аpple in Cyrillic)
 * but is not on the real domain is held for a moderator, or refused in chat.
 * A name that is also an everyday word is listed by its distinctive domain
 * instead (steamcommunity, not steam), so a cleaning business is not held.
 */
export const PROTECTED_BRANDS: readonly { name: string; domains: readonly string[] }[] = [
  { name: "amazon", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.ca", "amazon.com.au", "amazon.in", "amazon.co.jp", "amazon.nl", "amazon.se", "amazon.pl", "amazon.com.br", "amazon.com.mx", "amazonaws.com", "aws.amazon.com"] },
  { name: "apple", domains: ["apple.com", "icloud.com", "apple.co"] },
  { name: "binance", domains: ["binance.com", "binance.us"] },
  { name: "coinbase", domains: ["coinbase.com"] },
  { name: "discord", domains: ["discord.com", "discord.gg", "discordapp.com", "discord.media", "discordapp.net"] },
  { name: "dropbox", domains: ["dropbox.com", "db.tt"] },
  { name: "facebook", domains: ["facebook.com", "fb.com", "fb.me", "messenger.com"] },
  { name: "google", domains: ["google.com", "goo.gl", "googleusercontent.com", "g.co", "google.co.uk", "google.de", "google.ro"] },
  { name: "instagram", domains: ["instagram.com"] },
  { name: "kraken", domains: ["kraken.com"] },
  { name: "metamask", domains: ["metamask.io"] },
  { name: "microsoft", domains: ["microsoft.com", "live.com", "office.com", "outlook.com", "microsoftonline.com", "sharepoint.com"] },
  { name: "netflix", domains: ["netflix.com"] },
  { name: "paypal", domains: ["paypal.com", "paypal.me"] },
  { name: "revolut", domains: ["revolut.com", "revolut.me"] },
  { name: "steamcommunity", domains: ["steampowered.com", "steamcommunity.com"] },
  { name: "storelib", domains: ["storelib.com"] },
  { name: "stripe", domains: ["stripe.com"] },
  { name: "telegram", domains: ["telegram.org", "t.me", "telegram.me"] },
  { name: "whatsapp", domains: ["whatsapp.com", "wa.me"] },
]

/**
 * TOP LEVEL DOMAINS THAT READ LIKE A FILE. "invoice.zip" in a message looks
 * like an attachment and opens a website; a moderator looks first.
 */
export const FILE_LIKE_TLDS: readonly string[] = ["mov", "zip"]
