
/**
 * EitoDiceBanana CPU Simulator
 * Assembler Module — Phase 2 / Tasks 08-10
 *
 * Virtual addresses: 000h - 1FFh (9 bits).
 * Physical RAM: 256 bytes.
 *
 * LOAD PROGRAM:
 * - Clears all 256 physical RAM bytes.
 * - Loads machine code into the code segment.
 * - Rebuilds the Page Table and backing store.
 * - Invalidates caches and resets counters.
 * - Resets CPU and execution state.
 *
 * RESET:
 * - Restores the initial loaded program image.
 * - Does not erase the loaded program.
 */

// ------------------------------------------------------------
// INSTRUCTION SET
// ------------------------------------------------------------

const ISA = {
  MOV_IMM: { opcode: 0x01, bytes: 4 },
  MOV_REG: { opcode: 0x02, bytes: 3 },
  LOAD:    { opcode: 0x03, bytes: 4 },
  STORE:   { opcode: 0x04, bytes: 4 },

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
  BX: 0x01,
  CX: 0x02,
  DX: 0x03
};

const ASM_MODES = {
  REGISTER: 0x00,
  IMMEDIATE: 0x01
};

// ------------------------------------------------------------
// UTILITIES
// ------------------------------------------------------------

function asmRegisterCode_(name) {
  const key = String(name).trim().toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(
    ASM_REGISTERS,
    key
  )) {
    throw new Error("Invalid register: " + name);
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
    throw new Error(
      "Value out of 8-bit range: " + text
    );
  }

  return result;
}

/**
 * Parses a 9-bit virtual address.
 *
 * Range: 0-511 (000h-1FFh).
 * Accepted forms: 256, 1FFh, 0x1FF.
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
    throw new Error(
      "Invalid virtual address: " + text
    );
  }

  if (
    !Number.isInteger(result) ||
    result < 0 ||
    result > 511
  ) {
    throw new Error(
      "Virtual address out of range: " + text +
      ". Expected 0-511 (000h-1FFh)."
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

// ------------------------------------------------------------
// ASSEMBLE ONE INSTRUCTION
// ------------------------------------------------------------

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

  // LOAD register, [9-bit virtual address]
  // Encoding: opcode, register, addressHigh, addressLow
  match = source.match(
    /^LOAD\s+(AX|BX|CX|DX)\s*,\s*\[(.+)\]$/
  );

  if (match) {
    const address = asmParseVirtualAddress_(match[2]);

    return [
      ISA.LOAD.opcode,
      asmRegisterCode_(match[1]),
      (address >> 8) & 0x01,
      address & 0xFF
    ];
  }

  // STORE [9-bit virtual address], register
  // Encoding: opcode, addressHigh, addressLow, register
  match = source.match(
    /^STORE\s*\[(.+)\]\s*,\s*(AX|BX|CX|DX)$/
  );

  if (match) {
    const address = asmParseVirtualAddress_(match[1]);

    return [
      ISA.STORE.opcode,
      (address >> 8) & 0x01,
      address & 0xFF,
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

  throw new Error("Unknown instruction: " + source);
}

// ------------------------------------------------------------
// ASSEMBLE COMPLETE PROGRAM
// ------------------------------------------------------------

function assembleProgram(lines) {
  if (!Array.isArray(lines)) {
    throw new Error("Program must be an array.");
  }

  const program = [];

  lines.forEach(function(line, index) {
    try {
      const bytes = assembleInstruction(line);

      bytes.forEach(function(byte) {
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

// ------------------------------------------------------------
// LOAD PROGRAM INTO PHYSICAL RAM
// ------------------------------------------------------------

/**
 * Loads an assembled program into physical RAM.
 *
 * Unlike the previous implementation, this
 * initializes all 256 physical bytes, not
 * only the first 128 code bytes.
 *
 * Correct initialization sequence:
 *
 * 1. Validate the complete program.
 * 2. Build a clean 256-byte RAM image.
 * 3. Write the program into its code segment.
 * 4. Reinitialize the Page Table and backing store.
 * 5. Reset all cache lines and performance counters.
 * 6. Reset CPU registers and execution state.
 * 7. Initialize PC.
 *
 * The initialized physical memory becomes
 * the baseline restored by CPU RESET.
 */
