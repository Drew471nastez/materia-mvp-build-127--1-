/**
 * THE COMMUNITY NAVIGATOR (round 15): the one module the community's screens, the tab bar and the feed import to move a
 * member between places. The pure half (the Place type, placeHref, placeFromUrl) lives in places.ts so the server and the
 * tests read it without React; the hooks live in navigator-context.tsx. Both are here, under one name.
 */
export * from "./places"
export { addressFor, CommunityNavigatorProvider, registeredRefresh, useCommunityNavigator, useRegisterPlaceRefresh, useNavigatorOutsideCommunity, type CommunityNavigator, type GoOptions, type NavigatorHooks } from "./navigator-context"
