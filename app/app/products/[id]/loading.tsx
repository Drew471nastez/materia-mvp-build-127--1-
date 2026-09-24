import { EditorSkeleton } from "../new/editor-skeleton"

/**
 * Without this, opening a product fell back to the Products list's own
 * loading.tsx, the list's skeleton standing in for an editor. This one is the
 * editor's frame, and only after 300ms (see EditorSkeleton).
 */
export default function ProductEditLoading() {
  return <EditorSkeleton editing />
}
