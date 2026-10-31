/**
 * The real Add a section dialog (section-library.tsx, desktop) on an imported
 * theme, for scripts/check-section-preview-stress.mjs. Nothing about the
 * library or its previews is stubbed: only the theme's files arrive from
 * window.STRESS instead of the network, and the page exposes the ways an
 * editor changes them (a push, an AI edit) as window.stress.
 */
import { useState, useCallback, useMemo } from "react"
import { createRoot } from "react-dom/client"
import { SectionLibrary, deferPreviewsForChange, holdPreviewsForAi } from "@/components/website-builder/editor/section-library"
import { compatFilesChanged, patchCompatFiles } from "@/components/website-builder/compat/compat-files"
import { customAddableSections, customSectionSchemas } from "@/lib/website-builder/storelib-schemas"

type Stress = { sources: Record<string, string>; files: Record<string, string>; settings: Record<string, unknown> }
const data = (window as unknown as { STRESS: Stress }).STRESS
const INSTALL = "stress-install"
const liveFiles: Record<string, string> = { ...data.files }

const realFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes(`/themes/${INSTALL}/files`)) return Promise.resolve(new Response(JSON.stringify({ files: liveFiles }), { headers: { "Content-Type": "application/json" } }))
  if (url.startsWith("/api/")) return Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } }))
  return realFetch(input, init)
}) as typeof fetch

function Probe() {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState(data.sources)
  const [settings, setSettings] = useState(data.settings)
  const schemas = useMemo(() => customSectionSchemas(sources), [sources])
  const addable = useMemo(() => customAddableSections(schemas), [schemas])
  Object.assign(window, {
    stress: {
      open: () => setOpen(true),
      close: () => setOpen(false),
      /** A push: the section files and the theme's own files, as the editor receives them. */
      push: (next: Record<string, string | null>, files: Record<string, string> = {}) => {
        deferPreviewsForChange()
        setSources((prev) => {
          const out = { ...prev }
          for (const [k, v] of Object.entries(next)) {
            if (v === null) delete out[k]
            else out[k] = v
          }
          return out
        })
        if (Object.keys(files).length) {
          Object.assign(liveFiles, files)
          /* Either way the editor learns of it: the new text in hand, or "read the files again". */
          if (Math.random() < 0.5 || !patchCompatFiles(INSTALL, files)) compatFilesChanged(INSTALL)
        }
      },
      settings: (patch: Record<string, unknown>) => setSettings((s) => ({ ...s, ...patch })),
      ai: (on: boolean) => holdPreviewsForAi(on),
      sources: () => sources,
    },
  })
  const onAdd = useCallback(() => {}, [])
  return (
    <div style={{ height: "100vh", background: "#f8f9fa" }}>
      <SectionLibrary open={open} onOpenChange={setOpen} onAddSection={onAdd} schemas={schemas} addable={addable} ownTypes={addable} sources={sources} theme={settings as never} compatInstallId={INSTALL} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Probe />)
