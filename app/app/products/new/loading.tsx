import { EditorSkeleton } from "./editor-skeleton"

/** The new product form's frame, for a slow load only (see EditorSkeleton). */
export default function NewProductLoading() {
  return <EditorSkeleton editing={false} />
}
