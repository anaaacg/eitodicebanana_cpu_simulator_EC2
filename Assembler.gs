
/**
 * EitoDiceBanana CPU Simulator
 * Assembler Module - Phase 1
 *
 * Converts ASM instructions into machine code.
 * Loads programs into the 256-byte RAM.
 *
 * Active registers: AX, BX
 * Reserved registers: CX, DX
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

const ASM_REGISTERS = {
  AX: 0x00,
  BX: 0x01
};

const ASM_MODES = {
  REGISTER: 0x00,
  IMMEDIATE: 0x01
};


// ============================================
// UTILITIES
// ============================================

function asmRegisterCode_(name) {
  const key = String(name).toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(
    ASM_REGISTERS, key
  )) {
    throw new Error(
      "Invalid or reserved register: " + name
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
    String(value).toUpperCase()
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
  const source = asmRemoveComment_(line)
    .toUpperCase();

  if (!source) {
    return [];
  }

  // HLT
  if (source === "HLT") {
    return [ISA.HLT.opcode];
  }

  let match;

  // INC / DEC / NOT
  match = source.match(
    /^(INC|DEC|NOT)\s+(AX|BX)$/
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

  // LOAD reg, [address]
  match = source.match(
    /^LOAD\s+(AX|BX)\s*,\s*\[(.+)\]$/
  );

  if (match) {
    return [
      ISA.LOAD.opcode,
      asmRegisterCode_(match[1]),
      asmParseNumber_(match[2])
    ];
  }

  // STORE [address], reg
  match = source.match(
    /^STORE\s*\[(.+)\]\s*,\s*(AX|BX)$/
  );

  if (match) {
    return [
      ISA.STORE.opcode,
      asmParseNumber_(match[1]),
      asmRegisterCode_(match[2])
    ];
  }

  // MOV reg, reg
  // Exactly 3 bytes
  match = source.match(
    /^MOV\s+(AX|BX)\s*,\s*(AX|BX)$/
  );

  if (match) {
    return [
      ISA.MOV_REG.opcode,
      asmRegisterCode_(match[1]),
      asmRegisterCode_(match[2])
    ];
  }

  // MOV reg, immediate
  match = source.match(
    /^MOV\s+(AX|BX)\s*,\s*(.+)$/
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
    /^(ADD|SUB|CMP|AND|OR|XOR)\s+(AX|BX)\s*,\s*(.+)$/
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
          throw new Error("Invalid encoded byte.");
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
    throw new Error("Program is empty.");
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
  if (!Array.isArray(program) || program.length === 0) {
    throw new Error("Invalid or empty program.");
  }

  if (!isValidAddress(startAddress)) {
    throw new Error("Invalid start address.");
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

  // Validate all bytes before writing.
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

  // Clear code segment only.
  // Data segment remains unchanged.
  const emptyCode = Array.from(
    { length: 8 },
    () => Array(16).fill("00")
  );

  ram.getRange(6, 2, 8, 16)
    .setNumberFormat("@")
    .setValues(emptyCode);

  // Efficient batch writing into RAM.
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

  // Reset CPU and execution state without erasing RAM.
  resetCPURegisters();
  resetExecutionState();

  // PC points to the first opcode.
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
    throw new Error("ASM sheet not found.");
  }

  try {
    const lines = sheet
      .getRange("D8:D37")
      .getValues()
      .flat();

    const program = assembleProgram(lines);

    const count = loadProgram(program, 0x00);

    sheet.getRange("D42")
      .setValue("LOADED - " + count + " BYTES")
      .setFontColor(CONFIG.COLORS.green);

    SpreadsheetApp.getUi().alert(
      "Program loaded successfully.\n" +
      count + " bytes written to RAM."
    );

  } catch (error) {
    sheet.getRange("D42")
      .setValue("ERROR")
      .setFontColor(CONFIG.COLORS.red);

    SpreadsheetApp.getUi().alert(
      "Assembler error:\n" + error.message
    );
  }
}


// ============================================
// ASSEMBLER TESTS
// ============================================

function testAssemblerModule() {
  Logger.log("=== ASSEMBLER MODULE TEST ===");

  const lines = [
    "MOV AX, 5",
    "MOV BX, AX",
    "ADD AX, 3",
    "SUB AX, BX",
    "INC AX",
    "DEC BX",
    "CMP AX, 2",
    "AND AX, BX",
    "OR AX, 1",
    "XOR BX, AX",
    "NOT BX",
    "JZ 40h",
    "STORE [80h], AX",
    "LOAD BX, [80h]",
    "HLT"
  ];

  const program = assembleProgram(lines);

  // Correct calculated size: 46 bytes
  const expectedSize = 46;

  if (program.length !== expectedSize) {
    throw new Error(
      "Unexpected program size. Expected " +
      expectedSize + ", got " + program.length
    );
  }

  Logger.log("PASS: Program assembled");
  Logger.log("Program size: " + program.length);

  // MOV immediate
  const mov = assembleInstruction("MOV AX, 5");

  if (
    JSON.stringify(mov) !==
    JSON.stringify([0x01, 0x00, 0x01, 0x05])
  ) {
    throw new Error(
      "MOV immediate encoding failed."
    );
  }

  Logger.log("PASS: MOV immediate encoding");

  // MOV register
  const movReg = assembleInstruction("MOV BX, AX");

  if (
    JSON.stringify(movReg) !==
    JSON.stringify([0x02, 0x01, 0x00])
  ) {
    throw new Error(
      "MOV register encoding failed."
    );
  }

  Logger.log("PASS: MOV register encoding");

  // ADD immediate
  const add = assembleInstruction("ADD AX, 3");

  if (
    JSON.stringify(add) !==
    JSON.stringify([0x10, 0x00, 0x01, 0x03])
  ) {
    throw new Error(
      "ADD encoding failed."
    );
  }

  Logger.log("PASS: ADD encoding");

  // Logical instruction
  const andBytes = assembleInstruction("AND AX, BX");

  if (
    JSON.stringify(andBytes) !==
    JSON.stringify([0x15, 0x00, 0x00, 0x01])
  ) {
    throw new Error(
      "AND encoding failed."
    );
  }

  Logger.log("PASS: AND encoding");

  // Reserved CX must be rejected
  let rejectedCX = false;

  try {
    assembleInstruction("MOV CX, 5");
  } catch (error) {
    rejectedCX = true;
  }

  if (!rejectedCX) {
    throw new Error(
      "Reserved register CX was accepted."
    );
  }

  Logger.log("PASS: Reserved CX rejected");

  // Invalid value
  let rejectedValue = false;

  try {
    assembleInstruction("MOV AX, 256");
  } catch (error) {
    rejectedValue = true;
  }

  if (!rejectedValue) {
    throw new Error(
      "Invalid 8-bit value was accepted."
    );
  }

  Logger.log("PASS: Invalid value rejected");

  // Load into RAM
  const loadedBytes = loadProgram(program, 0x00);

  if (loadedBytes !== expectedSize) {
    throw new Error("Program load size mismatch.");
  }

  if (
    Read(0x00) !== 0x01 ||
    Read(0x01) !== 0x00 ||
    Read(0x02) !== 0x01 ||
    Read(0x03) !== 0x05
  ) {
    throw new Error(
      "RAM load verification failed."
    );
  }

  Logger.log("PASS: Program loaded into RAM");

  // Check initial PC
  if (getRegister("PC") !== 0x00) {
    throw new Error(
      "Program Counter initialization failed."
    );
  }

  Logger.log("PASS: PC initialized");

  Logger.log(
    "=== ALL ASSEMBLER TESTS PASSED ==="
  );
}
