"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewCoursePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [includesCommunity, setIncludesCommunity] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

      if (!creator) throw new Error("Creator profile not found")

      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")

      // Create product
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          creator_id: creator.id,
          type: "course",
          title,
          slug,
          description,
          price_cents: Math.round(Number.parseFloat(price) * 100),
          includes_community: includesCommunity,
          status: "draft",
        })
        .select()
        .single()

      if (productError) throw productError

      // Create course record
      const { error: courseError } = await supabase.from("courses").insert({
        product_id: product.id,
      })

      if (courseError) throw courseError

      router.push(`/app/courses/${product.id}/builder`)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
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
          Back to courses
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New Course</h1>
        <p className="text-muted-foreground">Create a course with modules and lessons</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Course Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Complete Web Development Bootcamp"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What will students learn?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">Price (USD)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="99.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">Include community access</p>
                <p className="text-sm text-muted-foreground">Students will get access to your community</p>
              </div>
              <Switch checked={includesCommunity} onCheckedChange={setIncludesCommunity} />
            </div>
          </CardContent>
        </Card>

        {error && <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create course"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/app/courses">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
