// tests/core/tp1-4.cam-table.test.ts
//
// RED suite for story tp1-4 — THE CAM, part 1. Cluster C2 of the primary-source
// audit (findings W-005, W-006), against Theurer's original 1981 source.
//
// ── The finding ──────────────────────────────────────────────────────────────
// Enemy behaviour in the ROM is not five hard-coded state machines. It is a
// per-invader BYTECODE PROGRAM. Every invader carries INVCAM, a program counter
// into one shared byte array (the CAM, ALWELG.MAC:2374-2526). MOVINV loads it
// into CAMPC and executes opcodes through the JSRCAM dispatcher until a VEXIT
// yields the frame (ALWELG.MAC:1508-1534):
//
//     EXICAM = 1                     ;no-exit flag
//     CAMPC  = INVCAM[x]             ;resume where this invader left off
//     repeat
//         JSR JSRCAM  (CAM[CAMPC])   ;execute one opcode
//         INC CAMPC                  ;auto-increment
//     until EXICAM == 0              ;a VEXIT cleared it
//     INVCAM[x] = CAMPC              ;the PC PERSISTS across frames
//
// The CAM is therefore a coroutine per invader: VEXIT is a yield, not a halt.
//
// ── What this file pins ──────────────────────────────────────────────────────
// The DATA, byte-exactly: the 20 opcodes, their operand widths, all 11 programs,
// and the two dispatch tables (CAMWAV, TNEWCAM). Behaviour is pinned separately
// in tp1-4.cam-behaviour.test.ts, through the public sim.
//
// ── Two encoding rules, both load-bearing ────────────────────────────────────
// 1. An ADDRESS operand is stored as (target - CAM - 1) — one BELOW the target
//    offset. This is not a typo and not ours to "clean up": the CAMA2F macro
//    (ALWELG.MAC:1600-1606) emits `.BYTE ...Z-CAM-1`, because the handler does
//    `STA CAMPC` and then the dispatcher's `INC CAMPC` lands the PC on the
//    target. Keep the ROM's bytes; let the auto-increment do its job.
//
//        .MACRO CAMA2F ...X,...Y,...W
//        .WORD ...X-1
//        .MACRO ...Y,...Z
//        .BYTE ...W
//        .BYTE ...Z-CAM-1          <-- the minus one
//
// 2. A TABLE entry (CAMWAV, TNEWCAM) is a RAW offset, with no minus-one — it is
//    loaded straight into INVCAM and executed from (`.BYTE NOJUMP-CAM`,
//    ALWELG.MAC:712). The asymmetry is real. Do not "fix" it into agreement.
//
// (The one exception lives in CHASER, ALWELG.MAC:1871 — `LDA I,TOPPER-CAM-1`
// takes the minus-one because it reassigns the PC MID-FRAME, inside the
// dispatcher's own auto-increment. That is story tp1-5's problem, not ours.)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CAM, CAM_OPS, CAM_OPERAND_BYTES, CAM_ENTRY, CAMWAV, TNEWCAM, flipperCamForWave,
} from '../../src/core/enemies/cam'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── The 20 opcodes ───────────────────────────────────────────────────────────
// TABJSR, ALWELG.MAC:1609-1633. The byte value is the opcode's index into a
// table of 2-byte pointers, so the codes step by TWO: 0x00, 0x02, … 0x26.
// JSRCAM (1577-1582) uses the opcode as a byte offset directly:
//     TAY / LDA Y,TABJSR+1 / PHA / LDA Y,TABJSR / PHA / RTS
const ROM_OPCODES: ReadonlyArray<readonly [string, number]> = [
  ['VEXIT', 0x00],   // CAMAC  JEXIT,VEXIT,0     — clear EXICAM: yield the frame
  ['VSLOOP', 0x02],  // CAMA2I JSLOOP,VSLOOP,2   — INVLOO = immediate
  ['VSKIP0', 0x04],  // CAMAC  JSKIP0,VSKIP0,4   — if CAMSTA==0 skip the next 2 bytes
  ['VSETPC', 0x06],  // CAMA2F JSETPC,VSETPC,6   — unconditional jump
  ['VELOOP', 0x08],  // CAMA2F JELOOP,VELOOP,8   — --INVLOO; reloop unless 0
  ['VNOOP', 0x0a],   // CAMAC  JNOOP,VNOOP,0A
  ['VSMOVE', 0x0c],  // CAMAC  JSMOVE,VSMOVE,0C  — move one step up the lane
  ['VSTRAI', 0x0e],  // CAMAC  JSTRAI,VSTRAI,0E  — process TRALER (lay the spike)
  ['VSLOPB', 0x10],  // CAMA2I JSLOPB,VSLOPB,10  — INVLOO = *(zero-page param)
  ['VJUMPS', 0x12],  // CAMAC  JJUMPS,VJUMPS,12  — start a jump (flip)
  ['VJUMPM', 0x14],  // CAMAC  JJUMPM,VJUMPM,14  — advance the jump one angle-step
  ['VCHROT', 0x16],  // CAMAC  JCHROT,VCHROT,16  — reverse the rotation bit
  ['VKITST', 0x18],  // CAMAC  JKITST,VKITST,18  — test for cursor kill
  ['VBR0PC', 0x1a],  // CAMA2F JBR0PC,VBR0PC,1A  — branch if CAMSTA==0
  ['VELTST', 0x1c],  // CAMAC  JELTST,VELTST,1C  — CAMSTA=0 iff on an enemy line
  ['VSFUSE', 0x1e],  // CAMAC  JFUSEUP,VSFUSE,1E
  ['VFUSKI', 0x20],  // CAMAC  JFUSKI,VFUSKI,20
  ['VSPUMO', 0x22],  // CAMAC  JPULMO,VSPUMO,22
  ['VCHPLA', 0x24],  // CAMAC  JCHPLA,VCHPLA,24  — set rotation TOWARD the player
  ['VCHKPU', 0x26],  // CAMAC  JCHKPU,VCHKPU,26  — CAMSTA=0 iff not pulsing soon
] as const

