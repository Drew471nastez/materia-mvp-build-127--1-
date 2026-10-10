/**
 * next/link, next/image, next/script, next/dynamic and friends: the bench
 * never draws a component, so each is a component that draws nothing.
 */
const Nothing = () => null
export default function dynamic() {
  return Nothing
}
export const ImageResponse = class {}
export const useLinkStatus = () => ({ pending: false })
export const getImageProps = () => ({ props: {} })
