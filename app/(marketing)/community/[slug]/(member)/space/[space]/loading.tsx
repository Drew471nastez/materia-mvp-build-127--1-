import { PlaceSpinner } from "@/components/community/member/place-spinner"
import { SpaceChipsHeld } from "@/components/community/member/space-chips-held"

/*
  Inside the community's frame, which stays on screen: the row of spaces as it was (the pressed one chosen) and, under it, a small
  spinner after a moment (components/community/member/place-spinner.tsx), never a skeleton (round 9).
*/
export default function Loading() {
  return (
    <div>
      <SpaceChipsHeld />
      <PlaceSpinner label="Loading the space" />
    </div>
  )
}
