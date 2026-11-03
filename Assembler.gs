
/**
 * EitoDiceBanana CPU Simulator
 * Assembler Module - Phase 2
 *
 * Converts ASM instructions into machine code.
 * Loads programs into 256-byte RAM.
 *
 * General-purpose registers:
 * AX = 00h, BX = 01h, CX = 02h, DX = 03h
 *
 * Code segment: 00h - 7Fh
 * Data segment: 80h - FFh
 */

// ============================================
// INSTRUCTION SET (ISA)
// ============================================

const ISA = {
  MOV_IMM: { opcode: 0x01, bytes: 4 },
  MOV_REG: { opcode: 0x02, bytes: 3 },
  LOAD:    { opcode: 0x03, bytes: 3 },
  STORE:   { opcode: 0x04, bytes: 3 },

  ADD: { opcode: 0x10, bytes: 4 },
  SUB: { opcode: 0x11, bytes: 4 },
  INC: { opcode: 0x12, bytes: 2 },
  DEC: { opcode: 0x13, bytes: 2 },
  CMP: { opcode: 0x14, bytes: 4 },

  AND: { opcode: 0x15, bytes: 4 },
  OR:  { opcode: 0x16, bytes: 4 },
  XOR: { opcode: 0x17, bytes: 4 },
  NOT: { opcode: 0x18, bytes: 2 },

  JMP: { opcode: 0x20, bytes: 2 },
  JZ:  { opcode: 0x21, bytes: 2 },
  JNZ: { opcode: 0x22, bytes: 2 },

  HLT: { opcode: 0xFF, bytes: 1 }
};

// Register encoding is backward compatible
// with the Phase 1 architecture.
const ASM_REGISTERS = {
  AX: 0x00,
  BX: 0x01,
  CX: 0x02,
  DX: 0x03
};

const ASM_MODES = {
  REGISTER: 0x00,
  IMMEDIATE: 0x01
};

// ============================================
// UTILITIES
// ============================================

function asmRegisterCode_(name) {
  const key = String(name).trim().toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(
    ASM_REGISTERS, key
  )) {
    throw new Error(
      "Invalid register: " + name
    );
  }

  return ASM_REGISTERS[key];
}

function asmParseNumber_(text) {
  const value = String(text).trim().toUpperCase();
  let result;

  if (/^0X[0-9A-F]+$/.test(value)) {
    result = parseInt(value.substring(2), 16);

  } else if (/^[0-9A-F]+H$/.test(value)) {
    result = parseInt(value.slice(0, -1), 16);

  } else if (/^\d+$/.test(value)) {
    result = parseInt(value, 10);

  } else {
    throw new Error(
      "Invalid numeric value: " + text
    );
  }

  if (!isValidByte(result)) {
    throw new Error(
      "Value out of 8-bit range: " + text
    );
  }

  return result;
}

function asmRemoveComment_(line) {
  return String(line).split(";")[0].trim();
}

function asmIsRegister_(value) {
  return Object.prototype.hasOwnProperty.call(
    ASM_REGISTERS,
    String(value).trim().toUpperCase()
  );
}

function asmEncodeValue_(value) {
  if (asmIsRegister_(value)) {
    return [
      ASM_MODES.REGISTER,
      asmRegisterCode_(value)
    ];
  }

  return [
    ASM_MODES.IMMEDIATE,
    asmParseNumber_(value)
  ];
}

// ============================================
// ASSEMBLE ONE INSTRUCTION
// ============================================

function assembleInstruction(line) {
  const source = asmRemoveComment_(line).toUpperCase();

  if (!source) {
    return [];
  }

  if (source === "HLT") {
    return [ISA.HLT.opcode];
  }

  let match;

  // INC / DEC / NOT
  match = source.match(
    /^(INC|DEC|NOT)\s+(AX|BX|CX|DX)$/
  );

  if (match) {
    return [
      ISA[match[1]].opcode,
      asmRegisterCode_(match[2])
    ];
  }

  // JMP / JZ / JNZ
  match = source.match(
    /^(JMP|JZ|JNZ)\s+(.+)$/
  );

  if (match) {
    return [
      ISA[match[1]].opcode,
      asmParseNumber_(match[2])
    ];
  }

  // LOAD register, [address]
  match = source.match(
    /^LOAD\s+(AX|BX|CX|DX)\s*,\s*\[(.+)\]$/
  );

  if (match) {
    return [
      ISA.LOAD.opcode,
      asmRegisterCode_(match[1]),
      asmParseNumber_(match[2])
    ];
  }

  // STORE [address], register
  match = source.match(
    /^STORE\s*\[(.+)\]\s*,\s*(AX|BX|CX|DX)$/
  );

  if (match) {
    return [
      ISA.STORE.opcode,
      asmParseNumber_(match[1]),
      asmRegisterCode_(match[2])
    ];
  }

  // MOV register, register
  match = source.match(
    /^MOV\s+(AX|BX|CX|DX)\s*,\s*(AX|BX|CX|DX)$/
  );

  if (match) {
    return [
      ISA.MOV_REG.opcode,
      asmRegisterCode_(match[1]),
      asmRegisterCode_(match[2])
    ];
  }

  // MOV register, immediate
  match = source.match(
    /^MOV\s+(AX|BX|CX|DX)\s*,\s*(.+)$/
  );

  if (match) {
    return [
      ISA.MOV_IMM.opcode,
      asmRegisterCode_(match[1]),
      ASM_MODES.IMMEDIATE,
      asmParseNumber_(match[2])
    ];
  }

  // ADD / SUB / CMP / AND / OR / XOR
  match = source.match(
    /^(ADD|SUB|CMP|AND|OR|XOR)\s+(AX|BX|CX|DX)\s*,\s*(.+)$/
  );

  if (match) {
    const encoded = asmEncodeValue_(match[3]);

    return [
      ISA[match[1]].opcode,
      asmRegisterCode_(match[2]),
      ...encoded
    ];
  }

  throw new Error(
    "Unknown instruction: " + source
  );
}

