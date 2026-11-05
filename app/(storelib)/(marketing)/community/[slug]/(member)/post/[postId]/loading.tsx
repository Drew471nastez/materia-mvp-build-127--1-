import { PlaceSpinner } from "@/components/community/member/place-spinner"

/*
  Inside the community's frame, which stays on screen: while this page is on its way, a small spinner in the middle column after a
  moment (components/community/member/place-spinner.tsx), never a skeleton and never over the bar or the side columns (round 9).
  The page's height, not a list's: a post opened from a notification or a search no longer collapses the column and grows again.
*/
export default function Loading() {
  return <PlaceSpinner label="Loading the post" />
}
