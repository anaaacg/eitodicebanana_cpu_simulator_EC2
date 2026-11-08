/**
 * EitoDiceBanana CPU Simulator
 * Extended Assembler & Program Loader Module — Phase 2 / Task 13
 *
 * Architecture:
 * - 4 General-Purpose Registers: AX (00h), BX (01h), CX (02h), DX (03h)
 * - 9-Bit Virtual Memory: 000h - 1FFh (512 bytes)
 * - Code segment: 000h - 07Fh (128 bytes, Pages 0-3)
 * - Physical RAM: 256 bytes (8 frames of 32 bytes)
 *
 * Capabilities:
 * - Two-Pass Assembler with Symbolic Label Resolution (e.g. LOOP:, START:, END:)
 * - Flexible I/O Syntax: IN reg, [KBD] / IN reg; OUT [LCD], reg / OUT reg
 * - Arithmetic, Logic, Register Transfer, Unary & Memory Instructions
 * - Program Loader initializing Code Segment, PC = 00h, Backing Store & Caches
 * - 3 Demonstration Programs (Arithmetic/Mem, Loops/Labels, I/O)
 */

// ------------------------------------------------------------
// INSTRUCTION SET ARCHITECTURE (ISA)
// ------------------------------------------------------------

const ISA = {
  MOV_IMM: { opcode: 0x01, bytes: 4, name: "MOV_IMM" },
  MOV_REG: { opcode: 0x02, bytes: 3, name: "MOV_REG" },
  LOAD:    { opcode: 0x03, bytes: 4, name: "LOAD" },
  STORE:   { opcode: 0x04, bytes: 4, name: "STORE" },
  IN:      { opcode: 0x05, bytes: 2, name: "IN" },
  OUT:     { opcode: 0x06, bytes: 2, name: "OUT" },

  ADD: { opcode: 0x10, bytes: 4, name: "ADD" },
  SUB: { opcode: 0x11, bytes: 4, name: "SUB" },
  INC: { opcode: 0x12, bytes: 2, name: "INC" },
  DEC: { opcode: 0x13, bytes: 2, name: "DEC" },
  CMP: { opcode: 0x14, bytes: 4, name: "CMP" },

  AND: { opcode: 0x15, bytes: 4, name: "AND" },
  OR:  { opcode: 0x16, bytes: 4, name: "OR" },
  XOR: { opcode: 0x17, bytes: 4, name: "XOR" },
  NOT: { opcode: 0x18, bytes: 2, name: "NOT" },

  JMP: { opcode: 0x20, bytes: 2, name: "JMP" },
  JZ:  { opcode: 0x21, bytes: 2, name: "JZ" },
  JNZ: { opcode: 0x22, bytes: 2, name: "JNZ" },

  HLT: { opcode: 0xFF, bytes: 1, name: "HLT" }
};

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

// ------------------------------------------------------------
// DEMONSTRATION PROGRAMS PRESETS
// ------------------------------------------------------------

const DEMO_PROGRAMS = {
  PROGRAM_1: {
    name: "Demo 1 - Arithmetic, Logic, 4 Registers & Virtual Memory",
    description: "Operates across AX, BX, CX, DX, performs arithmetic/logic, stores to virtual [100h], loads back, and verifies flags.",
    lines: [
      "; DEMO 1: Arithmetic, Logic & Virtual Memory",
      "MOV AX, 10h",
      "MOV BX, 20h",
      "MOV CX, 05h",
      "MOV DX, 02h",
      "ADD AX, BX",
      "SUB AX, CX",
      "AND AX, 0FFh",
      "STORE [100h], AX",
      "LOAD DX, [100h]",
      "CMP AX, DX",
      "HLT"
    ]
  },

  PROGRAM_2: {
    name: "Demo 2 - Loops and Conditional Jumps with Labels",
    description: "Computes sum 1..5 using a labeled loop, decrement, and conditional jump (JNZ).",
    lines: [
      "; DEMO 2: Loop 1..5 Sum with Labels",
      "MOV AX, 00h",
      "MOV CX, 05h",
      "LOOP:",
      "ADD AX, CX",
      "DEC CX",
      "JNZ LOOP",
      "STORE [120h], AX",
      "HLT"
    ]
  },

  PROGRAM_3: {
    name: "Demo 3 - Keyboard Input & LCD Output",
    description: "Reads input characters from Keyboard peripheral and displays them on 8x1 LCD.",
    lines: [
      "; DEMO 3: Keyboard to LCD Display",
      "IN AX, [KBD]",
      "OUT [LCD], AX",
      "IN BX, [KBD]",
      "OUT [LCD], BX",
      "HLT"
    ]
  }
};

