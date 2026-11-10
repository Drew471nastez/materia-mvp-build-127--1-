/**
 * ===========================================================================
 *  WHAT A PICTURE PROMPT MAY ASK FOR (round P, P1)
 * ===========================================================================
 * Checked before any provider is called, so an unsafe request costs nothing
 * and is refused the same way whichever provider would have answered (each
 * provider moderates too; this is the floor, not the only check).
 *
 * Refused: sexual content, anything involving minors and the body, gore and
 * cruelty, hate symbols, self harm, weapons as the subject, drug use, real
 * people's likeness (named public figures, "celebrity", "lookalike"),
 * brands and logos by name, and requests for words in the picture are not
 * refused but removed by the shaping (./prompt.ts says "no text").
 *
 * Pure, so the tests run every rule.
 */

export type PromptVerdict = { ok: true } | { ok: false; reason: string; rule: string }

const RULES: { rule: string; re: RegExp; reason: string }[] = [
  { rule: "sexual", re: /\b(nude|nudity|naked|topless|nsfw|porn\w*|explicit|erotic\w*|sexual\w*|sexy|lingerie model|fetish\w*|onlyfans|genitals?|nipples?)\b/i, reason: "It asks for sexual or nude content." },
  { rule: "minors", re: /\b(child|children|kid|kids|minor|minors|teen|teens|teenager|toddler|baby|babies|schoolgirl|schoolboy|underage|young girl|young boy)\b[^.]{0,40}\b(bikinis?|lingerie|underwear|naked|nude|undress\w*|kiss\w*|sexy|seductive)\b/i, reason: "It puts children in a setting that is not appropriate." },
  { rule: "gore", re: /\b(gore|gory|bloody|bloodied|blood[- ]soaked|blood spatter|corpse|dead body|decapitat\w*|dismember\w*|mutilat\w*|torture\w*|beheading|severed|massacre)\b/i, reason: "It asks for violence or gore." },
  { rule: "hate", re: /\b(swastika|nazi\w*|kkk|white power|confederate flag|isis flag|hate symbol)\b/i, reason: "It asks for a hate symbol." },
  { rule: "self_harm", re: /\b(suicide|self[- ]harm|cutting (her|his|their) (wrists?|arms?)|overdose)\b/i, reason: "It shows self harm." },
  { rule: "weapons", re: /\b((?<!(?:glue|heat|nail|spray|massage|caulk|staple|water|squirt|bubble) )guns?|rifles?|pistols?|handguns?|shotguns?|firearms?|assault weapons?|ak-?47|ar-?15|grenades?|(?<!bath |photo |color |colour |flavou?r )bombs?|explosives?)\b/i, reason: "It makes a weapon the subject." },
  { rule: "drugs", re: /\b(cocaine|heroin|meth|methamphetamine|crack pipe|injecting drugs|snorting|drug use)\b/i, reason: "It shows drug use." },
  { rule: "likeness", re: /\b(celebrit(y|ies)|famous (person|people|actor|actress|singer|athlete)|look-?alike|deepfake|likeness of|in the likeness|resembl\w+ (a )?(famous|celebrity)|real person named)\b/i, reason: "It asks for a real person's likeness." },
  {
    rule: "likeness",
    re: /\b(taylor swift|beyonc[eé]|rihanna|kim kardashian|kanye west|elon musk|jeff bezos|mark zuckerberg|bill gates|donald trump|joe biden|barack obama|kamala harris|putin|zelensky[iy]?|king charles|pope francis|pope leo|cristiano ronaldo|ronaldo|lionel messi|messi|lebron james|michael jordan|serena williams|oprah|tom cruise|brad pitt|angelina jolie|leonardo dicaprio|zendaya|billie eilish|ariana grande|selena gomez|dwayne johnson)\b/i,
    reason: "It names a real person. Pictures never show a real person's likeness.",
  },
  {
    rule: "brand",
    re: /\b(logo|logos|trademark\w*|nike|adidas|puma|reebok|under armour|lululemon|gymshark|apple (logo|watch|iphone|store)|iphone|macbook|coca[- ]cola|pepsi|starbucks|mcdonald'?s|gucci|chanel|louis vuitton|prada|herm[eè]s|dior|rolex|tesla|bmw|mercedes|ferrari|disney|marvel|pixar|pok[eé]mon|nintendo|lego|barbie|ikea|microsoft|facebook|instagram|tiktok|youtube|spotify|netflix|red bull|monster energy)\b/i,
    reason: "It names a brand or a logo. Pictures never show brands or logos.",
  },
]

const NEGATED = /\b(no|without|free of|not|never|zero)\s+(any\s+|visible\s+)?(text|lettering|letters|words|logos?|brands?|branding|brand marks?|trademarks?|watermarks?|signage)\b/gi

/** Whether this prompt may be made into a picture. Empty or very long prompts are refused too. */
export function checkImagePrompt(prompt: string): PromptVerdict {
  const text = String(prompt ?? "").replace(/\s+/g, " ").trim()
  /* "no logos", "without text": what the shaping adds anyway, never a reason to refuse. */
  const asked = text.replace(NEGATED, " ")
  if (text.length < 3) return { ok: false, rule: "empty", reason: "Say what the picture shows." }
  if (text.length > 1_200) return { ok: false, rule: "too_long", reason: "Describe the picture in under 1,200 characters." }
  for (const r of RULES) if (r.re.test(asked)) return { ok: false, rule: r.rule, reason: r.reason }
  return { ok: true }
}

/** Stock search words go through the same floor. */
export const checkPhotoQuery = (query: string): PromptVerdict => checkImagePrompt(query)
