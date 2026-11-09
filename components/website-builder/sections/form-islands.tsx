"use client"

/**
 * The live native forms a .storelib section asks for with
 * `data-storelib-native-form` (lib/website-builder/form-islands.ts), drawn
 * into each mark with the same NativeFormBlock a native form section uses.
 * On the builder's canvas the form is a preview: nothing is sent.
 *
 * The form's code loads only on a page that has a mark.
 */
import { lazy, Suspense, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { NATIVE_FORM_ATTR, formIslandOf, type FormIslandSpec } from "@/lib/website-builder/form-islands"

const NativeFormBlock = lazy(() => import("@/components/forms/native-form-block").then((m) => ({ default: m.NativeFormBlock })))

type Island = FormIslandSpec & { el: HTMLElement }

export function FormIslands({ root, html, preview }: { root: HTMLElement | null; html: string; preview: boolean }) {
  const [islands, setIslands] = useState<Island[]>([])
  useLayoutEffect(() => {
    if (!root || !html.includes(NATIVE_FORM_ATTR)) {
      setIslands((was) => (was.length ? [] : was))
      return
    }
    setIslands(
      Array.from(root.querySelectorAll<HTMLElement>(`[${NATIVE_FORM_ATTR}]`)).flatMap((el) => {
        const spec = formIslandOf((n) => el.getAttribute(n))
        return spec ? [{ ...spec, el }] : []
      }),
    )
  }, [root, html])
  if (islands.length === 0) return null
  return (
    <>
      {islands.map((i, n) =>
        createPortal(
          <Suspense fallback={null}>
            <NativeFormBlock formId={i.formId} title={i.title} presentation={i.presentation} source="website" preview={preview} />
          </Suspense>,
          i.el,
          `${n}:${i.formId}`,
        ),
      )}
    </>
  )
}