// ============================================
// ASSEMBLE COMPLETE PROGRAM
// ============================================

function assembleProgram(lines) {
  if (!Array.isArray(lines)) {
    throw new Error(
      "Program must be an array."
    );
  }

  const program = [];

  lines.forEach((line, index) => {
    try {
      const bytes = assembleInstruction(line);

      bytes.forEach(byte => {
        if (!isValidByte(byte)) {
          throw new Error(
            "Invalid encoded byte."
          );
        }

        program.push(byte);
      });

    } catch (error) {
      throw new Error(
        "ASM line " + (index + 1) +
        ": " + error.message
      );
    }
  });

  if (program.length === 0) {
    throw new Error(
      "Program is empty."
    );
  }

  const maxCodeSize =
    CONFIG.MEMORY.codeEnd -
    CONFIG.MEMORY.codeStart + 1;

  if (program.length > maxCodeSize) {
    throw new Error(
      "Program exceeds " + maxCodeSize +
      "-byte code segment."
    );
  }

  return program;
}

// ============================================
// LOAD PROGRAM INTO RAM
// ============================================

function loadProgram(program, startAddress = 0x00) {
  if (
    !Array.isArray(program) ||
    program.length === 0
  ) {
    throw new Error(
      "Invalid or empty program."
    );
  }

  if (!isValidAddress(startAddress)) {
    throw new Error(
      "Invalid start address."
    );
  }

  if (
    startAddress < CONFIG.MEMORY.codeStart ||
    startAddress + program.length - 1 >
      CONFIG.MEMORY.codeEnd
  ) {
    throw new Error(
      "Program exceeds code segment 00h-7Fh."
    );
  }

  program.forEach((byte, index) => {
    if (!isValidByte(byte)) {
      throw new Error(
        "Invalid byte at index " + index
      );
    }
  });

  const ram = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("MEMORIA");

  if (!ram) {
    throw new Error(
      "MEMORIA sheet not found."
    );
  }

  // Clear the code segment only.
  // Preserve the data segment.

  const emptyCode = Array.from(
    { length: 8 },
    () => Array(16).fill("00")
  );

  ram.getRange(6, 2, 8, 16)
    .setNumberFormat("@")
    .setValues(emptyCode);

  const codeBytes = Array(128).fill("00");

  program.forEach((byte, index) => {
    codeBytes[startAddress + index] =
      byteToHex_(byte);
  });

  const matrix = [];

  for (let row = 0; row < 8; row++) {
    matrix.push(
      codeBytes.slice(row * 16, row * 16 + 16)
    );
  }

  ram.getRange(6, 2, 8, 16)
    .setNumberFormat("@")
    .setValues(matrix);

  clearMemoryHighlight();

  // Reset CPU and execution state.
  // Do not erase RAM.

  resetCPURegisters();
  resetExecutionState();

  setRegister("PC", startAddress);

  return program.length;
}

// ============================================
// LOAD PROGRAM FROM ASM SHEET
// ============================================

function loadProgramFromInterface() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("ASM");

  if (!sheet) {
    throw new Error(
      "ASM sheet not found."
    );
  }

  try {
    const lines = sheet
      .getRange("D8:D37")
      .getValues()
      .flat();

    const program = assembleProgram(lines);

    const count = loadProgram(program, 0x00);

    sheet.getRange("D42")
      .setValue(
        "LOADED - " + count + " BYTES"
      )
      .setFontColor(
        CONFIG.COLORS.green
      );

    SpreadsheetApp.getUi().alert(
      "Program loaded successfully.\n" +
      count + " bytes written to RAM."
    );

  } catch (error) {
    sheet.getRange("D42")
      .setValue("ERROR")
      .setFontColor(
        CONFIG.COLORS.red
      );

    SpreadsheetApp.getUi().alert(
      "Assembler error:\n" +
      error.message
    );
  }
}

// ============================================
// ASSEMBLER TESTS - PHASE 2
// ============================================