// The five two-byte opcodes. Everything else is a bare byte. Getting this wrong
// desynchronises the whole PC — every opcode after it decodes as garbage.
const TWO_BYTE = new Set(['VSLOOP', 'VSETPC', 'VELOOP', 'VSLOPB', 'VBR0PC'])

describe('tp1-4 — the CAM opcode set (TABJSR, ALWELG.MAC:1609-1633)', () => {
  it('has exactly the ROM\'s 20 opcodes, at the ROM\'s byte values', () => {
    expect(Object.keys(CAM_OPS)).toHaveLength(20)
    for (const [name, value] of ROM_OPCODES) {
      expect(CAM_OPS[name as keyof typeof CAM_OPS], `opcode ${name}`).toBe(value)
    }
  })

  it('codes step by two, because TABJSR is a table of 2-byte pointers', () => {
    const values = ROM_OPCODES.map(([, v]) => v)
    expect(values).toEqual(values.map((_, i) => i * 2))
    // And every opcode the port defines is one the ROM defines — no inventions.
    expect(new Set(Object.values(CAM_OPS))).toEqual(new Set(values))
  })

  it('gives an operand to exactly the five CAMA2I/CAMA2F opcodes', () => {
    for (const [name, value] of ROM_OPCODES) {
      expect(CAM_OPERAND_BYTES[value], `operand width of ${name}`)
        .toBe(TWO_BYTE.has(name) ? 1 : 0)
    }
  })

  it('cites every opcode to the source — an uncited constant is not evidence', () => {
    // AC-1: "each cited to source". The citation must sit on the line that
    // defines the opcode, so it survives a reader who greps for one name.
    const src = readFileSync(join(repoRoot, 'src/core/enemies/cam.ts'), 'utf8')
    const lines = src.split('\n')
    for (const [name] of ROM_OPCODES) {
      const defining = lines.filter((l) => new RegExp(`\\b${name}\\b`).test(l) && /ALWELG\.MAC:\d+/.test(l))
      expect(defining.length, `${name} must be defined on a line citing ALWELG.MAC:<line>`)
        .toBeGreaterThan(0)
    }
  })
})

// ── The decoder ──────────────────────────────────────────────────────────────
// Walk the CAM exactly as the dispatcher does: read a byte, consume its operand
// if it has one, advance. If the port's operand widths are wrong this desyncs
// immediately and the program assertions below fail loudly — which is the point.
const NAME_OF: Record<number, string> = Object.fromEntries(
  ROM_OPCODES.map(([name, value]) => [value, name]),
)

