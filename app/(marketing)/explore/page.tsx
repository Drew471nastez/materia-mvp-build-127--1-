import Link from "next/link"

export const metadata = {
  title: "Explore Creators & Products | Storelib",
  description: "Discover digital products, courses, and communities from top creators.",
}

export const dynamic = "force-dynamic"

export default async function ExplorePage() {
  // Minimal page - no database queries, no complex components
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Explore</h1>
        <p className="mt-2 text-muted-foreground">Discover creators and their products</p>
      </div>

      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground mb-4">
          Browse our collection of digital products and creators.
        </p>
        <Link href="/" className="text-primary hover:underline">
          Go to homepage
        </Link>
      </div>
    </div>
  )
}
