
/**
 * EitoDiceBanana CPU Simulator
 * Memory Module - Phase 2 / Task 06
 *
 * Physical RAM: 256 bytes
 * Frames: 8
 * Frame size: 32 bytes
 *
 * Memory addresses: 00h - FFh
 * Code segment: 00h - 7Fh
 * Data segment: 80h - FFh
 *
 * READ highlight: Green
 * WRITE highlight: Yellow
 *
 * Compatible with CPU, ALU, Assembler,
 * Execution, Buses and ControlUnit.
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

const PHYSICAL_FRAME_SIZE = 32;
const PHYSICAL_FRAME_COUNT = 8;
const PHYSICAL_RAM_SIZE = 256;

// ============================================
// VALIDATION
// ============================================

function isValidAddress(address) {
  return Number.isInteger(address) &&
    address >= 0 &&
    address < PHYSICAL_RAM_SIZE;
}

function isValidByte(value) {
  return Number.isInteger(value) &&
    value >= 0 &&
    value <= 255;
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

function validatePhysicalConfiguration_() {
  if (
    PHYSICAL_FRAME_COUNT !== 8 ||
    PHYSICAL_FRAME_SIZE !== 32 ||
    PHYSICAL_RAM_SIZE !== 256 ||
    CONFIG.MEMORY.size !== 256
  ) {
    throw new Error(
      "Physical RAM requires exactly " +
      "8 frames of 32 bytes."
    );
  }

  return true;
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

function getPhysicalAddressInfo(address) {
  validateAddress_(address);
  validatePhysicalConfiguration_();

  const frame = Math.floor(
    address / PHYSICAL_FRAME_SIZE
  );

  const offset =
    address % PHYSICAL_FRAME_SIZE;

  return {
    address: address,
    frame: frame,
    offset: offset,
    frameStart:
      frame * PHYSICAL_FRAME_SIZE,
    frameEnd:
      frame * PHYSICAL_FRAME_SIZE + 31,
    row:
      MEMORY_LAYOUT.startRow +
      Math.floor(address / 16),
    column:
      MEMORY_LAYOUT.startColumn +
      (address % 16)
  };
}

function physicalFrameToAddress(frame, offset) {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= PHYSICAL_FRAME_COUNT
  ) {
    throw new Error(
      "Invalid physical frame: " +
      frame + ". Expected 0-7."
    );
  }

  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset >= PHYSICAL_FRAME_SIZE
  ) {
    throw new Error(
      "Invalid frame offset: " +
      offset + ". Expected 0-31."
    );
  }

  return frame * PHYSICAL_FRAME_SIZE + offset;
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

function memoryProperties_() {
  return PropertiesService.getDocumentProperties();
}

function byteToHex_(value) {
  validateByte_(value);

  return value.toString(16)
    .toUpperCase()
    .padStart(2, "0");
}

function byteToBinary_(value) {
  validateByte_(value);

  return value.toString(2)
    .padStart(8, "0");
}

function memorySegment_(address) {
  validateAddress_(address);

  return address <= CONFIG.MEMORY.codeEnd
    ? "CODE"
    : "DATA";
}

function memoryBaseColor_(address) {
  return memorySegment_(address) === "CODE"
    ? MEMORY_CODE_COLOR
    : CONFIG.COLORS.panel;
}

// ============================================
// HEXADECIMAL CELL PARSING
// ============================================

/**
 * Accepts one or two hexadecimal digits.
 *
 * Valid examples:
 * 0, 00, 1, 01, A, 0A, FF
 *
 * Rejects empty cells, negative values,
 * invalid characters and values > FFh.
 *
 * Fixes the physical address 81h issue.
 */
function parsePhysicalMemoryCell_(raw, address) {
  validateAddress_(address);

  const text = String(raw).trim();

  if (!/^[0-9A-F]{1,2}$/i.test(text)) {
    throw new Error(
      "Invalid byte at physical address " +
      byteToHex_(address) +
      "h: " + text
    );
  }

  const value = parseInt(text, 16);

  validateByte_(value);

  return value;
}

// ============================================
// RAW PHYSICAL MEMORY
// ============================================

