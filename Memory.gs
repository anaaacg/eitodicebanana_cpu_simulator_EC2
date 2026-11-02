
/**
 * EitoDiceBanana CPU Simulator
 * Memory Module - Phase 1
 *
 * RAM: 256 bytes (00h - FFh)
 * Code: 00h - 7Fh
 * Data: 80h - FFh
 *
 * Visual feedback:
 * READ  = Green
 * WRITE = Yellow
 *
 * Paging, cache and MMU reserved for Phase 2.
 */

// ============================================
// CONFIGURATION
// ============================================

const MEMORY_LAYOUT = {
  sheet: "MEMORIA",
  startRow: 6,
  startColumn: 2,

  inspector: {
    address: "G26",
    hex: "G27",
    binary: "G28",
    decimal: "G29",
    mnemonic: "G30"
  },

  access: {
    operation: "N26",
    segment: "N27",
    address: "N28",
    value: "N29"
  }
};

const MEMORY_HIGHLIGHT_KEY =
  "EDB_MEMORY_LAST_HIGHLIGHT";

const MEMORY_CODE_COLOR = "#29271F";

// ============================================
// VALIDATION
// ============================================

function isValidAddress(address) {
  return Number.isInteger(address) &&
    address >= CONFIG.MEMORY.minAddress &&
    address <= CONFIG.MEMORY.maxAddress;
}

function isValidByte(value) {
  return Number.isInteger(value) &&
    value >= 0 &&
    value <= CONFIG.CPU.maxValue;
}

function validateAddress_(address) {
  if (!isValidAddress(address)) {
    throw new Error(
      "Invalid memory address: " +
      address + ". Expected 0-255."
    );
  }
}

function validateByte_(value) {
  if (!isValidByte(value)) {
    throw new Error(
      "Invalid byte value: " +
      value + ". Expected 0-255."
    );
  }
}

// ============================================
// ADDRESS TRANSLATION
// ============================================

function addressToCell(address) {
  validateAddress_(address);

  return {
    row: MEMORY_LAYOUT.startRow +
      Math.floor(address / 16),

    column: MEMORY_LAYOUT.startColumn +
      (address % 16)
  };
}

// ============================================
// UTILITIES
// ============================================

function memorySheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(MEMORY_LAYOUT.sheet);

  if (!sheet) {
    throw new Error(
      'Memory sheet "' +
      MEMORY_LAYOUT.sheet +
      '" not found.'
    );
  }

  return sheet;
}

function byteToHex_(value) {
  validateByte_(value);

  return value
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
}

function byteToBinary_(value) {
  validateByte_(value);

  return value
    .toString(2)
    .padStart(8, "0");
}

function memorySegment_(address) {
  return address <= CONFIG.MEMORY.codeEnd
    ? "CODE"
    : "DATA";
}

function memoryBaseColor_(address) {
  return address <= CONFIG.MEMORY.codeEnd
    ? MEMORY_CODE_COLOR
    : CONFIG.COLORS.panel;
}

function memoryProperties_() {
  return PropertiesService.getDocumentProperties();
}

function readRawMemory_(address) {
  validateAddress_(address);

  const position = addressToCell(address);

  const rawValue = memorySheet_()
    .getRange(position.row, position.column)
    .getDisplayValue()
    .trim();

  if (!/^[0-9A-F]{2}$/i.test(rawValue)) {
    throw new Error(
      "Invalid byte at address " +
      byteToHex_(address) +
      "h: " + rawValue
    );
  }

  return parseInt(rawValue, 16);
}

// ============================================
// VISUAL HIGHLIGHT
// ============================================

/**
 * Removes highlight from the previously
 * accessed cell without repainting all RAM.
 */
function clearMemoryHighlight() {
  const props = memoryProperties_();

  const previous = props.getProperty(
    MEMORY_HIGHLIGHT_KEY
  );

  if (previous !== null) {
    const address = Number(previous);

    if (isValidAddress(address)) {
      const position = addressToCell(address);

      memorySheet_()
        .getRange(
          position.row,
          position.column
        )
        .setBackground(
          memoryBaseColor_(address)
        )
        .setFontColor(
          CONFIG.COLORS.white
        )
        .setFontWeight("normal");
    }
  }

  props.deleteProperty(
    MEMORY_HIGHLIGHT_KEY
  );
}

