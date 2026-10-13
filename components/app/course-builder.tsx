"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { forgetProduct } from "@/lib/products/forget-client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ArrowLeft, Plus, GripVertical, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import type { Product, Course, CourseModule, CourseLesson } from "@/lib/types"
import { tt } from "@/lib/i18n/text"

interface CourseBuilderProps {
  product: Product
  course: Course
  modules: (CourseModule & { lessons: CourseLesson[] })[]
}

export function CourseBuilder({ product, course, modules: initialModules }: CourseBuilderProps) {
  const router = useRouter()
  const [modules, setModules] = useState(initialModules)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(initialModules.map((m) => m.id)))
  const [isAddingModule, setIsAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState("")
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [addingLessonToModule, setAddingLessonToModule] = useState<string | null>(null)

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

  const handleAddModule = async () => {
    if (!newModuleTitle.trim()) return

    const supabase = createClient()
    const { data, error } = await supabase
      .from("course_modules")
      .insert({
        course_id: course.id,
        title: newModuleTitle,
        position: modules.length,
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      return
    }

    setModules([...modules, { ...data, lessons: [] }])
    setNewModuleTitle("")
    setIsAddingModule(false)
    setExpandedModules((prev) => new Set([...prev, data.id]))
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm(tt("Delete this module and all its lessons?"))) return

    const supabase = createClient()
    const { error } = await supabase.from("course_modules").delete().eq("id", moduleId)

    if (error) {
      console.error(error)
      return
    }

    setModules(modules.filter((m) => m.id !== moduleId))
  }

  const handleAddLesson = async (moduleId: string, title: string) => {
    const supabase = createClient()
    const module = modules.find((m) => m.id === moduleId)
    if (!module) return

    const { data, error } = await supabase
      .from("course_lessons")
      .insert({
        module_id: moduleId,
        title,
        position: module.lessons.length,
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      return
    }

    setModules(modules.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, data] } : m)))
    setAddingLessonToModule(null)
  }

  const handleDeleteLesson = async (moduleId: string, lessonId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("course_lessons").delete().eq("id", lessonId)

    if (error) {
      console.error(error)
      return
    }

    setModules(
      modules.map((m) => (m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m)),
    )
  }

  const handleUpdateLesson = async (lessonId: string, updates: Partial<CourseLesson>) => {
    const supabase = createClient()
    const { error } = await supabase.from("course_lessons").update(updates).eq("id", lessonId)

    if (error) {
      console.error(error)
      return
    }

    setModules(
      modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, ...updates } : l)),
      })),
    )
    setEditingLesson(null)
  }

  const togglePublish = async () => {
    const newStatus = product.status === "published" ? "draft" : "published"
    const supabase = createClient()
    const { error } = await supabase.from("products").update({ status: newStatus }).eq("id", product.id)
    if (!error) announceChange({ product: product.id })
    /* Published or unpublished is a change to what a visitor may see, so the
       caches that hold this course are dropped (app/api/products/forget). */
    if (!error) await forgetProduct(product.id, product.slug)
    router.refresh()
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
              <span className="text-sm text-muted-foreground">
                {tt("{length} modules,", { length: modules.length })} {modules.reduce((acc, m) => acc + m.lessons.length, 0)} {tt("lessons")}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/app/courses/${product.id}`}>{tt("Edit details")}</Link>
            </Button>
            <Button variant={product.status === "published" ? "outline" : "default"} onClick={togglePublish}>
              {product.status === "published" ? tt("Unpublish") : tt("Publish")}
            </Button>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-4">
        {modules.map((module, idx) => (
          <Card key={module.id}>
            <CardHeader className="cursor-pointer py-3" onClick={() => toggleModule(module.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  {expandedModules.has(module.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <CardTitle className="text-base">
                    {tt("Module {value}: {title}", { value: idx + 1, title: module.title })}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{tt("{length} lessons", { length: module.lessons.length })}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteModule(module.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {expandedModules.has(module.id) && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {module.lessons.map((lesson, lessonIdx) => (
                    <div
                      key={lesson.id}
                      className="flex items-center justify-between rounded-md border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{lessonIdx + 1}.</span>
                        <span className="text-sm">{lesson.title}</span>
                        {lesson.video_url && (
                          <Badge variant="secondary" className="text-xs">
                            {tt("Video")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Dialog
                          open={editingLesson === lesson.id}
                          onOpenChange={(open) => !open && setEditingLesson(null)}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setEditingLesson(lesson.id)}>
                              {tt("Edit")}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{tt("Edit Lesson")}</DialogTitle>
                            </DialogHeader>
                            <LessonForm
                              lesson={lesson}
                              onSave={(updates) => handleUpdateLesson(lesson.id, updates)}
                              onCancel={() => setEditingLesson(null)}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteLesson(module.id, lesson.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {addingLessonToModule === module.id ? (
                    <AddLessonForm
                      onAdd={(title) => handleAddLesson(module.id, title)}
                      onCancel={() => setAddingLessonToModule(null)}
                    />
                  ) : (
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => setAddingLessonToModule(module.id)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {tt("Add lesson")}
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))}

        {/* Add Module */}
        {isAddingModule ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2">
                <Input
                  placeholder={tt("Module title")}
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  autoFocus
                />
                <Button onClick={handleAddModule}>{tt("Add")}</Button>
                <Button variant="outline" onClick={() => setIsAddingModule(false)}>
                  {tt("Cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full bg-transparent" onClick={() => setIsAddingModule(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {tt("Add module")}
          </Button>
        )}
      </div>
    </div>
  )
}

function AddLessonForm({ onAdd, onCancel }: { onAdd: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("")

  return (
    <div className="flex gap-2 rounded-md border border-border p-3">
      <Input placeholder={tt("Lesson title")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <Button size="sm" onClick={() => onAdd(title)} disabled={!title.trim()}>
        {tt("Add")}
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel}>
        {tt("Cancel")}
      </Button>
    </div>
  )
}

function LessonForm({
  lesson,
  onSave,
  onCancel,
}: {
  lesson: CourseLesson
  onSave: (updates: Partial<CourseLesson>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(lesson.title)
  const [contentText, setContentText] = useState(lesson.content_text || "")
  const [videoUrl, setVideoUrl] = useState(lesson.video_url || "")

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="lessonTitle">{tt("Title")}</Label>
        <Input id="lessonTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="videoUrl">{tt("Video URL (YouTube, Vimeo, etc.)")}</Label>
        <Input id="videoUrl" placeholder="https://..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="content">{tt("Lesson content")}</Label>
        <Textarea
          id="content"
          placeholder={tt("Write your lesson content...")}
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          rows={6}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {tt("Cancel")}
        </Button>
        <Button
          onClick={() =>
            onSave({
              title,
              content_text: contentText || null,
              video_url: videoUrl || null,
            })
          }
        >
          {tt("Save")}
        </Button>
      </div>
    </div>
  )
}
