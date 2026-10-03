import "server-only"

/**
 * VIDEO_POLL: asks a video service (Mux, Cloudflare Stream, Bunny) where a
 * video is, in case its webhook never arrives. Queued once per video when
 * the browser says the upload is done (lib/communities/server/videos.ts
 * completeVideoUpload); asks every two minutes until the video is ready or
 * failed, for at most a day, then marks it failed so nobody waits on it
 * forever. Payload { videoId, tries }.
 */
import type { JobRow } from "../../types"
import type { Db } from "../db"
import type { JobContext, JobOutcome } from "./index"
import { VIDEO_POLL_EVERY_MS, VIDEO_POLL_MAX_TRIES, pollVideo } from "../videos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function videoPoll(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  const videoId = typeof job.payload?.videoId === "string" ? job.payload.videoId : ""
  if (!UUID.test(videoId)) throw new Error("video_poll needs payload.videoId")
  const tries = Math.max(0, Number(job.payload?.tries) || 0)
  const state = await pollVideo(db, videoId)
  if (state !== "waiting") return
  if (tries + 1 >= VIDEO_POLL_MAX_TRIES) {
    await db.from("media_videos").update({ status: "failed", error: "The video service did not finish this video." }).eq("id", videoId).in("status", ["uploading", "processing"])
    return
  }
  return { again: { payload: { videoId, tries: tries + 1 }, runAt: new Date(ctx.now + VIDEO_POLL_EVERY_MS).toISOString() } }
}
