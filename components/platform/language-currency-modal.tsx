"use client"

import * as React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useLocale } from "@/components/locale-provider"

/**
 * LANGUAGE ONLY. The currency tab is gone.
 *
 * It offered six currencies against a static rate table on a marketplace that
 * charges in one currency regardless of which you picked — so choosing GBP
 * relabelled every price on the site and changed nothing about the transaction,
 * and the bank statement was the first place anybody found out. A control that
 * moves the label and not the money is worse than no control at all.
 *
 * Storelib quotes in lei, is paid in lei and pays its couriers in lei. One
 * currency is not a limitation here; it is what the platform actually does.
 */
type Props = {
  trigger: React.ReactNode
}

export function LanguageCurrencyModal({ trigger }: Props) {
  const { language, languages, setLanguage, t } = useLocale()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex" role="button" tabIndex={0}>
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[92vw] max-w-[560px] rounded-2xl p-0 overflow-hidden">
          <div className="px-6 pt-5">
            <p className="pb-1 text-[15px] font-semibold text-foreground">{t("language")}</p>
            <div className="space-y-1 pb-6">
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLanguage(l.code)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-base",
                    "hover:bg-muted/60",
                  )}
                >
                  <span>{l.label}</span>
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full border border-border",
                      language === l.code && "bg-foreground",
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
