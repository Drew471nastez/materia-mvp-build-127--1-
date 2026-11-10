/**
 * ===========================================================================
 *  ROUND R (R4): THE SIX BUSINESSES EVERY AI WEBSITE ENGINE IS MEASURED ON
 * ===========================================================================
 * The same six briefs go through both engines (the agent, which writes its
 * own .storelib components from a starting template, and the native engine,
 * which places Storelib's own sections), in the scripted suite
 * (tests/ai-eval-r4.test.ts) and in the live run (scripts/ai-builder/eval.ts
 * --live). The words are what a creator would type on Describe your website.
 *
 * `expect` is what a person who knows the trade would say the site must be,
 * written down before any engine ran: the kind of business, the site story
 * (O5's stories, lib/storelib-ai/layout/stories.ts), the main action and the
 * words the home page must cover. The checks (./checks.ts) hold the outputs
 * to it.
 *
 * Pure data. Browser safe.
 */
import type { BusinessKind } from "@/lib/storelib-ai/direction/brief"

export type EvalScenarioId = "fitness" | "clothing" | "photography" | "skincare" | "architecture" | "consulting"

export interface EvalScenario {
  id: EvalScenarioId
  name: string
  /** What the creator types. */
  prompt: string
  /** The Describe your website chip, when one fits (StartOptions.category). */
  category: string | null
  /** The store's one or two real products (seeded before the build). */
  products: { title: string; priceCents: number; type: "service" | "physical" | "digital" }[]
  expect: {
    /** Business kinds that fit (O2's CreativeBrief.business.kind). */
    kinds: BusinessKind[]
    /** Site stories that fit (O5). */
    stories: string[]
    /** Main actions that fit. */
    objectives: ("book" | "buy" | "enquire" | "join" | "view-work" | "read" | "visit")[]
    /** Words the home page must cover, as patterns over its section names, headings and copy (at least half). */
    covers: { label: string; pattern: RegExp }[]
  }
}

