/**
 * The motion and layout block of a new website's brief (round O, O5): the
 * business's site story (./stories.ts layoutStoryFor) and the motion rules
 * for the feel it suggests (lib/storelib-ai/motion motionForPrompt). One
 * function so every AI surface that plans a site can append the same text.
 * Pure.
 */
import { motionForPrompt } from "../motion"
import { layoutStoryFor, type StoryBrief } from "./stories"

export function motionAndLayoutBrief(brief: StoryBrief): string {
  const story = layoutStoryFor(brief)
  return `${story.text}\n\n${motionForPrompt(story.motion)}`
}
