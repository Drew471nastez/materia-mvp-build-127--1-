import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-white p-8">
      <div className="mb-8">
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-5 w-64" />
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profile Images Card */}
        <div className="rounded-lg border border-border p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="flex gap-4 mb-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-16 w-48" />
          </div>
          <Skeleton className="h-32 w-full rounded" />
        </div>

        {/* Profile Info Card */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="space-y-4">
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>

        {/* Store Status Card */}
        <div className="rounded-lg border border-border p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-16 w-full rounded" />
        </div>

        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}