interface Instr { name: string; operand?: number; offset: number }

// The 11 programs, plus COWJM2's alternate entry. Spelled out rather than derived
// from `keyof typeof CAM_ENTRY`: this list is the ROM's, and deriving it from the
// port would let a missing program quietly narrow the thing that checks for it.
type ProgramName =
  | 'TRALUP' | 'NOJUMP' | 'MOVJMP' | 'SPIRAL' | 'SPIRCH' | 'TOPPER'
  | 'COWJMP' | 'COWJM2' | 'FUSEUP' | 'FUSELR' | 'PULSCH' | 'AVOIDR'

function decode(entry: number, count: number): Instr[] {
  const out: Instr[] = []
  let pc = entry
  for (let i = 0; i < count; i++) {
    const op = CAM[pc]
    const name = NAME_OF[op]
    expect(name, `CAM[${pc}] = ${op} is not a ROM opcode (decode desynced?)`).toBeDefined()
    const width = CAM_OPERAND_BYTES[op]
    out.push({ name, operand: width ? CAM[pc + 1] : undefined, offset: pc })
    pc += 1 + width
  }
  return out
}

// An expected instruction. `to` is an index into THIS program's instruction list;
// `ext` names another program's entry; `imm` is a literal operand value.
type Step =
  | string
  | { op: string; to: number }
  | { op: string; ext: ProgramName }
  | { op: string; imm: number }
  | { op: string; any: true }   // operand exists but has no port-side meaning

function assertProgram(label: ProgramName, steps: readonly Step[]): void {
  const entry = CAM_ENTRY[label]
  expect(entry, `CAM_ENTRY.${label}`).toBeTypeOf('number')
  const got = decode(entry, steps.length)

  expect(got.map((i) => i.name), `${label}: opcode sequence`)
    .toEqual(steps.map((s) => (typeof s === 'string' ? s : s.op)))

  steps.forEach((step, i) => {
    if (typeof step === 'string') {
      expect(got[i].operand, `${label}[${i}] ${step} takes no operand`).toBeUndefined()
      return
    }
    const where = `${label}[${i}] ${step.op}`
    if ('imm' in step) {
      expect(got[i].operand, `${where} immediate`).toBe(step.imm)
    } else if ('to' in step) {
      // Rule 1: an address operand is the target offset MINUS ONE.
      expect(got[i].operand, `${where} → instruction ${step.to}`).toBe(got[step.to].offset - 1)
    } else if ('ext' in step) {
      expect(got[i].operand, `${where} → ${step.ext}`).toBe(CAM_ENTRY[step.ext] - 1)
    } else {
      expect(got[i].operand, `${where} operand`).toBeTypeOf('number')
    }
  })
}

