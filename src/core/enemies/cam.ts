// src/core/enemies/cam.ts
//
// THE CAM — the ROM's enemy bytecode, transcribed from Theurer's 1981 source.
// Findings W-005 / W-006 / W-007 / W-008 of the primary-source audit.
//
// Enemy behaviour in Tempest is not five hard-coded state machines: it is a
// per-invader BYTECODE PROGRAM. Every invader carries INVCAM, a program counter
// into one shared byte array (the CAM, ALWELG.MAC:2374-2526). MOVINV loads it
// into CAMPC and executes opcodes through the JSRCAM dispatcher until one of
// them yields the frame (ALWELG.MAC:1508-1534):
//
//     EXICAM = 1                     ;no-exit flag
//     CAMPC  = INVCAM[x]             ;resume where this invader left off
//     repeat
//         JSR JSRCAM  (CAM[CAMPC])   ;execute one opcode
//         INC CAMPC                  ;auto-increment
//     until EXICAM == 0              ;the yield cleared it
//     INVCAM[x] = CAMPC              ;the PC PERSISTS across frames
//
// So the CAM is a coroutine per invader, and the yield is a suspend, not a halt.
// This file holds the ROM's DATA — the opcode set, the eleven programs, and the
// two dispatch tables. The machine that runs them is interpreter.ts.
//
// ── The encoding rule that is not ours to tidy ───────────────────────────────
// An in-program ADDRESS operand is stored as (target - CAM - 1) — one BELOW the
// target offset. The CAMA2F macro (ALWELG.MAC:1599-1605) emits `.BYTE ...Z-CAM-1`
// because the handler does `STA CAMPC` and the dispatcher's own `INC CAMPC` then
// lands the PC on the target. A CAMWAV or TNEWCAM entry, by contrast, is a RAW
// offset (`.BYTE NOJUMP-CAM`, ALWELG.MAC:712): it is loaded into INVCAM at
// activation, outside the dispatcher's increment. The asymmetry is real. Tidying
// the two into agreement starts every flipper one byte inside an instruction.
// The assembler below applies the -1 to address operands and nowhere else.

// The 20 opcodes, at the ROM's byte values. TABJSR is a table of 2-byte pointers
// and JSRCAM (ALWELG.MAC:1577-1582) uses the opcode as a byte offset into it
// directly, so the codes step by TWO.
export const CAM_OPS = {
  VEXIT:  0x00, // CAMAC  JEXIT,VEXIT,0     ALWELG.MAC:1612 — clear EXICAM: yield the frame
  VSLOOP: 0x02, // CAMA2I JSLOOP,VSLOOP,2   ALWELG.MAC:1613 — INVLOO = immediate
  VSKIP0: 0x04, // CAMAC  JSKIP0,VSKIP0,4   ALWELG.MAC:1614 — skip the next 2 bytes if CAMSTA==0
  VSETPC: 0x06, // CAMA2F JSETPC,VSETPC,6   ALWELG.MAC:1615 — unconditional jump
  VELOOP: 0x08, // CAMA2F JELOOP,VELOOP,8   ALWELG.MAC:1616 — --INVLOO; reloop unless it hit 0
  VNOOP:  0x0a, // CAMAC  JNOOP,VNOOP,0A    ALWELG.MAC:1617 — do nothing
  VSMOVE: 0x0c, // CAMAC  JSMOVE,VSMOVE,0C  ALWELG.MAC:1618 — move one step along the lane
  VSTRAI: 0x0e, // CAMAC  JSTRAI,VSTRAI,0E  ALWELG.MAC:1619 — process the traler (lay the spike)
  VSLOPB: 0x10, // CAMA2I JSLOPB,VSLOPB,10  ALWELG.MAC:1620 — INVLOO = *(wave parameter)
  VJUMPS: 0x12, // CAMAC  JJUMPS,VJUMPS,12  ALWELG.MAC:1621 — start a jump (a flip)
  VJUMPM: 0x14, // CAMAC  JJUMPM,VJUMPM,14  ALWELG.MAC:1622 — advance the jump one angle-step
  VCHROT: 0x16, // CAMAC  JCHROT,VCHROT,16  ALWELG.MAC:1623 — reverse the rotation bit
  VKITST: 0x18, // CAMAC  JKITST,VKITST,18  ALWELG.MAC:1624 — test for a cursor kill
  VBR0PC: 0x1a, // CAMA2F JBR0PC,VBR0PC,1A  ALWELG.MAC:1625 — branch if CAMSTA==0
  VELTST: 0x1c, // CAMAC  JELTST,VELTST,1C  ALWELG.MAC:1626 — CAMSTA=0 iff standing on an enemy line
  VSFUSE: 0x1e, // CAMAC  JFUSEUP,VSFUSE,1E ALWELG.MAC:1627 — process the fuse
  VFUSKI: 0x20, // CAMAC  JFUSKI,VFUSKI,20  ALWELG.MAC:1628 — fuse kills the cursor
  VSPUMO: 0x22, // CAMAC  JPULMO,VSPUMO,22  ALWELG.MAC:1629 — pulsar move
  VCHPLA: 0x24, // CAMAC  JCHPLA,VCHPLA,24  ALWELG.MAC:1630 — set rotation TOWARD the player
  VCHKPU: 0x26, // CAMAC  JCHKPU,VCHKPU,26  ALWELG.MAC:1631 — CAMSTA=0 iff not pulsing soon
} as const