function testAssemblerModule() {
  Logger.log(
    "=== PHASE 2 ASSEMBLER TEST ==="
  );

  // Test 1: Four register codes.
  const codes = {
    AX: 0x00,
    BX: 0x01,
    CX: 0x02,
    DX: 0x03
  };

  Object.keys(codes).forEach(reg => {
    if (
      asmRegisterCode_(reg) !== codes[reg]
    ) {
      throw new Error(
        "Register encoding failed: " + reg
      );
    }
  });

  Logger.log(
    "PASS: AX, BX, CX, DX register codes"
  );

  // Test 2: MOV immediate.
  const movCX = assembleInstruction(
    "MOV CX, 05h"
  );

  if (
    JSON.stringify(movCX) !==
    JSON.stringify([0x01, 0x02, 0x01, 0x05])
  ) {
    throw new Error(
      "MOV CX immediate failed."
    );
  }

  Logger.log(
    "PASS: MOV CX, immediate"
  );

  // Test 3: MOV register to register.
  const movDX = assembleInstruction(
    "MOV DX, CX"
  );

  if (
    JSON.stringify(movDX) !==
    JSON.stringify([0x02, 0x03, 0x02])
  ) {
    throw new Error(
      "MOV DX, CX failed."
    );
  }

  Logger.log(
    "PASS: MOV DX, CX"
  );

  // Test 4: Arithmetic registers.
  const add = assembleInstruction(
    "ADD CX, DX"
  );

  if (
    JSON.stringify(add) !==
    JSON.stringify([0x10, 0x02, 0x00, 0x03])
  ) {
    throw new Error(
      "ADD CX, DX encoding failed."
    );
  }

  Logger.log(
    "PASS: ADD CX, DX"
  );

  // Test 5: Unary operations.
  const inc = assembleInstruction(
    "INC DX"
  );

  if (
    JSON.stringify(inc) !==
    JSON.stringify([0x12, 0x03])
  ) {
    throw new Error(
      "INC DX encoding failed."
    );
  }

  Logger.log(
    "PASS: INC DX"
  );

  // Test 6: Logical operations.
  const andBytes = assembleInstruction(
    "AND DX, CX"
  );

  if (
    JSON.stringify(andBytes) !==
    JSON.stringify([0x15, 0x03, 0x00, 0x02])
  ) {
    throw new Error(
      "AND DX, CX encoding failed."
    );
  }

  Logger.log(
    "PASS: AND DX, CX"
  );

  // Test 7: LOAD and STORE.
  const load = assembleInstruction(
    "LOAD CX, [80h]"
  );

  const store = assembleInstruction(
    "STORE [81h], DX"
  );

  if (
    JSON.stringify(load) !==
    JSON.stringify([0x03, 0x02, 0x80]) ||
    JSON.stringify(store) !==
    JSON.stringify([0x04, 0x81, 0x03])
  ) {
    throw new Error(
      "LOAD/STORE encoding failed."
    );
  }

  Logger.log(
    "PASS: LOAD/STORE with CX and DX"
  );

  // Test 8: Existing AX/BX compatibility.
  const oldMov = assembleInstruction(
    "MOV BX, AX"
  );

  if (
    JSON.stringify(oldMov) !==
    JSON.stringify([0x02, 0x01, 0x00])
  ) {
    throw new Error(
      "Phase 1 compatibility failed."
    );
  }

  Logger.log(
    "PASS: Phase 1 AX/BX compatibility"
  );

  // Test 9: Invalid 8-bit value.
  let rejectedValue = false;

  try {
    assembleInstruction("MOV CX, 256");
  } catch (error) {
    rejectedValue = true;
  }

  if (!rejectedValue) {
    throw new Error(
      "Invalid 8-bit value was accepted."
    );
  }

  Logger.log(
    "PASS: Invalid 8-bit values rejected"
  );

  // Test 10: Complete four-register program.
  const program = assembleProgram([
    "MOV AX, 01h",
    "MOV BX, 02h",
    "MOV CX, 03h",
    "MOV DX, 04h",
    "ADD AX, CX",
    "SUB DX, BX",
    "HLT"
  ]);

  if (program.length !== 25) {
    throw new Error(
      "Unexpected program size: " +
      program.length
    );
  }

  Logger.log(
    "PASS: Four-register program assembled"
  );

  // Test 11: Load into RAM.
  const loadedBytes = loadProgram(
    program,
    0x00
  );

  if (loadedBytes !== 25) {
    throw new Error(
      "Program load failed."
    );
  }

  if (
    Read(0x08) !== 0x01 ||
    Read(0x09) !== 0x02 ||
    getRegister("PC") !== 0x00
  ) {
    throw new Error(
      "RAM encoding or PC initialization failed."
    );
  }

  Logger.log(
    "PASS: Program loaded into RAM"
  );

  Logger.log(
    "=== ALL PHASE 2 ASSEMBLER TESTS PASSED ==="
  );
}
