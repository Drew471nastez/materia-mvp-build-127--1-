"use client"

/**
 * ===========================================================================
 *  THE DASHBOARD'S LANGUAGE
 * ===========================================================================
 * The choices /app offers are lib/i18n/app-languages': the languages it
 * actually has words for, each by its own name with the English name under
 * it ("Deutsch", German).
 *
 * Settings shows them in its Language field (applied on Save, with the rest
 * of the page); the account menu opens them in a dialog, applied at once.
 */
import * as React from "react"
import { ChoiceDialog } from "@/components/ui/choice-list"
import { useLanguage, type LanguageCode } from "@/lib/i18n"
import { appLanguageChoices } from "@/lib/i18n/app-languages"
import { useLocale } from "@/components/locale-provider"
import { tt } from "@/lib/i18n/text"

/**
 * The account menu's Language: chosen and applied at once. It sets the
 * dashboard's words (lib/i18n) and the storelib.com side's (LocaleProvider),
 * which share one stored choice, so both agree.
 */
export function AppLanguageModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language, setLanguage } = useLanguage()
  const locale = useLocale()
  const choices = React.useMemo(() => (open ? appLanguageChoices() : []), [open])
  return (
    <ChoiceDialog
      open={open}
      onOpenChange={onOpenChange}
      name="language"
      title={tt("Language")}
      choices={choices}
      value={language}
      placeholder={tt("Search languages")}
      onPick={(code) => {
        setLanguage(code as LanguageCode)
        if (locale.languages.some((l) => l.code === code)) locale.setLanguage(code as never)
      }}
    />
  )
}

export { appLanguageChoices, appLanguageName } from "@/lib/i18n/app-languages"
