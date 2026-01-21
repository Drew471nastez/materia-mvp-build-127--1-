export default function OrderDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-32 bg-muted rounded animate-pulse" />
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid gap-6 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-64 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  )
}
