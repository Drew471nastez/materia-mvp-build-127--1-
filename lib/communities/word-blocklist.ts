/**
 * ===========================================================================
 *  WORDS NO COMMUNITY ON STORELIB TAKES
 * ===========================================================================
 * The platform list the keyword filter reads before any community's own
 * (./word-filter.ts explains how a word matches; safety.ts screenWrite is
 * where it is used). Three groups, each with what it does:
 *
 *   MINORS   sexual content involving children, and the code words used to
 *            trade it. Always REFUSED, for everybody, the team included,
 *            and written to the platform's security log (file_security_events,
 *            /admin/security), not only the community's: a community whose
 *            own team is the problem must not be the only one who knows.
 *   HATE     slurs with no other use. Always refused. Kept as fingerprints
 *            (wordPrint), so the file can be read without them; to add one,
 *            add wordPrint("theword") for its lower case spelling and its
 *            plural.
 *   ADULT    selling or trading sexual content, the usual spam. A post or
 *            comment is HELD for a moderator (a health or recovery
 *            community may say these words for good reasons); a chat or
 *            direct message, which cannot be held, is refused.
 *
 * Kept short on purpose: every entry here is refused or held in every
 * community, so a word that is ordinary somewhere does not belong ("cp" is
 * also Call of Duty Points, so it is not here). A
 * community adds its own words in Moderation, Rules.
 */

export const PLATFORM_MINORS: readonly string[] = [
  "child porn*",
  "childporn*",
  "kiddie porn*",
  "kiddieporn*",
  "kiddy porn*",
  "pedo porn*",
  "pedoporn*",
  "pthc",
  "preteen porn*",
  "preteen nude*",
  "preteen sex*",
  "underage porn*",
  "underage nude*",
  "jailbait nude*",
  "jailbait porn*",
  "jailbait pic*",
  "teen nudes",
  "loli porn*",
  "lolicon",
  "shotacon",
  "hebe porn*",
]

export const PLATFORM_ADULT: readonly string[] = [
  "selling nudes",
  "sell nudes",
  "buy nudes",
  "buy my nudes",
  "send nudes",
  "nudes for sale",
  "dm for nudes",
  "nude pics",
  "nude photos",
  "nude videos",
  "onlyfans leak*",
  "leaked onlyfans",
  "free porn",
  "porn links",
  "porn videos",
  "xxx videos",
  "xxx links",
  "sex videos",
  "sex tape*",
  "sexcam*",
  "camgirl*",
  "horny singles",
  "hookup tonight",
  "nsfw links",
]

/** Slurs, as wordPrint fingerprints of their lower case spellings and plurals. */
export const PLATFORM_HATE_PRINTS: ReadonlySet<string> = new Set([
  "1d6f1ede7192b1",
  "113da154e85c72",
  "1dee5f7f983ab2",
  "0d779ec5aee534",
  "1762dd6f8cf7ea",
  "0cbfcf8f47cc96",
  "114e3940220e97",
  "0173f4ef9a791b",
  "153e54915941c4",
  "17a3281944df4f",
  "0873c552d2fc01",
  "043959699aa864",
  "0c92076427d199",
  "0428e1c1b2404b",
  "0f7dc1e540af20",
  "00e651ddd8f3a0",
  "1a3c8e8c7b22f8",
  "0ee8859c514581",
  "03d5631a86e1de",
  "1fed4f373da42c",
  "0fef9e48a1f2be",
  "0eceae4419a050",
  "0451c162b9b6a5",
  "0d16ef7c14de32",
  "1b535e0a7747f0",
])
