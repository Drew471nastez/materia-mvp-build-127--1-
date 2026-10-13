"use client"

/**
 * ===========================================================================
 *  BLOCKED WORDS (Moderation, Rules)
 * ===========================================================================
 * The community's own word list (lib/communities/word-filter.ts): one word
 * or phrase a line, and what happens to a post, comment or message with
 * one of them: refused, or held for a moderator. Drawn as a row like Slow
 * mode above it, so the Rules view reads as one list of settings.
 *
 * The owner and admins edit it; a moderator reads it (so they know why
 * something was refused). Saved with its own Save, through
 * /api/app/community/<id>/words.
 *
 * Mount it under <SlowMode> in moderation-section.tsx's Rules view:
 *
 *   <BlockedWords communityId={head.id} canEdit={head.can.manage_settings === true} initial={blockedWords} />
 *
 * with `initial` from the page (wordSettingsOf(community.onboarding), which
 * is browser safe). Without `initial` it reads the list itself, drawn in
 * its final shape while it does (the box empty and still), so nothing below
 * it moves.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { WORD_LIST_MAX, WORD_PREFIX_MIN, cleanWordList, splitWordInput, type WordSettings, type WordsAction } from "@/lib/communities/word-filter"
import { Notice, Segmented, buttonPrimary, buttonSecondary, errorText, field, send, useToast } from "./parts"
import { tt } from "@/lib/i18n/text"

const ACTIONS: { value: WordsAction; label: string }[] = [
  { value: "block", get label() { return tt("Refuse it") } },
  { value: "hold", get label() { return tt("Hold for review") } },
]

function textOf(words: string[]): string {
  return words.join("\n")
}

export function BlockedWords({ communityId, canEdit, initial }: { communityId: string; canEdit: boolean; initial?: WordSettings }) {
  const toast = useToast()
  const [loaded, setLoaded] = React.useState<WordSettings | null>(initial ?? null)
  const [text, setText] = React.useState(initial ? textOf(initial.words) : "")
  const [action, setAction] = React.useState<WordsAction>(initial?.action ?? "block")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (initial) return
    let live = true
    void send<{ words: string[]; action: WordsAction }>(`/api/app/community/${communityId}/words`, "GET").then((res) => {
      if (!live) return
      const s: WordSettings = res.ok ? { words: Array.isArray(res.data.words) ? res.data.words : [], action: res.data.action === "hold" ? "hold" : "block" } : { words: [], action: "block" }
      setLoaded(s)
      setText(textOf(s.words))
      setAction(s.action)
    })
    return () => {
      live = false
    }
  }, [communityId, initial])

  const entries = splitWordInput(text)
  const dirty = loaded !== null && (textOf(entries) !== textOf(loaded.words) || action !== loaded.action)

  const save = async () => {
    const checked = cleanWordList(entries)
    if (!checked.ok) return setError(checked.error)
    setBusy(true)
    const res = await send<{ words: string[]; action: WordsAction }>(`/api/app/community/${communityId}/words`, "PUT", { words: checked.value, action })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    const saved: WordSettings = { words: res.data.words ?? checked.value, action: res.data.action ?? action }
    setLoaded(saved)
    setText(textOf(saved.words))
    setError(null)
    toast(saved.words.length ? tt("{length} blocked {length, plural, one {word} other {words}} saved", { length: saved.words.length }) : tt("Blocked words cleared"))
  }

  const reset = () => {
    if (!loaded) return
    setText(textOf(loaded.words))
    setAction(loaded.action)
    setError(null)
  }

  return (
    <div className="border-b border-[#f1f2f4] px-4 py-3 sm:px-5" data-blocked-words="">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[220px]">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Blocked words")}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">
            {tt("Posts, comments and messages from members with any of these. Whole words only; end one with * to match every word that starts with it. The team can still write them.")}
          </p>
        </div>
        {canEdit ? (
          <Segmented label={tt("What happens to it")} value={action} onChange={(v) => { setAction(v); setError(null) }} options={ACTIONS} className="w-full shrink-0 max-sm:[&>button]:flex-1 sm:w-auto" />
        ) : (
          <span className="text-[13.5px] text-[#4b5563]">{action === "hold" ? tt("Held for review") : tt("Refused")}</span>
        )}
      </div>

      {canEdit ? (
        <div className="sm:max-w-[560px]">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            disabled={loaded === null}
            aria-busy={loaded === null}
            rows={4}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label={tt("Blocked words, one a line")}
            placeholder={loaded === null ? "" : tt("One a line, for example\nfree followers\ncrypto signal*")}
            className={cn(field, "mt-3 min-h-[124px] resize-y py-2.5 leading-relaxed")}
          />
          {error ? (
            <div className="mt-2">
              <Notice>{error}</Notice>
            </div>
          ) : null}
          {/* Always as tall as its buttons, so Save arriving moves nothing. */}
          <div className="mt-2.5 flex min-h-10 flex-wrap items-center gap-2 sm:min-h-8">
            <span className={cn("mr-auto text-[12.5px] tabular-nums", entries.length > WORD_LIST_MAX ? "text-[#b42318]" : "text-[#9ca3af]")}>
              {loaded === null ? "" : entries.length ? tt("{length} of {wordListMax}", { length: entries.length, wordListMax: WORD_LIST_MAX }) : tt("Up to {wordListMax}, at least {wordPrefixMin} letters before a *", { wordListMax: WORD_LIST_MAX, wordPrefixMin: WORD_PREFIX_MIN })}
            </span>
            {dirty ? (
              <>
                <button type="button" onClick={reset} disabled={busy} className={cn(buttonSecondary, "h-10 sm:h-8")}>
                  {tt("Cancel")}
                </button>
                <button type="button" onClick={() => void save()} disabled={busy} className={cn(buttonPrimary, "h-10 sm:h-8")} data-blocked-words-save="">
                  {busy ? tt("Saving") : tt("Save")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : loaded === null ? (
        <p aria-hidden className="mt-2 text-[13.5px] leading-relaxed text-transparent">.</p>
      ) : loaded.words.length ? (
        <p className="mt-2 break-words text-[13.5px] leading-relaxed text-[#4b5563]">{loaded.words.join(", ")}</p>
      ) : (
        <p className="mt-2 text-[13.5px] text-[#9ca3af]">{tt("No blocked words yet. The owner and admins add them.")}</p>
      )}
    </div>
  )
}