function loadProgram(program, startAddress) {
  if (startAddress === undefined) {
    startAddress = 0x00;
  }

  if (
    !Array.isArray(program) ||
    program.length === 0
  ) {
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

  program.forEach(function(byte, index) {
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
    throw new Error("MEMORIA sheet not found.");
  }

  // ------------------------------------------
  // STEP 1: BUILD CLEAN PHYSICAL RAM
  // ------------------------------------------

  const ramSize = CONFIG.MEMORY.size;
  const ramColumns = CONFIG.MEMORY.columns;
  const ramRows = CONFIG.MEMORY.rows;

  if (
    ramSize !== 256 ||
    ramRows !== 16 ||
    ramColumns !== 16
  ) {
    throw new Error(
      "Invalid RAM configuration. Expected 256 bytes (16 x 16)."
    );
  }

  // A fresh program always starts with
  // zero-initialized physical RAM.
  const ramBytes = Array(ramSize).fill(0);

  // ------------------------------------------
  // STEP 2: LOAD MACHINE CODE
  // ------------------------------------------

  program.forEach(function(byte, index) {
    ramBytes[startAddress + index] = byte;
  });

  // Convert the complete image to the
  // 16 x 16 hexadecimal memory matrix.
  const matrix = [];

  for (let row = 0; row < ramRows; row++) {
    const start = row * ramColumns;

    const rowBytes = ramBytes
      .slice(start, start + ramColumns)
      .map(byteToHex_);

    matrix.push(rowBytes);
  }

  // ------------------------------------------
  // STEP 3: WRITE ALL 256 PHYSICAL BYTES
  // ------------------------------------------

  const startRow = MEMORY_LAYOUT.startRow;
  const startColumn = MEMORY_LAYOUT.startColumn;

  ram.getRange(
    startRow,
    startColumn,
    ramRows,
    ramColumns
  )
    .setNumberFormat("@")
    .setValues(matrix);

  SpreadsheetApp.flush();

  clearMemoryHighlight();

  // ------------------------------------------
  // STEP 4: REBUILD MMU / PAGING / SWAP
  // ------------------------------------------

  // Paging captures the newly initialized
  // physical RAM as the program baseline.
  if (
    typeof resetPagingSystem === "function"
  ) {
    resetPagingSystem();
  }

  // ------------------------------------------
  // STEP 5: INVALIDATE ALL CACHES
  // ------------------------------------------

  // Previous cache lines refer to the old
  // program image and must not survive.
  if (
    typeof resetCacheModule === "function"
  ) {
    resetCacheModule();
  }

  // ------------------------------------------
  // STEP 6: RESET CPU EXECUTION
  // ------------------------------------------

  resetCPURegisters();
  resetExecutionState();

  setRegister("PC", startAddress);

  Logger.log(
    "LOAD PROGRAM: " + program.length +
    " bytes loaded."
  );

  Logger.log(
    "LOAD PROGRAM: All 256 physical RAM bytes initialized."
  );

  Logger.log(
    "LOAD PROGRAM: MMU, paging, Swap, caches and CPU reset."
  );

  return program.length;
}

// ------------------------------------------------------------
// LOAD PROGRAM FROM ASM SHEET
// ------------------------------------------------------------

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
      count + " bytes written to RAM.\n" +
      "Physical memory initialized: 256 bytes."
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

// ------------------------------------------------------------
// ASSEMBLER TESTS
// ------------------------------------------------------------

function testAssemblerModule() {
  Logger.log(
    "=== PHASE 2 / TASK 08 ASSEMBLER TEST ==="
  );

  const codes = {
    AX: 0x00,
    BX: 0x01,
    CX: 0x02,
    DX: 0x03
  };

  Object.keys(codes).forEach(function(reg) {
    if (asmRegisterCode_(reg) !== codes[reg]) {
      throw new Error(
        "Register encoding failed: " + reg
      );
    }
  });

  Logger.log(
    "PASS: AX, BX, CX, DX register codes."
  );

  const movCX = assembleInstruction(
    "MOV CX, 05h"
  );

  if (
    JSON.stringify(movCX) !==
    JSON.stringify([0x01, 0x02, 0x01, 0x05])
  ) {
    throw new Error("MOV CX immediate failed.");
  }

  Logger.log("PASS: MOV immediate.");

  const movDX = assembleInstruction(
    "MOV DX, CX"
  );

  if (
    JSON.stringify(movDX) !==
    JSON.stringify([0x02, 0x03, 0x02])
  ) {
    throw new Error("MOV DX, CX failed.");
  }

  Logger.log("PASS: MOV register.");

  const add = assembleInstruction(
    "ADD CX, DX"
  );

  if (
    JSON.stringify(add) !==
    JSON.stringify([0x10, 0x02, 0x00, 0x03])
  ) {
    throw new Error("ADD CX, DX encoding failed.");
  }

  Logger.log("PASS: ADD register.");

  const inc = assembleInstruction("INC DX");

  if (
    JSON.stringify(inc) !==
    JSON.stringify([0x12, 0x03])
  ) {
    throw new Error("INC DX encoding failed.");
  }

  Logger.log("PASS: Unary instruction.");

  const andBytes = assembleInstruction(
    "AND DX, CX"
  );

  if (
    JSON.stringify(andBytes) !==
    JSON.stringify([0x15, 0x03, 0x00, 0x02])
  ) {
    throw new Error("AND DX, CX encoding failed.");
  }

  Logger.log("PASS: Logical instruction.");

  // LOAD and STORE encode 9-bit addresses.
  const load80 = assembleInstruction(
    "LOAD CX, [80h]"
  );

  const store81 = assembleInstruction(
    "STORE [81h], DX"
  );

  if (
    JSON.stringify(load80) !==
    JSON.stringify([0x03, 0x02, 0x00, 0x80])
  ) {
    throw new Error(
      "LOAD 80h encoding failed."
    );
  }

  if (
    JSON.stringify(store81) !==
    JSON.stringify([0x04, 0x00, 0x81, 0x03])
  ) {
    throw new Error(
      "STORE 81h encoding failed."
    );
  }

  Logger.log(
    "PASS: LOAD and STORE 8-bit virtual addresses."
  );

  const load100 = assembleInstruction(
    "LOAD AX, [100h]"
  );

  const store1FF = assembleInstruction(
    "STORE [1FFh], BX"
  );

  if (
    JSON.stringify(load100) !==
    JSON.stringify([0x03, 0x00, 0x01, 0x00])
  ) {
    throw new Error(
      "LOAD 100h encoding failed."
    );
  }

  if (
    JSON.stringify(store1FF) !==
    JSON.stringify([0x04, 0x01, 0xFF, 0x01])
  ) {
    throw new Error(
      "STORE 1FFh encoding failed."
    );
  }

  Logger.log(
    "PASS: 9-bit virtual addresses 100h and 1FFh."
  );

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
    "PASS: Phase 1 register compatibility."
  );

  let rejectedByte = false;

  try {
    assembleInstruction("MOV CX, 256");
  } catch (error) {
    rejectedByte = true;
  }

  if (!rejectedByte) {
    throw new Error(
      "Invalid 8-bit immediate was accepted."
    );
  }

  let rejectedVirtualAddress = false;

  try {
    assembleInstruction("LOAD AX, [200h]");
  } catch (error) {
    rejectedVirtualAddress = true;
  }

  if (!rejectedVirtualAddress) {
    throw new Error(
      "Virtual address above 1FFh was accepted."
    );
  }

  Logger.log(
    "PASS: Invalid values and addresses rejected."
  );

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
      "Unexpected program size: " + program.length
    );
  }

  Logger.log(
    "PASS: Complete four-register program assembled."
  );

  const loadedBytes = loadProgram(
    program,
    0x00
  );

  if (loadedBytes !== 25) {
    throw new Error("Program load failed.");
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
    "PASS: Program loaded into RAM."
  );

  // Verify the entire RAM initialization,
  // including the data segment.
  if (
    Read(0x80) !== 0 ||
    Read(0xA0) !== 0 ||
    Read(0xFF) !== 0
  ) {
    throw new Error(
      "Physical RAM initialization failed. " +
      "Data segment contains residual values."
    );
  }

  Logger.log(
    "PASS: All physical RAM data bytes initialized."
  );

  Logger.log(
    "=== ALL ASSEMBLER TESTS PASSED ==="
  );

  return {
    passed: true,
    programBytes: program.length,
    load80: load80,
    store1FF: store1FF,
    physicalRAMInitialized: true
  };
}
