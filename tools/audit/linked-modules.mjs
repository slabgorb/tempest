// The modules that actually shipped in the 27-AUG-81 build. This is NOT just
// the linker's object list — it is that list PLUS every module any of those
// objects pull in via `.INCLUDE` at assemble time (transitively). A module
// assembled in via `.INCLUDE` produces real bytes in the binary just as surely
// as one named on the link line: ALEXEC.MAP's own symbol table proves it —
// it contains VGMSGA=31E4 and HALF=325C, glyph symbols that live in ANVGAN,
// which is nowhere on the link line itself.
//
// 1. Linked objects, from ALEXEC.MAP's link string:
//      BIN:ALEXEC,ALEXEC.XX=OBJ:ALWELG,ALSCOR,ALDISP,ALEXEC,ALSOUN,ALVROM/C
//                               ALCOIN,ALLANG,ALHARD,ALTEST,ALEARO,ALVGUT
//
// 2. Modules those objects `.INCLUDE`, therefore also shipped (verified by
//    grepping every module above for `.INCLUDE`):
//      ALCOMN  — .INCLUDEd by ALWELG, ALSCOR, ALDISP, ALEXEC, ALSOUN, ALCOIN,
//                ALLANG, ALHARD, ALTEST, ALEARO, ALVGUT (every linked object
//                except ALVROM)
//      VGMC    — ALVROM.MAC:18 `.INCLUDE VGMC` (also ALTEST.MAC:13, same module)
//      ANVGAN  — ALVROM.MAC:26 `.INCLUDE ANVGAN`
//      ASCVG   — ALLANG.MAC:14 `.INCLUDE ASCVG`
//      COIN65  — ALCOIN.MAC:20 `.INCLUDE COIN65`
//
// Rejected as never-shipped: ALDIS2, ALSCO2, ALHAR2, ALTES2. These are
// near-identical variant files sitting alongside the real ones in the source
// tree — ALDIS2 differs from ALDISP by a single operand (EOR I,02A vs
// EOR I,029) — so a citation to one looks perfectly plausible and is
// perfectly wrong. They are absent from the ALEXEC.MAP link string, and
// grepping every module above for `.INCLUDE` turns up no reference to any of
// them either: nothing linked or transitively included pulls them in. (ALDIAG
// is also out of scope, but for a different reason — its own header says
// "LINKED ALONE": it is a standalone diagnostic PROM, never reachable from
// ALEXEC's link line at all.)
//
// Before adding anything to this list: it must be either on the ALEXEC.MAP
// link line, or `.INCLUDE`d — directly or transitively — by something that
// is. Anything else, however plausibly named, never assembled into the ROM.
export const LINKED_MODULES = [
  // linked objects (ALEXEC.MAP)
  'ALWELG', 'ALSCOR', 'ALDISP', 'ALEXEC', 'ALSOUN', 'ALVROM',
  'ALCOIN', 'ALLANG', 'ALHARD', 'ALTEST', 'ALEARO', 'ALVGUT',
  // .INCLUDEd transitively by one of the above (see comment)
  'ALCOMN', 'VGMC', 'ANVGAN', 'ASCVG', 'COIN65',
]
