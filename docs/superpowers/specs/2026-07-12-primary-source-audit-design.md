# Tempest — primary-source fidelity audit

**Date:** 2026-07-12
**Status:** Approved, not yet executed
**Deliverables:** one audit doc (`docs/2026-07-12-tempest-primary-source-audit.md`), then one sprint epic of fix stories.

## Why

Our clone was built from **secondary** sources: the book *Tempest vs Tempest* and a
third-party labelled disassembly (`tempest.a65`). The book-derived findings doc says so
itself:

> The book reproduces hand-typed 6502 listings as images; a handful of operands are
> OCR/typo artifacts. […] re-verify any single magic number against `tempest.a65` / the
> ROM before baking it in.

Epic-10 then baked fifteen stories' worth of constants out of that book. Some of those
constants rest on a source that admits it may be wrong.

We now have the **primary** source: Dave Theurer's actual 1981 Atari assembler source,
19 `.MAC` files, at `~/Projects/tempest-source-text` (LF; `~/Projects/tempest-source` is
the same content, CRLF). It carries his original comments, his label names, and the
literal data tables — including `ALVROM.MAC`, "ALIENS ROM VG PICTURES, TABLES", which
holds the exact `VCTR` coordinates and `CSTAT` colours of every shape in the game.

This audit compares our implementation against that primary source, subsystem by
subsystem, and produces a verified inventory of every divergence.

## Scope

**In:** all game-relevant modules — `ALWELG`, `ALVROM`, `ALDISP`, `ALSOUN`, `ALSCOR`,
`ALLANG` (on-screen messages), `ALEARO` (EAROM high-score persistence), `ALEXEC`,
`ALCOMN`, `ALVGUT`.

**Out:** `ALTEST`, `ALDIAG`, `COIN65`, `ALCOIN` — self-test, diagnostics and coin
handling have no counterpart in a browser clone. Also `ANVGAN` (Ed Logg): it is not in
the linked build, and so falls to the rule below.

### Which files are real

The `2`-suffixed files are **not** second halves and **not** additional content. They are
near-identical variants: `ALDIS2` differs from `ALDISP` by a single operand
(`EOR I,02A` vs `EOR I,029`) plus a trailing blank line; `ALSCO2` differs from `ALSCOR`
by four lines.

`ALEXEC.MAP` records the actual 27-AUG-81 build and settles which shipped:

```
BIN:ALEXEC,ALEXEC.XX=OBJ:ALWELG,ALSCOR,ALDISP,ALEXEC,ALSOUN,ALVROM/C
                         ALCOIN,ALLANG,ALHARD,ALTEST,ALEARO,ALVGUT
```

`ALDIS2`, `ALSCO2`, `ALHAR2`, `ALTES2` and `ANVGAN` are **not linked**. They never
shipped.

**Rule: the linker map, not the directory listing, is the authority on what is real.** A
finding citing `ALDIS2.MAC` cites a byte that is not in the ROM — and the single operand
those two files differ by is precisely the sort the book's anti-piracy-checksum chapter
concerns. Any finding citing a `2` file is invalid and must be dropped or re-cited
against the linked module.

`ALCOMN` is `.INCLUDE`d by `ALWELG` rather than linked separately; it is a header, and is
in scope.

## Method: seven paired agents, then a verify pass

Each agent owns one source↔ours pair, reads both sides, and emits findings.

| # | Source | Ours |
|---|---|---|
| 1 | `ALWELG` — CAM tables, nymph→invader conversion, skill contour tables, easy/med/hard options | `core/sim.ts`, `core/enemies/*.ts`, `core/rules.ts` (difficulty) |
| 2 | `ALVROM` — `VCTR` coords, `CSTAT` colours, VG alphanumerics, picture/sequence tables — plus `ALLANG` (message text) | `shell/render.ts` (shapes), `shell/glyphs.ts`, `shell/font.ts`, `shell/titleLogo.ts`, HUD strings |
| 3 | `ALDISP` **part A** — objects drawn *in* the well: nymphs, cursor, invaders, flippers, tankers, jumpers, fuse, pulsar, charges, explosions, special-explosion database, big boom | `shell/render.ts` (object draw), `shell/fx.ts`, `shell/phosphor.ts` |
| 4 | `ALDISP` **part B** — the well *itself*: well coordinate tables, projection & scale-factor utilities, colours, spokes, well rim, starfield, enemy lines (spikes) | `core/geometry.ts`, `core/modelView.ts`, `shell/starfield.ts`, `shell/render.ts` (well) |
| 5 | `ALSOUN` | `shell/audio.ts`, `shell/audio-dispatch.ts` |
| 6 | `ALSCOR` + `ALEARO` (EAROM persistence) | `core/rules.ts` (scoring), high-score storage, name entry |
| 7 | `ALEXEC` + `ALCOMN` + `ALVGUT` | `core/state.ts`, `shell/loop.ts`, frame cadence, RAM map |

