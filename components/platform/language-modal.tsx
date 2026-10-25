"use client"

import * as React from "react"

import { ChoiceDialog } from "@/components/ui/choice-list"
import { useLocale } from "@/components/locale-provider"
/* The words t() reads (lib/i18n/locale-words.ts): imported where they are used, not by the provider every page has. */
import "@/lib/i18n/locale-words"

/**
 * ===========================================================================
 *  THE LANGUAGE PICKER (storelib.com)
 * ===========================================================================
 *
 * Opened from the marketplace account dropdown and the marketplace mobile
 * sheet. Each menu renders its own row in its own style and hands the open
 * state here. /app has its own list of the dashboard's languages
 * (components/app/language-picker), drawn by the same parts: a small dialog
 * with a search field on a computer, the shared sheet on a phone
 * (components/ui/choice-list).
 *
 * ---------------------------------------------------------------------------
 * IT IS CONTROLLED, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * All the menus close on outside click, and a dialog portals to
 * document.body, so the first click inside the dialog registers as "outside
 * the menu", the menu unmounts, and it takes the dialog with it. So the
 * parent owns the state: it closes its own menu and opens this, and the
 * dialog outlives the menu that launched it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES AND DOES NOT TRANSLATE
 * ---------------------------------------------------------------------------
 * The PLATFORM only: navigation, buttons, labels, checkout, settings -- every
 * string that comes from lib/i18n/dictionaries.ts. It does not touch a single
 * word anybody wrote: listing titles and descriptions, messages, reviews, store
 * names and blog posts are rendered as their author typed them in every
 * language. Nothing here is machine translated.
 *
 * The list comes from the provider, which offers a language only once it is
 * genuinely translated (AVAILABLE_LANGUAGES in components/locale-provider.tsx).
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function englishName(code: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? undefined
  } catch {
    return undefined
  }
}

export function LanguageModal({ open, onOpenChange, sheetZIndex }: Props & { sheetZIndex?: number }) {
  const { language, languages, setLanguage, t } = useLocale()
  const choices = React.useMemo(
    () =>
      languages.map((l) => {
        const english = englishName(l.code)
        return {
          value: l.code,
          label: l.label,
          detail: english && !l.label.toLowerCase().startsWith(english.toLowerCase()) ? english : undefined,
          keywords: `${english ?? ""} ${l.short}`,
        }
      }),
    [languages],
  )
  return (
    <ChoiceDialog
      open={open}
      onOpenChange={onOpenChange}
      name="language"
      title={t("language")}
      choices={choices}
      value={language}
      placeholder="Search languages"
      onPick={(code) => setLanguage(code as typeof language)}
      sheetZIndex={sheetZIndex}
    />
  )
}