export type CamOpName = keyof typeof CAM_OPS
export type CamOp = (typeof CAM_OPS)[CamOpName]

// The five opcodes the CAMA2I / CAMA2F macros give a second byte to; every other
// opcode is a bare byte. Get this wrong and the PC desynchronises — every opcode
// after the first mistake decodes as garbage.
const OPERAND_OPS: readonly CamOpName[] = ['VSLOOP', 'VSETPC', 'VELOOP', 'VSLOPB', 'VBR0PC']

// Operand width in bytes, indexed by opcode value (JSLOOP/JSLOPB/JSETPC/JELOOP/
// JBR0PC each `INC CAMPC` past their operand; the rest do not).
export const CAM_OPERAND_BYTES: Readonly<Record<number, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(CAM_OPS).map(([name, value]) => [value, OPERAND_OPS.includes(name as CamOpName) ? 1 : 0]),
  ),
)

// VSLOPB's operand is a 6502 zero-page ADDRESS: it names the RAM cell holding a
// per-wave parameter (WTTFRA, PUCHDE — WTABLE, ALWELG.MAC:728-751). We have no
// zero page, so the operand is an index into this slot list instead, resolved by
// camParam() in interpreter.ts. The link from the opcode to the right parameter is
// what the ROM encodes; the address it encodes it with is a 6502 detail.
export const CAM_PARAM = {
  WTTFRA: 0, // angle-steps per frame for a chaser's jump at the rim (TWTTFRA, ALWELG.MAC:704-706)
  PUCHDE: 1, // frames a pulsar moves before it next flips  (TPUCHDE, ALWELG.MAC:680-684)
} as const

// ── The assembler ────────────────────────────────────────────────────────────
// The eleven programs are written below exactly as the source lists them, and
// assembled in two passes: pass 1 fixes every label's offset, pass 2 emits the
// bytes and applies the CAMA2F minus-one to address operands (and to nothing
// else). Hand-computing the offsets instead would hide a transcription error as
// a plausible-looking number.

/** A reference to a label; assembles to (that label's offset - 1). */
interface Addr { at: string }
const at = (label: string): Addr => ({ at: label })

interface Line {
  /** Labels sitting on this instruction. The ROM puts two on some (PULSCH/PULSCP). */
  labels?: readonly string[]
  op: CamOpName
  /** Immediate (VSLOOP), parameter slot (VSLOPB), or a label (the three jumps). */
  operand?: number | Addr
}

const l = (labels: readonly string[], op: CamOpName, operand?: number | Addr): Line => ({ labels, op, operand })
const i = (op: CamOpName, operand?: number | Addr): Line => ({ op, operand })

