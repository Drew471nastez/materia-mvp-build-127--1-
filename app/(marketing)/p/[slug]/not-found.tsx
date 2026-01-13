import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function ProductNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold">Product Not Found</h1>
      <p className="mt-4 max-w-md text-muted-foreground">This product doesn&apos;t exist or is no longer available.</p>
      <Button asChild className="mt-8">
        <Link href="/explore">Browse Products</Link>
      </Button>
    </div>
  )
}
