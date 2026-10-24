"use client"

/**
 * ===========================================================================
 *  WHAT THE NEWER CONTROLS NEED FROM THE EDITOR AROUND THEM
 * ===========================================================================
 * A text box needs its value and nothing else. A product list needs the
 * creator's products, a menu picker needs the site's menus, a dynamic
 * source needs to know which page is open (a product's title is only a
 * value on the product page), and a focal point needs the picture beside
 * it. The editor provides those once, here, and each control asks for what
 * it uses.
 *
 * Absent means a surface that is not the editor: every control that reads
 * this still draws, with the part that needs the editor left out.
 */
import { createContext, useContext, type ReactNode } from "react"

import type { Menu } from "@/lib/storelib-theme/values"

/** One of the creator's products, as a picker lists it. */
export interface PickerProduct {
  id: string
  title: string
  /** Formatted, "$48.00", or empty. */
  price: string
  /** A picture's address, or empty. */
  image: string
  /** /products/<slug>, or empty for a product with no address. */
  url: string
}

/** One of the creator's communities, as the community picker lists it. */
export interface PickerCommunity {
  id: string
  name: string
  /** Whether a visitor would see it: published, public, not suspended. */
  shows: boolean
  /** Why not, in a few words, when it would not. */
  why: string | null
}

/** One of the creator's collections, as the collection pickers list it. */
export interface PickerCollection {
  id: string
  title: string
  /** A picture's address, or empty. */
  image: string
  /** Whether a visitor would see it. */
  published: boolean
  products_count: number
  /** Its words and address, when the editor has them: what a setting bound to it shows (lib/storelib-theme/collection-binding.ts). */
  description?: string
  url?: string
}

export interface EditorFieldEnv {
  products: PickerProduct[]
  /** Every menu a section may name, the header's links as main-menu included. */
  menus: Record<string, Menu>
  /** The open page as `page.template` names it: "index", "product", "page.about". */
  template: string
  /** Opens Theme settings at Menus, at one menu when a handle is given. */
  openMenus?: (handle?: string) => void
  /** The menu Menus should open at, asked for by `openMenus(handle)`. `n` makes the same request twice count. */
  menuRequest?: { handle: string; n: number } | null
  /**
   * The header, for the Main menu: its links are the Main menu until the
   * Main menu is first edited (lib/website-builder/main-menu.ts).
   */
  header?: { settings: Record<string, unknown>; blocks?: { id: string; type: string; settings: Record<string, unknown> }[] } | null
  /** Points the header at the Main menu, the first time the Main menu is written. */
  linkHeaderToMain?: () => void
  /** The creator's own communities; null while communities are switched off on Storelib. */
  communities?: PickerCommunity[] | null
  /** The creator's own collections; null while physical commerce, where collections live, is off. */
  collections?: PickerCollection[] | null
  /**
   * Round 12: a collection made from a picker (its name and the products in
   * it), saved as Products › Collections saves one; answers its id once the
   * builder's list has it, or what went wrong in words for the merchant.
   */
  createCollection?: (input: { title: string; productIds: string[] }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  /**
   * An imported theme's own colour schemes, for a `color_scheme` setting
   * (lib/storelib-theme/compat/scheme-list.ts). Absent on Storelib's own
   * themes, whose schemes are Storelib's.
   */
  colorSchemes?: { id: string; name: string; background: string; text: string; accent: string }[] | null
  /** Storelib's own themes: the theme's settings, whose schemes a `color_scheme` setting lists by their own names. */
  themeSettings?: Record<string, unknown> | null
  /** Opens Theme settings where the schemes themselves are edited, at the one named (the Edit beside a section's scheme). */
  openColorSchemes?: (schemeId?: string) => void
  /**
   * An imported theme's own pictures by name, where they are stored
   * (shopify/config/assets.json): what a picture setting saved as
   * `shopify://shop_images/<name>` is drawn from (lib/website-builder/
   * picture-address.ts). Absent on Storelib's own themes.
   */
  pictureMedia?: Record<string, string> | null
}

const EditorFieldContext = createContext<EditorFieldEnv | null>(null)

export function EditorFieldProvider({ value, children }: { value: EditorFieldEnv; children: ReactNode }) {
  return <EditorFieldContext.Provider value={value}>{children}</EditorFieldContext.Provider>
}

export function useEditorFieldEnv(): EditorFieldEnv | null {
  return useContext(EditorFieldContext)
}

/**
 * The other settings of the section or block a field belongs to. A focal
 * point is a point ON a picture, and the picture is a sibling setting named
 * by the focal point's `image` key.
 */
const SiblingSettingsContext = createContext<Record<string, unknown> | null>(null)

export function SiblingSettingsProvider({ settings, children }: { settings: Record<string, unknown> | undefined; children: ReactNode }) {
  return <SiblingSettingsContext.Provider value={settings ?? null}>{children}</SiblingSettingsContext.Provider>
}

export function useSiblingSettings(): Record<string, unknown> | null {
  return useContext(SiblingSettingsContext)
}