describe('tp1-4 — the 11 CAM programs (ALWELG.MAC:2374-2526)', () => {
  // TRALUP is the SPIKER's program. The ROM calls the spiker a "TRALER" because
  // it TRAILS a spike up the lane behind it — which is what VSTRAI lays down.
  it('TRALUP — trailer moving up (ALWELG.MAC:2378-2386)', () => {
    assertProgram('TRALUP', [
      'VSMOVE',                          // MOVE UP
      'VSTRAI',                          // PROCESS TRALER
      { op: 'VBR0PC', ext: 'NOJUMP' },   // CONVERT TO CARRIER
      'VEXIT',
      { op: 'VSETPC', to: 0 },           // RELOOP
    ])
  })

  it('NOJUMP — moving up, no jumps (ALWELG.MAC:2387-2392)', () => {
    assertProgram('NOJUMP', [
      'VSMOVE',
      'VEXIT',
      { op: 'VSETPC', to: 0 },
    ])
  })

  it('MOVJMP — move N frames, then jump (ALWELG.MAC:2393-2406)', () => {
    assertProgram('MOVJMP', [
      { op: 'VSLOOP', imm: 8 },          // <-- see the comment trap below
      'VSMOVE',                          // MJLOP1: move up N frames
      'VEXIT',
      { op: 'VELOOP', to: 1 },
      'VJUMPS',                          // START JUMP
      'VEXIT',                           // MJLOP5
      'VJUMPM',                          // PROCESS JUMP
      'VSKIP0',                          // SKIP IF JUMP IS DONE
      { op: 'VSETPC', to: 5 },
      { op: 'VSETPC', to: 0 },           // JUMP IS DONE. RESTART SEQUENCE
    ])
  })

  it('MOVJMP loops EIGHT times — the source comment says three, and it lies', () => {
    // ALWELG.MAC:2392 reads ";MOVE 3 TIMES, THEN JUMP" directly above a
    // `VSLOOP 8`. Where the comment and the code disagree, the CODE is the
    // machine. Pin the refutation so nobody "corrects" 8 back to the comment.
    const [first] = decode(CAM_ENTRY.MOVJMP, 1)
    expect(first.name).toBe('VSLOOP')
    expect(first.operand, 'VSLOOP 8 — the code, not the comment').toBe(8)
    expect(first.operand, 'the comment\'s 3 appears nowhere in the machine').not.toBe(3)
  })

  it('SPIRAL — smooth upward spiral: it CLIMBS while it flips (ALWELG.MAC:2407-2419)', () => {
    assertProgram('SPIRAL', [
      'VSMOVE',
      'VEXIT',
      'VJUMPS',
      'VEXIT',                           // SPILOP
      'VJUMPM',
      'VSMOVE',                          // <-- the VSMOVE INSIDE the jump loop
      'VSKIP0',
      { op: 'VSETPC', to: 3 },
      { op: 'VSETPC', to: 0 },
    ])
  })

  it('SPIRCH — change jump direction every 2 jumps, then every 3 (ALWELG.MAC:2420-2446)', () => {
    assertProgram('SPIRCH', [
      'VSMOVE',
      'VEXIT',
      { op: 'VSLOOP', imm: 2 },          // LOOP FOR N JUMPS
      'VJUMPS',                          // SPRLP1
      'VEXIT',                           // SPRLP2
      'VJUMPM',
      'VSMOVE',
      'VSKIP0',
      { op: 'VSETPC', to: 4 },
      'VEXIT',
      { op: 'VELOOP', to: 3 },
      'VCHROT',                          // CHANGE JUMP DIRECTION
      { op: 'VSLOOP', imm: 3 },          // LOOP FOR N JUMPS
      'VJUMPS',                          // SPRLP3
      'VEXIT',                           // SPRLP4
      'VJUMPM',
      'VSMOVE',
      'VSKIP0',
      { op: 'VSETPC', to: 14 },
      'VEXIT',
      { op: 'VELOOP', to: 13 },
      'VCHROT',
      { op: 'VSETPC', to: 0 },           // START OVER
    ])
  })

  it('TOPPER — chase the player around the top, double-speed jump (ALWELG.MAC:2447-2461)', () => {
    assertProgram('TOPPER', [
      { op: 'VSLOOP', imm: 4 },          // WAIT IN CROUCH FOR N FRAMES
      'VKITST',                          // KICHEK: test for cursor kill
      'VEXIT',
      { op: 'VELOOP', to: 1 },
      'VJUMPS',
      'VEXIT',                           // KJULP1
      { op: 'VSLOPB', any: true },       // VSLOPB WTTFRA — a zero-page address
      'VJUMPM',                          // KJULP2: DOUBLE SPEED JUMP
      { op: 'VBR0PC', to: 0 },
      { op: 'VELOOP', to: 7 },
      { op: 'VSETPC', to: 5 },
    ])
  })

  it('COWJMP — flip on open lines, keep climbing on enemy lines (ALWELG.MAC:2462-2475)', () => {
    // COWJM2 is not a 12th program: it is an ALTERNATE ENTRY one byte BELOW
    // COWJMP, whose only instruction is a VEXIT that falls straight through.
    // Re-entering at COWJM2 therefore costs a frame; re-entering at COWJMP does
    // not. Both branch targets inside the program aim at COWJM2, so the loop
    // always yields — an interpreter that collapses the two entries into one
    // spins forever inside a single frame.
    expect(CAM_ENTRY.COWJM2, 'COWJM2 sits exactly one byte below COWJMP')
      .toBe(CAM_ENTRY.COWJMP - 1)

    assertProgram('COWJM2', [
      'VEXIT',                           // COWJM2 — the alternate entry
      'VSMOVE',                          // COWJMP — MOVE ENEMY
      'VELTST',                          // ON AN ENEMY LINE?
      { op: 'VBR0PC', to: 0 },           // YES. CONTINUE UP ON LINE
      'VJUMPS',                          // NO. START A JUMP
      'VEXIT',
      'VSMOVE',
      'VJUMPM',                          // COWJM3
      { op: 'VBR0PC', to: 0 },           // JUMP DONE
      'VEXIT',
      { op: 'VSETPC', to: 7 },           // CONTINUE JUMP
    ])
  })

  it('FUSEUP — fuse up/down (ALWELG.MAC:2479-2485)', () => {
    assertProgram('FUSEUP', [
      'VSFUSE',
      'VFUSKI',
      'VEXIT',
      { op: 'VSETPC', to: 0 },
    ])
  })

  it('FUSELR — fuse left/right (ALWELG.MAC:2486-2494)', () => {
    assertProgram('FUSELR', [
      'VEXIT',
      { op: 'VSLOOP', imm: 3 },          // SLOWL [sic]
      'VFUSKI',                          // FUSLOP
      'VEXIT',
      { op: 'VELOOP', to: 2 },
      'VJUMPM',
      { op: 'VBR0PC', ext: 'FUSEUP' },
      { op: 'VSETPC', to: 0 },
    ])
  })

  it('PULSCH — the pulsar chases the player (ALWELG.MAC:2495-2512)', () => {
    assertProgram('PULSCH', [
      { op: 'VSLOPB', any: true },       // VSLOPB PUCHDE — pulsar chase delay
      'VSPUMO',                          // PULSC1
      'VEXIT',
      { op: 'VELOOP', to: 1 },
      'VCHKPU',                          // PULSC2: pulsing?
      { op: 'VBR0PC', to: 9 },           // branch if NOT
      'VSPUMO',
      'VEXIT',
      { op: 'VSETPC', to: 4 },
      'VCHPLA',                          // PULSC3: flip direction toward player
      'VJUMPS',
      'VEXIT',                           // PULSCJ
      'VJUMPM',
      { op: 'VBR0PC', to: 0 },
      { op: 'VSETPC', to: 11 },
    ])
  })

  it('AVOIDR — the avoidance flipper flips AWAY from the player (ALWELG.MAC:2513-2526)', () => {
    // VCHPLA aims at the player; VCHROT immediately reverses it. Toward, then
    // away — the ROM spends two opcodes to say "flee", and it is deliberate.
    assertProgram('AVOIDR', [
      'VCHPLA',                          // SET DIRECTION TOWARD PLAYER
      'VCHROT',                          // REVERSE IT
      'VJUMPS',
      'VEXIT',                           // AVOID1
      'VSMOVE',
      'VJUMPM',
      'VSKIP0',
      { op: 'VSETPC', to: 3 },
      { op: 'VSLOOP', imm: 4 },
      'VEXIT',                           // AVOID2
      'VSMOVE',
      { op: 'VELOOP', to: 9 },
      { op: 'VSETPC', to: 0 },
    ])
  })

  it('ships all 11 programs and no twelfth', () => {
    // COWJM2 is an entry point, not a program — hence 11 programs, 12 entries.
    expect(Object.keys(CAM_ENTRY).sort()).toEqual([
      'AVOIDR', 'COWJM2', 'COWJMP', 'FUSELR', 'FUSEUP', 'MOVJMP',
      'NOJUMP', 'PULSCH', 'SPIRAL', 'SPIRCH', 'TOPPER', 'TRALUP',
    ])
  })
})

