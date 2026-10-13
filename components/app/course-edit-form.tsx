"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { deleteProduct, deleteQuestion, previewProductDelete, rememberDeleted, rememberStatus } from "@/lib/products/delete-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Trash2 } from "lucide-react"
import Link from "next/link"
import type { Product } from "@/lib/types"
import { tt } from "@/lib/i18n/text"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"

interface CourseEditFormProps {
  product: Product
}

export function CourseEditForm({ product }: CourseEditFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Said when a delete archived the course instead (it has sales). */
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState(product.title)
  const [description, setDescription] = useState(product.description || "")
  const [price, setPrice] = useState((product.price_cents / 100).toString())
  const [includesCommunity, setIncludesCommunity] = useState(product.includes_community)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          title,
          description,
          price_cents: Math.round(Number.parseFloat(price) * 100),
          includes_community: includesCommunity,
        })
        .eq("id", product.id)

      if (updateError) throw updateError

      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : tt("An error occurred"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    /* The question says what the press will do: a course with sales is archived, never deleted, so no student loses it. */
    const q = deleteQuestion(product.title, await previewProductDelete(product.id))
    if (!confirm(`${q.title}\n\n${q.body}`)) return

    /* On the server, by the session's own creator, with the caches and the OnePage after it (app/api/products/delete). */
    setError(null)
    setNotice(null)
    try {
      const result = await deleteProduct(product.id)
      if (result.outcome === "archived") {
        rememberStatus(product.id, result)
        setNotice(result.message)
        router.refresh()
        return
      }
      rememberDeleted(product.id)
      router.push("/app/courses")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("Could not delete the course"))
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/app/courses"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tt("Back to courses")}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={product.status === "published" ? "default" : "outline"} className="capitalize">
                {product.status}
              </Badge>
            </div>
          </div>
          <Button asChild>
            <Link href={`/app/courses/${product.id}/builder`}>{tt("Course builder")}</Link>
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{tt("Course Details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title">{tt("Title")}</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{tt("Description")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">{tt("Price ({currency})", { currency: SHOP_CURRENCY })}</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">{tt("Include community access")}</p>
                <p className="text-sm text-muted-foreground">{tt("Students will get access to your community")}</p>
              </div>
              <Switch checked={includesCommunity} onCheckedChange={setIncludesCommunity} />
            </div>
          </CardContent>
        </Card>

        {error && <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        {notice && <div role="status" className="rounded-lg border border-[#e5e7eb] bg-white p-4 text-sm text-[#1a1a2e]">{notice}</div>}

        <div className="flex justify-between">
          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? tt("Saving...") : tt("Save changes")}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/app/courses">{tt("Cancel")}</Link>
            </Button>
          </div>
          <Button type="button" variant="destructive" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {tt("Delete")}
          </Button>
        </div>
      </form>
    </div>
  )
}
