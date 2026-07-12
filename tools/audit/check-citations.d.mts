// Ambient type declaration for check-citations.mjs, so the strict TS project
// (which does not enable allowJs) can import it from tests/audit/citations.test.ts
// without tripping noImplicitAny (TS7016). Co-located .d.mts is the standard
// companion-declaration convention for a plain .mjs ESM module.
export function checkFindings(
  findings: object[],
  opts: { repoRoot: string; sourceDir: string | null },
): string[]
