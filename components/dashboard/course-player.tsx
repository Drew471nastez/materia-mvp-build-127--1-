"use client"

import { personName } from "@/lib/profile/display-name"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { ArrowLeft, Check, ChevronDown, ChevronRight, PlayCircle, FileText, Users } from "lucide-react"
import type { Product, Creator, CourseModule, CourseLesson, CourseProgress, Profile } from "@/lib/types"

interface CoursePlayerProps {
  product: Product
  creator: Creator & { profile: Profile }
  modules: (CourseModule & { lessons: CourseLesson[] })[]
  currentLesson: CourseLesson | null
  progressMap: Map<string, CourseProgress>
  userId: string
  communityAccess: boolean
}

export function CoursePlayer({
  product,
  creator,
  modules,
  currentLesson,
  progressMap,
  userId,
  communityAccess,
}: CoursePlayerProps) {
  const router = useRouter()
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(modules.map((m) => m.id)))
  const [progress, setProgress] = useState(progressMap)
  const [isCompleting, setIsCompleting] = useState(false)

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) {
        next.delete(moduleId)
      } else {
        next.add(moduleId)
      }
      return next
    })
  }

  const isLessonComplete = (lessonId: string) => {
    return progress.get(lessonId)?.completed || false
  }

  const handleMarkComplete = async () => {
    if (!currentLesson) return
    setIsCompleting(true)

    const supabase = createClient()
    const existingProgress = progress.get(currentLesson.id)

    if (existingProgress) {
      await supabase
        .from("course_progress")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", existingProgress.id)
    } else {
      await supabase.from("course_progress").insert({
        buyer_id: userId,
        lesson_id: currentLesson.id,
        completed: true,
        completed_at: new Date().toISOString(),
      })
    }

    setProgress((prev) => {
      const next = new Map(prev)
      next.set(currentLesson.id, {
        ...existingProgress,
        id: existingProgress?.id || "",
        buyer_id: userId,
        lesson_id: currentLesson.id,
        completed: true,
        completed_at: new Date().toISOString(),
        created_at: existingProgress?.created_at || new Date().toISOString(),
      })
      return next
    })

    // Navigate to next lesson
    const allLessons = modules.flatMap((m) => m.lessons)
    const currentIndex = allLessons.findIndex((l) => l.id === currentLesson.id)
    if (currentIndex < allLessons.length - 1) {
      router.push(`/dashboard/courses/${product.id}?lesson=${allLessons[currentIndex + 1].id}`)
    }

    setIsCompleting(false)
  }

  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0)
  const completedLessons = Array.from(progress.values()).filter((p) => p.completed).length
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  return (
    <div className="flex h-svh">
      {/* Sidebar */}
      <aside className="flex w-80 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-sidebar-border p-4">
          <Link
            href="/dashboard/courses"
            className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to courses
          </Link>
          <h2 className="font-semibold">{product.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">by {personName({ name: (creator.profile as { display_name?: string | null } | null)?.display_name })}</p>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {modules.map((module, idx) => (
              <div key={module.id} className="mb-4">
                <button
                  onClick={() => toggleModule(module.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-sidebar-accent/50"
                >
                  <span>
                    {idx + 1}. {module.title}
                  </span>
                  {expandedModules.has(module.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {expandedModules.has(module.id) && (
                  <ul className="mt-1 space-y-1 pl-4">
                    {module.lessons.map((lesson) => {
                      const isActive = currentLesson?.id === lesson.id
                      const isComplete = isLessonComplete(lesson.id)

                      return (
                        <li key={lesson.id}>
                          <Link
                            href={`/dashboard/courses/${product.id}?lesson=${lesson.id}`}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "hover:bg-sidebar-accent/50",
                            )}
                          >
                            {isComplete ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : lesson.video_url ? (
                              <PlayCircle className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={cn(isComplete && "text-muted-foreground")}>{lesson.title}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ))}

            {communityAccess && (
              <Link
                href={`/dashboard/communities/${creator.id}`}
                className="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium"
              >
                <Users className="h-4 w-4" />
                Join Community
              </Link>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {currentLesson ? (
          <div className="mx-auto max-w-4xl p-8">
            <h1 className="text-2xl font-semibold">{currentLesson.title}</h1>

            {/* Video */}
            {currentLesson.video_url && (
              <div className="mt-6 aspect-video overflow-hidden rounded-lg bg-black">
                <iframe
                  src={currentLesson.video_url}
                  className="h-full w-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            )}

            {/* Content */}
            {currentLesson.content_text && (
              <div className="mt-6 prose prose-neutral max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap">{currentLesson.content_text}</div>
              </div>
            )}

            {/* Mark Complete */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              {isLessonComplete(currentLesson.id) ? (
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Completed</span>
                </div>
              ) : (
                <Button onClick={handleMarkComplete} disabled={isCompleting}>
                  {isCompleting ? "Saving..." : "Mark as complete"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Select a lesson to begin</p>
          </div>
        )}
      </main>
    </div>
  )
}
