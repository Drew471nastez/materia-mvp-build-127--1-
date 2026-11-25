/**
 * Materia, as the AI website builder knows it: the catalogue of sections and
 * blocks (./catalogue.ts), the closest template as a pattern (./reference.ts),
 * the rules (./rules.ts) and the checks on what a model writes (./validate.ts).
 * Server only in practice: the generated catalogue is large.
 */
export * from "./catalogue"
export * from "./reference"
export * from "./rules"
export * from "./validate"
export * from "./install"
