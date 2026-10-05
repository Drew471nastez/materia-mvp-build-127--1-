/**
 * What the course pages hand their client components. Plain data, browser
 * safe, and never a storage path: a video or a file is asked for by lesson
 * or attachment id, and the server decides again each time.
 */
import type { CourseStatus, LessonProgress, OutlineLesson } from "./progress"

export interface PlayerAttachment {
  id: string
  name: string
  size: number | null
}

export interface PlayerLesson extends OutlineLesson {
  /** The lesson's text, as the creator wrote it. Null for a locked lesson. */
  notes: string | null
  attachments: PlayerAttachment[]
  hasCaptions: boolean
  /** A preview visitor sees the title of every lesson but can open only these. */
  locked: boolean
}

export interface PlayerModule {
  id: string
  title: string
  lessons: PlayerLesson[]
}

export interface PlayerCreator {
  name: string
  avatarUrl: string | null
  /** Their page on Storelib, or null when they have no handle. */
  storeHref: string | null
}

export interface PlayerData {
  productId: string
  courseId: string
  title: string
  thumbnailUrl: string | null
  /** The public product page, for a preview visitor to buy from. */
  productHref: string | null
  creator: PlayerCreator
  modules: PlayerModule[]
  progress: LessonProgress[]
  /** The lesson to open first: the one asked for, or where they left off. */
  initialLessonId: string | null
  access: "creator" | "owner" | "preview"
  emailsOff: boolean
  /** False for a community's own program: it has no product, so no creator contact form and no reminder emails. */
  contact?: boolean
}

export interface MyCourse {
  productId: string
  title: string
  thumbnailUrl: string | null
  creator: { id: string; name: string; avatarUrl: string | null; storeHref: string | null }
  total: number
  completed: number
  percent: number
  status: CourseStatus
  totalSeconds: number
  /** ISO time they last had it open, or when they bought it. */
  lastOpenedAt: string | null
  purchasedAt: string | null
  /** Where Continue goes, and what it says. */
  resume: { lessonId: string; title: string; number: number } | null
}

/** The course as its creator edits it (app/api/courses/manage). */
export interface EditorLesson {
  id: string
  title: string
  notes: string
  isPreview: boolean
  durationSeconds: number | null
  video: { name: string; size: number | null } | null
  externalUrl: string
  captions: boolean
  attachments: PlayerAttachment[]
}

export interface EditorModule {
  id: string
  title: string
  lessons: EditorLesson[]
}

export interface EditorTree {
  courseId: string | null
  modules: EditorModule[]
}
