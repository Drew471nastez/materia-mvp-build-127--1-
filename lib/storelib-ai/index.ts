/**
 * ===========================================================================
 *  ONE BRAIN, FOUR SURFACES, TWO VENDORS
 * ===========================================================================
 * Anthropic and OpenAI were never the problem: lib/sites/agent/provider.ts
 * already hands both the same `system` string, and neither adds a word of its
 * own. The problem was that the four places that BUILD that string each had
 * their own idea of what this product is, and three of them had no idea about
 * design at all.
 *
 * So the rules live here, once, and each surface composes the subset that
 * applies to it. A page agent does not need the schema format; the code
 * editor's repair path does not need the page's tool list; neither of them
 * needs the sites agent's React rules.
 *
 * EVERYTHING EXPORTED FROM HERE IS STABLE TEXT. It is identical on every
 * request for the life of a deployment, which is what lets Anthropic cache it
 * as a prefix block and OpenAI cache it under its key. The per-request half
 * of the brain lives in theme-context.ts and knowledge.ts and goes in the
 * turns. Moving any of this the other way would cost a cache hit on every
 * request, so: rules here, facts about THIS site there.
 */

import { DESIGN_RULES, DESIGN_RULES_BRIEF } from "./design"
import { FOLLOW_UP_RULES, INTENT_RULES } from "./intent"
import { AUTHORING_ESSENTIALS, CORE_FORMAT } from "./knowledge"
import { MINIMAL_EDIT_RULES, SOURCE_EDITING_RULES } from "./source-editing"
import { INTEGRATION_CONTRACT } from "./integration"

export { DESIGN_RULES, DESIGN_RULES_BRIEF, DESIGN_SYSTEM_RULES, RESPONSIVE_RULES, SETTINGS_RULES } from "./design"
export { FOLLOW_UP_RULES, INTENT_RULES } from "./intent"
export { ALL_TOPICS, AUTHORING_ESSENTIALS, CORE_FORMAT, knowledgeBlock, knowledgeFor, topicsById, type Topic } from "./knowledge"
export { checkSectionQuality, describeQuality, qualityErrors, type QualityFinding } from "./quality"
export { MINIMAL_EDIT_RULES, SOURCE_EDITING_RULES } from "./source-editing"
export { describeThemeForAuthoring, type ThemeContextInput } from "./theme-context"
export { MAX_REPAIR_ATTEMPTS, validateSection, type Validation } from "./validate"
export { INTEGRATION_CONTRACT, checkSectionIntegration } from "./integration"

/**
 * THE QUALITY CONTRACT, as the model is told it.
 *
 * Every line here is also checked in code, by quality.ts or by the compiler.
 * That is deliberate: saying it makes most files right the first time, and
 * checking it is what makes the rest of them right before anybody sees them.
 * A rule stated and not checked is a rule that is followed about half the
 * time, and nobody can tell which half.
 */
export const SECTION_CONTRACT = `BEFORE YOU CALL A SECTION FINISHED, it must: compile; declare every name its template reads; keep every word, link and picture the creator should change as a setting or a block; read a shared menu from a link_list and products, prices and checkout_url from the store; work when the section is on the page twice, which means no fixed id="…" in the markup and no query outside the script's own root; keep its CSS to itself; use real elements for anything interactive, with alt text on images. Colours, type, buttons, spacing, motion and logo size are the section's own design. A colour may follow the scheme or a color setting the creator overwrites. What is checked, and sent back if it fails, is a file that compiles and live Storelib values, not the look.`

/**
 * The page assistant: tools, a page, and a creator having a conversation.
 *
 * The BRIEF design rules (what outranks what, the machine-made habits, what
 * good looks like), not the whole set: the shared rulebook that follows it
 * in the same prompt (lib/agent-rules, builderAgentRules) carries matching
 * the site's system and phones, and the section-schema advice is a skill the
 * request loads when it is about settings. The same rule twice in one prompt
 * is paid for on every request and read as two rules.
 */
export function pageAgentRules(): string {
  return [INTENT_RULES, FOLLOW_UP_RULES, SOURCE_EDITING_RULES, DESIGN_RULES_BRIEF].join("\n\n")
}

/**
 * Writing one whole section file from a request.
 *
 * This is the only surface that decides everything at once, so it is the only
 * one that gets the authoring facts unconditionally rather than when the
 * request happens to mention them. A new file always has blocks to declare, a
 * scheme to take and a phone to lay out for.
 */
export function writeSectionRules(): string {
  return [CORE_FORMAT, AUTHORING_ESSENTIALS, DESIGN_RULES, SECTION_CONTRACT].join("\n\n")
}

/** Changing a section file that already exists, including a repair. */
export function editSectionRules(): string {
  return [CORE_FORMAT, INTENT_RULES, MINIMAL_EDIT_RULES, SECTION_CONTRACT, INTEGRATION_CONTRACT].join("\n\n")
}

/**
 * The sites agent, which writes React against a Vite project. It shares the
 * taste and nothing else: it has no schema, no colour scheme and no Storelib
 * compiler, so sending it the section contract would be sending it rules
 * about a format it cannot produce.
 */
export function sitesAgentRules(): string {
  return [DESIGN_RULES_BRIEF, INTENT_RULES, FOLLOW_UP_RULES].join("\n\n")
}
