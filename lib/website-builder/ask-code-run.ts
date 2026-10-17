/**
 * ===========================================================================
 *  A NEW SECTION, FROM THE CHAT'S SIDE
 * ===========================================================================
 * When the server's router (lib/website-builder/agent/router.ts) sends a
 * message to the section writer (app/api/website-builder/themes/[installId]/
 * sections/code): planned, written, drawn, read back against the request
 * and the picture, refined once. The chat draws its steps under "New
 * section: <name>", the canvas holds a spot with the same label, and when it
 * is done the section is put on the page, the canvas glides to it and rings
 * it once. The chat says one line, with View code beside it: no file in the
 * thread. An edit to the open section's code goes to the page assistant with
 * `codeFocus` instead (lib/website-builder/agent/loop.ts).
 *
 * The stream and its ending, kept here and pure so tests/ask-images-u.test.ts
 * can drive them without a browser.
 */

import { IMAGE_ACTION_LABELS, type ImageTarget } from "@/lib/sites/agent/questions"

/** One line the writer streams: a step in the page assistant's shapes, a stage, or the answer. */
export type WriterLine = Record<string, unknown> & { type?: string }

export interface WriterAnswer {
  status: number
  path?: string
  type?: string
  name?: string
  error?: string
  reply?: string
  errors?: { line?: number; message: string }[]
  imageSlots?: { setting: string; label: string }[]
  reviewed?: string
}

/**
 * The writer's answer, read as it arrives. Every line before the answer goes
 * to `onLine` as it lands: the chat draws them as the run's steps. An older
 * deployment, or a proxy that buffered it, answers with plain JSON, which is
 * read the same.
 */
export async function readWriteAnswer(res: Response, onLine: (line: WriterLine) => void): Promise<WriterAnswer> {
  const kind = res.headers.get("content-type") ?? ""
  if (!kind.includes("application/x-ndjson") || !res.body) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ...json, status: res.status }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: { status?: number; answer?: Record<string, unknown> } | null = null
  const take = (raw: string) => {
    const line = raw.trim()
    if (!line) return
    try {
      const event = JSON.parse(line) as WriterLine & { status?: number; answer?: Record<string, unknown> }
      if (event.type === "result") result = event
      else onLine(event)
    } catch {
      /* a partial line; the next read completes it */
    }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })
    let at = buffer.indexOf("\n")
    while (at >= 0) {
      take(buffer.slice(0, at))
      buffer = buffer.slice(at + 1)
      at = buffer.indexOf("\n")
    }
    if (done) break
  }
  take(buffer)
  const ended = result as { status?: number; answer?: Record<string, unknown> } | null
  if (!ended) return { status: 502, error: "The answer was cut off." }
  return { ...(ended.answer ?? {}), status: typeof ended.status === "number" ? ended.status : 500 } as WriterAnswer
}

/** The offer under a section that has a photo slot left empty: two pills that act on it. */
export interface PictureOffer {
  id: string
  question: string
  options: string[]
  target: ImageTarget
  /** No run is waiting on it: the picture is put in and that is all. */
  offer: true
}

/** What the exchange becomes once the writer has answered and the editor has placed (or not) the section. */
export interface WriteOutcome {
  reply?: string
  error?: string
  /** The answer was words, not a file: a conversation, not a failure. */
  answered?: boolean
  written?: { path: string; name: string; type: string; placedId: string | null }
  offer?: PictureOffer
}

/**
 * The writer's answer, made into what the chat says and what happens on the
 * canvas.
 *
 *   place     the editor puts the section on the page and answers with its
 *             id (true without one, false when it could not)
 *   finished  the canvas glides to that section and rings it once: the same
 *             call a page change ends with (onRunFinished)
 *
 * The chat says ONE line: "Added Hero with flag to the page." The file is
 * one press away (View code), never pasted into the thread.
 */
export async function finishWrite(
  answer: WriterAnswer,
  deps: {
    place: (section: { type: string; name: string; path: string }) => Promise<string | boolean> | string | boolean
    finished: (sectionIds: string[]) => void
    plainError: (status: number, error: string | undefined, compileErrors: boolean) => string
  },
): Promise<WriteOutcome> {
  if (answer.reply) return { reply: answer.reply, answered: true }
  const type = answer.type ?? answer.path?.match(/^sections\/([a-z0-9_-]+)\.storelib$/)?.[1]
  if (answer.status >= 400 || !answer.path || !answer.name || !type) {
    return { error: deps.plainError(answer.status, answer.error, Boolean(answer.errors?.length)) }
  }
  const section = { type, name: answer.name, path: answer.path }
  let placed: string | boolean = false
  try {
    placed = await deps.place(section)
  } catch {
    placed = false
  }
  const placedId = typeof placed === "string" && placed ? placed : null
  if (placedId) deps.finished([placedId])
  const onPage = placed !== false
  const slot = answer.imageSlots?.[0]
  return {
    reply: onPage ? `Added ${answer.name} to the page.` : `${answer.name} is written. Add it from Add Section, under Created.`,
    written: { ...section, placedId },
    ...(placedId && slot
      ? {
          offer: {
            id: `offer:${placedId}:${slot.setting}`,
            question: `Add the ${slot.label.toLowerCase()} for ${answer.name}`,
            options: [IMAGE_ACTION_LABELS.upload_image, IMAGE_ACTION_LABELS.image_url],
            target: { sectionId: placedId, setting: slot.setting, label: slot.label.toLowerCase() },
            offer: true as const,
          },
        }
      : {}),
  }
}