function readRawMemory_(address) {
  validateAddress_(address);

  const position = addressToCell(address);

  const raw = memorySheet_()
    .getRange(
      position.row,
      position.column
    )
    .getDisplayValue();

  return parsePhysicalMemoryCell_(
    raw,
    address
  );
}

// ============================================
// PHYSICAL FRAME OPERATIONS
// ============================================

function getPhysicalFrame(frame) {
  const start = physicalFrameToAddress(
    frame,
    0
  );

  const row =
    MEMORY_LAYOUT.startRow +
    Math.floor(start / 16);

  const values = memorySheet_()
    .getRange(
      row,
      MEMORY_LAYOUT.startColumn,
      2,
      16
    )
    .getDisplayValues()
    .flat();

  const bytes = values.map(
    function(raw, index) {
      return parsePhysicalMemoryCell_(
        raw,
        start + index
      );
    }
  );

  return {
    frame: frame,
    startAddress: start,
    endAddress: start + 31,
    size: 32,
    bytes: bytes
  };
}

function readPhysicalFrameByte(frame, offset) {
  const address = physicalFrameToAddress(
    frame,
    offset
  );

  return Read(address);
}

function writePhysicalFrameByte(
  frame,
  offset,
  value
) {
  validateByte_(value);

  const address = physicalFrameToAddress(
    frame,
    offset
  );

  Write(address, value);
}

// ============================================
// MEMORY HIGHLIGHT
// ============================================

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
// MNEMONIC INSPECTOR
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

// ============================================
// MEMORY INSPECTOR
// ============================================

function updateMemoryInspector_(address, value) {
  const sheet = memorySheet_();
  const cells = MEMORY_LAYOUT.inspector;

  sheet.getRange(cells.address)
    .setValue(
      byteToHex_(address) + "h"
    );

  sheet.getRange(cells.hex)
    .setValue(
      byteToHex_(value)
    );

  sheet.getRange(cells.binary)
    .setNumberFormat("@")
    .setValue(
      byteToBinary_(value)
    );

  sheet.getRange(cells.decimal)
    .setValue(value);

  sheet.getRange(cells.mnemonic)
    .setValue(
      getMnemonic(value)
    );
}

function setupMemoryAccessPanel() {
  const sheet = memorySheet_();
  const C = CONFIG.COLORS;

  const labels = [
    ["J26", "LAST ACCESS"],
    ["J27", "SEGMENT"],
    ["J28", "ADDRESS"],
    ["J29", "VALUE"]
  ];

  labels.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.muted)
      .setFontWeight("bold");
  });

  [
    MEMORY_LAYOUT.access.operation,
    MEMORY_LAYOUT.access.segment,
    MEMORY_LAYOUT.access.address,
    MEMORY_LAYOUT.access.value
  ].forEach(function(cell) {
    sheet.getRange(cell)
      .setBackground(C.panelAlt)
      .setFontColor(C.yellow)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  });

  sheet.getRange(
    MEMORY_LAYOUT.access.operation
  ).setValue("READY");

  sheet.getRange(
    MEMORY_LAYOUT.access.segment
  ).setValue("-");

  sheet.getRange(
    MEMORY_LAYOUT.access.address
  ).setValue("--");

  sheet.getRange(
    MEMORY_LAYOUT.access.value
  ).setValue("--");

  SpreadsheetApp.flush();
}

function updateMemoryAccess_(
  address,
  value,
  operation
) {
  const sheet = memorySheet_();
  const cells = MEMORY_LAYOUT.access;

  const action = String(
    operation
  ).toUpperCase();

  sheet.getRange(cells.operation)
    .setValue(action)
    .setFontColor(
      action === "WRITE"
        ? CONFIG.COLORS.yellow
        : CONFIG.COLORS.green
    );

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

  // Task 06 additional physical frame data.
  const info = getPhysicalAddressInfo(address);

  sheet.getRange("N30")
    .setValue("FRAME " + info.frame);

  sheet.getRange("N31")
    .setValue(
      byteToHex_(info.offset) + "h"
    );

  updateMemoryInspector_(address, value);
}

