/**
 * ===========================================================================
 *  THE COURSE EDITOR'S CHANGES, AS THEY WILL BE SAVED (round 33)
 * ===========================================================================
 * The course card (app/app/products/new/course-editor.tsx, also a community
 * program's lessons) shows a change the moment it is made and saves it
 * behind (app/api/courses/manage, lib/courses/manage.ts). This is the change
 * applied to the tree in the browser exactly the way the server applies it,
 * so the tree on screen and the tree that comes back agree. Pure and browser
 * safe, so the tests run it.
 */
import type { EditorLesson, EditorModule, EditorTree } from "./types"

export const blankLesson = (id: string, title: string): EditorLesson => ({ id, title, coverUrl: null, notes: "", isPreview: false, durationSeconds: null, video: null, externalUrl: "", captions: false, attachments: [] })

/** A new row's id, made here: the server keeps it (lib/courses/manage.ts newId), so the next change can name the row before the first is answered. */
export function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16))
  hex[12] = "4"
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const s = hex.join("")
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/** The tree as it will be once this change is saved. Null when the change has no picture of its own (an upload, a file taken off): the editor waits for the server for those. */
export function optimistic(tree: EditorTree, body: Record<string, unknown>): EditorTree | null {
  const mods = tree.modules
  switch (body.action) {
    case "add-module": {
      const lessons = body.withLesson === false ? [] : [blankLesson(String(body.lessonId), String(body.lessonTitle ?? "Lesson 1"))]
      return { ...tree, modules: [...mods, { id: String(body.moduleId), title: String(body.title ?? ""), coverUrl: null, lessons }] }
    }
    case "add-lesson":
      return { ...tree, modules: mods.map((m) => (m.id === body.moduleId ? { ...m, lessons: [...m.lessons, blankLesson(String(body.lessonId), String(body.title ?? ""))] } : m)) }
    case "rename-module":
    case "update-module":
      return {
        ...tree,
        modules: mods.map((m) =>
          m.id === body.moduleId
            ? { ...m, ...(typeof body.title === "string" && body.title.trim() ? { title: body.title.replace(/\s+/g, " ").trim() } : {}), ...(body.coverUrl !== undefined ? { coverUrl: (body.coverUrl as string | null) || null } : {}), ...(body.priceCents !== undefined ? { priceCents: typeof body.priceCents === "number" && body.priceCents > 0 ? body.priceCents : null } : {}) }
            : m,
        ),
      }
    case "delete-module":
      return { ...tree, modules: mods.filter((m) => m.id !== body.moduleId) }
    case "order-modules": {
      const ids = Array.isArray(body.ids) ? (body.ids as string[]) : []
      const next = ids.map((id) => mods.find((m) => m.id === id)).filter((m): m is EditorModule => !!m)
      return next.length === mods.length ? { ...tree, modules: next } : tree
    }
    case "order-lessons": {
      const ids = Array.isArray(body.ids) ? (body.ids as string[]) : []
      const all = mods.flatMap((m) => m.lessons)
      return {
        ...tree,
        modules: mods.map((m) => (m.id === body.moduleId ? { ...m, lessons: ids.map((id) => all.find((l) => l.id === id)).filter((l): l is EditorLesson => !!l) } : { ...m, lessons: m.lessons.filter((l) => !ids.includes(l.id)) })),
      }
    }
    case "delete-lesson":
      return { ...tree, modules: mods.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== body.lessonId) })) }
    case "update-lesson":
      return {
        ...tree,
        modules: mods.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) =>
            l.id === body.lessonId
              ? {
                  ...l,
                  ...(typeof body.title === "string" && body.title.trim() ? { title: body.title.replace(/\s+/g, " ").trim() } : {}),
                  ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
                  ...(typeof body.isPreview === "boolean" ? { isPreview: body.isPreview } : {}),
                  ...(typeof body.externalUrl === "string" ? { externalUrl: body.externalUrl.trim() } : {}),
                  ...(body.coverUrl !== undefined ? { coverUrl: (body.coverUrl as string | null) || null } : {}),
                }
              : l,
          ),
        })),
      }
    default:
      return null
  }
}

/** Whether a change names one of these rows (a change waiting on a module that failed to be made goes with it). */
export function namesAny(body: Record<string, unknown>, ids: readonly string[]): boolean {
  return ids.some((id) => body.moduleId === id || body.lessonId === id || (Array.isArray(body.ids) && body.ids.includes(id)))
}

/** The tree on screen: the last one the server answered with, and every change still on its way on top, in order. */
export function treeOnScreen(confirmed: EditorTree, waiting: readonly Record<string, unknown>[]): EditorTree {
  return waiting.reduce<EditorTree>((t, body) => optimistic(t, body) ?? t, confirmed)
}
