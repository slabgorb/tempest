// src/core/assert.ts
//
// A leaf. It imports nothing, so everything may import it — which is the whole point:
// `rules.ts` cannot reach into `enemies/interpreter.ts` (the interpreter imports rules),
// and `state.ts` already imports rules, so the only place an exhaustiveness guard can
// live where all three can see it is a module with no edges at all.

/**
 * The compile-time half of a `switch` over a closed union.
 *
 * Reaching here means the switch above did NOT handle every member — and because the
 * parameter is typed `never`, that is a `tsc` error at the call site, not a surprise in a
 * running game. The throw is the runtime backstop for a value that lied about its type
 * (a hand-built fixture, a stale `dist/`), and never the primary guard.
 *
 * A helper that took `unknown` and threw would be the runtime tripwire wearing a better
 * name. The `never` is the feature.
 */
export function assertNever(x: never, what = 'value'): never {
  throw new Error(`unhandled ${what}: ${String(x)}`)
}
