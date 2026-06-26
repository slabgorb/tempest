// Ambient type for Vite's `?raw` imports (file content as a string). Used by the
// pure-core boundary scan in tests/core/events.test.ts to read core source as
// text WITHOUT pulling Node's `fs` types into the project, preserving the
// deliberately browser-pure type posture (lib: DOM, types: vitest/globals only).
declare module '*?raw' {
  const content: string
  export default content
}