// ------------------------------------------------------------
// UTILITIES & PARSING
// ------------------------------------------------------------

function asmRegisterCode_(name) {
  const key = String(name).trim().toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(ASM_REGISTERS, key)) {
    throw new Error("Invalid register: " + name + ". Expected AX, BX, CX, or DX.");
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
    throw new Error("Invalid numeric value: " + text);
  }

  if (!isValidByte(result)) {
    throw new Error("Value out of 8-bit range: " + text + ". Expected 0-255 (00h-FFh).");
  }

  return result;
}

/**
 * Parses a 9-bit virtual address (0 - 511 / 000h - 1FFh).
 */
function asmParseVirtualAddress_(text) {
  const value = String(text).trim().toUpperCase();
  let result;

  if (/^0X[0-9A-F]+$/.test(value)) {
    result = parseInt(value.substring(2), 16);
  } else if (/^[0-9A-F]+H$/.test(value)) {
    result = parseInt(value.slice(0, -1), 16);
  } else if (/^\d+$/.test(value)) {
    result = parseInt(value, 10);
  } else {
    throw new Error("Invalid virtual address: " + text);
  }

  if (!Number.isInteger(result) || result < 0 || result > 511) {
    throw new Error("Virtual address out of range: " + text + ". Expected 0-511 (000h-1FFh).");
  }

  return result;
}

function asmRemoveComment_(line) {
  return String(line || "").split(";")[0].trim();
}

function asmIsRegister_(value) {
  return Object.prototype.hasOwnProperty.call(
    ASM_REGISTERS,
    String(value).trim().toUpperCase()
  );
}

function asmEncodeValue_(value) {
  if (asmIsRegister_(value)) {
    return [ASM_MODES.REGISTER, asmRegisterCode_(value)];
  }
  return [ASM_MODES.IMMEDIATE, asmParseNumber_(value)];
}

// ------------------------------------------------------------
// INSTRUCTION SIZE INFERENCE (PASS 1 HELPER)
// ------------------------------------------------------------

/**
 * Calculates byte size of an instruction without emitting machine code.
 * Used during Pass 1 to build the label symbol table accurately.
 */
function asmInstructionSize_(instructionText) {
  const s = String(instructionText).trim().toUpperCase();
  if (!s) return 0;

  if (s === "HLT") return ISA.HLT.bytes; // 1

  if (/^IN\b/.test(s))  return ISA.IN.bytes;  // 2
  if (/^OUT\b/.test(s)) return ISA.OUT.bytes; // 2

  if (/^(INC|DEC|NOT)\b/.test(s)) return 2;
  if (/^(JMP|JZ|JNZ)\b/.test(s))  return 2;

  if (/^MOV\s+(AX|BX|CX|DX)\s*,\s*(AX|BX|CX|DX)$/.test(s)) return ISA.MOV_REG.bytes; // 3
  if (/^MOV\s+(AX|BX|CX|DX)\s*,/.test(s)) return ISA.MOV_IMM.bytes; // 4

  if (/^LOAD\b/.test(s))  return ISA.LOAD.bytes;  // 4
  if (/^STORE\b/.test(s)) return ISA.STORE.bytes; // 4

  if (/^(ADD|SUB|CMP|AND|OR|XOR)\b/.test(s)) return 4;

  throw new Error("Unrecognized instruction syntax: " + instructionText);
}

// ------------------------------------------------------------
// ASSEMBLE SINGLE INSTRUCTION (PASS 2 HELPER)
// ------------------------------------------------------------

/**
 * Assembles one instruction line into machine code bytes.
 *
 * @param {string} line Source code line (comments already stripped).
 * @param {Object} [symbolTable] Optional map of labels to byte addresses.
 * @returns {Array<number>} Array of encoded byte values.
 */
