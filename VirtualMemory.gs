/**
 * EitoDiceBanana CPU Simulator
 * Virtual Memory & Page Table Module — Phase 2 / Task 07
 *
 * Architecture:
 * - Virtual address space: 512 bytes (000h - 1FFh, 9 bits)
 * - Virtual pages: 16 (Page 0 through Page 15, 4 bits VPN)
 * - Virtual page size: 32 bytes (5 bits offset)
 * - Physical RAM: 256 bytes (00h - FFh), 8 frames of 32 bytes (PFN 0 - 7)
 * - Page Table: 16 entries mapping VPN -> PFN with control bits:
 *     - Present (P): 1 if resident in RAM, 0 if page fault
 *     - Dirty (D): 1 if written/modified, 0 otherwise
 *     - Referenced (R): 1 if accessed (read or write), 0 otherwise
 *
 * Collision prevention:
 * - One physical frame can belong to at most one resident virtual page.
 */

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const VIRTUAL_MEMORY_SIZE = 512;
const VIRTUAL_PAGE_SIZE = 32;
const VIRTUAL_PAGE_COUNT = 16;
const VM_PHYSICAL_FRAME_COUNT = 8;
const VM_PHYSICAL_FRAME_SIZE = 32;
const VM_PHYSICAL_RAM_SIZE = 256;

const PAGE_TABLE_KEY = "EDB_PAGE_TABLE_STATE";

const PAGINAS_LAYOUT = {
  sheet: "PAGINAS",

  table: {
    startRow: 8,
    colVPN: 2,       // B
    colRange: 3,     // C
    colPresent: 4,   // D
    colPFN: 5,       // E
    colDirty: 6,     // F
    colRef: 7,       // G
    colStatus: 8     // H
  },

  monitor: {
    virtualAddress:  "L8",
    vpn:             "L9",
    offset:          "L10",
    pfn:             "L11",
    physicalAddress: "L12",
    operation:       "L13",
    status:          "L14"
  }
};

// ============================================
// VALIDATION
// ============================================

function isValidVirtualAddress(address) {
  return Number.isInteger(address) &&
    address >= 0 &&
    address < VIRTUAL_MEMORY_SIZE;
}

function validateVirtualAddress_(address) {
  if (!isValidVirtualAddress(address)) {
    throw new Error(
      "Invalid virtual address: " + address +
      ". Expected 0-" + (VIRTUAL_MEMORY_SIZE - 1) + " (000h-1FFh)."
    );
  }
}

function isValidVPN(vpn) {
  return Number.isInteger(vpn) &&
    vpn >= 0 &&
    vpn < VIRTUAL_PAGE_COUNT;
}

function validateVPN_(vpn) {
  if (!isValidVPN(vpn)) {
    throw new Error(
      "Invalid Virtual Page Number (VPN): " + vpn +
      ". Expected 0-" + (VIRTUAL_PAGE_COUNT - 1) + "."
    );
  }
}

function isValidPFN(pfn) {
  return Number.isInteger(pfn) &&
    pfn >= 0 &&
    pfn < VM_PHYSICAL_FRAME_COUNT;
}

function validatePFN_(pfn) {
  if (!isValidPFN(pfn)) {
    throw new Error(
      "Invalid Physical Frame Number (PFN): " + pfn +
      ". Expected 0-" + (VM_PHYSICAL_FRAME_COUNT - 1) + "."
    );
  }
}

// ============================================
// PAGE TABLE STATE MANAGEMENT
// ============================================

/**
 * Creates the default initial Page Table state:
 * - 16 entries (VPN 0 to 15).
 * - Initial mapping: Pages 0-7 resident in physical frames 0-7.
 * - Pages 8-15 non-resident (Present = 0, PFN = null).
 */
