import { PlaceSpinner } from "@/components/community/member/place-spinner"

/*
  Inside the community's frame, which stays on screen: while this page is on its way, a small spinner in the middle column after a
  moment (components/community/member/place-spinner.tsx), never a skeleton and never over the bar or the side columns (round 9).
*/
export default function Loading() {
  return <PlaceSpinner label="Loading the course" />
}