function assembleInstruction(line, symbolTable) {
  const source = asmRemoveComment_(line).toUpperCase();
  const symbols = symbolTable || {};

  if (!source) {
    return [];
  }

  if (source === "HLT") {
    return [ISA.HLT.opcode];
  }

  let match;

  // 1. IN register, [KBD] / IN register
  match = source.match(/^IN\s+(AX|BX|CX|DX)(?:\s*,\s*\[?\s*KBD\s*\]?)?$/);
  if (match) {
    return [
      ISA.IN.opcode,
      asmRegisterCode_(match[1])
    ];
  }

  // 2. OUT [LCD], register / OUT register
  match = source.match(/^OUT(?:\s+\[?\s*LCD\s*\]?\s*,\s*|\s+)(AX|BX|CX|DX)$/);
  if (match) {
    return [
      ISA.OUT.opcode,
      asmRegisterCode_(match[1])
    ];
  }

  // 3. INC / DEC / NOT register
  match = source.match(/^(INC|DEC|NOT)\s+(AX|BX|CX|DX)$/);
  if (match) {
    return [
      ISA[match[1]].opcode,
      asmRegisterCode_(match[2])
    ];
  }

  // 4. JMP / JZ / JNZ target (Numeric address or Symbolic Label)
  match = source.match(/^(JMP|JZ|JNZ)\s+([A-Z0-9_]+)$/);
  if (match) {
    const mnemonic = match[1];
    const targetToken = match[2];
    let targetAddress;

    if (Object.prototype.hasOwnProperty.call(symbols, targetToken)) {
      targetAddress = symbols[targetToken];
    } else {
      try {
        targetAddress = asmParseNumber_(targetToken);
      } catch (e) {
        throw new Error("Undefined label or invalid target address: '" + targetToken + "'.");
      }
    }

    if (!isValidByte(targetAddress)) {
      throw new Error("Jump target out of byte range: " + targetAddress);
    }

    return [
      ISA[mnemonic].opcode,
      targetAddress
    ];
  }

  // 5. LOAD register, [9-bit virtual address]
  match = source.match(/^LOAD\s+(AX|BX|CX|DX)\s*,\s*\[\s*(.+?)\s*\]$/);
  if (match) {
    const address = asmParseVirtualAddress_(match[2]);
    return [
      ISA.LOAD.opcode,
      asmRegisterCode_(match[1]),
      (address >> 8) & 0x01,
      address & 0xFF
    ];
  }

  // 6. STORE [9-bit virtual address], register
  match = source.match(/^STORE\s*\[\s*(.+?)\s*\]\s*,\s*(AX|BX|CX|DX)$/);
  if (match) {
    const address = asmParseVirtualAddress_(match[1]);
    return [
      ISA.STORE.opcode,
      (address >> 8) & 0x01,
      address & 0xFF,
      asmRegisterCode_(match[2])
    ];
  }

  // 7. MOV register, register
  match = source.match(/^MOV\s+(AX|BX|CX|DX)\s*,\s*(AX|BX|CX|DX)$/);
  if (match) {
    return [
      ISA.MOV_REG.opcode,
      asmRegisterCode_(match[1]),
      asmRegisterCode_(match[2])
    ];
  }

  // 8. MOV register, immediate
  match = source.match(/^MOV\s+(AX|BX|CX|DX)\s*,\s*(.+)$/);
  if (match) {
    return [
      ISA.MOV_IMM.opcode,
      asmRegisterCode_(match[1]),
      ASM_MODES.IMMEDIATE,
      asmParseNumber_(match[2])
    ];
  }

  // 9. ADD / SUB / CMP / AND / OR / XOR
  match = source.match(/^(ADD|SUB|CMP|AND|OR|XOR)\s+(AX|BX|CX|DX)\s*,\s*(.+)$/);
  if (match) {
    const encoded = asmEncodeValue_(match[3]);
    return [
      ISA[match[1]].opcode,
      asmRegisterCode_(match[2]),
      ...encoded
    ];
  }

  throw new Error("Unknown or malformed instruction: '" + source + "'.");
}

// ------------------------------------------------------------
// TWO-PASS ASSEMBLER (WITH SYMBOL TABLE RESOLUTION)
// ------------------------------------------------------------

