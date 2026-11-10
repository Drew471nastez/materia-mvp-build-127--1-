/**
 * ===========================================================================
 *  CRAFT PRINCIPLES FROM OPEN-SOURCE DESIGN GUIDES, CONDENSED
 * ===========================================================================
 * Hand-condensed from two open-source skills that teach agents taste. Each
 * record is a short restatement of one rule set, with the file it came from
 * and the commit read, so it can be checked against the source:
 *
 *   Leonxlnx/taste-skill   MIT License, Copyright (c) 2026 Leonxlnx
 *   pbakaus/impeccable     Apache License 2.0 (its NOTICE.md credits ehmo's
 *                          platform-design-skills, MIT, for the iOS and
 *                          Android files, which are NOT used here)
 *
 * Licences read from each repository's LICENSE on 2026-11-10; full texts in
 * ./vendor/NOTICE.md. The text here is a condensation in Storelib's words
 * (Apache-2.0 section 4(b): this file states that it was changed), and the
 * rules are adapted to Storelib (a section, the editor, its hooks).
 *
 * Pure data. Browser safe.
 */
import type { DesignReference, ReferenceRole } from "./types"

const TASTE = { repo: "Leonxlnx/taste-skill", commit: "f6b76575f949707b4e3c37cd86cb44b0b98643e8", licence: "MIT", notice: "Condensed from taste-skill, MIT License, Copyright (c) 2026 Leonxlnx. Changed: restated and adapted for Storelib." }
const IMPECCABLE = { repo: "pbakaus/impeccable", commit: "ec229b48547f24685ffb22aa51c462c5ae27908c", licence: "Apache-2.0", notice: "Condensed from impeccable (github.com/pbakaus/impeccable), Apache License 2.0. Changed: restated and adapted for Storelib." }

interface P {
  from: typeof TASTE | typeof IMPECCABLE
  path: string
  id: string
  title: string
  summary: string
  tags: string[]
  borrow: string[]
  avoid: string[]
  roles: ReferenceRole[]
  industries?: string[]
}

function principle(p: P): DesignReference {
  const dir = p.from === TASTE ? "skills/taste-skill/references" : "skill/reference"
  return {
    id: p.id,
    version: 1,
    kind: "principle",
    title: p.title,
    summary: p.summary,
    styleTags: p.tags,
    industries: p.industries ?? [],
    tone: [],
    density: "unknown",
    palette: { mode: "unknown", colors: [], strategy: "" },
    type: { display: "", body: "", strategy: "" },
    layout: { topology: "", hero: "", grid: "", rhythm: "" },
    imagery: "",
    motion: { character: "", evidence: "unknown", ideas: [] },
    details: [],
    borrow: p.borrow,
    avoid: p.avoid,
    fitsPoorly: [],
    roles: p.roles,
    source: { origin: "vendored", url: `https://github.com/${p.from.repo}/blob/${p.from.commit}/${dir}/${p.path}`, subject: null, creator: p.from.repo.split("/")[0], capturedAt: null },
    rights: { usage: "reusable", licence: p.from.licence, mayRedistribute: true, notice: p.from.notice, permissionEvidence: null },
    provenance: { addedBy: "storelib", addedAt: "2026-11-10", repo: p.from.repo, commit: p.from.commit, path: `${dir}/${p.path}#${p.id}`, analysisModel: null, verifiedByHuman: true },
    quality: 4,
    image: null,
    enabled: true,
  }
}

