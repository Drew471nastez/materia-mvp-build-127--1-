/**
 * A CAPTION FILE THE BROWSER WILL SHOW. A <track> takes WebVTT only, and
 * creators often have SubRip (.srt) from their editor, which differs in two
 * places: no "WEBVTT" line at the top, and a comma before the milliseconds.
 * An .srt is turned into WebVTT when it is served; a .vtt is served as it
 * is. Anything that is neither is refused at upload. Pure.
 */

export const CAPTION_MAX_BYTES = 2 * 1024 * 1024

export function isCaptionName(name: unknown): boolean {
  return typeof name === "string" && /\.(vtt|srt)$/i.test(name.trim())
}

export function toWebVtt(text: string): string {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  if (/^WEBVTT/.test(clean)) return clean
  const body = clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
  return `WEBVTT\n\n${body.trim()}\n`
}

/** Whether the start of a file reads as captions at all: a header, or a first cue's timing line. */
export function looksLikeCaptions(text: string): boolean {
  const head = text.replace(/^﻿/, "").slice(0, 2000)
  return /^WEBVTT/.test(head) || /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(head)
}