export const EVAL_SCENARIOS: readonly EvalScenario[] = [
  {
    id: "fitness",
    name: "Premium personal fitness coach",
    prompt: "Premium personal fitness coaching in Manchester. One to one strength training, online programmes and a free consultation people can book. I mostly train busy professionals.",
    category: "fitness_coach",
    products: [{ title: "Strength coaching, 12 sessions", priceCents: 72_000, type: "service" }],
    expect: {
      kinds: ["fitness"],
      stories: ["fitness-coach"],
      objectives: ["book"],
      covers: [
        { label: "the coach", pattern: /\bcoach(?:ing)?\b|\btrainer\b/i },
        { label: "how training works", pattern: /\bsessions?\b|\bprogramme|\bprogram\b|\bplan\b|\bmethod\b/i },
        { label: "who it is for", pattern: /\bfor you\b|\bwho\b|\bprofessionals?\b|\bbeginners?\b/i },
        { label: "a consultation to book", pattern: /\bconsult(?:ation)?\b|\bbook\b/i },
        { label: "prices or packages", pattern: /£\s?\d|\bpackages?\b|\bprices?\b|\bper session\b|\bcoaching, 12 sessions\b/i },
      ],
    },
  },
  {
    id: "clothing",
    name: "Contemporary clothing brand",
    prompt: "A contemporary clothing brand from Glasgow: small-batch knitwear, overshirts and outerwear released in seasonal drops. Sell online and tell people when the next drop lands.",
    category: null,
    products: [
      { title: "Boiled wool overshirt", priceCents: 18_500, type: "physical" },
      { title: "Lambswool crew knit", priceCents: 12_900, type: "physical" },
    ],
    expect: {
      kinds: ["fashion"],
      stories: ["product-brand"],
      objectives: ["buy"],
      covers: [
        { label: "the collection or drop", pattern: /\bdrops?\b|\bcollection\b|\bseason/i },
        { label: "the products", pattern: /\bknit|\bovershirt|\bouterwear|\bjacket|\bwool/i },
        { label: "how it is made", pattern: /\bmade\b|\bsmall[- ]batch\b|\bmill\b|\bfabric|\byarn/i },
        { label: "shop", pattern: /\bshop\b|\bbuy\b|\badd to (?:bag|cart)\b/i },
        { label: "the next drop sign-up", pattern: /\bnewsletter\b|\bsign up\b|\bemail\b|\bnext drop\b/i },
      ],
    },
  },
  {
    id: "photography",
    name: "Editorial photography portfolio",
    prompt: "An editorial photography portfolio for a London photographer working on fashion stories and documentary commissions. Show the work first, take commission enquiries and sell a few signed prints.",
    category: "photographer",
    products: [{ title: "Signed print, Thames at dawn", priceCents: 24_000, type: "physical" }],
    expect: {
      kinds: ["photography"],
      stories: ["photographer"],
      objectives: ["book", "enquire", "view-work"],
      covers: [
        { label: "the work", pattern: /\bwork\b|\bseries\b|\bstor(?:y|ies)\b|\bportfolio\b|\bgallery\b/i },
        { label: "commissions", pattern: /\bcommission|\benquir|\bbook(?:ing)?\b|\bavailab/i },
        { label: "the photographer", pattern: /\babout\b|\bphotographer\b|\bstudio\b/i },
        { label: "prints", pattern: /\bprints?\b|\bshop\b|\bedition/i },
      ],
    },
  },
  {
    id: "skincare",
    name: "Luxury skincare",
    prompt: "A luxury skincare brand: a face oil, a serum and a cleansing balm made in small batches in Copenhagen. Sell the products online, with the ritual and the ingredients explained.",
    category: null,
    products: [
      { title: "Night face oil, 30 ml", priceCents: 6_800, type: "physical" },
      { title: "Barrier serum, 30 ml", priceCents: 5_900, type: "physical" },
      { title: "Cleansing balm, 100 ml", priceCents: 4_200, type: "physical" },
    ],
    expect: {
      kinds: ["beauty", "wellness"],
      stories: ["product-brand", "wellness-studio"],
      objectives: ["buy"],
      covers: [
        { label: "the products", pattern: /\boil\b|\bserum\b|\bbalm\b|\bproducts?\b/i },
        { label: "the ritual", pattern: /\britual\b|\broutine\b|\bsteps?\b|\bhow to use\b/i },
        { label: "the ingredients", pattern: /\bingredients?\b|\bformula|\bsqualane\b|\bniacinamide\b|\bjojoba\b/i },
        { label: "shop", pattern: /\bshop\b|\bbuy\b|\badd to (?:bag|cart)\b/i },
      ],
    },
  },
  {
    id: "architecture",
    name: "Modern architecture studio",
    prompt: "A modern architecture studio in Rotterdam designing homes and small cultural buildings. Show the projects, the practice and how to start a commission.",
    category: null,
    products: [{ title: "Feasibility study", priceCents: 250_000, type: "service" }],
    expect: {
      kinds: ["architecture"],
      stories: ["architect"],
      objectives: ["enquire", "book", "view-work"],
      covers: [
        { label: "the projects", pattern: /\bprojects?\b|\bwork\b|\bhouse\b|\bbuildings?\b/i },
        { label: "the practice", pattern: /\bpractice\b|\bstudio\b|\bteam\b|\babout\b/i },
        { label: "how a commission works", pattern: /\bcommission|\bprocess\b|\bstages?\b|\bfeasibility\b|\bbrief\b/i },
        { label: "contact", pattern: /\bcontact\b|\benquir|\bstart\b|\bwrite\b/i },
      ],
    },
  },
  {
    id: "consulting",
    name: "Professional consulting",
    prompt: "Professional consulting for mid-size manufacturers: operations, pricing and finance projects led by two senior partners. Visitors should book an intro call.",
    category: null,
    products: [{ title: "Operations diagnostic", priceCents: 600_000, type: "service" }],
    expect: {
      kinds: ["professional", "agency"],
      stories: ["local-professional", "agency"],
      objectives: ["enquire", "book"],
      covers: [
        { label: "the services", pattern: /\boperations\b|\bpricing\b|\bfinance\b|\bservices?\b/i },
        { label: "who it is for", pattern: /\bmanufactur|\bfactor(?:y|ies)\b|\bplants?\b/i },
        { label: "how an engagement runs", pattern: /\bdiagnostic\b|\bprocess\b|\bhow we work\b|\bweeks?\b|\bproject\b/i },
        { label: "the partners", pattern: /\bpartners?\b|\babout\b|\bteam\b/i },
        { label: "an intro call", pattern: /\bintro call\b|\bbook\b|\bcall\b/i },
      ],
    },
  },
]

export function scenarioById(id: string): EvalScenario | undefined {
  return EVAL_SCENARIOS.find((s) => s.id === id)
}
