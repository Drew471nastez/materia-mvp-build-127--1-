"use client"

/**
 * ===========================================================================
 *  THE ICON OF A SPACE, PICKED (round 31)
 * ===========================================================================
 * Was a text input 64px wide whose caret sat on top of the emoji, and whose
 * slice cut a pasted family or flag in half. Now a square that shows the
 * icon, the way the list shows it, and opens Storelib's emoji picker
 * (components/app/rich-text/emoji-picker.tsx EmojiPanel): a popover under it
 * on a computer, the shared sheet on a phone. Above the emoji, a field of the
 * admin's own: type or paste one emoji or up to two letters, checked as a
 * person counts characters (space-icon.ts), with what will be shown beside
 * it. Picking or using one closes the picker; "Use the kind's icon" empties
 * it, so the space shows its kind's again.
 */
import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { FIT_POPOVER, fitBox } from "@/components/ui/popover-fit"
import { EmojiPanel } from "@/components/app/rich-text/emoji-picker"
import { KIND_GLYPH } from "@/components/community/member/space-glyph"
import type { SpaceKind } from "@/lib/communities/types"
import { checkSpaceIcon, isEmojiIcon } from "./space-icon"
import { buttonSecondary } from "./parts"
import { usePhoneNow } from "./form-sheet"
import { tt } from "@/lib/i18n/text"

/** An icon drawn in a square: an emoji at the emoji's size, letters smaller and bold. */
export function IconGlyph({ value, size = "md", faded }: { value: string; size?: "sm" | "md" | "lg"; faded?: boolean }) {
  const emoji = isEmojiIcon(value)
  return (
    <span
      aria-hidden
      className={cn(
        "leading-none",
        emoji ? (size === "lg" ? "text-[22px]" : size === "md" ? "text-[18px]" : "text-[16px]") : cn("font-semibold tracking-tight text-[#1a1a2e]", size === "lg" ? "text-[16px]" : "text-[13px]"),
        faded && "opacity-45 grayscale-[0.3]",
      )}
    >
      {value}
    </span>
  )
}

export function SpaceIconField({ value, kind, onChange, id }: { value: string; kind: SpaceKind; onChange: (icon: string) => void; id: string }) {
  const phone = usePhoneNow()
  const [open, setOpen] = React.useState(false)
  const shown = value || KIND_GLYPH[kind]
  const close = React.useCallback(() => setOpen(false), [])
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  })
  /* The same function every render, so the panel's grids are not drawn again for nothing. */
  const pick = React.useCallback((icon: string) => {
    onChangeRef.current(icon)
    setOpen(false)
  }, [])

  const trigger = (
    <button
      id={id}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={tt("Icon: {icon}. Change", { icon: shown })}
      onClick={() => setOpen((o) => !o)}
      data-space-icon={value || ""}
      className={cn(
        "group relative grid h-11 w-full cursor-pointer place-items-center rounded-lg border border-[#e1e3e7] bg-white outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#d2d5da] hover:bg-[#fafafb] focus-visible:border-[#1a1a2e]/50 focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:h-10",
        open && "border-[#1a1a2e]/50 shadow-[0_0_0_3px_rgba(26,26,46,0.07)]",
      )}
    >
      <IconGlyph value={shown} faded={!value} />
      <ChevronDown aria-hidden className="absolute bottom-1 right-1 h-3 w-3 text-[#9ca3af] transition-colors group-hover:text-[#6b7280]" strokeWidth={2.4} />
    </button>
  )

  if (phone)
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={close} label={tt("Icon")} height="min(72dvh, 600px)" maxHeight="min(72dvh, 600px)" fill aboveKeyboard hideFrom={null}>
          <IconPicker phone value={value} kind={kind} active={open} onPick={pick} />
        </BottomSheet>
      </>
    )

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>{trigger}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          {...FIT_POPOVER}
          style={fitBox(344, 452)}
          data-space-icon-picker=""
          className="z-[2147483640] flex flex-col overflow-hidden rounded-xl border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
        >
          <IconPicker phone={false} value={value} kind={kind} active={open} onPick={pick} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/** The admin's own icon above Storelib's emoji, and the way back to the kind's. */
function IconPicker({ phone, value, kind, active, onPick }: { phone: boolean; value: string; kind: SpaceKind; active: boolean; onPick: (icon: string) => void }) {
  const [typed, setTyped] = React.useState("")
  React.useEffect(() => {
    if (!active) setTyped("")
  }, [active])
  const checked = checkSpaceIcon(typed)
  const ready = checked.ok && checked.value !== ""
  const use = () => {
    if (ready && checked.ok) onPick(checked.value)
  }
  const ownId = React.useId()
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-icon-picker="">
      <div className={cn("shrink-0 border-b border-[#f0f1f3]", phone ? "px-4 pb-3" : "px-3 pb-2.5 pt-3")} data-icon-own="">
        <label htmlFor={ownId} className="mb-1.5 block text-[12.5px] font-medium text-[#4b5563]">
          {tt("Your own")}
        </label>
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#f3f4f6]" data-icon-preview={checked.ok ? checked.value : ""}>
            {checked.ok && checked.value ? <IconGlyph value={checked.value} /> : <IconGlyph value={value || KIND_GLYPH[kind]} faded />}
          </span>
          <input
            id={ownId}
            value={typed}
            onChange={(e) => setTyped(e.target.value.slice(0, 32))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                use()
              }
            }}
            placeholder={tt("Type or paste an emoji")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={!checked.ok || undefined}
            aria-describedby={`${ownId}-hint`}
            className={cn(
              "h-10 min-w-0 flex-1 rounded-lg border border-[#e1e3e7] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#a2a7b0] focus:border-[#1a1a2e]/50 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:text-[14px]",
              !checked.ok && "border-[#dc2626] focus:border-[#dc2626]",
            )}
            data-icon-input=""
          />
          <button type="button" onClick={use} disabled={!ready} className={cn(buttonSecondary, "h-10 shrink-0 px-3.5 sm:h-10")} data-icon-use="">
            {tt("Use")}
          </button>
        </div>
        <p id={`${ownId}-hint`} className={cn("mt-1.5 text-[12px] leading-snug", checked.ok ? "text-[#6b7280]" : "text-[#b42318]")} data-icon-hint={checked.ok ? "" : "error"} role={checked.ok ? undefined : "alert"}>
          {checked.ok ? tt("One emoji, or up to two letters.") : checked.error}
        </p>
      </div>
      <div className={cn("min-h-0 flex-1", phone ? "pt-2" : "")}>
        <EmojiPanel phone={phone} active={active} onPick={onPick} />
      </div>
      {value ? (
        <div className={cn("shrink-0 border-t border-[#f0f1f3]", phone ? "px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1" : "px-1.5 py-1")}>
          <button type="button" onClick={() => onPick("")} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f4f5f7] hover:text-[#1a1a2e] sm:min-h-9" data-icon-reset="">
            <IconGlyph value={KIND_GLYPH[kind]} size="sm" />
            {tt("Use the kind's icon")}
          </button>
        </div>
      ) : null}
    </div>
  )
}
