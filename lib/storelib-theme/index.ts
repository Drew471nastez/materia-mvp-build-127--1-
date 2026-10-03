/**
 * The Storelib theme engine. Imports nothing from the application: no
 * editor, no renderers, no Supabase. See docs/theme/.
 */
export * from "./types"
export { CONTROLS, CONTROL_TYPES, LEGACY_TYPE_ALIASES, SHOPIFY_TYPE_ALIASES, UNSUPPORTED_TYPES, controlFor, controlsAsJson, controlsAsMarkdown, holdsValue, resolveControlType } from "./controls/registry"
export type { ControlDefinition, ControlType, ValueKind } from "./controls/registry"
export { validateSectionSchema, validateBlockSchema, acceptsType } from "./schema/validate"
export { parseSchemaJson, parseStorelib } from "./storelib/parse"
export { compileTemplate, renderTemplate, pathsRead, contentForRefs, FILTER_NAMES, embedUrl, EMBED_ALLOWED } from "./storelib/template"
export type { CompiledTemplate } from "./storelib/template"
export { scopeCss, cssForInstance, cssForBlockInstance, blockScope, scopeSelector, SCOPE_PLACEHOLDER, BLOCK_PLACEHOLDER } from "./storelib/css"
export { checkScript, CAPABILITIES, FORBIDDEN_IDENTIFIERS, SCRIPT_CONTEXT } from "./storelib/script"
export type { Capability } from "./storelib/script"
export { compileSection, compileBlock, compileThemeFile, createCompileCache, createLru, COMPILE_CACHE_LIMIT, sourceHash } from "./storelib/compile"
export { resolveInstance, resolveOne, resolveSettings, stripDefaults, fillResponsive, themeTokens } from "./resolve"
export type { CatalogItem, ResolveOptions, ResolvedBlock } from "./resolve"
export { BLOCK_PATH, blockTypeFromPath, blockSourcePath, isPrivateBlock, presetTree, listFromPreset, keyedFromList, listFromKeyed, countBlocks, blockDepth } from "./blocks"
export type { ListBlock, PresetNode } from "./blocks"
export {
  Linked, SAFE_HREF, safeHref, isSafeHref, safeMediaUrl, isColor, cleanBackground, cleanFocalPoint, sanitizeInlineHtml,
  INLINE_TAGS, plainText, decodeEntities, parseVideoUrl, VIDEO_HOSTS, parseDatetime, cleanDatetime, formatDatetime,
  cleanMenu, cleanMenus, MENU_LIMITS, MENU_HANDLE,
} from "./values"
export type { Menu, MenuLink, VideoLink, VideoHost, DateParts } from "./values"
export {
  DYNAMIC_SOURCES, SOURCE_TARGETS, dynamicSource, sourcesIn, wholeSource, placeholderFor, sourcesFor, fillSources,
  targetIsWhole, describePlaceholders,
} from "./dynamic"
export type { DynamicSource, DynamicContext, SourceKind, SourceTarget } from "./dynamic"
export { renderSection } from "./render"
export { chromeRoleOf, chromeRefusal, declaredKind, kindTaken, CHROME_TYPES } from "./chrome"
export type { ChromeRole } from "./chrome"
export {
  GROUP_ORDER, GROUP_LABELS, kindOf, sectionGroupsFor, groupOf, isKind, splitGroups, orderByGroup, inGroup,
  placeSection, visibleOfKind, toggleShown, repairChrome, kindOfSource, kindLookup,
} from "./section-groups"
export type { SectionGroup, SectionKind, KindOfType, GroupedSection, Placement, Repair } from "./section-groups"
export {
  SCHEME_COLOR_KEYS, SCHEME_COLOR_LABELS, SCHEME_COLOR_GROUPS, SECTION_OVERRIDE_KEYS, SCHEME_CSS_VARS, SCHEME_GRADIENT_VAR,
  BUILT_IN_SCHEME_KEYS, DEFAULT_COLOR_SCHEMES, FALLBACK_SCHEME_KEY, LEGACY_TO_SEMANTIC, LEGACY_FIXED,
  normalizeScheme, newSchemeFrom, themeColorSchemes, isBuiltInScheme, defaultSchemeKey, sectionOverrides,
  resolveSectionColors, schemeVars, legacySchemeValues, styleAttr, remapScheme, stripSchemeDefaults,
} from "./color-schemes"
export type { ColorScheme, SchemeColorKey, BuiltInSchemeKey, ResolvedSectionColors } from "./color-schemes"
export {
  TYPE_STYLE_KEYS, TYPE_STYLE_LABELS, FONT_ROLES, TEXT_TRANSFORMS, TYPE_BREAKPOINTS, DEFAULT_TYPE_STYLES,
  SECTION_HEADING_STYLES, SECTION_BODY_STYLES, responsiveSize, normalizeTypeStyle, baseTypeStyles, themeTypography,
  stripTypeStyleDefaults, fontVars, typographyVars, typographySizeVars, sectionTypography, typographyStylesheet,
} from "./typography"
export type { TypeStyle, TypeStyleKey, FontRole, TextTransform, ResponsiveSize, ThemeFonts, ThemeTypography, SectionTypography } from "./typography"
export type { Rendered, RenderInput } from "./render"
export { buildLibrary, allowedOn, templatesUsing, sectionTypeFromPath } from "./discovery"
export type { Library, LibraryEntry } from "./discovery"
export { buildPackage, readPackage, templateFromSections, sectionsFromTemplate, sha256, assetPath, mimeForExt, isSafeThemePath, assetRefsIn } from "./package"
export type { ThemePackage, PackageAsset, PackageManifest, ReadPackage } from "./package"

export {
  LANGUAGE_VERSION,
  DEFAULT_LANGUAGE_VERSION,
  MIGRATIONS,
  migrationPath,
  migrateSource,
  readLanguageVersion,
  type LanguageMigration,
} from "./language"
