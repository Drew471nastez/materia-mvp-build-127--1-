/**
 * The native engine's tool: one JSON schema, built from the registry, that
 * the model answers in (OpenPage's single structured response, as a tool).
 *
 * STRICT WHERE IT CAN BE. Every object is closed and every property is
 * required, and nothing in it is a numeric or length rule, so
 * lib/sites/agent/strict-schema.ts strictReady passes and both providers
 * send it as a strict tool (tests/native-engine-r2.test.ts holds this). The
 * part a strict schema cannot carry without a union per section type (tens
 * of them, past a provider's limits) is each section's settings: those are
 * [{id, value}] pairs, the section and block types are enums from the
 * registry, and ./validate.ts holds every value to its control exactly.
 */
import type { ToolSpec } from "@/lib/sites/agent/types"
import type { NativeRegistry } from "./registry"

export const NATIVE_TOOL = "submit_native_site"

const KV = {
  type: "object",
  properties: {
    id: { type: "string" },
    value: { type: "string", description: 'The value as text: words, a listed choice, a number ("64"), true/false, or for a responsive range {"desktop":3,"mobile":1}.' },
  },
  required: ["id", "value"],
  additionalProperties: false,
}

/** The tool for these section types. Pure. */
export function nativeTool(reg: NativeRegistry, types: string[]): ToolSpec<string> {
  const blockTypes = [...new Set(types.flatMap((t) => reg.sections[t]?.blocks.map((b) => b.type) ?? []))]
  const block = {
    type: "object",
    properties: { type: { type: "string", enum: blockTypes.length ? blockTypes : ["none"] }, settings: { type: "array", items: KV } },
    required: ["type", "settings"],
    additionalProperties: false,
  }
  const section = {
    type: "object",
    properties: {
      type: { type: "string", enum: types },
      purpose: { type: "string", description: "What the section does on this page, one sentence." },
      scheme: { type: "string", enum: ["light", "dark", "alt"], description: "Its colour band." },
      settings: { type: "array", items: KV, description: "The section's settings by id, from the library line for its type." },
      blocks: { type: "array", items: block, description: "Its items, in order. [] for a section without blocks." },
      images: {
        type: "array",
        description: "One brief per picture slot left empty: a setting id or block:<block type>.",
        items: {
          type: "object",
          properties: { slot: { type: "string" }, query: { type: "string", description: "Two to five concrete words for the photo, e.g. 'coach spotting a deadlift'" }, aspect: { type: "string", enum: ["landscape", "portrait", "square"] } },
          required: ["slot", "query", "aspect"],
          additionalProperties: false,
        },
      },
    },
    required: ["type", "purpose", "scheme", "settings", "blocks", "images"],
    additionalProperties: false,
  }
  const palette = {
    type: "object",
    properties: Object.fromEntries(reg.theme.palette.map((k) => [k, { type: "string", description: '"#rrggbb", or "" to keep the preset\'s' }])),
    required: [...reg.theme.palette],
    additionalProperties: false,
  }
  return {
    name: NATIVE_TOOL,
    description: "Submit the whole website as Storelib sections: the theme tokens and every page with its sections, settings and blocks.",
    parameters: {
      type: "object",
      properties: {
        brand: { type: "object", properties: { name: { type: "string" }, tagline: { type: "string" } }, required: ["name", "tagline"], additionalProperties: false },
        voice: { type: "string" },
        audience: { type: "string" },
        conversion: { type: "string", description: "The one thing a visitor should do." },
        imagery: { type: "string" },
        theme: {
          type: "object",
          properties: {
            preset: { type: "string", enum: reg.theme.presets.map((p) => p.id) },
            palette,
            font_heading: { type: "string", enum: reg.theme.fonts.heading },
            font_body: { type: "string", enum: reg.theme.fonts.body },
            settings: { type: "array", items: KV, description: `Theme settings over the preset: ${reg.theme.settings.map((s) => s.id).join(", ")}.` },
          },
          required: ["preset", "palette", "font_heading", "font_body", "settings"],
          additionalProperties: false,
        },
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string", description: '"home" first, then short slugs ("programs", "about")' }, title: { type: "string" }, purpose: { type: "string" }, sections: { type: "array", items: section } },
            required: ["key", "title", "purpose", "sections"],
            additionalProperties: false,
          },
        },
      },
      required: ["brand", "voice", "audience", "conversion", "imagery", "theme", "pages"],
      additionalProperties: false,
    },
  }
}