export const PRINCIPLE_REFERENCES: DesignReference[] = [
  principle({
    from: IMPECCABLE,
    path: "craft-floor.md",
    id: "ref_pr-craft-floor",
    title: "The craft floor: what every page must get right",
    summary: "Before a page counts as done: body text at 4.5:1 and large text at 3:1, shadows with an offset and soft blur (never a zero offset coloured halo), tight groups with generous separation and more space above a heading than below it, body measure of 65 to 75 characters, every state (hover, disabled, loading, error, empty) designed, and the browser's own surfaces (selection colour, caret, focus ring, scrollbars, tabular numerals) themed from the palette.",
    tags: ["craft", "accessibility", "typography", "states", "polish"],
    borrow: ["Theme selection, caret and focus ring from the palette: the cheapest sign a page was built rather than assembled.", "Tint secondary text from the surface hue instead of using grey on colour.", "One authored motion moment, eased out from an already visible state."],
    avoid: ["Shipping with default browser surfaces", "Grey text on coloured backgrounds", "The same entrance animation on every section"],
    roles: ["functional"],
  }),
  principle({
    from: IMPECCABLE,
    path: "craft-floor.md",
    id: "ref_pr-refuse-scaffolds",
    title: "Page scaffolds a designer refuses by default",
    summary: "Defaults that read as a template unless the brief earns them: same size cards of icon, heading and text as the page structure; nested cards; the hero metric block (big number, small label, supporting stats); a small label or eyebrow above every heading; section numbers that carry no real sequence; a modal for a task that needs no interruption.",
    tags: ["anti-slop", "layout", "cards", "eyebrow"],
    borrow: ["Let the heading carry its own weight; delete the label above it.", "Use cards only for genuinely equivalent, clickable items."],
    avoid: ["Identical card grids as structure", "Eyebrow labels above every heading", "01 / 02 / 03 numbering without a sequence"],
    roles: ["composition"],
  }),
  principle({
    from: IMPECCABLE,
    path: "craft-floor.md",
    id: "ref_pr-refuse-surfaces",
    title: "Surface habits that read as machine made",
    summary: "Gradient text; glass and blur as decoration; a coloured left or right border thicker than 1px on cards and callouts; hard offset block shadows outside a page that is truly neo-brutalist; sparklines and progress rings standing in for content; monospace worn as a costume for 'technical'; a system face (Arial Black, the platform sans) as the display voice; emoji or unicode glyphs instead of drawn icons.",
    tags: ["anti-slop", "surfaces", "type", "icons"],
    borrow: ["Emphasis from weight and size, not gradient fills.", "Monospace only for code, data and measurements.", "One icon set, one stroke weight."],
    avoid: ["Gradient text", "Decorative glassmorphism", "Side stripe borders on cards", "Mono uppercase captions as decoration"],
    roles: ["identity"],
  }),
  principle({
    from: IMPECCABLE,
    path: "typeset.md",
    id: "ref_pr-type-system",
    title: "Set a type system with the fewest roles that make hierarchy obvious",
    summary: "Name the roles the page needs (display, heading, body, label, data), make adjacent roles clearly different by combining size, weight, space and tone, keep body at 16px or more with a 45 to 75 character measure, tune line height to measure (wider lines need more leading), give light text on dark a little more leading, tracking and weight, use tabular figures for numbers that line up, and load only the weights used.",
    tags: ["typography", "hierarchy", "readability"],
    borrow: ["Line height tuned to the face and measure, not a universal ratio.", "Tabular figures in prices and timetables.", "A second family only when it has a job the first cannot do."],
    avoid: ["Adjacent sizes too close to signal a different role", "Decorative type that costs comprehension"],
    roles: ["identity"],
  }),
  principle({
    from: IMPECCABLE,
    path: "layout.md",
    id: "ref_pr-layout-rhythm",
    title: "Layout by meaning: proximity, rhythm and honest structure",
    summary: "Squint test: with detail blurred the primary element, the secondary one and the groups must still read in order. Group by proximity before adding containers. Make rhythm from deliberate contrast between tight and generous intervals on a 4 based spacing scale. Repeat cards or columns only when the items are genuinely equivalent. Check the structure at narrow, wide, zoomed and long content states, and keep focus order matching visual order.",
    tags: ["layout", "spacing", "rhythm", "responsive"],
    borrow: ["Tight inside a group, generous between groups.", "Alternate dense and breathing sections."],
    avoid: ["One spacing value everywhere so everything has equal weight", "Containers compensating for weak grouping"],
    roles: ["composition"],
  }),
  principle({
    from: TASTE,
    path: "motion.md",
    id: "ref_pr-motion-three-layers",
    title: "Motion in three places only: entrance, one moment, hover",
    summary: "A page moves in three layers: the hero's entrance once on load (headline line by line, then lead and buttons, about a second, then still), one memorable moment in a section of its own (two on a long page), and a hover and press layer on every link and button. Scrolling does not fade or stagger every card in; text never parallaxes; the page is never scroll jacked. Every motion has a written purpose, and content is readable with scripts off and under reduced motion.",
    tags: ["motion", "restraint", "reduced-motion", "hero"],
    borrow: ["Name each motion and its purpose in a few words; cut motion with no purpose.", "A moment may pin its own section with position: sticky while the page scrolls natively."],
    avoid: ["Stock scroll reveals on every card", "Parallax on text", "Carousels that advance by themselves, logo marquees", "Magnetic buttons and cursor followers"],
    roles: ["motion"],
  }),
  principle({
    from: TASTE,
    path: "photos.md",
    id: "ref_pr-photographs-first",
    title: "A place is its photographs; software leads with its real interface",
    summary: "A cafe, studio, shop or guesthouse is shown through its own photographs, two or three per screen; software shows its real interface; a game shows its own art. Library stock fills detail slots only (hands, tools, materials), never the hero, a room, a product or a person. With no photographs yet, say so to the creator and design a labelled, editable empty state in the editor, never a grey box or instructions in the published copy.",
    tags: ["photography", "imagery", "placeholders"],
    borrow: ["The creator's own photos lead; stock only for details.", "One consistent backdrop for product photos."],
    avoid: ["Stock people smiling at laptops", "Visible 'add your photo here' copy in the site", "An effect or a drawing where a photograph belongs"],
    roles: ["identity"],
  }),
  principle({
    from: TASTE,
    path: "layout-v4.md",
    id: "ref_pr-section-per-screen",
    title: "Plan the page as screens: one section per screen, a hero alone",
    summary: "Good marketing pages give the hero the first screen to itself and size each later section to roughly one or two screens, with clear space between, so any screenshot shows one idea. Plan the page as a list of screens before building, keep the shell to header, main and footer (no popups, chat bubbles or award strips), and let heights and padding create the look.",
    tags: ["layout", "page rhythm", "hero", "sections"],
    borrow: ["List the screens before writing sections.", "Give the hero the whole first screen on desktop and phone."],
    avoid: ["Half a section peeking under the hero by accident", "Fixed widgets competing with the content"],
    roles: ["composition"],
  }),
  principle({
    from: TASTE,
    path: "copy-tells.md",
    id: "ref_pr-copy-tells",
    title: "Copy tells that mark a page as generated",
    summary: "Headings built as two fragments or a number pair, 'not X, but Y' contrast frames, runs of negations, virtue words (seamless, effortless, elevate), invented brand names, and repeated promises. Write in the business's own words: a control names its action, a heading says something only this business could say.",
    tags: ["copy", "anti-slop", "voice"],
    borrow: ["Button labels that name the action ('Book a session', 'Play the demo').", "Specific facts over adjectives."],
    avoid: ["'Elevate your X' and 'Transform your Y'", "Contrast frame headings", "Made up brand or product names"],
    roles: ["identity", "functional"],
  }),
]
