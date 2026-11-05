import { PlaceLoading } from "@/components/community/member/place-spinner"

/*
  Inside the community's frame, which stays on screen: the page's own title at once and a small spinner under it after a
  moment (components/community/member/place-spinner.tsx PlaceLoading), never a skeleton and never over the bar or the side
  columns. When the page lands its title is already in place and only what is under it fades in.
*/
export default function Loading() {
  return <PlaceLoading title="Notifications" detail={null} />
}
