"use client"

import { useRef, useLayoutEffect, useCallback, useState } from "react"

export type BlockType = "p" | "h2" | "h3" | "hr" | "img" | "youtube" | "table" | "quote" | "ul" | "ol" | "code"

export interface Block {
  id: string
  type: BlockType
  html?: string        // p, h2, h3, quote
  url?: string         // img
  alt?: string         // img
  caption?: string     // img
  videoId?: string     // youtube
  headers?: string[]   // table
  rows?: string[][]    // table
  items?: string[]     // ul, ol
  lang?: string        // code
  text?: string        // code
}

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

function extractYouTubeId(input: string): string {
  const match = input.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : input.trim()
}

// ─── Text Block (contenteditable) ─────────────────────────────────────────
function TextBlock({
  block,
  onChange,
  placeholder,
  className,
}: {
  block: Block
  onChange: (html: string) => void
  placeholder: string
  className: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastId = useRef(block.id)

  useLayoutEffect(() => {
    if (!ref.current) return
    if (block.id !== lastId.current || ref.current.innerHTML === "") {
      ref.current.innerHTML = block.html || ""
      lastId.current = block.id
    }
  }, [block.id, block.html])

  const execCmd = (cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
  }

  return (
    <div className="group/text relative">
      {/* Mini formatting toolbar */}
      <div className="absolute -top-9 left-0 hidden group-focus-within/text:flex items-center gap-0.5 bg-neutral-900 rounded-lg px-1 py-1 shadow-lg z-10">
        {[
          { cmd: "bold", icon: <span className="font-bold text-xs">B</span>, title: "Bold (⌘B)" },
          { cmd: "italic", icon: <span className="italic text-xs">I</span>, title: "Italic (⌘I)" },
          { cmd: "underline", icon: <span className="underline text-xs">U</span>, title: "Underline (⌘U)" },
          { cmd: "strikeThrough", icon: <span className="line-through text-xs">S</span>, title: "Strikethrough" },
        ].map(b => (
          <button
            key={b.cmd}
            onMouseDown={e => { e.preventDefault(); execCmd(b.cmd) }}
            title={b.title}
            className="w-7 h-7 flex items-center justify-center rounded-md text-white hover:bg-white/20 transition-colors"
          >
            {b.icon}
          </button>
        ))}
        <div className="w-px h-4 bg-white/20 mx-0.5" />
        <button
          onMouseDown={e => {
            e.preventDefault()
            const url = prompt("Link URL:")
            if (url) execCmd("createLink", url)
          }}
          title="Link"
          className="w-7 h-7 flex items-center justify-center rounded-md text-white hover:bg-white/20 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={() => { if (ref.current) onChange(ref.current.innerHTML) }}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); execCmd("bold") }
          if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); execCmd("italic") }
          if ((e.metaKey || e.ctrlKey) && e.key === "u") { e.preventDefault(); execCmd("underline") }
        }}
        className={`${className} outline-none min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-300`}
        data-placeholder={placeholder}
      />
    </div>
  )
}

// ─── Block type configs ────────────────────────────────────────────────────
const BLOCK_TYPES: { type: BlockType; label: string; group: string; icon: React.ReactNode }[] = [
  {
    type: "p", group: "Text", label: "Paragraph",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/></svg>,
  },
  {
    type: "h2", group: "Text", label: "Heading 2",
    icon: <span className="text-xs font-bold">H2</span>,
  },
  {
    type: "h3", group: "Text", label: "Heading 3",
    icon: <span className="text-xs font-bold">H3</span>,
  },
  {
    type: "quote", group: "Text", label: "Quote",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>,
  },
  {
    type: "code", group: "Text", label: "Code Block",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  },
  {
    type: "ul", group: "Lists", label: "Bullet List",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>,
  },
  {
    type: "ol", group: "Lists", label: "Numbered List",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>,
  },
  {
    type: "hr", group: "Structure", label: "Divider",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>,
  },
  {
    type: "table", group: "Structure", label: "Table",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  },
  {
    type: "img", group: "Media", label: "Image",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  },
  {
    type: "youtube", group: "Media", label: "YouTube",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor"/></svg>,
  },
]

