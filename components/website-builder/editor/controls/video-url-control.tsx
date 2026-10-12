"use client"

/**
 * The control for `video_url`: a box to paste a YouTube or Vimeo link, and
 * one line under it saying what was found. Every shape people paste is
 * understood (a watch page, a youtu.be link, Shorts, a Vimeo page), and a
 * link that is not a video says so at once rather than leaving an empty
 * rectangle on the page to explain it.
 */
import { parseVideoUrl, VIDEO_HOSTS } from "@/lib/storelib-theme/values"
import { useEchoedValue } from "@/components/website-builder/echo-field"
import { INPUT, NOTE, PROBLEM } from "./styles"
import { tt } from "@/lib/i18n/text"

const HOST_NAME: Record<string, string> = { youtube: "YouTube", vimeo: "Vimeo" }

export function VideoUrlControl({
  value,
  onChange,
  accept,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: unknown) => void
  accept?: string[]
  placeholder?: string
  label?: string
}) {
  const [shown, set] = useEchoedValue(value ?? "", onChange)
  const hosts = accept && accept.length ? accept : [...VIDEO_HOSTS]
  const text = typeof shown === "string" ? shown.trim() : ""
  const found = text ? parseVideoUrl(text, hosts) : null
  const names = hosts.map((h) => HOST_NAME[h] ?? h)
  return (
    <div className="space-y-1">
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-invalid={!!text && !found}
        className={INPUT}
        placeholder={placeholder ?? "https://youtu.be/…"}
        value={typeof shown === "string" ? shown : ""}
        onChange={(e) => set(e.target.value)}
      />
      {text && found && (
        <p className={NOTE}>
          {HOST_NAME[found.host]} {tt("video {id}", { id: found.id })}
        </p>
      )}
      {text && !found && (
        <p className={PROBLEM} role="alert">
          {names.length === 1
            ? tt("Paste a {names} link. This one is not a {names2} video.", { names: names[0], names2: names[0] })
            : tt("Paste a {value} link. This one is not a video on {value2}.", { value: names.join(" or "), value2: names.length === 2 ? "either" : tt("any of them") })}
        </p>
      )}
    </div>
  )
}
