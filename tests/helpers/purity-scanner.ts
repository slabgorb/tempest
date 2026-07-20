// tests/helpers/purity-scanner.ts
//
// Story td1-2 (GREEN) — the core/shell boundary scanner, ported from joust
// (jt1-7 + jt1-11) onto the TypeScript compiler API. Replaces the inline
// `FORBIDDEN` regex table that used to live in tests/rom-clock-sources.test.ts
// (tp1-4's canonical core sweep), which comment-strips but never string-strips
// — so it both missed real holes AND over-flagged string data (see
// tests/purity-scanner.test.ts's RED-phase header for the measured probe
// table). One implementation, shared by the src/core sweep and
// tests/purity-scanner.test.ts (which pins its behaviour).
//
// ─── WHY AN AST AND NOT A BETTER REGEX ───────────────────────────────────────
// The old table strips comments over flat text but never strings. That leaves
// two failure modes, not one:
//
//   1. a `/*` inside a string still opens a phantom block comment that
//      swallows every violation up to the next real `*/`
//   2. a `//` inside a string still truncates the line
//   3. `${...}` interpolation reached via element access (`Math["random"]`)
//      never contains the literal `Date.now`/`Math.random` the regex greps for
//   4. `const { random } = Math` aliases past a call-anchored ban
//   5. `Date["now"]` re-spells a banned member so the literal never appears
//   6. a string carrying BOTH `//` and `/*` (no stripping order survives it)
//   • conversely, because strings are NEVER stripped, `"window.open failed"`
//     wrongly flags as `window.*` — a false POSITIVE the AST port also fixes,
//     because a string literal is data, not a live reference.
//
// The tempting fix is to reorder or extend the regexes. It does not work, and
// the companion suite proves it: each plausible patch direction breaks a
// different one of nine MUST HOLD cases (nested templates, a regex literal
// containing a quote, an apostrophe in a comment, division vs regex, …). A
// parser satisfies all of them without trying, because the distinction between
// code and text is exactly what parsing IS.
//
// ─── WHY TypeScript AND NOT acorn ────────────────────────────────────────────
// acorn parses JavaScript only, while `src/core/*.ts` is full of interfaces,
// generics, `as const` and type-only imports. `typescript` is already a direct
// devDependency and is TS-native, so this needs no new dependency at all.
//
// ─── WHAT THIS SCANNER DOES NOT DETECT (stated, not implied) ─────────────────
// The scanner is SYNTACTIC. It recognises banned names where they appear in
// code, and it follows the one binding form a variable declarator gives it. It
// does NOT perform dataflow analysis, so every route below is a KNOWN
// LIMITATION rather than an oversight, and none of them is half-implemented —
// a partial check here would read as coverage while providing none:
//
//   • spread — `const { ...rest } = Math; rest.random()`
//   • Object.assign — `const o = Object.assign({}, Math)`
//   • Reflect.get — `Reflect.get(Math, 'random')()`
//   • reassignment aliasing — `let x = null; x = Math; x.random()`
//   • class extends — `class C extends Date {}`
//
// Catching these needs real dataflow (or a type checker), which is a different
// tool. The boundary they guard is also defended by review — unlike the
// string-literal and element-access holes this port closed, which an INNOCENT
// string or a routine re-spelling could trip.
//
// SHADOWING IS DELIBERATELY STRICT. A local named `document` or `window`
// reports, even though it shadows the global and is therefore harmless. The
// alternative is scope tracking, and a false POSITIVE here costs one rename
// while a false negative costs the determinism the whole tube sim rests on.
//
// ─── THE ANTI-FALLBACK RULE ──────────────────────────────────────────────────
// There is deliberately no try/catch that falls back to a regex sweep. That
// shortcut would satisfy every behavioural case above while quietly restoring
// every hole. Source this scanner cannot parse is REPORTED, never certified.

import ts from 'typescript'

// ─── TEMPEST'S BAN SET (preserved exactly — smaller than centipede's/joust's) ─
// requestAnimationFrame, Date.now, new Date, performance.now, Math.random,
// document.*, window.*, and shell imports. That is the WHOLE surface. Tempest
// bans NONE of joust's setTimeout / localStorage / fetch / eval / new Function
// / globalThis / navigator / crypto / process / HTMLCanvasElement /
// AudioContext / dynamic import() — those are not in this repo's table and are
// not added here (that would silently expand the ban set beyond what this
// story's tests require).

/**
 * Objects whose every member access is a shell surface. Reported by object
 * name, so `view.windowSize` and `processInput()` never trip — only the OBJECT
 * identifier is consulted, never the member name.
 */
const BANNED_OBJECTS: ReadonlyMap<string, string> = new Map([
  ['window', 'window.*'],
  ['document', 'document.*'],
])

/** Specific `object.member` pairs — the object itself is otherwise legitimate. */
const BANNED_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['Date.now', 'Date.now()'],
  ['Math.random', 'Math.random()'],
  ['performance.now', 'performance.now()'],
])

/** Called functions that schedule work. */
const BANNED_CALLS: ReadonlyMap<string, string> = new Map([
  // The shell accumulates wall time and steps the sim in whole frames. Core
  // advances only when stepped — it never schedules itself.
  ['requestAnimationFrame', 'requestAnimationFrame()'],
])

/** `new X(...)` forms. */
const BANNED_CONSTRUCTORS: ReadonlyMap<string, string> = new Map([['Date', 'new Date()']])

/**
 * Objects that must not be aliased wholesale — binding them sidesteps every
 * member-anchored rule above. `Date` keeps its historical rule name because
 * existing tests assert it by name.
 */
