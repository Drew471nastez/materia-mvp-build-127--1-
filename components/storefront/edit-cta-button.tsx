"use client"

/**
 * ===========================================================================
 *  THE TWO MOST-READ STRINGS ON THE PAGE, EDITED WHERE THEY ARE
 * ===========================================================================
 * "Join AndrewRullz's newsletter!" and the word on the button beside it. They
 * sit across the top of a creator's page, above everything, and until now the
 * only way to change either was the section editor: a page load, a canvas, a
 * sidebar and a publish, for two fields.
 *
 * So it is a pencil on the bar, the same shape as the one on the profile and
 * the one on About, writing through the same /api/creator-profile that
 * already does the auth, the ownership check and the merge into both the
 * draft and the published config.
 *
 * OWNER ONLY, and that is decided by the page rather than here: this is
 * rendered into a slot the storefront only fills when the viewer owns the
 * page, which is the same rule every other control on it follows.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Pencil } from "lucide-react"

const MAX_TEXT = 120
const MAX_BUTTON = 30

export function EditCtaButton({
  text,
  buttonText,
}: {
  /** What the bar says now, already resolved through its presets. */
  text: string
  /** What the button says now, likewise. */
  buttonText: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [nextText, setNextText] = React.useState(text)
  const [nextButton, setNextButton] = React.useState(buttonText)

  /** Reopening after a cancel shows what is saved, not what was abandoned. */
  React.useEffect(() => {
    if (open) return
    setNextText(text)
    setNextButton(buttonText)
    setError(null)
  }, [open, text, buttonText])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/creator-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribeBar: { text: nextText.trim(), buttonText: nextButton.trim() },
        }),
      })
      if (!res.ok) {
        setError("That could not be saved. Try again.")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit this bar"
        title="Edit this bar"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/5 text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>The bar at the top</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cta-text">Message</Label>
                <span className="text-xs text-muted-foreground">
                  {nextText.length}/{MAX_TEXT}
                </span>
              </div>
              <Input
                id="cta-text"
                value={nextText}
                maxLength={MAX_TEXT}
                onChange={(e) => setNextText(e.target.value)}
                placeholder="Join my newsletter"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cta-button">Button</Label>
                <span className="text-xs text-muted-foreground">
                  {nextButton.length}/{MAX_BUTTON}
                </span>
              </div>
              <Input
                id="cta-button"
                value={nextButton}
                maxLength={MAX_BUTTON}
                onChange={(e) => setNextButton(e.target.value)}
                placeholder="Follow"
              />
              {/* One sentence, because a person who just typed a word into a
                  box next to a live bar does not need it explained twice. */}
              <p className="text-xs text-muted-foreground">Leave empty to use the preset label.</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
