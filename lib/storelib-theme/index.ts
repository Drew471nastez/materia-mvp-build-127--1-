/**
 * The Storelib theme engine. Imports nothing from the application: no
 * editor, no renderers, no Supabase. See docs/theme/.
 */
export * from "./types"
export { CONTROLS, CONTROL_TYPES, LEGACY_TYPE_ALIASES, controlFor, controlsAsJson, controlsAsMarkdown, holdsValue, resolveControlType } from "./controls/registry"
export type { ControlDefinition, ControlType, ValueKind } from "./controls/registry"
export { validateSectionSchema } from "./schema/validate"
export { parseSchemaJson, parseStorelib } from "./storelib/parse"
export { compileTemplate, renderTemplate, pathsRead, FILTER_NAMES, embedUrl, EMBED_ALLOWED } from "./storelib/template"
export type { CompiledTemplate } from "./storelib/template"
export { scopeCss, cssForInstance, scopeSelector, SCOPE_PLACEHOLDER } from "./storelib/css"
export { checkScript, CAPABILITIES, FORBIDDEN_IDENTIFIERS, SCRIPT_CONTEXT } from "./storelib/script"
export type { Capability } from "./storelib/script"
export { compileSection, createCompileCache, createLru, COMPILE_CACHE_LIMIT, sourceHash } from "./storelib/compile"
export { resolveInstance, resolveOne, resolveSettings, stripDefaults, fillResponsive, themeTokens } from "./resolve"
export { renderSection } from "./render"
export type { Rendered, RenderInput } from "./render"
export { buildLibrary, allowedOn, templatesUsing, sectionTypeFromPath } from "./discovery"
export type { Library, LibraryEntry } from "./discovery"
export { buildPackage, readPackage, templateFromSections, sectionsFromTemplate, sha256, assetPath, mimeForExt, isSafeThemePath, assetRefsIn } from "./package"
export type { ThemePackage, PackageAsset, PackageManifest, ReadPackage } from "./package"