const ALIASABLE_OBJECTS: ReadonlyMap<string, string> = new Map([
  ['Date', 'Date aliasing (= Date)'],
  ['Math', 'Math aliasing (= Math)'],
  ['performance', 'performance aliasing'],
  ['window', 'window aliasing'],
  ['document', 'document aliasing'],
])

/**
 * The boundary is one-way: core emits data, shell consumes it. Any import
 * reaching from core/ into shell/ inverts it.
 */
// Case-insensitive: '../SHELL/x' resolves and runs on macOS's case-insensitive
// filesystem, so a case-sensitive ban is an accidental-evasion channel.
const SHELL_SPECIFIER = /^\.{1,2}\/(?:[^'"]*\/)?shell/i

/**
 * Every boundary rule this source violates, deduplicated and in first-seen
 * order. Pure: the input string is never modified and no state survives a call.
 *
 * @param source the module text
 * @param filename used only for the parser's diagnostics
 */
export function violations(source: string, filename = 'module.ts'): string[] {
  const hits: string[] = []
  const seen = new Set<string>()
  /**
   * Report a rule once per (rule, line). The location matters: `rules.ts` is a
   * large module, and "crosses the boundary via Math.random()" with no line
   * leaves the author grepping.
   */
  const report = (rule: string, node?: ts.Node): void => {
    let where = ''
    if (node) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      where = ` (${filename}:${line + 1})`
    }
    const entry = rule + where
    if (seen.has(entry)) return
    seen.add(entry)
    hits.push(entry)
  }

  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )

  // THE ANTI-FALLBACK RULE. A file the scanner cannot read must never be
  // certified clean — that is exactly how a regex fallback would hide.
  const parseErrors = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics
  if (parseErrors && parseErrors.length > 0) {
    report(
      `unparseable source (${parseErrors.length} syntax error(s)) — ` +
        'the scanner cannot certify a file it cannot read',
    )
    return hits
  }

  /**
   * Strip the wrappers that carry an expression through unchanged. `(Math)`,
   * `Math!` and `Math satisfies object` are all still Math, and a scanner that
   * only recognises a bare Identifier misses every one of them.
   */
  const unwrap = (node: ts.Node): ts.Node => {
    let n = node
    for (;;) {
      if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n)) n = n.expression
      else if (ts.isSatisfiesExpression(n) || ts.isAsExpression(n)) n = n.expression
      else if (ts.isTypeAssertionExpression?.(n)) n = n.expression
      else return n
    }
  }

  /** The dotted text of a property access, when it is a plain a.b chain. */
  const memberPath = (node: ts.PropertyAccessExpression): string | null =>
    ts.isIdentifier(unwrap(node.expression))
      ? `${(unwrap(node.expression) as ts.Identifier).text}.${node.name.text}`
      : null

  const visit = (node: ts.Node): void => {
    // ── import ... from '../shell/...' ─────────────────────────────────────
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      SHELL_SPECIFIER.test(node.moduleSpecifier.text)
    ) {
      report('import from shell/', node)
    }

    // ── a.b / a['b'] ───────────────────────────────────────────────────────
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const target = unwrap(node.expression)
      if (ts.isIdentifier(target)) {
        const objectRule = BANNED_OBJECTS.get(target.text)
        if (objectRule) report(objectRule, node)
      }
      if (ts.isPropertyAccessExpression(node)) {
        const path = memberPath(node)
        const memberRule = path ? BANNED_MEMBERS.get(path) : undefined
        if (memberRule) report(memberRule, node)
      }
      // `Date['now']()` and `Math[\`random\`]()` reach the same member as
      // `Date.now()`. A literal subscript is not indirection — it is the same
      // access spelled differently, so it goes through the same table.
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(target)) {
        const arg = node.argumentExpression
        const key =
          ts.isStringLiteralLike(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)
            ? arg.text
            : ts.isNoSubstitutionTemplateLiteral(arg)
              ? arg.text
              : undefined
        if (key !== undefined) {
          const memberRule = BANNED_MEMBERS.get(`${target.text}.${key}`)
          if (memberRule) report(memberRule, node)
        }
      }
    }

    // ── new X(...) ─────────────────────────────────────────────────────────
    if (ts.isNewExpression(node) && ts.isIdentifier(unwrap(node.expression))) {
      const rule = BANNED_CONSTRUCTORS.get((unwrap(node.expression) as ts.Identifier).text)
      if (rule) report(rule, node)
    }

    // ── f(...) where f is a bare banned name ───────────────────────────────
    if (ts.isCallExpression(node) && ts.isIdentifier(unwrap(node.expression))) {
      const rule = BANNED_CALLS.get((unwrap(node.expression) as ts.Identifier).text)
      if (rule) report(rule, node)
    }

    // ── const x = <banned object>  /  const { m } = <banned object> ────────
    // FN-4 and FN-5: binding analysis, not tokenizing. `const { random } = Math`
    // and `Date["now"]` are lexically unremarkable — what makes the former a
    // violation is what it BINDS (the latter is actually caught above, by the
    // ordinary element-access visit: `Date["now"]` is a banned member whether
    // or not it is immediately called).
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrap(node.initializer)
      if (ts.isIdentifier(init)) {
        const rule = ALIASABLE_OBJECTS.get(init.text)
        if (rule) {
          // The two forms are EXCLUSIVE, so one defect is named once. Reporting
          // both `Math aliasing` and `destructuring Math` for a single
          // `const { random } = Math` would send the author hunting a second,
          // non-existent problem.
          if (ts.isObjectBindingPattern(node.name)) report(`destructuring ${init.text}`, node)
          // `const D = Date` — the bare constructor, no member access, no call.
          // A `: Date` annotation, `type X = Date` and `<T = Date>` are all
          // different node kinds and never reach here.
          else report(rule, node)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return hits
}
