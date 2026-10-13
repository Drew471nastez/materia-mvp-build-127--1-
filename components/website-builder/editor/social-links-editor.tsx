"use client"

/**
 * ===========================================================================
 *  THE STORE'S SOCIAL LINKS, AS A LIST YOU ADD TO
 * ===========================================================================
 * Theme settings › Social links was eighteen empty boxes, one per platform,
 * most of which nobody has. Here the platforms with an address are rows,
 * each with its own mark, and Add a platform offers the rest. A row takes a
 * handle ("@name") or an address: a handle is saved as the platform's
 * profile address (lib/website-builder/social-links socialFromInput). The
 * settings are the same keys as before, so the footer, the header and every
 * section read them exactly as they did.
 */
import * as React from "react"
import { Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { SOCIAL_ICONS } from "@/components/website-builder/theme/ThemeSocials"
import { SOCIAL_PLATFORMS, socialFromInput, socialHref, takesHandle, type SocialKey } from "@/lib/website-builder/social-links"
import { tt } from "@/lib/i18n/text"

const LABEL: Partial<Record<SocialKey, string>> = { get social_twitter() { return tt("X (Twitter)") } }
const nameOf = (key: SocialKey, label: string) => LABEL[key] ?? label

export function SocialLinksEditor({
  values,
  onChange,
}: {
  values: Record<string, unknown>
  onChange: (key: SocialKey, value: string) => void
}) {
  const filled = SOCIAL_PLATFORMS.filter((p) => typeof values[p.key] === "string" && (values[p.key] as string).trim() !== "")
  /* A row added and not typed in yet stays until it is left empty and closed. */
  const [adding, setAdding] = React.useState<SocialKey[]>([])
  const [picking, setPicking] = React.useState(false)
  const shown = [...filled.map((p) => p.key), ...adding.filter((k) => !filled.some((p) => p.key === k))]
  const rest = SOCIAL_PLATFORMS.filter((p) => !shown.includes(p.key))
  const focusKey = React.useRef<SocialKey | null>(null)

  return (
    <div className="space-y-2" data-social-links-editor="">
      {shown.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{tt("No social links yet. Add the platforms you are on and their icons show in your footer.")}</p>
      ) : null}
      {shown.map((key) => {
        const p = SOCIAL_PLATFORMS.find((x) => x.key === key)!
        const Icon = SOCIAL_ICONS[key]
        const value = typeof values[key] === "string" ? (values[key] as string) : ""
        const bad = value.trim() !== "" && !socialHref(key, value)
        return (
          <div key={key} data-social-row={key}>
            <div className={cn("flex h-10 items-center gap-2 rounded-md border bg-background pl-2.5 pr-1 transition-colors focus-within:border-neutral-400", bad ? "border-red-300" : "border-border")}>
              <Icon className="h-4 w-4 shrink-0 text-foreground/80" />
              <input
                aria-label={nameOf(key, p.label)}
                autoFocus={focusKey.current === key}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground max-sm:text-[16px]"
                placeholder={key === "social_email" ? p.placeholder : takesHandle(key) ? "@username or a link" : p.placeholder}
                defaultValue={value}
                key={value}
                inputMode={key === "social_email" ? "email" : "url"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onBlur={(e) => {
                  const next = socialFromInput(key, e.target.value)
                  if (next !== value) onChange(key, next)
                  if (!next) setAdding((a) => a.filter((k) => k !== key))
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                }}
              />
              <button
                type="button"
                aria-label={tt("Remove {name}", { name: nameOf(key, p.label) })}
                onClick={() => {
                  onChange(key, "")
                  setAdding((a) => a.filter((k) => k !== key))
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {bad ? <p className="mt-1 text-[11px] text-red-600">{tt("That is not a link a visitor can open.")}</p> : null}
          </div>
        )
      })}

      {rest.length > 0 ? (
        picking ? (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1 animate-in fade-in-0 duration-150" data-social-pick="">
            {rest.map((p) => {
              const Icon = SOCIAL_ICONS[p.key]
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    focusKey.current = p.key
                    setAdding((a) => [...a, p.key])
                    setPicking(false)
                  }}
                  className="flex h-9 items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-muted"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{nameOf(p.key, p.label)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <button
            type="button"
            data-social-add=""
            onClick={() => setPicking(true)}
            className="flex h-9 w-full items-center gap-2 rounded-md px-1 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full border border-border">
              <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
            </span>
            {tt("Add a platform")}
          </button>
        )
      ) : null}
    </div>
  )
}
