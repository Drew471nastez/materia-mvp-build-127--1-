"use client"

/**
 * ===========================================================================
 *  THE WELCOME POST, IN THE FEED'S OWN WRITER (round 27, J4)
 * ===========================================================================
 * The owner: "make sure the welcome post in the community new page is using
 * the same post writer, imported from the community feed." The create wizard
 * (components/community/creator/create-flow.tsx, J27's) asked for it in two
 * plain form fields. This is the writer the feed opens, drawn open in place:
 * the same card, the member's picture and "<name> posting in <space>", the
 * same title and words (composer.tsx TITLE_FIELD, WORDS_FIELD and its
 * MentionTextarea, which grows with the words), the same toolbar glyphs and
 * the same Emoji control putting an emoji where the caret was.
 *
 * What it does not have is what needs the community to exist first: the
 * community is made when the wizard ends, so there is nowhere yet to upload a
 * picture, a file or a video, nothing to read a link card or GIFs through, and
 * nobody to mention. Those tools are left out rather than shown and refused.
 * Nothing is posted from here either: the words are the wizard's (controlled,
 * `title`, `body`, `onChange`), and the wizard sends them with the community,
 * which pins the post at the top of the first space.
 *
 *   <WelcomePostWriter me={{ name, avatarUrl }} spaceName={draft.spaceName}
 *     title={draft.welcomeTitle} body={draft.welcomeBody}
 *     onChange={({ title, body }) => setDraft((d) => ({ ...d, welcomeTitle: title, welcomeBody: body, welcomeEdited: true }))}
 *     errors={{ title: err("welcomeTitle"), body: err("welcomeBody") }} bodyMax={WELCOME_BODY_MAX} />
 */
import { useRef } from "react"
import { EmojiControl } from "@/components/app/rich-text/emoji-picker"
import { EMOJI_POPOVER } from "@/components/ui/popover-fit"
import { MemberAvatar } from "./member-avatar"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { TITLE_FIELD, TITLE_MAX, TOOL, WORDS_FIELD } from "./composer"
import { CARD } from "./ui"
import { spaceGlyph } from "./space-glyph"
import { tt } from "@/lib/i18n/text"

export interface WelcomePostWriterProps {
  /** Who it is from: the creator, as the feed's writer shows the member. */
  me: { name: string; avatarUrl: string | null }
  /** The first space's name, where it will be pinned. */
  spaceName: string
  title: string
  body: string
  onChange: (next: { title: string; body: string }) => void
  /** The wizard's own words under a field, when it refuses one. */
  errors?: { title?: string | null; body?: string | null }
  /** The words' limit (the wizard's WELCOME_BODY_MAX); the title's is a post's. */
  bodyMax?: number
  /** Ids for the wizard's labels and its error lines (aria-describedby). */
  ids?: { title?: string; body?: string }
}

export function WelcomePostWriter({ me, spaceName, title, body, onChange, errors, bodyMax = 5000, ids }: WelcomePostWriterProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<MentionTextareaHandle>(null)
  /* Where the caret was last, so an emoji goes there (the feed writer's rule, round 29). */
  const lastField = useRef<"title" | "body">("body")
  const latest = useRef({ title, body })
  latest.current = { title, body }

  const insertEmoji = (emoji: string) => {
    const el = titleRef.current
    if (lastField.current !== "title" || !el) return textRef.current?.insert(emoji)
    const from = el.selectionStart ?? el.value.length
    const to = el.selectionEnd ?? from
    if (el.value.length - (to - from) + emoji.length > TITLE_MAX) return
    onChange({ title: el.value.slice(0, from) + emoji + el.value.slice(to), body: latest.current.body })
    const caret = from + emoji.length
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
      el.setSelectionRange(caret, caret)
    })
  }

  const space = spaceName.trim() || tt("General")
  return (
    <div className={`${CARD} sm:shadow-[0_1px_2px_rgba(16,24,40,0.04)]`} data-composer="welcome">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5" data-composer-row="">
        <span className="flex shrink-0" data-composer-avatar="">
          <MemberAvatar src={me.avatarUrl} name={me.name} alt="" size={40} />
        </span>
        <div className="flex min-w-0 items-center text-[14.5px] text-[#6b7280]" data-composer-name="">
          <span className="truncate">
            {tt("{name} posting in {space}", { name: me.name, space })}
          </span>
          <span aria-hidden className="ml-1.5 shrink-0 text-[13px] leading-none" data-space-glyph="">
            {spaceGlyph(null, "feed")}
          </span>
        </div>
      </div>
      <div className="px-4 pb-4 pt-0.5 sm:px-5" data-composer-editor="">
        <input
          ref={titleRef}
          id={ids?.title}
          value={title}
          onChange={(e) => onChange({ title: e.target.value.slice(0, TITLE_MAX), body: latest.current.body })}
          onFocus={() => (lastField.current = "title")}
          maxLength={TITLE_MAX}
          placeholder={tt("Title")}
          aria-label={tt("Title")}
          aria-invalid={errors?.title ? true : undefined}
          aria-describedby={errors?.title && ids?.title ? `${ids.title}-error` : undefined}
          className={TITLE_FIELD}
          data-composer-title=""
        />
        {errors?.title ? (
          <p id={ids?.title ? `${ids.title}-error` : undefined} role="alert" className="mt-1 text-[13px] text-[#b42318]">
            {errors.title}
          </p>
        ) : null}
        {/* No community yet, so nobody to mention: the same field, its lookups off (communityId empty). */}
        <MentionTextarea
          ref={textRef}
          communityId=""
          value={body}
          onChange={(v) => onChange({ title: latest.current.title, body: v.slice(0, bodyMax) })}
          onFocus={() => (lastField.current = "body")}
          placeholder={tt("Write something...")}
          ariaLabel={tt("Welcome post")}
          minRows={4}
          maxLength={bodyMax}
          className={WORDS_FIELD}
        />
        {errors?.body ? (
          <p id={ids?.body ? `${ids.body}-error` : undefined} role="alert" className="mt-1 text-[13px] text-[#b42318]">
            {errors.body}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-0.5 border-t border-[#f0f1f3] pt-2.5" data-composer-tools="">
          <span data-composer-tool="emoji" className="contents">
            <EmojiControl className={TOOL} size={EMOJI_POPOVER} onBeforeOpen={() => undefined} onInsert={insertEmoji} />
          </span>
        </div>
      </div>
    </div>
  )
}