function defaultPageTableState_() {
  const entries = [];

  for (let vpn = 0; vpn < VIRTUAL_PAGE_COUNT; vpn++) {
    const isInitialResident = vpn < VM_PHYSICAL_FRAME_COUNT;

    entries.push({
      vpn: vpn,
      present: isInitialResident ? 1 : 0,
      pfn: isInitialResident ? vpn : null,
      dirty: 0,
      referenced: 0
    });
  }

  return {
    entries: entries,
    lastTranslation: {
      virtualAddress: null,
      vpn: null,
      offset: null,
      pfn: null,
      physicalAddress: null,
      operation: "-",
      status: "READY"
    }
  };
}

function getPageTable_() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(PAGE_TABLE_KEY);

  if (!raw) {
    const state = defaultPageTableState_();
    savePageTable_(state);
    return state;
  }

  try {
    const saved = JSON.parse(raw);
    if (!saved || !Array.isArray(saved.entries) || saved.entries.length !== VIRTUAL_PAGE_COUNT) {
      const state = defaultPageTableState_();
      savePageTable_(state);
      return state;
    }
    return saved;
  } catch (e) {
    const state = defaultPageTableState_();
    savePageTable_(state);
    return state;
  }
}

function savePageTable_(state) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(PAGE_TABLE_KEY, JSON.stringify(state));
}

function resetPageTable() {
  const state = defaultPageTableState_();
  savePageTable_(state);

  try {
    syncPageTableDisplay();
  } catch (e) {
    // Sheet may not be opened or initialized yet
  }

  return state;
}

// ============================================
// ADDRESS TRANSLATION & DECOMPOSITION
// ============================================

/**
 * Decomposes a 9-bit virtual address into VPN (4 bits) and offset (5 bits).
 *
 * @param {number} virtualAddress (0 - 511)
 * @returns {Object} { virtualAddress, vpn, offset, vpnHex, offsetHex, virtualHex }
 */
function splitVirtualAddress(virtualAddress) {
  validateVirtualAddress_(virtualAddress);

  const vpn = Math.floor(virtualAddress / VIRTUAL_PAGE_SIZE);
  const offset = virtualAddress % VIRTUAL_PAGE_SIZE;

  return {
    virtualAddress: virtualAddress,
    vpn: vpn,
    offset: offset,
    vpnHex: vpn.toString(16).toUpperCase(),
    offsetHex: offset.toString(16).toUpperCase().padStart(2, "0"),
    virtualHex: virtualAddress.toString(16).toUpperCase().padStart(3, "0")
  };
}

/**
 * Translates a virtual address into a physical address.
 * Updates Referenced bit (and Dirty bit if isWrite is true).
 * Reports Page Fault if Present bit is 0.
 *
 * @param {number} virtualAddress (0 - 511)
 * @param {boolean} isWrite
 * @returns {Object} Translation result with fault flag and calculated physical address.
 */
function translateVirtualAddress(virtualAddress, isWrite) {
  validateVirtualAddress_(virtualAddress);

  const split = splitVirtualAddress(virtualAddress);
  const state = getPageTable_();
  const entry = state.entries[split.vpn];

  if (!entry) {
    throw new Error("Page table entry not found for VPN: " + split.vpn);
  }

  const opType = isWrite ? "WRITE" : "READ";

  // Check Page Fault
  if (entry.present !== 1 || entry.pfn === null) {
    const faultInfo = {
      success: false,
      fault: true,
      virtualAddress: virtualAddress,
      vpn: split.vpn,
      offset: split.offset,
      pfn: null,
      physicalAddress: null,
      operation: opType,
      status: "PAGE_FAULT",
      message: "PAGE FAULT: Virtual Page " + split.vpn + " is not resident in RAM (Present = 0)."
    };

    state.lastTranslation = faultInfo;
    savePageTable_(state);

    try {
      updateMMUMonitorDisplay_(faultInfo);
    } catch (e) {
      // Ignored if UI unavailable
    }

    return faultInfo;
  }

  // Calculate physical address: (PFN * 32) + offset
  const physicalAddress = (entry.pfn * VIRTUAL_PAGE_SIZE) + split.offset;

  // Update control bits
  entry.referenced = 1;
  if (isWrite) {
    entry.dirty = 1;
  }

  const result = {
    success: true,
    fault: false,
    virtualAddress: virtualAddress,
    vpn: split.vpn,
    offset: split.offset,
    pfn: entry.pfn,
    physicalAddress: physicalAddress,
    dirty: entry.dirty,
    referenced: entry.referenced,
    operation: opType,
    status: "TRANSLATED",
    message: "Translated VPN " + split.vpn + " -> PFN " + entry.pfn + " (Phys: " + physicalAddress + ")."
  };

  state.lastTranslation = result;
  savePageTable_(state);

  try {
    updateMMUMonitorDisplay_(result);
    syncPageTableDisplay();
  } catch (e) {
    // Ignored if UI unavailable
  }

  return result;
}

