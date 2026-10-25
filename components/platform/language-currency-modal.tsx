"use client"

import * as React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useLocale } from "@/components/locale-provider"
/* The words t() reads (lib/i18n/locale-words.ts): imported where they are used, not by the provider every page has. */
import "@/lib/i18n/locale-words"

type Props = {
  trigger: React.ReactNode
}

export function LanguageCurrencyModal({ trigger }: Props) {
  const { language, currency, languages, currencies, setLanguage, setCurrency, t } = useLocale()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex" role="button" tabIndex={0}>
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[92vw] max-w-[560px] rounded-2xl p-0 overflow-hidden">
          <div className="px-6 pt-5">
            <Tabs defaultValue="language" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="language">{t("language")}</TabsTrigger>
                <TabsTrigger value="currency">{t("currency")}</TabsTrigger>
              </TabsList>

              <TabsContent value="language" className="mt-5">
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
              </TabsContent>

              <TabsContent value="currency" className="mt-5">
                <div className="space-y-1 pb-6">
                  {currencies.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setCurrency(c.code)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-base",
                        "hover:bg-muted/60",
                      )}
                    >
                      <span>{c.label}</span>
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full border border-border",
                          currency === c.code && "bg-foreground",
                        )}
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
