"use client"
import { useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { OnePageBlock, LinkButtonBlockData } from "@/lib/onepage/types"
import {
  PRESENTABLE_BLOCKS,
  presentationOf,
  socialPresentation,
  type BlockPresentation,
} from "@/lib/onepage/block-presentation"
import { ColorRow, RangeRow, Segmented } from "./editor-kit"
import { tt } from "@/lib/i18n/text"

/** The editor's own controls, with presets first and optional fine tuning. */
export function BlockPresentationEditor({
  block,
  onChange,
  getBlock,
}: {
  block: OnePageBlock
  getBlock?: () => OnePageBlock | undefined
  onChange: (updates: Partial<OnePageBlock>) => void
}) {
  const latest = useRef(block)
  latest.current = block
  const [advanced, setAdvanced] = useState(false)
  if (!PRESENTABLE_BLOCKS.has(block.type)) return null
  const p = presentationOf(block),
    link = block.type === "link_button",
    data = block.data as LinkButtonBlockData
  const current = () => getBlock?.() || latest.current
  const set = (patch: Partial<BlockPresentation>) => {
    const source = current()
    onChange({
      style: {
        ...source.style,
        presentation: { ...source.style?.presentation, ...patch },
      },
    })
  }
  const color = (
    label: string,
    key: "title_color" | "subtitle_color" | "icon_color",
  ) => (
    <ColorRow
      label={label}
      value={p[key]}
      onChange={(value) => set({ [key]: value })}
      onClear={() => set({ [key]: undefined })}
      emptyLabel={tt("Page default")}
    />
  )
  const range = (
    label: string,
    key: "title_size" | "subtitle_size" | "icon_size" | "gap" | "padding",
    min: number,
    max: number,
    fallback: number,
  ) => (
    <RangeRow
      compact
      label={label}
      value={p[key] ?? fallback}
      min={min}
      max={max}
      step={1}
      unit="px"
      onChange={(value) => set({ [key]: value })}
    />
  )
  const visual = ["visual", "featured"].includes(p.variant || "")
  return (
    <section
      className="space-y-4 border-t border-[#eef0f2] pt-4"
      data-block-appearance=""
    >
      <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Style")}</p>
      <label className="block space-y-1.5 text-[12.5px] font-medium text-[#6b7280]">
        {tt("Description")}{" "}
        <span className="font-normal">{tt("(optional)")}</span>
        <textarea
          data-block-description=""
          rows={2}
          maxLength={600}
          value={p.subtitle ?? ""}
          placeholder={tt("Add a little more detail")}
          onChange={(e) => set({ subtitle: e.target.value })}
          className="w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-3 py-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]"
        />
      </label>
      {link ? (
        <>
          <Segmented
            label={tt("Link layout")}
            value={p.variant || "original"}
            options={[
              { id: "original", label: tt("Classic") },
              { id: "visual", label: tt("Card") },
              { id: "featured", label: tt("Featured") },
              { id: "image-first", label: tt("Photo") },
              { id: "compact", label: tt("Compact") },
            ]}
            onChange={(variant) =>
              set({ variant: variant as BlockPresentation["variant"] })
            }
          />
          {socialPresentation(data.url || "") ? (
            <Segmented
              label={tt("Social presentation")}
              value={p.media_mode || "card"}
              options={[
                { id: "card", label: tt("Open link") },
                { id: "native", label: tt("Display post") },
              ]}
              onChange={(media_mode) =>
                set({
                  media_mode: media_mode as "card" | "native",
                  ...(media_mode === "native" &&
                  (!p.variant || p.variant === "original")
                    ? { variant: "image-first" as const }
                    : {}),
                })
              }
            />
          ) : null}
          {p.variant && p.variant !== "original" ? (
            <Segmented
              label={tt("Block size")}
              value={p.size || "full"}
              options={[
                { id: "full", label: tt("Full width") },
                { id: "half", label: tt("Half width") },
                { id: "tall", label: tt("Tall") },
              ]}
              onChange={(size) =>
                set({ size: size as BlockPresentation["size"] })
              }
            />
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        aria-expanded={advanced}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#e3e4e8] px-3 text-[13px] font-medium text-[#1a1a2e]"
        onClick={() => setAdvanced((v) => !v)}
      >
        {tt("Text and colors")}
        <ChevronDown
          aria-hidden
          className="h-4 w-4 transition-transform"
          style={{ transform: advanced ? "rotate(180deg)" : undefined }}
        />
      </button>
      {advanced ? (
        <div className="space-y-4" data-block-advanced="">
          <Segmented
            label={tt("Text alignment")}
            value={p.align || "center"}
            options={[
              { id: "left", label: tt("Left") },
              { id: "center", label: tt("Center") },
              { id: "right", label: tt("Right") },
            ]}
            onChange={(align) =>
              set({ align: align as BlockPresentation["align"] })
            }
          />
          {color(tt("Title color"), "title_color")}
          {color(tt("Description color"), "subtitle_color")}
          {color(tt("Icon color"), "icon_color")}
          {range(tt("Title size"), "title_size", 12, 40, 16)}
          {range(tt("Description size"), "subtitle_size", 11, 24, 13)}
          {range(tt("Icon size"), "icon_size", 16, 48, 22)}
          <Segmented
            label={tt("Title weight")}
            value={String(p.title_weight || 600)}
            options={[
              { id: "400", label: tt("Regular") },
              { id: "600", label: tt("Semibold") },
              { id: "700", label: tt("Bold") },
            ]}
            onChange={(v) => set({ title_weight: Number(v) })}
          />
          {range(tt("Content spacing"), "gap", 0, 24, 8)}
          {range(tt("Inner padding"), "padding", 8, 40, 16)}
          {visual ? (
            <>
              <Segmented
                label={tt("Text position")}
                value={p.position || "bottom"}
                options={[
                  { id: "top", label: tt("Top") },
                  { id: "center", label: tt("Middle") },
                  { id: "bottom", label: tt("Bottom") },
                ]}
                onChange={(position) =>
                  set({ position: position as BlockPresentation["position"] })
                }
              />
              <RangeRow
                compact
                label={tt("Image shade")}
                value={p.overlay ?? 65}
                min={0}
                max={90}
                step={1}
                unit="%"
                onChange={(overlay) => set({ overlay })}
              />
              <ColorRow
                label={tt("Gradient start")}
                value={p.gradient_from}
                onChange={(gradient_from) =>
                  set({
                    gradient_from,
                    gradient_to: p.gradient_to ?? gradient_from,
                  })
                }
                onClear={() =>
                  set({ gradient_from: undefined, gradient_to: undefined })
                }
              />
              <ColorRow
                label={tt("Gradient end")}
                value={p.gradient_to}
                onChange={(gradient_to) =>
                  set({
                    gradient_to,
                    gradient_from: p.gradient_from ?? gradient_to,
                  })
                }
                onClear={() =>
                  set({ gradient_from: undefined, gradient_to: undefined })
                }
              />
            </>
          ) : null}
          <button
            type="button"
            className="min-h-10 text-[12.5px] font-medium text-[#6b7280] underline"
            onClick={() =>
              onChange({
                style: { ...current().style, presentation: undefined },
              })
            }
          >
            {tt("Reset block appearance")}
          </button>
        </div>
      ) : null}
    </section>
  )
}