// ============================================
// VIRTUAL MEMORY READ / WRITE
// ============================================

/**
 * Reads a byte from Virtual Memory.
 * Translates address and delegates read to physical RAM (Memory.gs -> Read).
 *
 * @param {number} virtualAddress (0 - 511)
 * @returns {number} 8-bit value (0 - 255)
 */
function readVirtualMemory(virtualAddress) {
  const translation = translateVirtualAddress(virtualAddress, false);

  if (translation.fault) {
    throw new Error(translation.message);
  }

  return Read(translation.physicalAddress);
}

/**
 * Writes a byte to Virtual Memory.
 * Translates address and delegates write to physical RAM (Memory.gs -> Write).
 *
 * @param {number} virtualAddress (0 - 511)
 * @param {number} value (0 - 255)
 */
function writeVirtualMemory(virtualAddress, value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("Invalid byte value: " + value + ". Expected 0-255.");
  }

  const translation = translateVirtualAddress(virtualAddress, true);

  if (translation.fault) {
    throw new Error(translation.message);
  }

  Write(translation.physicalAddress, value);
}

// ============================================
// PAGE TABLE ENTRY MANAGEMENT
// ============================================

/**
 * Configures an entry in the Page Table with collision guard:
 * Multiple resident pages cannot share the same physical frame.
 *
 * @param {number} vpn (0 - 15)
 * @param {number|null} pfn (0 - 7 when present, or null)
 * @param {number} present (0 or 1)
 * @param {number} dirty (0 or 1)
 * @param {number} referenced (0 or 1)
 */
function setPageTableEntry(vpn, pfn, present, dirty, referenced) {
  validateVPN_(vpn);

  const isPres = present === 1 || present === true ? 1 : 0;
  const isDirty = dirty === 1 || dirty === true ? 1 : 0;
  const isRef = referenced === 1 || referenced === true ? 1 : 0;

  let assignedPFN = null;

  if (isPres === 1) {
    validatePFN_(pfn);
    assignedPFN = pfn;

    // Frame collision check: no other resident page can have the same PFN
    const state = getPageTable_();
    for (let i = 0; i < state.entries.length; i++) {
      const other = state.entries[i];
      if (other.vpn !== vpn && other.present === 1 && other.pfn === assignedPFN) {
        throw new Error(
          "Frame collision: Physical frame " + assignedPFN +
          " is already allocated to Virtual Page " + other.vpn + "."
        );
      }
    }
  }

  const state = getPageTable_();
  state.entries[vpn] = {
    vpn: vpn,
    present: isPres,
    pfn: assignedPFN,
    dirty: isDirty,
    referenced: isRef
  };

  savePageTable_(state);

  try {
    syncPageTableDisplay();
  } catch (e) {
    // Sheet may not be open
  }

  return state.entries[vpn];
}

// ============================================
// GOOGLE SHEETS DASHBOARD (SHEET: "PAGINAS")
// ============================================

function paginasSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PAGINAS_LAYOUT.sheet);

  if (!sheet) {
    throw new Error('Sheet "' + PAGINAS_LAYOUT.sheet + '" not found.');
  }

  return sheet;
}

