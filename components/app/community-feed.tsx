"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AppAvatar } from "@/components/app/app-avatar"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Pin, MoreHorizontal, Trash2, Users } from "lucide-react"
import type { CommunityPost, Profile } from "@/lib/types"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

interface CommunityFeedProps {
  creatorId: string
  userId: string
  posts: (CommunityPost & { author: Profile })[]
  isCreator: boolean
}

export function CommunityFeed({ creatorId, userId, posts: initialPosts, isCreator }: CommunityFeedProps) {
  const router = useRouter()
  const [posts, setPosts] = useState(initialPosts)
  const [newPost, setNewPost] = useState("")
  const [isPosting, setIsPosting] = useState(false)

  const handlePost = async () => {
    if (!newPost.trim()) return
    setIsPosting(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from("community_posts")
      .insert({
        creator_id: creatorId,
        author_id: userId,
        content: newPost,
      })
      .select(`*, author:profiles!community_posts_author_id_fkey(${PROFILE_CARD})` as const)
      .single()

    if (error) {
      console.error(error)
      setIsPosting(false)
      return
    }

    setPosts([data, ...posts])
    setNewPost("")
    setIsPosting(false)
  }

  const handleDelete = async (postId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("community_posts").delete().eq("id", postId)

    if (error) {
      console.error(error)
      return
    }

    setPosts(posts.filter((p) => p.id !== postId))
  }

  const handleTogglePin = async (postId: string, currentPinned: boolean) => {
    const supabase = createClient()
    const { error } = await supabase.from("community_posts").update({ pinned: !currentPinned }).eq("id", postId)

    if (error) {
      console.error(error)
      return
    }

    setPosts(
      posts
        .map((p) => (p.id === postId ? { ...p, pinned: !currentPinned } : p))
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }),
    )
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateString))
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Community</h1>
        <p className="text-muted-foreground">{isCreator ? "Engage with your customers" : "Join the conversation"}</p>
      </div>

      {/* New Post */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <Textarea
            placeholder="Share something with your community..."
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            rows={3}
          />
          <div className="mt-4 flex justify-end">
            <Button onClick={handlePost} disabled={isPosting || !newPost.trim()}>
              {isPosting ? "Posting..." : "Post"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Posts */}
      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => {
            const initials = post.author?.display_name
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()

            return (
              <Card key={post.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      {/* No name: the avatar's own person glyph, not a "?" at somebody. */}
                      <AppAvatar src={post.author?.avatar_url} name={post.author?.display_name || initials || ""} size={32} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{post.author?.display_name || "User"}</span>
                          {post.pinned && <Pin className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                    {(isCreator || post.author_id === userId) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isCreator && (
                            <DropdownMenuItem onClick={() => handleTogglePin(post.id, post.pinned)}>
                              <Pin className="mr-2 h-4 w-4" />
                              {post.pinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(post.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap">{post.content}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No posts yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Start the conversation with your community.</p>
        </div>
      )}
    </div>
  )
}