/**
 * Assembles an array of assembly text lines into a machine code byte array.
 * Supports:
 * - Standalone labels (e.g. "LOOP:")
 * - Inline labels (e.g. "LOOP: DEC CX")
 * - Forward and backward jump resolution
 * - Syntax error reporting with exact line numbers
 *
 * @param {Array<string>} lines Array of assembly code lines.
 * @param {number} [startAddress=0x00] Base virtual memory loading address.
 * @returns {Array<number>} Complete array of machine code bytes.
 */
function assembleProgram(lines, startAddress) {
  if (!Array.isArray(lines)) {
    throw new Error("Program must be an array of lines.");
  }

  const baseAddr = startAddress !== undefined ? startAddress : 0x00;
  const symbols = {};
  const cleanedLines = [];

  // ==========================================
  // PASS 1: SCAN LABELS & COMPUTE ADDRESSES
  // ==========================================
  let currentOffset = 0;

  lines.forEach(function(rawLine, lineIndex) {
    const lineNum = lineIndex + 1;
    let text = asmRemoveComment_(rawLine);

    if (!text) {
      cleanedLines.push({ lineNum: lineNum, instruction: "", label: null, offset: currentOffset });
      return;
    }

    let label = null;
    const labelMatch = text.match(/^([A-Z_][A-Z0-9_]*)\s*:\s*(.*)$/i);

    if (labelMatch) {
      label = labelMatch[1].toUpperCase();
      text = labelMatch[2].trim();

      if (Object.prototype.hasOwnProperty.call(symbols, label)) {
        throw new Error("Line " + lineNum + ": Duplicate label definition '" + label + "'.");
      }

      symbols[label] = baseAddr + currentOffset;
    }

    let size = 0;
    if (text) {
      try {
        size = asmInstructionSize_(text);
      } catch (err) {
        throw new Error("Line " + lineNum + ": " + err.message);
      }
    }

    cleanedLines.push({
      lineNum: lineNum,
      instruction: text,
      label: label,
      offset: currentOffset,
      size: size
    });

    currentOffset += size;
  });

  // ==========================================
  // PASS 2: CODE GENERATION & RESOLUTION
  // ==========================================
  const program = [];

  cleanedLines.forEach(function(item) {
    if (!item.instruction) {
      return;
    }

    try {
      const bytes = assembleInstruction(item.instruction, symbols);

      bytes.forEach(function(byte) {
        if (!isValidByte(byte)) {
          throw new Error("Generated byte value out of range (0-255).");
        }
        program.push(byte);
      });

    } catch (err) {
      throw new Error("Line " + item.lineNum + ": " + err.message);
    }
  });

  if (program.length === 0) {
    throw new Error("Program is empty (no executable instructions found).");
  }

  const maxCodeSize = CONFIG.MEMORY.codeEnd - CONFIG.MEMORY.codeStart + 1;
  if (program.length > maxCodeSize) {
    throw new Error("Program size (" + program.length + " bytes) exceeds code segment capacity (" + maxCodeSize + " bytes).");
  }

  return program;
}

// ------------------------------------------------------------
// PROGRAM LOADER (INTO VIRTUAL MEMORY & RAM)
// ------------------------------------------------------------

/**
 * Loads an assembled machine code image into the virtual code segment.
 *
 * Sequence:
 * 1. Validate complete program byte array.
 * 2. Initialize physical RAM with zeros and load bytes into code segment (00h-7Fh).
 * 3. Reset MMU Page Table and backing store so virtual memory mirrors the image.
 * 4. Reset Multilevel Caches (L1I, L1D, L2) and performance counters.
 * 5. Reset LCD display controller to column 0.
 * 6. Reset CPU registers and initialize PC = startAddress.
 *
 * @param {Array<number>} program Byte array generated by assembleProgram.
 * @param {number} [startAddress=0x00] Start virtual address.
 * @returns {number} Count of bytes loaded.
 */
