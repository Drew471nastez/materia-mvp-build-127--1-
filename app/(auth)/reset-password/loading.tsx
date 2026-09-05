import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="min-h-svh flex items-center justify-center skeleton-deferred">
      <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
    </div>
  )
}
