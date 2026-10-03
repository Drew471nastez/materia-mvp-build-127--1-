/**
 * ===========================================================================
 *  THE DESIGN GUARDRAILS, SHARED BY EVERY MODEL THIS PRODUCT TALKS TO
 * ===========================================================================
 * A section can compile, use the right colour scheme, be perfectly responsive
 * and still look machine-made. What gives it away is a short and remarkably
 * stable list of habits: a gradient nobody asked for, a glow, everything at
 * rounded-2xl, an eyebrow chip above every heading, three cards whatever the
 * content is, invented testimonials with invented names.
 *
 * Two public catalogues of those habits informed this list:
 *   no-slop-ui            github.com/LeoStehlik/no-slop-ui
 *   signs-of-ai-design    github.com/febbhav/signs-of-ai-design
 *
 * GUARDRAILS, NOT BANS, and the difference matters. "Never use a gradient"
 * turns into a model arguing with a creator who asked for a gradient, which
 * is worse than the gradient. These are defaults for when nobody has said
 * otherwise; an explicit request and the site's own established design both
 * outrank every line of it.
 *
 * PURE TEXT, in the stable system prefix, so it is cached rather than resent.
 */

/**
 * WHAT OUTRANKS WHAT. First, because a rule list read without it is a rule
 * list that will be applied over somebody's explicit instruction.
 */
const PRIORITY = `TWO THINGS OUTRANK EVERY DESIGN RULE BELOW: what the creator explicitly asked for, and what this site has already established. Somebody who asks for a gradient gets a gradient. A site already built on pill buttons keeps pill buttons. These are defaults for the decisions nobody has made yet, not a house style to impose on work that already has one.`

/**
 * The habits, named specifically. A general instruction to "avoid generic AI
 * design" is agreeable and changes nothing; the named ones change output.
 */
const AVOID = `AVOID THE THINGS THAT MAKE A PAGE READ AS MACHINE-MADE, unless asked for or already the site's style:
- Decorative gradients, gradient text, and coloured glows behind cards.
- Glassmorphism and frosted panels.
- Everything at a large corner radius. Buttons and inputs sit around 6-10px; a card is not a pill.
- Eyebrow chips and badges above headings, and numbered markers like 01 / 02 / 03, when they carry no information.
- Three cards in a row as the answer to every layout. Use the number the content has.
- Icon tiles stacked above every heading, and the same four icons everywhere.
- Headings sized for a screenshot rather than for reading.
- Invented social proof of any kind: testimonials with made-up names, statistics nobody measured, logos of companies that are not customers, star ratings with no reviews behind them.
- Copy that would fit any business. "Streamline", "unlock", "elevate", "seamless", "transform", "empower". Write about this business instead.
- One-hue purple-and-indigo palettes, and neon on near-black, chosen as a default rather than because the brand is that.`

const INSTEAD = `WHAT GOOD LOOKS LIKE HERE: solid surfaces, restrained borders, shadows you have to look for. A clear type hierarchy doing the work that decoration was doing. Generous, consistent spacing on a scale the rest of the page already uses. Layouts that are simple on purpose, where every visual choice has a reason you could say out loud. If you cannot say why something is there, take it out.`

/**
 * The part that is specific to this product rather than to taste. A section
 * that hardcodes #6b7280 is not ugly, it is BROKEN: it stops responding to
 * the theme, and the creator's colour scheme silently no longer applies to it.
 */
const SYSTEM = `USE THE SITE'S OWN DESIGN SYSTEM RATHER THAN INVENTING ONE:
- COLOUR comes from the colour scheme. A visual section declares a color_scheme setting and reads scheme.background, scheme.text, scheme.text_muted, scheme.heading, scheme.border, scheme.accent, scheme.link, scheme.primary_button_background, scheme.primary_button_text. The shorter aliases bg, paragraph, primary_btn_bg and primary_btn_text also resolve, because older themes are written that way. Hardcoding a hex value opts that section out of the creator's theme, which is a fault, not a style. Then give each element the section draws its own color setting (heading, text, buttons and their text, cards, borders), each defaulting to the scheme colour it follows ("default": "scheme.heading"), so it matches the scheme until the creator picks a colour of their own for that one element.
- TYPE comes from the theme's fonts and type scale. Do not name a font family inside a section. Expose a type override only when there is a real reason, not as a matter of course.
- BUTTONS use the theme's button styles. Do not build a private button system inside each section.
- SPACING, RADIUS AND BORDERS come from the theme's tokens and the spacing values the rest of the page uses.
- MATCH THE PAGE THIS WILL SIT ON. Reuse a colour that is already there rather than one three shades off it. Follow the background rhythm the page has. Coherence comes from a small vocabulary used consistently.`

/**
 * Settings are the product's surface, and the fastest way to make a section
 * feel amateur is to expose the CSS box model through it. A creator picks a
 * layout; they do not pick a flex-basis.
 */
const SETTINGS = `SETTINGS ARE MERCHANT CHOICES, NOT CSS PROPERTIES. Good: colour scheme, layout, alignment, columns, content width, desktop spacing, mobile spacing, image position, slider speed and direction, whether the first item starts open. Bad: flex-direction, z-index, letter-spacing, a raw class name, anything that only means something to whoever wrote the CSS.
- Most visual sections start with colour scheme, content width, alignment, desktop spacing and mobile spacing, then whatever is specific to that section and nothing more.
- Different sections get different settings. An FAQ needs a style, an icon, and whether the first answer is open. A marquee needs direction, speed and gap. Testimonials need columns and whether ratings show. A hero needs layout, media position and heading size. Do not give them all the same list.
- A section must look finished with its defaults, before anybody opens the settings panel.`

const RESPONSIVE = `MOBILE IS DESIGNED, NOT SHRUNK. Write the phone layout first and let the wider ones be the addition. Decide, per section: what stacks and in what order, how wide text runs, what spacing changes, whether a grid becomes a slider, how images crop, and that nothing scrolls sideways. Touch targets stay comfortable. A desktop layout with smaller text is not a mobile design.`

/** Everything, for the surfaces that write whole sections. */
export const DESIGN_RULES = [PRIORITY, AVOID, INSTEAD, SYSTEM, SETTINGS, RESPONSIVE].join("\n\n")

/**
 * The subset for surfaces that do not author section files: the page agent
 * choosing settings and writing copy, and the sites agent, which has its own
 * format. Schema advice there is noise, and noise in a cached prefix is paid
 * for on every request for the life of the deployment.
 */
export const DESIGN_RULES_BRIEF = [PRIORITY, AVOID, INSTEAD].join("\n\n")

/** Colour, type, buttons and tokens, for surfaces inside the theme system. */
export const DESIGN_SYSTEM_RULES = SYSTEM

/** What a setting is for, for surfaces that can change a schema. */
export const SETTINGS_RULES = SETTINGS

/** How to think about widths, for anything that writes layout. */
export const RESPONSIVE_RULES = RESPONSIVE
