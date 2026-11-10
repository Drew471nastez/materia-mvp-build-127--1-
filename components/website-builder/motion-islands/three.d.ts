/*
 * three.js has no bundled type declarations and @types/three is not a
 * dependency: the one module that imports it (./object-3d.ts) types the
 * few shapes it uses itself.
 */
declare module "three"
declare module "three/examples/jsm/environments/RoomEnvironment.js"
declare module "three/examples/jsm/geometries/RoundedBoxGeometry.js"
