/**
 * ===========================================================================
 *  WHAT WAS SAID, PUT WHERE THE CARET IS, AND KEPT WHILE IT IS SAID
 * ===========================================================================
 * "Voice typing sometimes gets blocked and stops following what is said."
 * Four things did it, and the pure halves of their fixes are here
 * (components/website-builder/ask-voice.ts is the recogniser, theme-chat.tsx
 * the box):
 *
 *   A SESSION THAT ENDS IN SILENCE   Chrome and Safari end a "continuous"
 *                                    recognition after a pause, a network
 *                                    hiccup or a minute. It ended the
 *                                    recording with it. Now a new session
 *                                    starts while the person is still
 *                                    recording, and what the old one heard
 *                                    is kept in front of it (joinHeard).
 *   RESULTS READ FROM resultIndex    Android repeats earlier finals in later
 *                                    events, and words were counted twice;
 *                                    a session is read whole each time, with
 *                                    a repeated phrase kept once
 *                                    (transcriptOf).
 *   ALWAYS AT THE END                the words went after everything in the
 *                                    box, wherever the caret was. They go AT
 *                                    the caret now, with what was after it
 *                                    kept after them (anchorAt,
 *                                    composeDictation).
 *   A BOX THAT FOUGHT THE WORDS      typing while it listened was undone on
 *                                    the next frame by the words typing
 *                                    themselves back in. A key press now
 *                                    keeps what is in the box, and what is
 *                                    heard after it goes at the new caret
 *                                    (spokenSince).
 *
 * Pure: tests/ask-images-u.test.ts plays recordings through it.
 */

/** The box split at the caret when the recording started: the words go between the two. */
export interface DictationAnchor {
  before: string
  after: string
}

/** Where the words will go: at the caret, or at the end when there is none. */
export function anchorAt(draft: string, caret: number | null | undefined): DictationAnchor {
  const at = typeof caret === "number" && caret >= 0 && caret <= draft.length ? caret : draft.length
  return { before: draft.slice(0, at), after: draft.slice(at) }
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim()

/**
 * One recognition session, read whole: the words it is sure of, and the ones
 * it may still change. A result that repeats the one before it and goes on
 * (Android's "make the" then "make the hero") replaces it rather than being
 * added to it.
 */
export function transcriptOf(results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>): { final: string; interim: string } {
  const finals: string[] = []
  let interim = ""
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const text = flat(r?.[0]?.transcript ?? "")
    if (!text) continue
    if (!r.isFinal) {
      interim = flat(`${interim} ${text}`)
      continue
    }
    const last = finals[finals.length - 1]
    if (last && text.toLowerCase().startsWith(last.toLowerCase())) finals[finals.length - 1] = text
    else if (last && last.toLowerCase() === text.toLowerCase()) continue
    else finals.push(text)
  }
  return { final: finals.join(" "), interim }
}

/** What earlier sessions of this recording heard, then this one. */
export function joinHeard(earlier: string, session: string): string {
  return flat(`${earlier} ${session}`)
}

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
  return i
}

/**
 * What was heard after `offset`: the words already placed when the person
 * typed into the box mid recording. Where the recogniser has since revised
 * what was placed, only what differs from the end of it comes back.
 */
export function spokenSince(offset: string, heard: string): string {
  if (!offset) return flat(heard)
  const shared = commonPrefix(offset, heard)
  return flat(heard.slice(shared))
}

/**
 * The box with the spoken words at the anchor: a space between them and
 * what is before, and between them and what is after, only where one is
 * needed. And where the caret goes: just after the words.
 */
export function composeDictation(anchor: DictationAnchor, spoken: string): { text: string; caret: number } {
  const words = flat(spoken)
  if (!words) return { text: anchor.before + anchor.after, caret: anchor.before.length }
  const lead = anchor.before && !/\s$/.test(anchor.before) ? " " : ""
  const trail = anchor.after && !/^[\s.,;:!?)]/.test(anchor.after) ? " " : ""
  const head = `${anchor.before}${lead}${words}`
  return { text: `${head}${trail}${anchor.after}`, caret: head.length }
}

/**
 * Whether a session that just ended should be followed by another. While the
 * person is still recording, under the time limit, and not ending straight
 * away again and again (a recogniser that refuses to run would otherwise
 * restart forever: three quick ends with nothing heard and it stops).
 */
export function shouldRestart(input: { wanted: boolean; elapsedSeconds: number; limitSeconds: number; quickEnds: number }): boolean {
  return input.wanted && input.elapsedSeconds < input.limitSeconds && input.quickEnds < 3
}

/** A session that ended this soon after it started, hearing nothing, counts as a quick end. */
export const QUICK_END_MS = 1_200

/** The recogniser's errors that only end a session: the next one carries on. */
export function isTransientSpeechError(code: string): boolean {
  return code === "no-speech" || code === "aborted" || code === "network"
}
