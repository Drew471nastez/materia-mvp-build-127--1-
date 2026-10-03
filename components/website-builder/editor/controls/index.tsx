"use client"

/**
 * ===========================================================================
 *  THE NEWER CONTROLS, REGISTERED IN ONE PLACE
 * ===========================================================================
 * The sidebar draws a setting through FieldEditor in the editor page, which
 * is a switch on the control's type. The types added with the Shopify gap
 * work (lib/storelib-theme/controls/registry.ts) each have their own file in
 * this folder, and FieldEditor asks this function first: a type drawn here
 * returns its control, anything else returns null and FieldEditor carries on
 * as it did. One call there, one switch here, and the older controls are
 * not touched.
 */
import type { ReactNode } from "react"

import type { SchemaField } from "@/lib/website-builder/types"
import { BackgroundControl } from "./background-control"
import { DateTimeControl } from "./datetime-control"
import { FocalPointControl } from "./focal-point-control"
import { HtmlControl } from "./html-control"
import { InlineRichTextControl } from "./inline-richtext-control"
import { MenuPickerControl } from "./menu-picker-control"
import { MenusEditor } from "./menus-editor"
import { ProductListControl } from "./product-list-control"
import { VideoPickerControl } from "./video-picker-control"
import { VideoUrlControl } from "./video-url-control"

export { DynamicSourceField } from "./dynamic-source-field"
export { EditorFieldProvider, SiblingSettingsProvider, type EditorFieldEnv, type PickerProduct } from "./context"

/** The types this folder draws, for FieldEditor's label rule and the docs. */
export const REGISTERED_CONTROLS = [
  "inline_richtext", "html", "color_background", "datetime", "focal_point", "video_url", "video_picker", "product_list", "link_list", "menus",
] as const

/** Controls that print their own name, so the panel does not label them twice. */
export function controlCarriesOwnLabel(kind: string): boolean {
  return kind === "color_background"
}

export function renderRegisteredControl(
  kind: string,
  field: SchemaField,
  value: unknown,
  onChange: (v: unknown) => void,
): ReactNode | null {
  const str = typeof value === "string" ? value : ""
  const fallback = typeof field.default === "string" ? field.default : ""
  switch (kind) {
    case "inline_richtext":
      return <InlineRichTextControl value={str} onChange={onChange} placeholder={field.placeholder} label={field.label} />
    case "html":
      return <HtmlControl value={str} onChange={onChange} placeholder={field.placeholder} />
    case "color_background":
      return <BackgroundControl label={field.label} value={str} fallback={fallback} onChange={onChange} />
    case "datetime":
      return <DateTimeControl value={str} onChange={onChange} label={field.label} />
    case "focal_point":
      return <FocalPointControl value={str || fallback || "50% 50%"} onChange={onChange} imageSetting={field.image} label={field.label} />
    case "video_picker":
      return <VideoPickerControl value={str} onChange={onChange} label={field.label} />
    case "video_url":
      return <VideoUrlControl value={str} onChange={onChange} accept={field.accept} placeholder={field.placeholder} label={field.label} />
    case "product_list":
      return <ProductListControl value={value} onChange={onChange} limit={field.limit} label={field.label} />
    case "link_list":
      return <MenuPickerControl value={str} onChange={onChange} label={field.label} />
    case "menus":
      return <MenusEditor value={value} onChange={onChange} />
    /* A paragraph from a .storelib schema says what it says in `content`. */
    case "paragraph":
      return field.content ? <p className="text-xs text-muted-foreground leading-relaxed">{field.content}</p> : null
  }
  return null
}
