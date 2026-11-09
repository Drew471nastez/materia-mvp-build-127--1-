/**
 * ===========================================================================
 *  START WITH AI: THE STUDIO'S OWN RULES, ON THE SERVER
 * ===========================================================================
 * The owner wants every generated site to look designed by a person, and
 * Storelib's own product follows a written set of rules for that (CLAUDE.md,
 * "design, UX, copywriting, and anti-AI-slop rules"). This is those rules,
 * distilled for a model that is designing someone else's website rather than
 * Storelib's interface: the same refusals (purple gradients, glass, giant
 * generic heroes, identical cards, pills and icons on everything, hype
 * words, em dashes), said as what to do instead.
 *
 * It goes into the planner's system prompt and into every section the coder
 * writes, and the same banned words and placeholder shapes are checked in
 * code afterwards (`slopIn`, `placeholderIn`), because a rule a model was
 * told is a rule it sometimes forgets.
 *
 * PURE TEXT AND TWO REGEXES. Stable, so it sits in the cached prefix.
 */

export const STUDIO_CRAFT = `HOW THIS STUDIO DESIGNS (the client has seen a hundred sites a machine made and will not accept another)
START FROM THE PERSON, NOT THE COMPONENTS. Decide who arrives, what they need to believe and the one thing they should do. Hierarchy follows from that: one clear first message, then proof, then the details, then the ask. Remove a section before adding one; every section must earn its place by moving the visitor toward the ask.
NEVER THE EASY DEFAULT:
- No purple, violet or indigo gradients, no gradient text, no neon glow, no glassmorphism, no frosted panels.
- No giant generic hero: a full-screen gradient with a centred slogan and two buttons is the most common AI page there is. Open on this business's real subject (the work, the place, the result, the product) with a specific headline.
- No bento grids, no rows of identical cards, no card inside a card. Use the number of items the content has and vary the shape down the page.
- No excessive rounding: buttons and inputs around 4-10px, images at most 16px unless the brand is soft by intent. No pill on everything.
- No random badges or eyebrow chips above every heading, no icon beside every label, no numbered 01/02/03 markers that say nothing.
- No decorative whitespace and no filler sections. Spacing follows one scale; dense where there is a lot to read, open where one thing matters.
- No fake metrics, invented testimonials, made-up client logos or star ratings. Real facts from the store, or none.
COPY IS SPECIFIC, COMPACT AND NATURAL. Name the thing that happens ("Book a free first call", "See this week's classes"). Write as the owner would say it out loud. Never: unlock, elevate, seamless, powerful, effortless, effortlessly, supercharge, transform, game changer, cutting edge, next level, empower, streamline. No em dashes and no needless hyphens: use a comma or a full stop. No "Welcome to our website", no "Learn more" or "Click here".
REVIEW YOUR OWN WORK: before you answer, look at it as the client would. If it could belong to any business, it is wrong: change the layout, the type scale or the words until it could only be this one.`

/** Words the studio never ships, as whole words. Shared with the deterministic check. */
export const BANNED_COPY = /\b(unlock(s|ed|ing)?|elevat(e|es|ed|ing)|seamless(ly)?|powerful(ly)?|effortless(ly)?|supercharg(e|es|ed|ing)|transform(s|ed|ing|ative)?|game[- ]?changer|cutting[- ]edge|next[- ]level|empower(s|ed|ing)?|streamlin(e|es|ed|ing))\b/i

/** Text a writer leaves when it did not finish: lorem ipsum, TODO, square bracket slots, "Your heading here". */
export const PLACEHOLDER_COPY = /(lorem ipsum|dolor sit amet|\bTODO\b|\bTBD\b|\bFIXME\b|\[(?:your|insert|add|company|brand|name|title|image|heading|text)[^\]]{0,40}\]|\{\{\s*placeholder|\byour (?:heading|title|text|tagline|company name|brand name) here\b|\bheading goes here\b|\btext goes here\b|\bplaceholder text\b|\bexample\.com\b)/i

/** The first banned word in `text`, or null. Markup is ignored. */
export function slopIn(text: string): string | null {
  const plain = text.replace(/<[^>]*>/g, " ")
  const m = BANNED_COPY.exec(plain)
  if (m) return m[0]
  return /\u2014/.test(plain) ? "an em dash" : null
}

/** The first placeholder in `text`, or null. */
export function placeholderIn(text: string): string | null {
  const m = PLACEHOLDER_COPY.exec(text.replace(/<[^>]*>/g, " "))
  return m ? m[0] : null
}
