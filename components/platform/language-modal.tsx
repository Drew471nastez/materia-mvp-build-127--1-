"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useLocale } from "@/components/locale-provider"

/**
 * ===========================================================================
 *  THE LANGUAGE PICKER
 * ===========================================================================
 *
 * One modal, opened from three different menus: the marketplace account
 * dropdown, the marketplace mobile sheet, and the /app header dropdown. Each of
 * those has its own visual language -- light rows, big touch rows, dark rows --
 * so each menu renders its OWN trigger row in its own style and hands the open
 * state here. Sharing the trigger as well would mean a control that looks
 * pasted in from another app in at least two of the three places.
 *
 * ---------------------------------------------------------------------------
 * IT IS CONTROLLED, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * The obvious build is a self-contained <LanguageModal trigger={...} />. It
 * does not work here. All three menus close on outside-click, and a dialog
 * portals to document.body -- so the first click inside the dialog registers as
 * "outside the menu", the menu unmounts, and it takes the dialog with it. The
 * picker would open and vanish in the same gesture.
 *
 * So the parent owns the state: it closes its own menu and opens this, and the
 * dialog outlives the menu that launched it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES AND DOES NOT TRANSLATE
 * ---------------------------------------------------------------------------
 * The PLATFORM only: navigation, buttons, labels, checkout, settings -- every
 * string that comes from lib/i18n/dictionaries.ts. It does not touch a single
 * word anybody wrote: listing titles and descriptions, messages, reviews, store
 * names and blog posts are stored as their author typed them and are rendered
 * verbatim in every language. Nothing here is machine-translated, and a seller
 * who writes in Romanian is read in Romanian by a shopper browsing in English.
 *
 * The list itself comes from the provider, which offers a language only once it
 * is genuinely translated -- see AVAILABLE_LANGUAGES in
 * components/locale-provider.tsx.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LanguageModal({ open, onOpenChange }: Props) {
  const { language, languages, setLanguage, t } = useLocale()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 336px is the old 420 less 20%. A language list is short rows of short
          words; the extra width was empty space to the right of every one. */}
      <DialogContent className="w-[92vw] max-w-[336px] rounded-2xl p-0 overflow-hidden gap-0">
        <div className="px-6 pt-6 pb-2">
          <DialogTitle className="text-[22px] font-bold tracking-tight text-foreground">
            {t("language")}
          </DialogTitle>
        </div>

        <div className="px-3 pb-4 max-h-[60vh] overflow-y-auto">
          {languages.map((l) => {
            const selected = language === l.code
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setLanguage(l.code)
                  onOpenChange(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {/*
                  The radio is drawn rather than using an <input>: it has to sit
                  inside a button that is itself the hit target, and a real
                  radio inside a button is both invalid HTML and a second thing
                  to click. role/aria-checked above carry the semantics.
                */}
                <span
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected ? "border-[#7c3aed] bg-[#7c3aed]" : "border-neutral-300",
                  )}
                  aria-hidden
                >
                  {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
                {/* Flags render as country emoji. Windows draws these as letter
                    pairs rather than flags, which is why the language name
                    beside it is the label and the flag is decoration. */}
                <span className="text-[19px] leading-none" aria-hidden>
                  {l.flag}
                </span>
                <span className="text-[15px] font-medium text-foreground">{l.label}</span>
              </button>
            )
          })}
        </div>

      </DialogContent>
    </Dialog>
  )
}