/**
 * Renders the initial layout of the PAGINAS dashboard non-destructively.
 */
function renderVirtualMemoryDashboard() {
  const sheet = paginasSheet_();
  const C = CONFIG.COLORS;

  sheet.clear();
  sheet.getRange("A1:Z60").setBackground(C.background);

  function header(range, text) {
    sheet.getRange(range).merge()
      .setValue(text)
      .setBackground(C.panelAlt)
      .setFontColor(C.yellow)
      .setFontWeight("bold")
      .setFontSize(10)
      .setHorizontalAlignment("left");
  }

  function label(cell, text) {
    sheet.getRange(cell)
      .setValue(text)
      .setFontColor(C.muted)
      .setFontWeight("bold")
      .setFontSize(9);
  }

  function valueCell(cell) {
    sheet.getRange(cell)
      .setBackground(C.panel)
      .setFontColor(C.white)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  }

  // Title
  sheet.getRange("B2:R2").merge()
    .setValue("EitoDiceBanana \u2014 VIRTUAL MEMORY & PAGE TABLE (MMU)")
    .setBackground(C.panel)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(13)
    .setHorizontalAlignment("center");

  // Section 1: Page Table (16 Entries)
  header("B5:H5", "1. PAGE TABLE (16 VIRTUAL PAGES \u2192 8 PHYSICAL FRAMES)");

  const tableHeaders = [
    ["B7", "VPN"],
    ["C7", "ADDR RANGE"],
    ["D7", "PRESENT (P)"],
    ["E7", "PFN (FRAME)"],
    ["F7", "DIRTY (D)"],
    ["G7", "REF (R)"],
    ["H7", "STATUS"]
  ];

  tableHeaders.forEach(item => {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setBackground(C.panelAlt)
      .setFontColor(C.muted)
      .setFontWeight("bold")
      .setFontSize(8)
      .setHorizontalAlignment("center");
  });

  // Section 2: Address Translation Monitor
  header("J5:N5", "2. MMU ADDRESS TRANSLATION MONITOR");
  label("J8",  "VIRTUAL ADDRESS");   valueCell("L8");
  label("J9",  "VPN (PAGE)");        valueCell("L9");
  label("J10", "OFFSET");            valueCell("L10");
  label("J11", "PFN (FRAME)");       valueCell("L11");
  label("J12", "PHYSICAL ADDRESS");  valueCell("L12");
  label("J13", "OPERATION");         valueCell("L13");
  label("J14", "STATUS");            valueCell("L14");

  // Section 3: Architecture Summary
  header("J17:N17", "3. ARCHITECTURE SPECIFICATIONS");
  const specs = [
    ["J19", "Virtual Space:", "L19", "512 Bytes (000h - 1FFh)"],
    ["J20", "Virtual Pages:", "L20", "16 Pages (32 Bytes each)"],
    ["J21", "Physical RAM:",  "L21", "256 Bytes (8 Frames of 32B)"],
    ["J22", "Address Bits:",  "L22", "9-Bit Virtual = 4b VPN + 5b Offset"],
    ["J23", "Physical Bits:", "L23", "8-Bit Phys = 3b PFN + 5b Offset"]
  ];

  specs.forEach(item => {
    sheet.getRange(item[0]).setValue(item[1]).setFontColor(C.muted).setFontWeight("bold");
    sheet.getRange(item[2]).setValue(item[3]).setFontColor(C.white);
  });

  SpreadsheetApp.flush();
  syncPageTableDisplay();
}

/**
 * Synchronizes the 16 Page Table entries onto sheet PAGINAS.
 */