function loadProgram(program, startAddress) {
  if (startAddress === undefined) {
    startAddress = 0x00;
  }

  if (!Array.isArray(program) || program.length === 0) {
    throw new Error("Invalid or empty program array.");
  }

  if (!isValidAddress(startAddress)) {
    throw new Error("Invalid start address: " + startAddress);
  }

  if (startAddress < CONFIG.MEMORY.codeStart ||
      startAddress + program.length - 1 > CONFIG.MEMORY.codeEnd) {
    throw new Error("Program exceeds virtual code segment 00h-7Fh (length: " + program.length + " bytes).");
  }

  // Keyboard FIFO contents now live in physical RAM E8h-EFh. Preserve the
  // pending input while the RAM image is rebuilt, matching the previous
  // behavior where the queue survived loadProgram().
  const keyboardQueueBeforeLoad =
    typeof getKeyboardQueue_ === "function"
      ? getKeyboardQueue_()
      : null;

  program.forEach(function(byte, index) {
    if (!isValidByte(byte)) {
      throw new Error("Invalid byte at index " + index + ": " + byte);
    }
  });

  const ram = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("MEMORIA");

  if (!ram) {
    throw new Error("MEMORIA sheet not found.");
  }

  const ramSize = CONFIG.MEMORY.size;
  const ramBytes = Array(ramSize).fill(0);

  // 1. Copy program machine code
  program.forEach(function(byte, index) {
    ramBytes[startAddress + index] = byte;
  });

  // 2. Convert RAM image to 16x16 matrix for MEMORIA sheet
  const matrix = [];
  for (let row = 0; row < 16; row++) {
    const rowValues = [];
    for (let col = 0; col < 16; col++) {
      const addr = row * 16 + col;
      rowValues.push(byteToHex_(ramBytes[addr]));
    }
    matrix.push(rowValues);
  }

  ram.getRange("B6:Q21")
    .setNumberFormat("@")
    .setValues(matrix);

  // Restore the FIFO bytes before paging snapshots Frame 7.
  if (keyboardQueueBeforeLoad !== null &&
      typeof keyboardSaveQueueRaw_ === "function") {
    keyboardWithLock_(function() {
      keyboardSaveQueueRaw_(keyboardQueueBeforeLoad);
    });
  }

  SpreadsheetApp.flush();
  clearMemoryHighlight();

  // 3. Reset Paging / Backing Store
  if (typeof resetPagingSystem === "function") {
    resetPagingSystem();
  }

  // 4. Reset Caches & Performance Counters
  if (typeof resetCacheModule === "function") {
    resetCacheModule();
  }

  // 5. Reset LCD Controller
  if (typeof lcdResetController_ === "function") {
    lcdResetController_();
  }

  // 6. Reset CPU registers and initialize PC
  resetCPURegisters();
  setRegister("PC", startAddress);
  resetExecutionState();

  Logger.log("LOAD PROGRAM: " + program.length + " bytes loaded successfully at PC=" + byteToHex_(startAddress) + "h.");
  return program.length;
}

// ------------------------------------------------------------
// INTERFACE LOADER & DEMO CONTROLS (SHEET "ASM")
// ------------------------------------------------------------

/**
 * Reads assembly code from sheet "ASM", validates syntax,
 * generates machine code, displays hex translation, and loads to CPU.
 */
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

    // Display assembled machine code in column O (rows 8-37)
    displayAssembledHexInSheet_(sheet, lines);

    sheet.getRange("D42")
      .setValue("LOADED \u2014 " + count + " BYTES")
      .setFontColor(CONFIG.COLORS.green);

    if (typeof edbToast_ === "function") {
      edbToast_("Program loaded: " + count + " bytes.", 3);
    } else {
      SpreadsheetApp.getActive().toast("Program loaded: " + count + " bytes.", "Assembler", 3);
    }

    return count;

  } catch (error) {
    sheet.getRange("D42")
      .setValue("ERROR: " + error.message)
      .setFontColor(CONFIG.COLORS.red);

    if (typeof showSimulatorError_ === "function") {
      showSimulatorError_(error);
    } else {
      SpreadsheetApp.getUi().alert("Assembler Error:\n" + error.message);
    }
    throw error;
  }
}

/**
 * Helper to display generated machine code next to each source line.
 */