describe('tp1-4 — CAMWAV: the flipper\'s program is chosen per wave (ALWELG.MAC:711-727)', () => {
  // The 16 entries run with the 16 well shapes:
  // CIRCLE, SQUARE, CROSS, PEANUT, KEY, TRIANGLE, CLOVER, V,
  // STAIRS, U, FLAT, HEART, STAR, WAVES, TOPO, 8
  const ROM_CAMWAV = [
    'NOJUMP', 'MOVJMP', 'SPIRAL', 'SPIRCH',
    'COWJM2', 'MOVJMP', 'SPIRCH', 'SPIRAL',
    'COWJM2', 'AVOIDR', 'SPIRCH', 'SPIRAL',
    'COWJM2', 'NOJUMP', 'AVOIDR', 'SPIRCH',
  ] as const

  it('is the ROM\'s 16 entries, in the ROM\'s order', () => {
    expect(CAMWAV).toHaveLength(16)
    ROM_CAMWAV.forEach((label, i) => {
      expect(CAMWAV[i], `CAMWAV[${i}] (wave ${i + 1}) = ${label}`).toBe(CAM_ENTRY[label])
    })
  })

  it('holds RAW entry offsets — a table entry takes no minus-one', () => {
    // `.BYTE NOJUMP-CAM` (712) is loaded straight into INVCAM and executed from.
    // Only the in-program CAMA2F operands carry the -1. Confuse the two and
    // every flipper starts one byte early, mid-instruction.
    expect(CAMWAV[0]).toBe(CAM_ENTRY.NOJUMP)
    expect(CAMWAV[0]).not.toBe(CAM_ENTRY.NOJUMP - 1)
  })

  it('indexes as (wave - 1) mod 16 — DOTZAN, ALWELG.MAC:790-795', () => {
    //     LDA TEMP2 / SEC / SBC I,1 / AND I,0F / CLC / ADC I,1
    // i.e. ((wave - 1) AND 0x0F), 1-based back into the byte list.
    expect(flipperCamForWave(1), 'wave 1 = CIRCLE = NOJUMP').toBe(CAM_ENTRY.NOJUMP)
    expect(flipperCamForWave(2)).toBe(CAM_ENTRY.MOVJMP)
    expect(flipperCamForWave(10), 'wave 10 = U = AVOIDR').toBe(CAM_ENTRY.AVOIDR)
    expect(flipperCamForWave(16), 'wave 16 = 8 = SPIRCH').toBe(CAM_ENTRY.SPIRCH)
  })

  it('wraps: wave 17 is wave 1 again, and wave 33 after that', () => {
    expect(flipperCamForWave(17)).toBe(flipperCamForWave(1))
    expect(flipperCamForWave(32)).toBe(flipperCamForWave(16))
    expect(flipperCamForWave(33)).toBe(flipperCamForWave(1))
  })
})