/**
 * Highlights one accessed address.
 *
 * READ: green
 * WRITE: yellow
 */
function highlightMemory(address, operation) {
  validateAddress_(address);

  const action = String(
    operation || "READ"
  ).toUpperCase();

  const color = action === "WRITE"
    ? CONFIG.COLORS.yellow
    : CONFIG.COLORS.green;

  clearMemoryHighlight();

  const position = addressToCell(address);

  memorySheet_()
    .getRange(
      position.row,
      position.column
    )
    .setBackground(color)
    .setFontColor(
      CONFIG.COLORS.background
    )
    .setFontWeight("bold");

  memoryProperties_().setProperty(
    MEMORY_HIGHLIGHT_KEY,
    String(address)
  );
}

// ============================================
// MEMORY INSPECTOR
// ============================================

function getMnemonic(value) {
  const mnemonics = {
    0x01: "MOV reg, imm",
    0x02: "MOV reg, reg",
    0x03: "LOAD reg, [dir]",
    0x04: "STORE [dir], reg",

    0x10: "ADD reg, imm/reg",
    0x11: "SUB reg, imm/reg",
    0x12: "INC reg",
    0x13: "DEC reg",
    0x14: "CMP reg, imm/reg",

    0x15: "AND reg, imm/reg",
    0x16: "OR reg, imm/reg",
    0x17: "XOR reg, imm/reg",
    0x18: "NOT reg",

    0x20: "JMP dir",
    0x21: "JZ dir",
    0x22: "JNZ dir",

    0xFF: "HLT"
  };

  return mnemonics[value] || "-";
}

/**
 * Updates the inspector without triggering
 * a second memory read.
 */
function updateMemoryInspector_(address, value) {
  const sheet = memorySheet_();
  const cells = MEMORY_LAYOUT.inspector;

  sheet.getRange(cells.address)
    .setValue(byteToHex_(address) + "h");

  sheet.getRange(cells.hex)
    .setValue(byteToHex_(value));

  sheet.getRange(cells.binary)
    .setNumberFormat("@")
    .setValue(byteToBinary_(value));

  sheet.getRange(cells.decimal)
    .setValue(value);

  sheet.getRange(cells.mnemonic)
    .setValue(getMnemonic(value));
}

/**
 * Adds a small access monitor beside
 * the existing memory inspector.
 *
 * Safe to execute on an existing sheet.
 */
function setupMemoryAccessPanel() {
  const sheet = memorySheet_();
  const C = CONFIG.COLORS;

  const labels = [
    ["J26", "LAST ACCESS"],
    ["J27", "SEGMENT"],
    ["J28", "ADDRESS"],
    ["J29", "VALUE"]
  ];

  labels.forEach(item => {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.muted)
      .setFontWeight("bold");
  });

  const cells = MEMORY_LAYOUT.access;

  [
    cells.operation,
    cells.segment,
    cells.address,
    cells.value
  ].forEach(cell => {
    sheet.getRange(cell)
      .setBackground(C.panelAlt)
      .setFontColor(C.yellow)
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
  });

  sheet.getRange(cells.operation)
    .setValue("READY");

  sheet.getRange(cells.segment)
    .setValue("-");

  sheet.getRange(cells.address)
    .setValue("--");

  sheet.getRange(cells.value)
    .setValue("--");

  SpreadsheetApp.flush();
}

/**
 * Displays the latest access information.
 */