// The CAM, ALWELG.MAC:2374-2526. Program order is the ROM's, so the offsets are too.
const PROGRAM: readonly Line[] = [
  // TRAILER MOVING UP (ALWELG.MAC:2378-2383)
  l(['TRALUP'], 'VSMOVE'),                //  MOVE UP
  i('VSTRAI'),                            //  PROCESS TRALER
  i('VBR0PC', at('NOJUMP')),              //  CONVERT TO CARRIER
  i('VEXIT'),
  i('VSETPC', at('TRALUP')),              //  RELOOP

  // MOVING UP (NO JUMPS) (ALWELG.MAC:2387-2390)
  l(['NOJUMP'], 'VSMOVE'),                //  MOVE UP
  i('VEXIT'),
  i('VSETPC', at('NOJUMP')),              //  RELOOP

  // MOVE N TIMES, THEN JUMP (ALWELG.MAC:2393-2403). The source comment above it
  // reads ";MOVE 3 TIMES, THEN JUMP" and sits directly on top of a `VSLOOP 8`.
  // Where the comment and the code disagree, the code is the machine.
  l(['MOVJMP'], 'VSLOOP', 8),
  l(['MJLOP1'], 'VSMOVE'),                //  MOVE UP N FRAMES
  i('VEXIT'),
  i('VELOOP', at('MJLOP1')),
  i('VJUMPS'),                            //  START JUMP
  l(['MJLOP5'], 'VEXIT'),
  i('VJUMPM'),                            //  PROCESS JUMP
  i('VSKIP0'),                            //  SKIP IF JUMP IS DONE
  i('VSETPC', at('MJLOP5')),
  i('VSETPC', at('MOVJMP')),              //  JUMP IS DONE. RESTART SEQUENCE

  // SMOOTH UPWARD SPIRAL (ALWELG.MAC:2407-2416). One byte apart from MOVJMP: the
  // VSMOVE INSIDE the jump loop is the whole difference between a flipper that
  // freezes mid-flip and one that climbs through it.
  l(['SPIRAL'], 'VSMOVE'),
  i('VEXIT'),
  i('VJUMPS'),                            //  START JUMP
  l(['SPILOP'], 'VEXIT'),
  i('VJUMPM'),                            //  PROCESS JUMP
  i('VSMOVE'),                            //  MOVE UP
  i('VSKIP0'),
  i('VSETPC', at('SPILOP')),
  i('VSETPC', at('SPIRAL')),              //  RESTART JUMP WHEN FINISHED

  // CHANGE JUMP DIRECTION EVERY N JUMPS (ALWELG.MAC:2420-2443)
  l(['SPIRCH'], 'VSMOVE'),
  i('VEXIT'),
  i('VSLOOP', 2),                         //  LOOP FOR N JUMPS
  l(['SPRLP1'], 'VJUMPS'),                //  START JUMP
  l(['SPRLP2'], 'VEXIT'),
  i('VJUMPM'),                            //  CONTINUE JUMP
  i('VSMOVE'),                            //  MOVE UP
  i('VSKIP0'),                            //  JUMP DONE?
  i('VSETPC', at('SPRLP2')),              //  NO. CONTINUE JUMP
  i('VEXIT'),
  i('VELOOP', at('SPRLP1')),              //  YES. NEW JUMP OR EXIT
  i('VCHROT'),                            //  CHANGE JUMP DIRECTION
  i('VSLOOP', 3),                         //  LOOP FOR N JUMPS
  l(['SPRLP3'], 'VJUMPS'),                //  START JUMP
  l(['SPRLP4'], 'VEXIT'),
  i('VJUMPM'),                            //  CONTINUE JUMP
  i('VSMOVE'),                            //  MOVE UP
  i('VSKIP0'),                            //  JUMP DONE?
  i('VSETPC', at('SPRLP4')),              //  NO. CONT JUMP
  i('VEXIT'),
  i('VELOOP', at('SPRLP3')),              //  YES. NEW JUMP OR EXIT
  i('VCHROT'),
  i('VSETPC', at('SPIRCH')),              //  START OVER

  // CHASE PLAYER AROUND TOP (ALWELG.MAC:2447-2460). The chaser's program: story
  // tp1-5 gives it a rim state to run in. Transcribed here because the CAM is one
  // byte array and its offsets are load-bearing.
  l(['TOPPER'], 'VSLOOP', 4),             //  WAIT IN CROUCH FOR N FRAMES
  l(['KICHEK'], 'VKITST'),                //  TEST FOR CURSOR KILL
  i('VEXIT'),
  i('VELOOP', at('KICHEK')),
  i('VJUMPS'),                            //  START A JUMP
  l(['KJULP1'], 'VEXIT'),
  i('VSLOPB', CAM_PARAM.WTTFRA),
  l(['KJULP2'], 'VJUMPM'),                //  DOUBLE SPEED JUMP
  i('VBR0PC', at('TOPPER')),              //  SKIP IF JUMP IS DONE
  i('VELOOP', at('KJULP2')),
  i('VSETPC', at('KJULP1')),

  // ENEMY FLIPS & MOVES ON OPEN LINES, MOVES ON ENEMY LINES (ALWELG.MAC:2462-2472).
  // COWJM2 is not a twelfth program: it is an ALTERNATE ENTRY one byte BELOW
  // COWJMP whose only instruction is a VEXIT, which then falls straight through
  // into COWJMP. Both of the program's branches aim at COWJM2, so the loop always
  // yields a frame. Collapse the two entries and the interpreter spins forever
  // inside one frame.
  l(['COWJM2'], 'VEXIT'),
  l(['COWJMP'], 'VSMOVE'),                //  MOVE ENEMY
  i('VELTST'),                            //  ON AN ENEMY LINE?
  i('VBR0PC', at('COWJM2')),              //  YES. CONTINUE UP ON LINE
  i('VJUMPS'),                            //  NO. START A JUMP
  i('VEXIT'),
  i('VSMOVE'),                            //  MOVE UP
  l(['COWJM3'], 'VJUMPM'),                //  PROCESS JUMP
  i('VBR0PC', at('COWJM2')),              //  JUMP DONE
  i('VEXIT'),
  i('VSETPC', at('COWJM3')),              //  CONTINUE JUMP

  // FUSE UP/DOWN (ALWELG.MAC:2478-2482)
  l(['FUSEUP'], 'VSFUSE'),                //  PROCESS FUSE
  i('VFUSKI'),                            //  FUSE KILL CURSOR
  i('VEXIT'),
  i('VSETPC', at('FUSEUP')),              //  RELOOP

  // FUSE LEFT/RIGHT (ALWELG.MAC:2484-2491)
  l(['FUSELR'], 'VEXIT'),
  i('VSLOOP', 3),                         //  SLOWL
  l(['FUSLOP'], 'VFUSKI'),                //  CURSOR KILLED?
  i('VEXIT'),
  i('VELOOP', at('FUSLOP')),
  i('VJUMPM'),                            //  LEFT/RIGHT
  i('VBR0PC', at('FUSEUP')),              //  JUMP DONE?
  i('VSETPC', at('FUSELR')),              //  NO. CONTINUE JUMP

  // PULSAR CHASES PLAYER (ALWELG.MAC:2493-2509)
  l(['PULSCH', 'PULSCP'], 'VSLOPB', CAM_PARAM.PUCHDE),
  l(['PULSC1'], 'VSPUMO'),                //  MOVE 1/8 OF TUBE BEFORE NEXT FLIP
  i('VEXIT'),
  i('VELOOP', at('PULSC1')),
  l(['PULSC2'], 'VCHKPU'),                //  PULSING?
  i('VBR0PC', at('PULSC3')),              //  BRANCH IF NOT
  i('VSPUMO'),                            //  PULSING, SO KEEP MOVING
  i('VEXIT'),
  i('VSETPC', at('PULSC2')),              //  RECHECK FOR PULSE
  l(['PULSC3'], 'VCHPLA'),                //  SET FLIP DIRECTION TOWARD PLAYER
  i('VJUMPS'),                            //  START FLIP
  l(['PULSCJ'], 'VEXIT'),
  i('VJUMPM'),                            //  CONTINUE FLIP
  i('VBR0PC', at('PULSCP')),              //  DONE?
  i('VSETPC', at('PULSCJ')),              //  NO

  // AVOIDANCE FLIPPER (ALWELG.MAC:2513-2526). VCHPLA aims it at the player and
  // VCHROT immediately reverses that: the ROM spends two opcodes to say "flee".
  l(['AVOIDR'], 'VCHPLA'),                //  SET DIRECTION TOWARD PLAYER
  i('VCHROT'),                            //  REVERSE IT
  i('VJUMPS'),
  l(['AVOID1'], 'VEXIT'),                 //  FLIP PROCESSING LOOP
  i('VSMOVE'),
  i('VJUMPM'),
  i('VSKIP0'),
  i('VSETPC', at('AVOID1')),
  i('VSLOOP', 4),
  l(['AVOID2'], 'VEXIT'),                 //  FLIP DONE. MOVE UP LOOP
  i('VSMOVE'),
  i('VELOOP', at('AVOID2')),
  i('VSETPC', at('AVOIDR')),
]

