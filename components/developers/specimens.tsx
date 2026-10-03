/**
 * Settings as the builder draws them, for the Builder guide.
 *
 * STILL PICTURES, NOT CONTROLS. Each is drawn in the builder's own look (the
 * white panel, the dark switch, the slider, the swatch) with the setting's
 * default, so a reader can match what they read to what they see in the
 * editor. None of it takes focus or input: a working switch in a document
 * would be a switch that does nothing. Server rendered, no script.
 */
import type { SchemeSwatch, Specimen } from "@/lib/developers/builder-reference"
import { Inline } from "./inline"
import { MONO } from "./type"

const box = "h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] text-[#1a1a2e] flex items-center"

function Drawn({ s }: { s: Specimen }) {
  const v = s.value
  switch (s.control) {
    case "text":
    case "file":
    case "picker":
      return (
        <div className={box}>
          <span className={v ? "" : "text-[#9ca3af]"}>
            {v ? String(v) : s.placeholder ?? (s.control === "picker" ? `Choose ${s.label.toLowerCase()}` : "")}
          </span>
          {s.control === "picker" && <span aria-hidden className="ml-auto text-[#9ca3af]">▾</span>}
        </div>
      )
    case "textarea":
      return <div className={`${box} h-16 items-start py-2 text-[#9ca3af]`}>{v ? String(v) : s.placeholder ?? ""}</div>
    case "richtext":
      return (
        <div className="w-full overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
          <div className="flex items-center gap-2.5 border-b border-[#f1f2f4] px-2.5 py-1.5 text-[12px] text-[#6b7280]">
            <span>Paragraph ▾</span><b>B</b><i>I</i><span className="underline">Link</span><span>• List</span><span>1. List</span>
          </div>
          <div className="px-3 py-2 text-[13px] text-[#9ca3af]">Write something</div>
        </div>
      )
    case "number":
      return (
        <div className={`${box} justify-between tabular-nums`}>
          <span>{v ?? ""}</span>
          <span className="text-[11px] text-[#9ca3af]">{s.min !== undefined && s.max !== undefined ? `${s.min} to ${s.max}${s.unit ?? ""}` : s.unit ?? ""}</span>
        </div>
      )
    case "toggle": {
      const on = v === true
      return (
        <div className="flex h-9 items-center justify-end">
          <span className={`relative h-[20px] w-[36px] rounded-full ${on ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]"}`}>
            <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-white shadow ${on ? "left-[18px]" : "left-[2px]"}`} />
          </span>
          <span className="ml-2 w-6 text-[12px] text-[#6b7280]">{on ? "On" : "Off"}</span>
        </div>
      )
    }
    case "select":
    case "font": {
      const shown = typeof v === "string" && v !== "" ? (s.options?.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v) : s.options?.[0] ?? ""
      return (
        <div className={`${box} justify-between`}>
          <span style={s.control === "font" && shown ? { fontFamily: `'${shown}', ui-sans-serif, system-ui` } : undefined}>{shown}</span>
          <span aria-hidden className="text-[#9ca3af]">▾</span>
        </div>
      )
    }
    case "radio":
    case "alignment": {
      const opts = s.control === "alignment" ? ["Left", "Center", "Right"] : s.options ?? []
      const current = typeof v === "string" ? v.toLowerCase() : ""
      if (opts.length > 3) return <Drawn s={{ ...s, control: "select" }} />
      return (
        <div className="flex h-9 w-full rounded-lg bg-[#f1f2f4] p-[3px] text-[12px]">
          {opts.map((o, i) => {
            const active = current ? o.toLowerCase() === current || o.toLowerCase().startsWith(current) : i === 0
            return (
              <span key={o} className={`flex flex-1 items-center justify-center rounded-md ${active ? "bg-white font-medium text-[#1a1a2e] shadow-sm" : "text-[#6b7280]"}`}>
                {o}
              </span>
            )
          })}
        </div>
      )
    }
    case "range": {
      const min = s.min ?? 0
      const max = s.max ?? 100
      const n = typeof v === "number" ? v : min
      const pct = max > min ? Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100)) : 0
      return (
        <div className="flex h-9 w-full items-center gap-3">
          <span className="relative h-1 flex-1 rounded-full bg-[#e5e7eb]">
            <span className="absolute inset-y-0 left-0 rounded-full bg-[#1a1a2e]" style={{ width: `${pct}%` }} />
            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1a1a2e] bg-white" style={{ left: `${pct}%` }} />
          </span>
          <span className="w-16 text-right text-[12px] tabular-nums text-[#3d3f4e]">{n}{s.unit ?? ""}</span>
        </div>
      )
    }
    case "color": {
      const hex = typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : "#000000"
      return (
        <div className={`${box} gap-2.5`}>
          <span className="h-5 w-5 shrink-0 rounded-md border border-black/10" style={{ background: hex }} />
          <span className={`text-[12px] uppercase text-[#3d3f4e] ${MONO}`}>{hex}</span>
        </div>
      )
    }
    case "color_scheme":
      return (
        <div className={`${box} gap-2`}>
          <span className="flex h-6 w-6 items-center justify-center rounded border border-[#e5e7eb] text-[11px] font-semibold">Aa</span>
          <span>Light</span>
          <span aria-hidden className="ml-auto text-[#9ca3af]">▾</span>
        </div>
      )
    case "image":
    case "image_gallery":
    case "video":
      return (
        <div className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#d1d5db] bg-[#f8f9fa] text-[12px] text-[#6b7280]">
          <span className="font-medium text-[#3d3f4e]">{s.control === "video" ? "Paste video URL" : "Add Image"}</span>
          <span>{s.control === "video" ? "or upload a file" : "Click to upload or drag & drop"}</span>
        </div>
      )
    case "icon":
      return (
        <div className="grid h-9 w-full grid-cols-6 gap-1">
          {["★", "♥", "✓", "✉", "☎", "⌂"].map((g, i) => (
            <span key={g} className={`flex items-center justify-center rounded-md border text-[13px] ${i === 0 ? "border-[#1a1a2e]" : "border-[#e5e7eb] text-[#6b7280]"}`}>{g}</span>
          ))}
        </div>
      )
    case "url":
      return (
        <div className={`${box} justify-between`}>
          <span className="text-[#9ca3af]">Nothing linked</span>
          <span aria-hidden className="text-[#9ca3af]">↗</span>
        </div>
      )
    case "header":
      return <div className="w-full border-t border-[#e5e7eb] pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">{s.label}</div>
    case "paragraph":
      return <p className="w-full text-[12px] text-[#6b7280]">A line of help text.</p>
    case "divider":
      return <hr className="w-full border-[#e5e7eb]" />
  }
}

export function Specimens({ items }: { items: Specimen[] }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-[#e5e7eb]">
      {items.map((s) => (
        <div key={s.id} className="grid gap-3 border-b border-[#f1f2f4] px-4 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_240px] sm:gap-6">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#1a1a2e]">
              {s.label}
              <code className={`ml-2 rounded bg-[#f1f2f4] px-1.5 py-0.5 text-[12px] font-normal text-[#4b5563] ${MONO}`}>{s.id}</code>
            </p>
            {s.does && (
              <p className="mt-1 text-[14px] leading-[1.6] text-[#4b5563]">
                <Inline text={s.does} />
              </p>
            )}
          </div>
          {/* The picture of the control, with its default. Not a control. */}
          <div aria-hidden="true" className="pointer-events-none select-none self-center">
            <Drawn s={s} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SchemeSwatches({ schemes }: { schemes: SchemeSwatch[] }) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {schemes.map((sc) => {
        const get = (label: string) => sc.colors.find((c) => c.label === label)?.value ?? "#fff"
        return (
          <figure key={sc.key} className="overflow-hidden rounded-xl border border-[#e5e7eb]">
            {/* The scheme, as a section painted in it. */}
            <div className="px-4 py-5" style={{ background: get("Background") }}>
              <p className="text-[17px] font-semibold" style={{ color: get("Heading") }}>Aa {sc.name}</p>
              <p className="mt-1 text-[13px]" style={{ color: get("Text") }}>Body text on this scheme.</p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-md px-3 py-1.5 text-[12px] font-medium" style={{ background: get("Primary button"), color: get("Primary button text"), border: `1px solid ${get("Primary button border")}` }}>Primary</span>
                <span className="rounded-md px-3 py-1.5 text-[12px] font-medium" style={{ background: get("Secondary button"), color: get("Secondary button text"), border: `1px solid ${get("Secondary button border")}` }}>Secondary</span>
              </div>
            </div>
            <figcaption className="flex flex-wrap gap-1 border-t border-[#e5e7eb] bg-white p-2">
              {sc.colors.map((c) => (
                <span key={c.label} title={`${c.group}: ${c.label} ${c.value}`} className="h-4 w-4 rounded border border-black/10" style={{ background: c.value }} />
              ))}
              <code className={`ml-auto self-center text-[11px] text-[#6b7280] ${MONO}`}>{sc.key}</code>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