The part A / part B seam in `ALDISP` is "objects in the well" vs "the well and how it is
projected". Part B holds the projection and scale-factor utilities, which pair directly
against our `geometry.ts` / `modelView.ts` — the likeliest explanation for any
perspective wrongness.

Pair 1 is the highest-value pair in the audit. Theurer's **CAM table** is a
data-driven enemy-movement dispatcher; our five `enemies/*.ts` are hand-written state
machines derived from prose descriptions of behaviour.

### Finding format

Every finding MUST carry:

- **both citations** — `ALWELG.MAC:1234` *and* `core/sim.ts:456`
- the **verbatim source line**

No citation, no finding. It is dropped, not softened.

Each finding is classified:

| Class | Meaning |
|---|---|
| `DIVERGENCE` | We differ, and we are probably wrong |
| `CONFIRMED` | We match. Recorded — this is what makes the doc trustworthy |
| `BOOK-WAS-WRONG` | The primary source contradicts a constant epic-10 baked in from the book |
| `STRUCTURAL` | Differs because we are float/`dt` and the arcade is integer on a 60 Hz IRQ. Usually accept |
| `NO-COUNTERPART` | Exists in the arcade, absent from us entirely |

### Verify pass

A second agent re-opens every claimed `DIVERGENCE` and `BOOK-WAS-WRONG` at its cited
lines and attempts to **refute** it. Only survivors reach the doc.

Thirty findings that can be trusted beat eighty that must be re-checked.

## The audit doc

`docs/2026-07-12-tempest-primary-source-audit.md` becomes the authoritative fidelity
reference, superseding `docs/tempest-1981-source-findings.md` as the source of truth. It
explicitly flags every place the book — and therefore epic-10 — was wrong.

It opens with a **Rosetta glossary**, because Theurer's vocabulary is not ours and every
finding depends on the mapping:

| Theurer | Us |
|---|---|
| cursor | player / claw |
| charges | bullets |
| invaders | active enemies |
| nymphs | enemies at the top of the well, before they hatch — **a distinction our model may not have at all** |
| enemy lines | spikes |
| well | tube |

## Deviation policy

The audit inventories **everything**, including divergences previously ruled acceptable.
Nothing is silently omitted. That explicitly includes the four deviations epic-10 excluded
as deliberate — flipper-carrier fire, flip direction, spike max height, held-fire autofire
— and the core's float/`dt` architecture.

Each surviving finding carries a **recommendation** (fix / accept / won't-fix), reasoning,
and a size. The user rules per item. The epic is filed from the items ruled "fix", so the
ruling is made against a verified list rather than a raw one.

## Known risks

Both were raised and accepted before this spec was written.

1. **The CAM table may not map onto our enemy code.** If Theurer's enemies are
   table-driven where ours are five hand-written state machines, the fix is a rewrite of
   `core/enemies/`, not a set of constant tweaks. The audit will say so plainly rather
   than pretending the gap is small.

2. **Exact `ALVROM` coordinates will visibly change how enemies look.** That is the
   point of the exercise, but it is not a small diff, and the game will not look
   identical to today's build afterwards.

## Non-goals

- **No fixes in this pass.** The audit produces a report and an epic. Code changes happen
  in the epic's stories, after the user has ruled on each finding.
- **No CI-enforced fidelity harness.** Mechanically extracting the ROM tables into
  committed fixtures with tests asserting our constants match them is a stronger,
  permanent form of this work, and it was considered and set aside in favour of the
  report. It remains available later; nothing here forecloses it.

## Success criteria

- Every game-relevant module in the linked build has been read against its counterpart in
  our code.
- Every finding in the doc cites both sides and survived a refutation attempt.
- Every constant epic-10 took from the book has been checked against the primary source
  and marked `CONFIRMED` or `BOOK-WAS-WRONG`.
- The user can rule fix/accept/won't-fix on each finding without reopening the source.
