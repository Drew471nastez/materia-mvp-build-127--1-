/**
 * ===========================================================================
 *  WHAT A REQUEST FOR A NEW SECTION IS FOR, IN MATERIA'S WORDS (round 69)
 * ===========================================================================
 * "Add a newsletter signup below this" on a site made from one of Storelib's
 * templates went to the section writer, which wrote a brand new file from
 * nothing: a section in no template's style, beside sections that all come
 * from the Materia theme. Materia already has sections for that job, in 37
 * templates' worth of designs. The router could not tell, because it matched
 * the words against type names ("newsletter-signup-2" is not "newsletter").
 *
 * This reads the request for its purpose, using the same purposes the
 * catalogue sorts sections into (lib/storelib-ai/materia/build.ts PURPOSES).
 * Small and pure, so the browser's early guess (ask-route.ts writerAtOnce)
 * can run it too without loading the catalogue.
 */

const RULES: [RegExp, string][] = [
  [/\b(?:faqs?|questions?|q ?& ?a|frequently asked)\b/i, "faq"],
  [/\b(?:testimonials?|reviews?|quotes?|what (?:people|clients|customers) say|kind words|feedback)\b/i, "testimonials and reviews"],
  [/\b(?:pricing|prices|price list|plans?|tiers?|packages|comparison|compare|rates)\b/i, "comparison and pricing"],
  [/\b(?:countdown|timer|launch date|ends in)\b/i, "countdown"],
  [/\b(?:newsletter|sign ?up|subscribe|email (?:capture|list|form)|mailing list|contact(?: form)?|enquir(?:y|ies)|booking form|book a call|map|address|opening hours|hours|location|find us)\b/i, "newsletter and contact"],
  [/\b(?:steps?|how it works|how we work|process|timeline|journey|curriculum|modules?|schedule|itinerary)\b/i, "steps and timeline"],
  [/\b(?:features?|benefits?|why us|why choose|usps?|trust|guarantees?|values|stats|numbers|icons?)\b/i, "features and benefits"],
  [/\b(?:gallery|photos|pictures|images|portfolio|lookbook|mosaic|instagram|before and after|slideshow|carousel)\b/i, "media and gallery"],
  [/\b(?:video|film|reel|youtube|vimeo|vsl)\b/i, "video"],
  [/\b(?:marquee|ticker|logos?|press|as seen|partners?|brands we)\b/i, "marquee and logos"],
  [/\b(?:about|our story|story|founder|team|meet|who we are|bio|instructor|teacher|maker)\b/i, "image with text"],
  [/\b(?:products?|best ?sellers?|new arrivals|shop|featured items?|collection grid)\b/i, "products"],
  [/\b(?:collections?|categories)\b/i, "collections"],
  [/\b(?:banner|call to action|cta|promo|offer|announcement)\b/i, "call to action"],
  [/\b(?:hero|header image|opening section|top of the page banner)\b/i, "hero"],
  [/\b(?:blog|articles?|journal|posts?)\b/i, "blog"],
  [/\b(?:text|story|statement|letter|manifesto|mission|rich text|paragraph)\b/i, "text and story"],
]

/** The catalogue purpose the words ask for, or null when they name none. */
export function purposeOfWords(text: string): string | null {
  const said = text.replace(/\s+/g, " ")
  for (const [re, purpose] of RULES) if (re.test(said)) return purpose
  return null
}