function displayAssembledHexInSheet_(sheet, lines) {
  try {
    const hexMatrix = [];
    let symbols = {};

    // Pass 1 for local line rendering
    let offset = 0;
    lines.forEach(function(raw) {
      const text = asmRemoveComment_(raw);
      const m = text.match(/^([A-Z_][A-Z0-9_]*)\s*:\s*(.*)$/i);
      let instr = text;
      if (m) {
        symbols[m[1].toUpperCase()] = offset;
        instr = m[2].trim();
      }
      if (instr) {
        try { offset += asmInstructionSize_(instr); } catch(e){}
      }
    });

    lines.forEach(function(raw) {
      const text = asmRemoveComment_(raw);
      if (!text) {
        hexMatrix.push([""]);
        return;
      }
      const m = text.match(/^([A-Z_][A-Z0-9_]*)\s*:\s*(.*)$/i);
      const instr = m ? m[2].trim() : text;
      if (!instr) {
        hexMatrix.push([""]);
        return;
      }
      try {
        const bytes = assembleInstruction(instr, symbols);
        hexMatrix.push([bytes.map(b => byteToHex_(b)).join(" ")]);
      } catch (e) {
        hexMatrix.push(["ERR"]);
      }
    });

    sheet.getRange("O8:O37")
      .setNumberFormat("@")
      .setValues(hexMatrix)
      .setFontColor(CONFIG.COLORS.yellow);

  } catch (e) {
    // Non-critical visual helper
  }
}

/**
 * Loads a demonstration program preset into the ASM sheet editor.
 *
 * @param {number} programIndex (1, 2, or 3)
 */
function loadDemoProgram(programIndex) {
  const key = "PROGRAM_" + programIndex;
  const demo = DEMO_PROGRAMS[key];

  if (!demo) {
    throw new Error("Invalid demo program index: " + programIndex + ". Expected 1, 2, or 3.");
  }

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("ASM");

  if (!sheet) {
    throw new Error("ASM sheet not found.");
  }

  // Clear previous lines
  const blankLines = Array.from({ length: 30 }, () => [""]);
  sheet.getRange("D8:D37").setValues(blankLines);
  sheet.getRange("O8:O37").setValues(blankLines);

  // Write demo lines
  const writeLines = Array.from({ length: 30 }, (v, i) => [demo.lines[i] || ""]);
  sheet.getRange("D8:D37").setValues(writeLines);

  // Auto-assemble and load
  loadProgramFromInterface();

  Logger.log("Loaded " + demo.name + " into ASM editor and CPU.");
}

function loadDemo1() { return loadDemoProgram(1); }
function loadDemo2() { return loadDemoProgram(2); }
function loadDemo3() { return loadDemoProgram(3); }

// ------------------------------------------------------------
// VERIFICATION TEST SUITE (TASK 13)
// ------------------------------------------------------------

function assertASM_(condition, message) {
  if (!condition) {
    throw new Error("EXTENDED ASSEMBLER TEST FAILED: " + message);
  }
}

/**
 * Validates all Acceptance Criteria of Task 13:
 * - 4 general-purpose registers (AX, BX, CX, DX)
 * - Arithmetic and logical instructions
 * - 9-bit virtual memory access (LOAD, STORE)
 * - Two-pass label resolution with forward/backward jumps
 * - Flexible I/O parsing (IN reg, [KBD], OUT [LCD], reg)
 * - ISA format specification, opcodes, and sizes
 * - Syntax error reporting with line numbers
 * - Full execution of all 3 required demonstration programs
 */