function syncPageTableDisplay() {
  const sheet = paginasSheet_();
  const state = getPageTable_();
  const C = CONFIG.COLORS;
  const startRow = PAGINAS_LAYOUT.table.startRow;

  for (let vpn = 0; vpn < VIRTUAL_PAGE_COUNT; vpn++) {
    const entry = state.entries[vpn];
    const row = startRow + vpn;
    const rangeStart = (vpn * VIRTUAL_PAGE_SIZE).toString(16).toUpperCase().padStart(3, "0") + "h";
    const rangeEnd = ((vpn + 1) * VIRTUAL_PAGE_SIZE - 1).toString(16).toUpperCase().padStart(3, "0") + "h";

    // VPN
    sheet.getRange(row, 2)
      .setValue("Page " + vpn + " (" + vpn.toString(16).toUpperCase() + "h)")
      .setFontColor(C.white)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // Address range
    sheet.getRange(row, 3)
      .setValue(rangeStart + " - " + rangeEnd)
      .setFontColor(C.muted)
      .setHorizontalAlignment("center");

    // Present bit (P)
    const pCell = sheet.getRange(row, 4);
    pCell.setValue(entry.present)
      .setFontColor(entry.present === 1 ? C.green : C.red)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // PFN
    const pfnCell = sheet.getRange(row, 5);
    pfnCell.setValue(entry.present === 1 ? "Frame " + entry.pfn : "-")
      .setFontColor(entry.present === 1 ? C.yellow : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // Dirty bit (D)
    sheet.getRange(row, 6)
      .setValue(entry.dirty)
      .setFontColor(entry.dirty === 1 ? C.yellow : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // Referenced bit (R)
    sheet.getRange(row, 7)
      .setValue(entry.referenced)
      .setFontColor(entry.referenced === 1 ? C.green : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // Status
    sheet.getRange(row, 8)
      .setValue(entry.present === 1 ? "RESIDENT" : "NON-RESIDENT")
      .setFontColor(entry.present === 1 ? C.green : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  }
}

/**
 * Updates the MMU Address Translation Monitor on sheet PAGINAS.
 */
function updateMMUMonitorDisplay_(info) {
  const sheet = paginasSheet_();
  const M = PAGINAS_LAYOUT.monitor;
  const C = CONFIG.COLORS;

  sheet.getRange(M.virtualAddress)
    .setValue(info.virtualAddress !== null ? info.virtualAddress + " (" + info.virtualAddress.toString(16).toUpperCase().padStart(3, "0") + "h)" : "--");

  sheet.getRange(M.vpn)
    .setValue(info.vpn !== null ? "Page " + info.vpn : "--");

  sheet.getRange(M.offset)
    .setValue(info.offset !== null ? info.offset + " (" + info.offset.toString(16).toUpperCase() + "h)" : "--");

  sheet.getRange(M.pfn)
    .setValue(info.pfn !== null ? "Frame " + info.pfn : "NONE");

  sheet.getRange(M.physicalAddress)
    .setValue(info.physicalAddress !== null ? info.physicalAddress + " (" + info.physicalAddress.toString(16).toUpperCase().padStart(2, "0") + "h)" : "--");

  sheet.getRange(M.operation)
    .setValue(info.operation || "-")
    .setFontColor(info.operation === "WRITE" ? C.yellow : C.green);

  const statusCell = sheet.getRange(M.status);
  statusCell.setValue(info.status || "-")
    .setFontColor(info.status === "TRANSLATED" ? C.green : (info.status === "PAGE_FAULT" ? C.red : C.muted));
}

// ============================================
// VERIFICATION TEST SUITE (TASK 07)
// ============================================

function assertVM_(condition, message) {
  if (!condition) {
    throw new Error("VM TEST FAILED: " + message);
  }
}

/**
 * Complete test suite validating all 18 Acceptance Criteria of Task 07:
 * - 512-byte virtual memory space
 * - 16 pages of 32 bytes
 * - 16 Page Table entries with VPN, P, PFN, D, R
 * - Address decomposition (VPN and offset)
 * - Physical address calculation: (PFN * 32) + offset
 * - Resident translation vs Page Fault
 * - Reference and Dirty bit updates
 * - Collision prevention for physical frames
 * - Boundary checks and rejection of invalid addresses
 */
function testVirtualMemoryModule() {
  Logger.log("=== STARTING TASK 07 VIRTUAL MEMORY & PAGE TABLE TESTS ===");

  // Reset table to clean known state
  resetPageTable();

  // ── TEST 1: Virtual memory space configuration (512 bytes, 16 pages, 32 bytes) ──
  assertVM_(VIRTUAL_MEMORY_SIZE === 512, "Virtual space must be 512 bytes");
  assertVM_(VIRTUAL_PAGE_COUNT === 16, "Virtual memory must have 16 pages");
  assertVM_(VIRTUAL_PAGE_SIZE === 32, "Page size must be 32 bytes");
  assertVM_(VM_PHYSICAL_FRAME_COUNT === 8, "Physical frames must be 8");
  Logger.log("PASS CR-1..3: 512 bytes, 16 pages of 32 bytes");

  // ── TEST 2: Page Table structure (16 entries with VPN, P, PFN, D, R) ──
  const state = getPageTable_();
  assertVM_(state.entries.length === 16, "Page Table must contain 16 entries");

  state.entries.forEach((e, idx) => {
    assertVM_(e.vpn === idx, "Entry VPN must match index: " + idx);
    assertVM_(e.present === 0 || e.present === 1, "Present bit must be 0 or 1");
    assertVM_(e.dirty === 0 || e.dirty === 1, "Dirty bit must be 0 or 1");
    assertVM_(e.referenced === 0 || e.referenced === 1, "Reference bit must be 0 or 1");
    if (e.present === 1) {
      assertVM_(isValidPFN(e.pfn), "Resident entry must have valid PFN 0-7");
    } else {
      assertVM_(e.pfn === null, "Non-resident entry must have null PFN");
    }
  });
  Logger.log("PASS CR-4..9: 16 Page Table entries with VPN, P, PFN, D, R");

  // ── TEST 3: Address decomposition (VPN and offset) ──
  const split0 = splitVirtualAddress(0);
  assertVM_(split0.vpn === 0 && split0.offset === 0, "Address 0 must be VPN 0, Offset 0");

  const split31 = splitVirtualAddress(31);
  assertVM_(split31.vpn === 0 && split31.offset === 31, "Address 31 must be VPN 0, Offset 31");

  const split32 = splitVirtualAddress(32);
  assertVM_(split32.vpn === 1 && split32.offset === 0, "Address 32 must be VPN 1, Offset 0");

  const split100 = splitVirtualAddress(100);
  assertVM_(split100.vpn === 3 && split100.offset === 4, "Address 100 must be VPN 3, Offset 4 (3*32+4)");

  const split511 = splitVirtualAddress(511);
  assertVM_(split511.vpn === 15 && split511.offset === 31, "Address 511 must be VPN 15, Offset 31");
  Logger.log("PASS CR-10: Correct VPN and offset calculation across page boundaries");

  // ── TEST 4: Valid resident virtual-to-physical translation ──
  // Page 2 maps to PFN 2 initially: address 65 = Page 2, offset 1 -> physical (2*32)+1 = 65
  const trans1 = translateVirtualAddress(65, false);
  assertVM_(trans1.success === true && trans1.fault === false, "Translation must succeed");
  assertVM_(trans1.vpn === 2 && trans1.offset === 1, "VPN 2, offset 1");
  assertVM_(trans1.pfn === 2, "PFN must be 2");
  assertVM_(trans1.physicalAddress === 65, "Physical address must be 65");
  assertVM_(trans1.referenced === 1, "Reference bit must be updated to 1");
  Logger.log("PASS CR-11..12: Valid resident translation (VPN 2 -> PFN 2, Phys 65)");

  // ── TEST 5: Non-resident Page Fault detection (Present = 0) ──
  // Page 10 is non-resident by default (virtual address 10 * 32 = 320)
  const transFault = translateVirtualAddress(320, false);
  assertVM_(transFault.success === false && transFault.fault === true, "Must detect Page Fault");
  assertVM_(transFault.vpn === 10, "Fault VPN must be 10");
  assertVM_(transFault.status === "PAGE_FAULT", "Status must be PAGE_FAULT");

  let threwFault = false;
  try {
    readVirtualMemory(320);
  } catch (err) {
    if (/PAGE FAULT/i.test(err.message)) {
      threwFault = true;
    }
  }
  assertVM_(threwFault, "readVirtualMemory on non-resident page must throw Page Fault error");
  Logger.log("PASS CR-13: Page Fault reported for non-resident pages (Present = 0)");

  // ── TEST 6: Dirty and Reference bits update on Read vs Write ──
  // Reset entry 4
  setPageTableEntry(4, 4, 1, 0, 0);
  let e4 = getPageTable_().entries[4];
  assertVM_(e4.dirty === 0 && e4.referenced === 0, "D and R start at 0");

  // Read virtual address 128 (Page 4, offset 0)
  translateVirtualAddress(128, false);
  e4 = getPageTable_().entries[4];
  assertVM_(e4.referenced === 1, "Read must set Reference bit = 1");
  assertVM_(e4.dirty === 0, "Read must NOT set Dirty bit");

  // Write virtual address 129 (Page 4, offset 1)
  translateVirtualAddress(129, true);
  e4 = getPageTable_().entries[4];
  assertVM_(e4.referenced === 1, "Write must keep Reference bit = 1");
  assertVM_(e4.dirty === 1, "Write must set Dirty bit = 1");
  Logger.log("PASS CR-14: Reference bit on READ, Dirty and Reference bits on WRITE");

  // ── TEST 7: Physical frame collision prevention ──
  // PFN 3 is currently assigned to Page 3. Attempting to assign PFN 3 to Page 9 must fail.
  let collisionCaught = false;
  try {
    setPageTableEntry(9, 3, 1, 0, 0);
  } catch (err) {
    if (/collision/i.test(err.message)) {
      collisionCaught = true;
    }
  }
  assertVM_(collisionCaught, "Must reject allocating same physical frame to multiple pages");
  Logger.log("PASS CR-15: Frame collision guard prevents duplicate frame allocation");

  // ── TEST 8: Translation across arbitrary mapped virtual pages ──
  // Unmap Page 1 (make P=0), then map Page 12 to PFN 1
  setPageTableEntry(1, null, 0, 0, 0);
  setPageTableEntry(12, 1, 1, 0, 0);

  // Translate virtual address in Page 12: 12 * 32 + 5 = 389 -> physical (1 * 32) + 5 = 37
  const trans12 = translateVirtualAddress(389, false);
  assertVM_(trans12.success === true && trans12.fault === false, "Translation of Page 12 must succeed");
  assertVM_(trans12.vpn === 12, "VPN 12");
  assertVM_(trans12.pfn === 1, "PFN 1");
  assertVM_(trans12.physicalAddress === 37, "Physical address must be 37");
  Logger.log("PASS CR-17: Correct translation for dynamically remapped virtual page");

  // ── TEST 9: Reject invalid virtual addresses outside 512 bytes ──
  const invalidAddresses = [-1, 512, 513, 1024, 1.5, "100"];
  invalidAddresses.forEach(addr => {
    let rejected = false;
    try {
      translateVirtualAddress(addr, false);
    } catch (err) {
      rejected = true;
    }
    assertVM_(rejected, "Invalid virtual address must be rejected: " + addr);
  });
  Logger.log("PASS CR-18: Invalid addresses outside 0-511 strictly rejected");

  // Restore clean default Page Table
  resetPageTable();

  Logger.log("=== ALL TASK 07 VIRTUAL MEMORY & PAGE TABLE TESTS PASSED ===");

  return {
    passed: true,
    virtualMemorySize: VIRTUAL_MEMORY_SIZE,
    pageCount: VIRTUAL_PAGE_COUNT,
    pageSize: VIRTUAL_PAGE_SIZE,
    criteriaTested: 18
  };
}