function assemble(lines: readonly Line[]): { bytes: number[], labels: Record<string, number> } {
  const labels: Record<string, number> = {}
  let offset = 0
  for (const line of lines) {
    for (const label of line.labels ?? []) labels[label] = offset
    offset += 1 + CAM_OPERAND_BYTES[CAM_OPS[line.op]]
  }

  const bytes: number[] = []
  for (const line of lines) {
    bytes.push(CAM_OPS[line.op])
    if (line.operand === undefined) continue
    if (typeof line.operand === 'number') {
      bytes.push(line.operand)                 // an immediate, or a parameter slot
    } else {
      // CAMA2F: the operand is the target MINUS ONE — the dispatcher's own
      // INC CAMPC completes the jump.
      //
      // The `& 0xff` is not defensive: it is the encoding. TRALUP sits at offset 0
      // (it is the first program, and `CAM:` labels its first byte), so its own
      // `VSETPC TRALUP` assembles `.BYTE TRALUP-CAM-1` = .BYTE -1 = the byte 0xFF.
      // CAMPC is one byte, so the dispatcher's INC wraps 0xFF back to 0x00 and the
      // jump lands. Store what the ROM stores; interpreter.ts wraps the PC to match.
      bytes.push((labels[line.operand.at] - 1) & 0xff)
    }
  }
  return { bytes, labels }
}

