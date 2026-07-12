// The modules actually linked into the shipped 27-AUG-81 build, per ALEXEC.MAP:
//   BIN:ALEXEC,ALEXEC.XX=OBJ:ALWELG,ALSCOR,ALDISP,ALEXEC,ALSOUN,ALVROM/C
//                            ALCOIN,ALLANG,ALHARD,ALTEST,ALEARO,ALVGUT
// ALCOMN is .INCLUDEd by ALWELG rather than linked, so it is real too.
// ALDIS2/ALSCO2/ALHAR2/ALTES2/ANVGAN are absent from the link string: they are
// near-identical variants that never shipped. ALDIS2 differs from ALDISP by a
// single operand (EOR I,02A vs EOR I,029), so a citation to it looks perfectly
// plausible and is perfectly wrong.
export const LINKED_MODULES = [
  'ALWELG', 'ALSCOR', 'ALDISP', 'ALEXEC', 'ALSOUN', 'ALVROM',
  'ALCOIN', 'ALLANG', 'ALHARD', 'ALTEST', 'ALEARO', 'ALVGUT',
  'ALCOMN',
]
