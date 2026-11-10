/**
 * Round P (P2a): the site template library. Whole, original starting sites
 * the agent adapts (./types.ts), the gallery (./registry.ts, ./gallery.ts),
 * the choice (./choose.ts) and the start and the finish check (./apply.ts).
 * The component kit the templates are built with is ./kit.
 *
 * Server and tests: the registry holds every template's files.
 */
export * from "./types"
export { SITE_TEMPLATES, templateById, templateSummary, templateCatalog } from "./registry"
export { chooseTemplate, MIN_SCORE, type TemplateChoice } from "./choose"
export { applyTemplate, untouchedTemplateParts, templatePlan, imageTasks, slotPrompt, tokensFor, pagesWithImages, adaptationBrief, TEMPLATE_SETTING, type ApplyOptions, type ApplyResult, type ImageTask, type UntouchedParts } from "./apply"
export { LIST_TEMPLATES_TOOL, runListTemplates, searchTemplates, templateEntries, templateEntry, templateSuggestion } from "./gallery"