const assembled = assemble(PROGRAM)

/** The CAM itself: one shared byte array, exactly as the ROM lays it out. */
export const CAM: readonly number[] = Object.freeze(assembled.bytes)

/**
 * Where each program starts. Eleven programs, twelve entries: COWJM2 is an
 * alternate entry into COWJMP, not a program of its own.
 */
export const CAM_ENTRY = Object.freeze({
  TRALUP: assembled.labels.TRALUP,
  NOJUMP: assembled.labels.NOJUMP,
  MOVJMP: assembled.labels.MOVJMP,
  SPIRAL: assembled.labels.SPIRAL,
  SPIRCH: assembled.labels.SPIRCH,
  TOPPER: assembled.labels.TOPPER,
  COWJM2: assembled.labels.COWJM2,
  COWJMP: assembled.labels.COWJMP,
  FUSEUP: assembled.labels.FUSEUP,
  FUSELR: assembled.labels.FUSELR,
  PULSCH: assembled.labels.PULSCH,
  AVOIDR: assembled.labels.AVOIDR,
})

// CAMWAV (ALWELG.MAC:711-727) — the FLIPPER's program for the wave, one entry per
// well shape: CIRCLE, SQUARE, CROSS, PEANUT, KEY, TRIANGLE, CLOVER, V, STAIRS, U,
// FLAT, HEART, STAR, WAVES, TOPO, 8. Wave 1 is the circle, and it gets NOJUMP —
// which is why the arcade's first wave is a shooting gallery of flippers coming
// straight up the lanes, and ours was a swarm strobing sideways (W-006).
//
// These are RAW offsets: `.BYTE NOJUMP-CAM` is loaded straight into INVCAM by
// NEWFLI and executed from. No minus-one here — see the header.
export const CAMWAV: readonly number[] = Object.freeze([
  CAM_ENTRY.NOJUMP, CAM_ENTRY.MOVJMP, CAM_ENTRY.SPIRAL, CAM_ENTRY.SPIRCH,
  CAM_ENTRY.COWJM2, CAM_ENTRY.MOVJMP, CAM_ENTRY.SPIRCH, CAM_ENTRY.SPIRAL,
  CAM_ENTRY.COWJM2, CAM_ENTRY.AVOIDR, CAM_ENTRY.SPIRCH, CAM_ENTRY.SPIRAL,
  CAM_ENTRY.COWJM2, CAM_ENTRY.NOJUMP, CAM_ENTRY.AVOIDR, CAM_ENTRY.SPIRCH,
])

// TNEWCAM (ALWELG.MAC:1483-1484) — the program a NEW invader of each appearance
// code gets: ZABFLI=0 flipper, ZABPUL=1 pulsar, ZABTAN=2 tanker, ZABTRA=3 traler
// (our spiker — the ROM names it for the spike it TRAILS up the lane), ZABFUS=4
// fuseball (ALCOMN.MAC:845-849).
//
// The flipper's entry here is only the fallback SPLCHA uses when a tanker splits
// too close to the player ("YES. NO FLIPPING", ALWELG.MAC:1498-1500). A flipper
// that spawns normally takes WFLICAM — the wave's program from CAMWAV — through
// NEWFLI (1428-1433). Read TNEWCAM[0] for every flipper and you pin all 16 waves
// to NOJUMP.
export const TNEWCAM: readonly number[] = Object.freeze([
  CAM_ENTRY.NOJUMP, CAM_ENTRY.PULSCH, CAM_ENTRY.NOJUMP, CAM_ENTRY.TRALUP, CAM_ENTRY.FUSEUP,
])

/**
 * The flipper's CAM program for a wave — CAMWAV indexed by (wave-1) mod 16.
 *
 * DOTZAN (ALWELG.MAC:790-795) resolves a TZANDF table by ANDing the 0-based
 * CURWAV with 0x0F, so wave 17 wraps back onto wave 1's program rather than
 * running off the end of the table.
 */
export function flipperCamForWave(wave: number): number {
  return CAMWAV[(wave - 1) & 0x0f]
}