const DEFAULTS: Record<BlockType, Partial<Block>> = {
  p: { html: "" },
  h2: { html: "" },
  h3: { html: "" },
  quote: { html: "" },
  code: { lang: "javascript", text: "" },
  ul: { items: [""] },
  ol: { items: [""] },
  hr: {},
  table: { headers: ["Column 1", "Column 2"], rows: [["", ""]] },
  img: { url: "", alt: "", caption: "" },
  youtube: { videoId: "" },
}

// ─── Single Block ──────────────────────────────────────────────────────────
function BlockItem({
  block,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onUpload,
}: {
  block: Block
  index: number
  total: number
  onChange: (id: string, updates: Partial<Block>) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onUpload: (file: File) => Promise<string>
}) {
  const [uploading, setUploading] = useState(false)

  const updateBlock = (updates: Partial<Block>) => onChange(block.id, updates)

  // ── Render the content area based on block type ──
  function renderContent() {
    switch (block.type) {
      case "p":
        return (
          <TextBlock
            block={block}
            onChange={html => updateBlock({ html })}
            placeholder="Write something…"
            className="text-neutral-800 text-base leading-relaxed py-1"
          />
        )

      case "h2":
        return (
          <TextBlock
            block={block}
            onChange={html => updateBlock({ html })}
            placeholder="Heading 2"
            className="text-2xl font-bold text-neutral-900 py-1"
          />
        )

      case "h3":
        return (
          <TextBlock
            block={block}
            onChange={html => updateBlock({ html })}
            placeholder="Heading 3"
            className="text-xl font-semibold text-neutral-900 py-1"
          />
        )

      case "quote":
        return (
          <div className="border-l-4 border-neutral-300 pl-4">
            <TextBlock
              block={block}
              onChange={html => updateBlock({ html })}
              placeholder="Enter a quote…"
              className="text-neutral-600 italic text-base leading-relaxed py-1"
            />
          </div>
        )

      case "code":
        return (
          <div className="rounded-xl bg-neutral-950 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
              <select
                value={block.lang || "javascript"}
                onChange={e => updateBlock({ lang: e.target.value })}
                className="text-xs text-neutral-400 bg-transparent outline-none cursor-pointer"
              >
                {["javascript", "typescript", "python", "jsx", "tsx", "html", "css", "json", "bash", "sql", "go", "rust", "java", "php"].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <span className="text-xs text-neutral-600 font-mono">code</span>
            </div>
            <textarea
              value={block.text || ""}
              onChange={e => updateBlock({ text: e.target.value })}
              placeholder="Enter code…"
              rows={6}
              spellCheck={false}
              className="w-full bg-transparent text-emerald-400 font-mono text-sm p-4 resize-none outline-none leading-relaxed"
            />
          </div>
        )

      case "hr":
        return (
          <div className="py-3 flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-neutral-300 text-xs">divider</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>
        )

      case "img":
        return (
          <div className="space-y-3">
            {block.url ? (
              <div className="relative rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.url} alt={block.alt || ""} className="w-full max-h-80 object-cover" />
                <button
                  onClick={() => updateBlock({ url: "" })}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center">
                <svg className="mx-auto mb-3 text-neutral-300" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <label className="cursor-pointer px-3 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded-lg hover:bg-neutral-800 transition-colors">
                    {uploading ? "Uploading…" : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploading(true)
                        const url = await onUpload(file)
                        updateBlock({ url })
                        setUploading(false)
                      }}
                    />
                  </label>
                  <span className="text-xs text-neutral-400">or</span>
                </div>
                <input
                  type="url"
                  placeholder="Paste image URL…"
                  value={block.url || ""}
                  onChange={e => updateBlock({ url: e.target.value })}
                  className="w-full max-w-sm px-3 py-1.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Alt text"
                value={block.alt || ""}
                onChange={e => updateBlock({ alt: e.target.value })}
                className="px-3 py-1.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <input
                type="text"
                placeholder="Caption (optional)"
                value={block.caption || ""}
                onChange={e => updateBlock({ caption: e.target.value })}
                className="px-3 py-1.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>
        )

      case "youtube": {
        const vid = block.videoId
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="YouTube URL or video ID…"
                value={block.videoId || ""}
                onChange={e => updateBlock({ videoId: extractYouTubeId(e.target.value) })}
                className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            {vid && (
              <div className="aspect-video rounded-xl overflow-hidden bg-neutral-100">
                <iframe
                  src={`https://www.youtube.com/embed/${vid}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube embed"
                />
              </div>
            )}
          </div>
        )
      }

      case "table": {
        const headers = block.headers || ["Column 1", "Column 2"]
        const rows = block.rows || [["", ""]]
        return (
          <div className="space-y-2 overflow-x-auto">
            <div className="inline-block min-w-full">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {headers.map((h, ci) => (
                      <th key={ci} className="border border-neutral-200 p-0">
                        <input
                          value={h}
                          onChange={e => {
                            const nh = [...headers]
                            nh[ci] = e.target.value
                            updateBlock({ headers: nh })
                          }}
                          className="w-full px-3 py-2 text-xs font-semibold text-neutral-700 bg-neutral-50 outline-none focus:bg-indigo-50"
                          placeholder={`Column ${ci + 1}`}
                        />
                      </th>
                    ))}
                    <th className="border border-neutral-200 w-8">
                      <button
                        onClick={() => updateBlock({ headers: [...headers, "Column"], rows: rows.map(r => [...r, ""]) })}
                        className="w-full h-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 py-2"
                        title="Add column"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-neutral-200 p-0">
                          <input
                            value={cell}
                            onChange={e => {
                              const nr = rows.map((r, rIdx) => rIdx === ri ? r.map((c, cIdx) => cIdx === ci ? e.target.value : c) : r)
                              updateBlock({ rows: nr })
                            }}
                            className="w-full px-3 py-2 text-neutral-700 outline-none focus:bg-blue-50"
                            placeholder="…"
                          />
                        </td>
                      ))}
                      <td className="border border-neutral-200 w-8">
                        <button
                          onClick={() => updateBlock({ rows: rows.filter((_, i) => i !== ri) })}
                          className="w-full flex items-center justify-center text-neutral-300 hover:text-red-500 hover:bg-red-50 py-2"
                          title="Delete row"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={headers.length + 1} className="border border-neutral-200">
                      <button
                        onClick={() => updateBlock({ rows: [...rows, Array(headers.length).fill("")] })}
                        className="w-full px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 text-left flex items-center gap-1"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add row
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      case "ul":
      case "ol": {
        const items = block.items || [""]
        const isOrdered = block.type === "ol"
        return (
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-neutral-400 text-sm w-5 text-right flex-shrink-0 font-medium">
                  {isOrdered ? `${i + 1}.` : "•"}
                </span>
                <input
                  type="text"
                  value={item}
                  onChange={e => {
                    const ni = [...items]
                    ni[i] = e.target.value
                    updateBlock({ items: ni })
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const ni = [...items]
                      ni.splice(i + 1, 0, "")
                      updateBlock({ items: ni })
                      setTimeout(() => {
                        const inputs = (e.target as HTMLElement).closest(".space-y-1\\.5")?.querySelectorAll("input")
                        inputs?.[i + 1]?.focus()
                      }, 10)
                    }
                    if (e.key === "Backspace" && item === "" && items.length > 1) {
                      e.preventDefault()
                      updateBlock({ items: items.filter((_, idx) => idx !== i) })
                    }
                  }}
                  placeholder={`Item ${i + 1}`}
                  className="flex-1 text-neutral-800 text-sm outline-none border-b border-transparent focus:border-neutral-200 py-0.5 transition-colors bg-transparent"
                />
                {items.length > 1 && (
                  <button
                    onClick={() => updateBlock({ items: items.filter((_, idx) => idx !== i) })}
                    className="text-neutral-300 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => updateBlock({ items: [...items, ""] })}
              className="ml-7 text-xs text-neutral-400 hover:text-neutral-600 flex items-center gap-1 mt-1"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add item
            </button>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="group/block relative flex gap-3">
      {/* Block type badge */}
      <div className="flex-shrink-0 mt-1">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-neutral-100 text-neutral-400 text-[10px] font-bold uppercase">
          {block.type === "p" ? "¶" : block.type === "hr" ? "—" : block.type === "img" ? "🖼" : block.type === "youtube" ? "▶" : block.type.toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">{renderContent()}</div>

      {/* Controls (appear on hover) */}
      <div className="flex-shrink-0 flex flex-col gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity mt-1">
        <button
          onClick={() => onMoveUp(block.id)}
          disabled={index === 0}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-neutral-100 text-neutral-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Move up"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button
          onClick={() => onMoveDown(block.id)}
          disabled={index === total - 1}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-neutral-100 text-neutral-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Move down"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-colors"
          title="Delete block"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  )
}

// ─── Add Block Menu ────────────────────────────────────────────────────────
function AddBlockMenu({ onAdd, compact }: { onAdd: (type: BlockType) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const groups = ["Text", "Lists", "Structure", "Media"]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={compact
          ? "flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-700 border border-dashed border-neutral-200 rounded-lg hover:border-neutral-400 transition-all hover:bg-white"
          : "flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 border border-dashed border-neutral-200 rounded-lg hover:border-neutral-400 transition-all hover:bg-white"
        }
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {compact ? "Add" : "Add Block"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-20 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 w-72">
            {groups.map(group => {
              const types = BLOCK_TYPES.filter(t => t.group === group)
              if (!types.length) return null
              return (
                <div key={group} className="mb-3 last:mb-0">
                  <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 px-1">{group}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {types.map(t => (
                      <button
                        key={t.type}
                        onClick={() => { onAdd(t.type); setOpen(false) }}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors text-left"
                      >
                        <span className="text-neutral-400">{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Inline Inserter (between blocks) ─────────────────────────────────────
function InlineInserter({
  onAdd,
  onUpload,
}: {
  onAdd: (type: BlockType) => void
  onUpload: (file: File) => Promise<string>
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="group/inserter relative flex items-center gap-1.5 py-0.5 -my-0.5">
      {/* Hover line */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-transparent group-hover/inserter:bg-neutral-200 transition-colors pointer-events-none" />

      {/* Quick actions */}
      <div className="relative z-[1] flex items-center gap-1 opacity-0 group-hover/inserter:opacity-100 transition-opacity ml-8">
        {/* Quick image upload */}
        <label
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-dashed border-neutral-200 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer ${uploading ? "text-blue-500 bg-blue-50 border-blue-300" : "text-neutral-400"}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          {uploading ? "Uploading..." : "Image"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploading(true)
              try {
                const url = await onUpload(file)
                if (url) {
                  onAdd("img")
                  // Small delay to let the block be created, then we update it via a custom event
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("blog-editor-set-last-img", { detail: { url } }))
                  }, 50)
                }
              } finally {
                setUploading(false)
                if (fileRef.current) fileRef.current.value = ""
              }
            }}
          />
        </label>

        {/* Quick paragraph */}
        <button
          onClick={() => onAdd("p")}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-400 rounded-lg border border-dashed border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/></svg>
          Text
        </button>

        {/* All blocks menu */}
        <AddBlockMenu onAdd={onAdd} compact />
      </div>
    </div>
  )
}

// ─── Main Blog Editor ──────────────────────────────────────────────────────
export interface BlogEditorProps {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
}

export default function BlogEditor({ blocks, onChange }: BlogEditorProps) {
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const [dragOver, setDragOver] = useState(false)

  const addBlock = useCallback((type: BlockType, afterIndex?: number) => {
    const newBlock: Block = { id: newId(), type, ...DEFAULTS[type] }
    const updated = [...blocksRef.current]
    if (afterIndex !== undefined) {
      updated.splice(afterIndex + 1, 0, newBlock)
    } else {
      updated.push(newBlock)
    }
    onChange(updated)
    return newBlock.id
  }, [onChange])

  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    onChange(blocksRef.current.map(b => b.id === id ? { ...b, ...updates } : b))
  }, [onChange])

  const deleteBlock = useCallback((id: string) => {
    onChange(blocksRef.current.filter(b => b.id !== id))
  }, [onChange])

  const moveUp = useCallback((id: string) => {
    const i = blocksRef.current.findIndex(b => b.id === id)
    if (i <= 0) return
    const updated = [...blocksRef.current]
    ;[updated[i - 1], updated[i]] = [updated[i], updated[i - 1]]
    onChange(updated)
  }, [onChange])

  const moveDown = useCallback((id: string) => {
    const i = blocksRef.current.findIndex(b => b.id === id)
    if (i >= blocksRef.current.length - 1) return
    const updated = [...blocksRef.current]
    ;[updated[i], updated[i + 1]] = [updated[i + 1], updated[i]]
    onChange(updated)
  }, [onChange])

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd })
    const data = await res.json()
    return data.url || ""
  }, [])

  // Listen for the custom event to set URL on the last added img block
  useLayoutEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail?.url
      if (!url) return
      const current = blocksRef.current
      // Find the last img block without a URL
      for (let i = current.length - 1; i >= 0; i--) {
        if (current[i].type === "img" && !current[i].url) {
          onChange(current.map((b, idx) => idx === i ? { ...b, url } : b))
          break
        }
      }
    }
    window.addEventListener("blog-editor-set-last-img", handler)
    return () => window.removeEventListener("blog-editor-set-last-img", handler)
  }, [onChange])

  // Drag-and-drop images onto the entire editor
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault()
      setDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))
    for (const file of files) {
      const url = await uploadImage(file)
      if (url) {
        const id = addBlock("img")
        // Short delay then set URL
        setTimeout(() => {
          onChange(blocksRef.current.map(b => b.id === id ? { ...b, url } : b))
        }, 30)
      }
    }
  }, [uploadImage, addBlock, onChange])

  return (
    <div
      className={`space-y-2 relative ${dragOver ? "ring-2 ring-blue-400 ring-offset-2 rounded-xl" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-30 bg-blue-50/80 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-blue-600 font-medium text-sm flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Drop image here to insert
          </div>
        </div>
      )}

      {blocks.length === 0 && (
        <div className="text-center py-12 text-neutral-300">
          <svg className="mx-auto mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          <p className="text-sm">No content yet. Add your first block below.</p>
          <p className="text-xs mt-1 text-neutral-300">You can also drag &amp; drop images anywhere here.</p>
        </div>
      )}

      {blocks.map((block, index) => (
        <div key={block.id}>
          {/* Inline inserter before each block */}
          <InlineInserter
            onAdd={(type) => addBlock(type, index - 1)}
            onUpload={uploadImage}
          />

          <div className="rounded-xl border border-transparent hover:border-neutral-100 p-3 transition-colors">
            <BlockItem
              block={block}
              index={index}
              total={blocks.length}
              onChange={updateBlock}
              onDelete={deleteBlock}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onUpload={uploadImage}
            />
          </div>
        </div>
      ))}

      {/* Bottom inserter + full Add Block menu */}
      <InlineInserter
        onAdd={(type) => addBlock(type)}
        onUpload={uploadImage}
      />

      <div className="pt-2">
        <AddBlockMenu onAdd={(type) => addBlock(type)} />
      </div>
    </div>
  )
}