function inspectMemory(address) {
  validateAddress_(address);

  const value = Read(address);
  const physical = getPhysicalAddressInfo(
    address
  );

  return {
    address: address,
    hexadecimal: byteToHex_(value),
    binary: byteToBinary_(value),
    decimal: value,
    mnemonic: getMnemonic(value),
    frame: physical.frame,
    offset: physical.offset
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
 * WARNING:
 * This removes programs and RAM data.
 * Do not run for Task 06 tests.
 */
function clearRAM() {
  const sheet = memorySheet_();

  const values = Array.from(
    { length: 16 },
    () => Array(16).fill("00")
  );

  sheet.getRange(6, 2, 16, 16)
    .setNumberFormat("@")
    .setValues(values)
    .setFontColor(CONFIG.COLORS.white)
    .setFontWeight("normal");

  sheet.getRange("B6:Q13")
    .setBackground(MEMORY_CODE_COLOR);

  sheet.getRange("B14:Q21")
    .setBackground(CONFIG.COLORS.panel);

  memoryProperties_().deleteProperty(
    MEMORY_HIGHLIGHT_KEY
  );

  // RAM reset also resets the metadata for the physical keyboard FIFO.
  // keyboardReset_ rewrites E8h-EFh as zero and leaves the LCD controller
  // state independent from the keyboard queue.
  if (typeof keyboardReset_ === "function") {
    keyboardReset_();
  }

  setupMemoryAccessPanel();
}

// ============================================
// ORIGINAL MEMORY TESTS
// ============================================

function testMemoryModule() {
  Logger.log("=== MEMORY MODULE TEST ===");

  Write(0x12, 0xAB);

  if (Read(0x12) !== 0xAB) {
    throw new Error(
      "READ/WRITE test failed."
    );
  }

  Logger.log(
    "PASS: Read/Write 12h = ABh"
  );

  Write(0xFF, 0x7A);

  if (Read(0xFF) !== 0x7A) {
    throw new Error(
      "Last address test failed."
    );
  }

  Logger.log(
    "PASS: FFh = 7Ah"
  );

  Write(0x80, 0x25);

  if (Read(0x80) !== 0x25) {
    throw new Error(
      "Data segment test failed."
    );
  }

  Logger.log(
    "PASS: Data segment 80h = 25h"
  );

  const info = inspectMemory(0x12);

  if (
    info.hexadecimal !== "AB" ||
    info.binary !== "10101011" ||
    info.decimal !== 171
  ) {
    throw new Error(
      "Memory inspector failed."
    );
  }

  Logger.log(
    "PASS: Memory inspector"
  );

  let rejected = false;

  try {
    Read(256);
  } catch (error) {
    rejected = true;
  }

  if (!rejected) {
    throw new Error(
      "Invalid address was accepted."
    );
  }

  Logger.log(
    "PASS: Invalid address rejected"
  );

  rejected = false;

  try {
    Write(0x10, 256);
  } catch (error) {
    rejected = true;
  }

  if (!rejected) {
    throw new Error(
      "Invalid byte was accepted."
    );
  }

  Logger.log(
    "PASS: Invalid byte rejected"
  );

  Logger.log(
    "=== ALL MEMORY TESTS PASSED ==="
  );
}

// ============================================
// PHYSICAL FRAMES DASHBOARD
// ============================================

function setupPhysicalFramesDashboard() {
  validatePhysicalConfiguration_();

  const sheet = memorySheet_();
  const C = CONFIG.COLORS;

  // Each frame occupies two rows of RAM.
  for (
    let frame = 0;
    frame < PHYSICAL_FRAME_COUNT;
    frame++
  ) {
    const start = physicalFrameToAddress(
      frame,
      0
    );

    const end = physicalFrameToAddress(
      frame,
      31
    );

    const firstRow =
      MEMORY_LAYOUT.startRow + frame * 2;

    sheet.getRange(firstRow, 18)
      .setValue(
        "FRAME " + frame
      )
      .setBackground(C.panelAlt)
      .setFontColor(C.yellow)
      .setFontWeight("bold");

    sheet.getRange(firstRow + 1, 18)
      .setValue(
        byteToHex_(start) + "-" +
        byteToHex_(end) + "h"
      )
      .setBackground(C.panel)
      .setFontColor(C.muted);

    sheet.getRange(
      firstRow,
      MEMORY_LAYOUT.startColumn,
      1,
      16
    ).setBorder(
      true,
      null,
      null,
      null,
      null,
      null,
      C.yellow,
      SpreadsheetApp.BorderStyle.SOLID
    );
  }

  sheet.setColumnWidth(18, 130);

  // Frame map heading
  sheet.getRange("B35:Q35")
    .breakApart();

  sheet.getRange("B35:Q35")
    .merge()
    .setValue(
      "PHYSICAL RAM / EIGHT 32-BYTE FRAMES"
    )
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.getRange("J30")
    .setValue("LAST FRAME")
    .setFontColor(C.muted)
    .setFontWeight("bold");

  sheet.getRange("J31")
    .setValue("FRAME OFFSET")
    .setFontColor(C.muted)
    .setFontWeight("bold");

  sheet.getRange("N30:N31")
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  const headers = Array(16).fill("");

  headers[0] = "FRAME";
  headers[3] = "START";
  headers[6] = "END";
  headers[9] = "SIZE";
  headers[12] = "OFFSETS";

  sheet.getRange(37, 2, 1, 16)
    .setValues([headers])
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  const rows = [];

  for (
    let frame = 0;
    frame < PHYSICAL_FRAME_COUNT;
    frame++
  ) {
    const start = physicalFrameToAddress(
      frame,
      0
    );

    const end = physicalFrameToAddress(
      frame,
      31
    );

    const row = Array(16).fill("");

    row[0] = "FRAME " + frame;
    row[3] = byteToHex_(start) + "h";
    row[6] = byteToHex_(end) + "h";
    row[9] = "32 B";
    row[12] = "00h-1Fh";

    rows.push(row);
  }

  sheet.getRange(39, 2, 8, 16)
    .setValues(rows)
    .setBackground(C.panel)
    .setFontColor(C.white);

  sheet.getRange("B48:Q48")
    .breakApart();

  sheet.getRange("B48:Q48")
    .merge()
    .setValue(
      "Address = frame * 32 + offset"
    )
    .setFontColor(C.muted);

  SpreadsheetApp.flush();

  SpreadsheetApp.getActiveSpreadsheet()
    .toast(
      "8 frames of 32 bytes ready",
      "EitoDiceBanana",
      4
    );
}

// ============================================
// NORMALIZE RAM DISPLAY
// ============================================

/**
 * Converts displayed bytes to two-digit HEX.
 *
 * 0  -> 00
 * A  -> 0A
 * FF -> FF
 *
 * Numeric byte values are preserved.
 * All cells are validated before writing.
 */
function normalizePhysicalRAMDisplay() {
  const sheet = memorySheet_();

  const range = sheet.getRange(
    MEMORY_LAYOUT.startRow,
    MEMORY_LAYOUT.startColumn,
    16,
    16
  );

  const displayed = range.getDisplayValues();

  const normalized = displayed.map(
    function(row, rowIndex) {
      return row.map(
        function(raw, colIndex) {
          const address =
            rowIndex * 16 + colIndex;

          const value =
            parsePhysicalMemoryCell_(
              raw,
              address
            );

          return byteToHex_(value);
        }
      );
    }
  );

  range.setNumberFormat("@");
  range.setValues(normalized);

  SpreadsheetApp.flush();

  Logger.log(
    "PASS: 256 physical RAM bytes normalized"
  );

  return {
    normalizedBytes: 256,
    frames: 8,
    bytesPerFrame: 32
  };
}

// ============================================
// TASK 06 TESTS
// ============================================

/**
 * Tests:
 * - 256 physical addresses
 * - 8 frames
 * - 32 bytes per frame
 * - Frame and offset calculations
 * - First and last byte of each frame
 * - Read and write operations
 * - Invalid addresses
 * - Invalid frame numbers and offsets
 * - Invalid 8-bit values
 *
 * RAM contents are restored afterward.
 *
 * Run only while CPU is stopped.
 */
function testPhysicalFramesModule() {
  const sheet = memorySheet_();

  const range = sheet.getRange(
    MEMORY_LAYOUT.startRow,
    MEMORY_LAYOUT.startColumn,
    16,
    16
  );

  const snapshot = range.getDisplayValues();

  function assert(condition, message) {
    if (!condition) {
      throw new Error(
        "TASK 06: " + message
      );
    }
  }

  Logger.log(
    "=== TASK 06 PHYSICAL RAM TEST ==="
  );

  try {
    // TEST 1: PHYSICAL ORGANIZATION

    validatePhysicalConfiguration_();

    assert(
      PHYSICAL_RAM_SIZE === 256 &&
      PHYSICAL_FRAME_COUNT === 8 &&
      PHYSICAL_FRAME_SIZE === 32,
      "Invalid physical memory organization"
    );

    Logger.log(
      "PASS: 256 bytes, 8 frames, 32 bytes per frame"
    );

    // TEST 2: ALL ADDRESS MAPPINGS

    for (
      let address = 0;
      address < 256;
      address++
    ) {
      const info =
        getPhysicalAddressInfo(address);

      assert(
        info.frame ===
          Math.floor(address / 32),
        "Incorrect frame at " + address
      );

      assert(
        info.offset === address % 32,
        "Incorrect offset at " + address
      );

      assert(
        physicalFrameToAddress(
          info.frame,
          info.offset
        ) === address,
        "Reverse address translation failed"
      );
    }

    Logger.log(
      "PASS: All 256 physical addresses map to frame/offset"
    );

    // TEST 3: FRAME BOUNDARIES

    for (
      let frame = 0;
      frame < 8;
      frame++
    ) {
      const start = physicalFrameToAddress(
        frame,
        0
      );

      const end = physicalFrameToAddress(
        frame,
        31
      );

      const firstValue = 0x40 + frame;
      const lastValue = 0xC0 + frame;

      Write(start, firstValue);
      Write(end, lastValue);

      assert(
        Read(start) === firstValue,
        "First address failed in frame " +
        frame
      );

      assert(
        Read(end) === lastValue,
        "Last address failed in frame " +
        frame
      );

      const contents = getPhysicalFrame(
        frame
      );

      assert(
        contents.size === 32 &&
        contents.bytes.length === 32 &&
        contents.bytes[0] === firstValue &&
        contents.bytes[31] === lastValue,
        "Frame inspection failed: " + frame
      );

      Logger.log(
        "PASS: Frame " + frame +
        " boundaries " +
        byteToHex_(start) + "h-" +
        byteToHex_(end) + "h"
      );
    }

    // TEST 4: INVALID ADDRESSES

    [
      -1,
      256,
      999,
      1.5,
      NaN,
      "10"
    ].forEach(function(address) {
      let rejected = false;

      try {
        Read(address);
      } catch (error) {
        rejected = true;
      }

      assert(
        rejected,
        "Invalid address accepted: " +
        address
      );
    });

    Logger.log(
      "PASS: Invalid physical addresses rejected"
    );

    // TEST 5: INVALID FRAMES AND OFFSETS

    [
      [-1, 0],
      [8, 0],
      [0, -1],
      [0, 32],
      [1.5, 0]
    ].forEach(function(pair) {
      let rejected = false;

      try {
        physicalFrameToAddress(
          pair[0],
          pair[1]
        );
      } catch (error) {
        rejected = true;
      }

      assert(
        rejected,
        "Invalid frame/offset accepted"
      );
    });

    Logger.log(
      "PASS: Invalid frames and offsets rejected"
    );

    // TEST 6: INVALID BYTE VALUES

    [
      -1,
      256,
      1.5
    ].forEach(function(value) {
      let rejected = false;

      try {
        Write(0x80, value);
      } catch (error) {
        rejected = true;
      }

      assert(
        rejected,
        "Invalid 8-bit value accepted"
      );
    });

    Logger.log(
      "PASS: Values restricted to 8 bits (0..255)"
    );

    Logger.log(
      "=== ALL TASK 06 PHYSICAL RAM TESTS PASSED ==="
    );

    return {
      passed: true,
      ramBytes: 256,
      frames: 8,
      bytesPerFrame: 32
    };

  } finally {
    // Restore original RAM contents.
    clearMemoryHighlight();

    range.setNumberFormat("@");
    range.setValues(snapshot);

    Logger.log(
      "RAM snapshot restored after frame tests"
    );
  }
}
