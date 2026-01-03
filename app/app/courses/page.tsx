import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, GraduationCap, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default async function CoursesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user!.id).single()

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", creator!.id)
    .eq("type", "course")
    .order("created_at", { ascending: false })

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-muted-foreground">Build and manage your online courses</p>
        </div>
        <Button asChild>
          <Link href="/app/courses/new">
            <Plus className="mr-2 h-4 w-4" />
            New course
          </Link>
        </Button>
      </div>

      {products && products.length > 0 ? (
        <div className="rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Course</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/app/courses/${product.id}`} className="font-medium hover:underline">
                      {product.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatPrice(product.price_cents)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={product.status === "published" ? "default" : "outline"} className="capitalize">
                      {product.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/courses/${product.id}`}>Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/app/courses/${product.id}/builder`}>Course builder</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No courses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first course and start teaching.</p>
          <Button className="mt-4" asChild>
            <Link href="/app/courses/new">
              <Plus className="mr-2 h-4 w-4" />
              Create course
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