describe('tp1-4 — TNEWCAM: every enemy kind runs a program (ALWELG.MAC:1481-1482)', () => {
  // TNEWCAM: .BYTE NOJUMP-CAM,PULSCH-CAM,NOJUMP-CAM
  //          .BYTE TRALUP-CAM,FUSEUP-CAM
  // indexed by the appearance code in ALCOMN.MAC:845-849:
  //   ZABFLI=0 FLIPPER  ZABPUL=1 PULSAR  ZABTAN=2 TANKER
  //   ZABTRA=3 TRALER   ZABFUS=4 FUSE
  // This table is what makes AC-5 possible: all five of our per-kind steppers
  // have a CAM program to be replaced BY. The spiker is the "TRALER".
  it('maps the five appearance codes to their ROM programs', () => {
    expect(TNEWCAM).toHaveLength(5)
    expect(TNEWCAM[0], 'ZABFLI flipper — the default, overridden per wave by WFLICAM')
      .toBe(CAM_ENTRY.NOJUMP)
    expect(TNEWCAM[1], 'ZABPUL pulsar').toBe(CAM_ENTRY.PULSCH)
    expect(TNEWCAM[2], 'ZABTAN tanker').toBe(CAM_ENTRY.NOJUMP)
    expect(TNEWCAM[3], 'ZABTRA traler — our "spiker", the one that trails a spike')
      .toBe(CAM_ENTRY.TRALUP)
    expect(TNEWCAM[4], 'ZABFUS fuseball').toBe(CAM_ENTRY.FUSEUP)
  })

  it('a NEW flipper takes WFLICAM, not TNEWCAM[0] (NEWFLI, ALWELG.MAC:1428-1433)', () => {
    // NEWFLI: LDA WFLICAM — the wave's program from CAMWAV. TNEWCAM[ZABFLI] is
    // only the fallback that SPLCHA uses when a tanker splits too close to the
    // player ("YES. NO FLIPPING"). On most waves the two disagree, and a port
    // that reads TNEWCAM[0] for flippers silently pins every wave to NOJUMP.
    expect(flipperCamForWave(2), 'wave 2 flippers must NOT fall back to NOJUMP')
      .not.toBe(TNEWCAM[0])
    expect(flipperCamForWave(2)).toBe(CAM_ENTRY.MOVJMP)
  })
})
