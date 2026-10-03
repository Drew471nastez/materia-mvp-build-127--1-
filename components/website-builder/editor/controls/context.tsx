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

export interface EditorFieldEnv {
  products: PickerProduct[]
  /** Every menu a section may name, the header's links as main-menu included. */
  menus: Record<string, Menu>
  /** The open page as `page.template` names it: "index", "product", "page.about". */
  template: string
  /** Opens Theme settings at Menus. */
  openMenus?: () => void
  /** The creator's own communities; null while communities are switched off on Storelib. */
  communities?: PickerCommunity[] | null
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