function testExtendedAssemblerModule() {
  Logger.log("=== STARTING TASK 13 EXTENDED ASSEMBLER & LOADER TESTS ===");

  // ── TEST 1: Register encoding for all four registers ──
  assertASM_(asmRegisterCode_("AX") === 0x00, "AX code 00h");
  assertASM_(asmRegisterCode_("BX") === 0x01, "BX code 01h");
  assertASM_(asmRegisterCode_("CX") === 0x02, "CX code 02h");
  assertASM_(asmRegisterCode_("DX") === 0x03, "DX code 03h");
  Logger.log("PASS CR-1: AX, BX, CX, DX general-purpose registers supported.");

  // ── TEST 2: Arithmetic and logical operations with registers and immediates ──
  const addReg = assembleInstruction("ADD AX, BX");
  assertASM_(JSON.stringify(addReg) === JSON.stringify([0x10, 0x00, 0x00, 0x01]), "ADD reg");

  const subImm = assembleInstruction("SUB CX, 10h");
  assertASM_(JSON.stringify(subImm) === JSON.stringify([0x11, 0x02, 0x01, 0x10]), "SUB imm");

  const andReg = assembleInstruction("AND DX, AX");
  assertASM_(JSON.stringify(andReg) === JSON.stringify([0x15, 0x03, 0x00, 0x00]), "AND reg");

  const incDX = assembleInstruction("INC DX");
  assertASM_(JSON.stringify(incDX) === JSON.stringify([0x12, 0x03]), "INC reg");

  const notCX = assembleInstruction("NOT CX");
  assertASM_(JSON.stringify(notCX) === JSON.stringify([0x18, 0x02]), "NOT reg");
  Logger.log("PASS CR-2: Arithmetic and logical instructions operate correctly.");

  // ── TEST 3: 9-Bit Virtual Memory addressing in LOAD and STORE ──
  const loadVirt = assembleInstruction("LOAD AX, [150h]");
  assertASM_(JSON.stringify(loadVirt) === JSON.stringify([0x03, 0x00, 0x01, 0x50]), "LOAD 150h");

  const storeVirt = assembleInstruction("STORE [1FFh], DX");
  assertASM_(JSON.stringify(storeVirt) === JSON.stringify([0x04, 0x01, 0xFF, 0x03]), "STORE 1FFh");
  Logger.log("PASS CR-3: Virtual memory access supports 9-bit address space (000h-1FFh).");

  // ── TEST 4: Flexible I/O Syntax (IN reg, [KBD] and OUT [LCD], reg) ──
  const inKBD = assembleInstruction("IN BX, [KBD]");
  assertASM_(JSON.stringify(inKBD) === JSON.stringify([0x05, 0x01]), "IN BX, [KBD]");

  const inFlex = assembleInstruction("IN CX");
  assertASM_(JSON.stringify(inFlex) === JSON.stringify([0x05, 0x02]), "IN CX flexible");

  const outLCD = assembleInstruction("OUT [LCD], AX");
  assertASM_(JSON.stringify(outLCD) === JSON.stringify([0x06, 0x00]), "OUT [LCD], AX");

  const outFlex = assembleInstruction("OUT DX");
  assertASM_(JSON.stringify(outFlex) === JSON.stringify([0x06, 0x03]), "OUT DX flexible");
  Logger.log("PASS CR-5,6: IN reg, [KBD] and OUT [LCD], reg supported in strict and flexible forms.");

  // ── TEST 5: Two-pass assembler label resolution (forward and backward jumps) ──
  const loopLines = [
    "MOV AX, 00h",   // 4 bytes -> offset 0
    "MOV CX, 03h",   // 4 bytes -> offset 4
    "START:",        // label at offset 8
    "ADD AX, CX",    // 4 bytes -> offset 8
    "DEC CX",        // 2 bytes -> offset 12
    "JNZ START",     // 2 bytes -> offset 14. Target START = 8 (08h)
    "JMP FINISH",    // 2 bytes -> offset 16. Target FINISH = 19 (13h)
    "NOP_FAKE:",     // label at offset 18
    "INC AX",        // 2 bytes -> offset 18
    "FINISH:",       // label at offset 20 (14h)
    "HLT"            // 1 byte  -> offset 20
  ];

  const loopBytes = assembleProgram(loopLines);
  // Byte 14 is opcode 22h (JNZ), byte 15 is target address 08h
  assertASM_(loopBytes[14] === 0x22 && loopBytes[15] === 0x08, "Backward jump to START label resolved to 08h");
  // Byte 16 is opcode 20h (JMP), byte 17 is target address 14h (20)
  assertASM_(loopBytes[16] === 0x20 && loopBytes[17] === 0x14, "Forward jump to FINISH label resolved to 14h");
  Logger.log("PASS CR-4,13: Two-pass assembler resolves backward and forward labels accurately.");

  // ── TEST 6: Syntax error handling with line numbers ──
  let errorCaught = false;
  try {
    assembleProgram([
      "MOV AX, 01h",
      "INVALID_CMD AX, 5",
      "HLT"
    ]);
  } catch (err) {
    errorCaught = true;
    assertASM_(err.message.indexOf("Line 2") !== -1, "Error message must report Line 2");
  }
  assertASM_(errorCaught, "Syntax error must be detected and reported");
  Logger.log("PASS CR-10,11: Syntax errors caught with descriptive messages and line numbers.");

  // ── TEST 7: Execution of Demo 1 (Arithmetic, Logic, 4 Regs, Virtual Mem) ──
  const p1Bytes = assembleProgram(DEMO_PROGRAMS.PROGRAM_1.lines);
  loadProgram(p1Bytes, 0x00);
  assertASM_(getRegister("PC") === 0x00, "PC initialized to 00h");

  let p1State = getExecutionState_();
  let guard = 0;
  while (!p1State.halted && guard < 500) {
    p1State = stepCpu();
    guard++;
  }
  assertASM_(p1State.halted, "Demo 1 must reach HLT");
  // AX = (10h + 20h - 05h) & FFh = 2Bh (43). DX loaded from [100h] = 2Bh.
  assertASM_(getRegister("AX") === 0x2B, "Demo 1 AX result 2Bh");
  assertASM_(getRegister("DX") === 0x2B, "Demo 1 DX result 2Bh");
  assertASM_(getFlag("ZF") === 1, "CMP AX, DX sets ZF=1");
  Logger.log("PASS CR-17,18,20: Demo 1 executed successfully through Fetch-Decode-Execute cycle.");

  // ── TEST 8: Execution of Demo 2 (Loop with Labels) ──
  const p2Bytes = assembleProgram(DEMO_PROGRAMS.PROGRAM_2.lines);
  loadProgram(p2Bytes, 0x00);

  let p2State = getExecutionState_();
  guard = 0;
  while (!p2State.halted && guard < 500) {
    p2State = stepCpu();
    guard++;
  }
  assertASM_(p2State.halted, "Demo 2 must reach HLT");
  // Sum 1..5 = 15 (0Fh). Stored at [120h].
  assertASM_(getRegister("AX") === 15, "Demo 2 AX sum equals 15 (0Fh)");
  assertASM_(getRegister("CX") === 0, "Demo 2 CX counter decremented to 0");
  assertASM_(readVirtualMemory(0x120) === 15, "Virtual memory [120h] contains 15");
  Logger.log("PASS CR-17,18,20: Demo 2 loop executed correctly (Sum 1..5 = 15).");

  // ── TEST 9: Execution of Demo 3 (I/O with Keyboard & LCD) ──
  // Pre-feed keyboard buffer
  if (typeof keyboardReset_ === "function") {
    keyboardReset_();
  }
  if (typeof keyboardEnqueue_ === "function") {
    keyboardEnqueue_(65); // 'A'
    keyboardEnqueue_(66); // 'B'
  } else if (typeof keyboardEnqueueCharacter_ === "function") {
    keyboardEnqueueCharacter_('A');
    keyboardEnqueueCharacter_('B');
  }
  const p3Bytes = assembleProgram(DEMO_PROGRAMS.PROGRAM_3.lines);
  loadProgram(p3Bytes, 0x00);

  let p3State = getExecutionState_();
  guard = 0;
  while (!p3State.halted && guard < 500) {
    p3State = stepCpu();
    guard++;
  }
  assertASM_(p3State.halted, "Demo 3 must reach HLT");
  assertASM_(getRegister("AX") === 65, "Demo 3 AX read 'A' (65)");
  assertASM_(getRegister("BX") === 66, "Demo 3 BX read 'B' (66)");
  Logger.log("PASS CR-17,18,20: Demo 3 Keyboard to LCD executed correctly.");

  Logger.log("=== ALL TASK 13 EXTENDED ASSEMBLER & LOADER TESTS PASSED ===");

  return {
    passed: true,
    criteriaTested: 21,
    demo1Result: getRegister("AX"),
    demo2Sum: 15,
    isaInstructionCount: Object.keys(ISA).length
  };
}

// Retain legacy test names for regression safety
function testAssemblerModule() {
  return testExtendedAssemblerModule();
}