function updateMemoryAccess_(address, value, operation) {
  const sheet = memorySheet_();
  const cells = MEMORY_LAYOUT.access;

  const action = String(
    operation
  ).toUpperCase();

  const color = action === "WRITE"
    ? CONFIG.COLORS.yellow
    : CONFIG.COLORS.green;

  sheet.getRange(cells.operation)
    .setValue(action)
    .setFontColor(color);

  sheet.getRange(cells.segment)
    .setValue(
      memorySegment_(address)
    );

  sheet.getRange(cells.address)
    .setValue(
      byteToHex_(address) + "h"
    );

  sheet.getRange(cells.value)
    .setValue(
      byteToHex_(value) + "h"
    );

  updateMemoryInspector_(address, value);
}

/**
 * Manual inspection.
 *
 * This is also treated as a READ.
 */
function inspectMemory(address) {
  validateAddress_(address);

  const value = Read(address);

  return {
    address: address,
    hexadecimal: byteToHex_(value),
    binary: byteToBinary_(value),
    decimal: value,
    mnemonic: getMnemonic(value)
  };
}

// ============================================
// READ
// ============================================

function Read(address) {
  validateAddress_(address);

  const value = readRawMemory_(address);

  highlightMemory(address, "READ");

  updateMemoryAccess_(
    address,
    value,
    "READ"
  );

  return value;
}

// ============================================
// WRITE
// ============================================

function Write(address, value) {
  validateAddress_(address);
  validateByte_(value);

  const position = addressToCell(address);

  memorySheet_()
    .getRange(
      position.row,
      position.column
    )
    .setNumberFormat("@")
    .setValue(
      byteToHex_(value)
    );

  highlightMemory(address, "WRITE");

  updateMemoryAccess_(
    address,
    value,
    "WRITE"
  );
}

// ============================================
// RESET RAM
// ============================================

/**
 * Clears the entire physical RAM.
 *
 * WARNING:
 * Removes loaded programs and data.
 */
function clearRAM() {
  const sheet = memorySheet_();

  const emptyRAM = Array.from(
    { length: 16 },
    () => Array(16).fill("00")
  );

  sheet.getRange(6, 2, 16, 16)
    .setNumberFormat("@")
    .setValues(emptyRAM)
    .setFontColor(CONFIG.COLORS.white)
    .setFontWeight("normal");

  sheet.getRange("B6:Q13")
    .setBackground(MEMORY_CODE_COLOR);

  sheet.getRange("B14:Q21")
    .setBackground(CONFIG.COLORS.panel);

  memoryProperties_().deleteProperty(
    MEMORY_HIGHLIGHT_KEY
  );

  setupMemoryAccessPanel();
}

// ============================================
// TESTS
// ============================================

function testMemoryModule() {
  Logger.log("=== MEMORY MODULE TEST ===");

  Write(0x12, 0xAB);

  if (Read(0x12) !== 0xAB) {
    throw new Error(
      "READ/WRITE test failed."
    );
  }

  Logger.log("PASS: Read/Write 12h = ABh");

  Write(0xFF, 0x7A);

  if (Read(0xFF) !== 0x7A) {
    throw new Error(
      "Last address test failed."
    );
  }

  Logger.log("PASS: FFh = 7Ah");

  Write(0x80, 0x25);

  if (Read(0x80) !== 0x25) {
    throw new Error(
      "Data segment test failed."
    );
  }

  Logger.log("PASS: Data segment 80h = 25h");

  const info = inspectMemory(0x12);

  if (
    info.hexadecimal !== "AB" ||
    info.binary !== "10101011" ||
    info.decimal !== 171
  ) {
    throw new Error(
      "Memory inspector test failed."
    );
  }

  Logger.log("PASS: Memory inspector");

  try {
    Write(256, 10);

    throw new Error(
      "Invalid address was accepted."
    );

  } catch (error) {
    if (!error.message.includes(
      "Invalid memory address"
    )) {
      throw error;
    }
  }

  Logger.log("PASS: Invalid address rejected");

  try {
    Write(0x10, 256);

    throw new Error(
      "Invalid byte value was accepted."
    );

  } catch (error) {
    if (!error.message.includes(
      "Invalid byte value"
    )) {
      throw error;
    }
  }

  Logger.log("PASS: Invalid byte rejected");

  Logger.log(
    "=== ALL MEMORY TESTS PASSED ==="
  );
}
