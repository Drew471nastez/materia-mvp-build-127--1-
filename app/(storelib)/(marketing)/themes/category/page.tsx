import { permanentRedirect } from "next/navigation"

/** /themes/category on its own names no category: the marketplace is the list of them (round 58). */
export default function CategoryIndex() {
  permanentRedirect("/themes")
}
