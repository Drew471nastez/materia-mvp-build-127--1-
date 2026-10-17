/**
 * The section panel the settings sync probe draws, before and after its
 * <schema> changed, as the builder reads it (schemaFor). Printed as JSON for
 * scripts/check-settings-sync.mjs, which hands it to the page.
 *
 *   npx tsx scripts/render-settings-sync-fields.ts
 */
import { schemaFor } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"

const SECTION_FILE = (() => {
  /* A section of the creator's own: a collection picker, a bound picture and title, a slider, a toggle. */
  const schema = {
    schema_version: 1,
    type: "shelf",
    name: "Shelf",
    settings: [
      { type: "collection_picker", id: "collection", label: "Collection" },
      { type: "image_picker", id: "image", label: "Picture", from: "collection.image" },
      { type: "text", id: "title", label: "Title", from: "collection.title" },
      { type: "range", id: "padding_top", label: "Top padding", min: 0, max: 200, step: 4, unit: "px", default: 72 },
      { type: "toggle", id: "show_count", label: "Show how many products", default: true },
      { type: "text", id: "old_words", label: "Old words", default: "" },
    ],
    presets: [{ name: "Shelf" }],
  }
  const changed = {
    ...schema,
    settings: [
      { type: "header", id: "hdr_look", label: "Look" },
      { type: "range", id: "padding_top", label: "Top padding", min: 0, max: 96, step: 4, unit: "px", default: 48 },
      { type: "range", id: "gap", label: "Gap", min: 0, max: 40, step: 4, unit: "px", default: 12 },
      { type: "toggle", id: "show_count", label: "Show how many products", default: true },
      { type: "header", id: "hdr_content", label: "Content" },
      { type: "collection_picker", id: "collection", label: "Collection" },
      { type: "text", id: "title", label: "Title", from: "collection.title" },
      { type: "image_picker", id: "image", label: "Picture", from: "collection.image" },
    ],
  }
  const file = (s: unknown) => `<template>\n<section class="s"><h2>{{ settings.title }}</h2></section>\n</template>\n\n<schema>\n${JSON.stringify(s, null, 2)}\n</schema>\n`
  return { before: file(schema), after: file(changed) }
})()

const fields = (source: string) => schemaFor("shelf", { "sections/shelf.storelib": source }, SECTION_SCHEMAS)?.fields ?? []
process.stdout.write(JSON.stringify({ before: fields(SECTION_FILE.before), after: fields(SECTION_FILE.after) }))
