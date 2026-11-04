/**
 * EitoDiceBanana CPU Simulator
 * Virtual Memory & Page Table — Task 07 + Task 08
 *
 * Virtual address space: 512 bytes
 * Virtual pages: 16 x 32 bytes
 * Physical RAM: 256 bytes
 * Physical frames: 8 x 32 bytes
 */

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
    colVPN: 2,
    colRange: 3,
    colPresent: 4,
    colPFN: 5,
    colDirty: 6,
    colRef: 7,
    colStatus: 8
  },
  monitor: {
    virtualAddress: "L8",
    vpn: "L9",
    offset: "L10",
    pfn: "L11",
    physicalAddress: "L12",
    operation: "L13",
    status: "L14"
  }
};

// ------------------------------------------------------------
// VALIDATION
// ------------------------------------------------------------

function isValidVirtualAddress(address) {
  return Number.isInteger(address) &&
    address >= 0 &&
    address < VIRTUAL_MEMORY_SIZE;
}

function validateVirtualAddress_(address) {
  if (!isValidVirtualAddress(address)) {
    throw new Error(
      "Invalid virtual address: " + address +
      ". Expected 0-" + (VIRTUAL_MEMORY_SIZE - 1) +
      " (000h-1FFh)."
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

// ------------------------------------------------------------
// PAGE TABLE STATE
// ------------------------------------------------------------

function defaultPageTableState_() {
  const entries = [];

  for (let vpn = 0; vpn < VIRTUAL_PAGE_COUNT; vpn++) {
    const resident = vpn < VM_PHYSICAL_FRAME_COUNT;

    entries.push({
      vpn: vpn,
      present: resident ? 1 : 0,
      pfn: resident ? vpn : null,
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

    if (
      !saved ||
      !Array.isArray(saved.entries) ||
      saved.entries.length !== VIRTUAL_PAGE_COUNT
    ) {
      throw new Error("Invalid Page Table state.");
    }

    return saved;

  } catch (error) {
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

/**
 * Restores the initial mapping:
 * VPN 0-7 -> PFN 0-7.
 * It also refreshes the paging backing store when Task 08 is loaded.
 */
function resetPageTable() {
  const state = defaultPageTableState_();
  savePageTable_(state);

  if (typeof resetPagingBackingStore_ === "function") {
    try {
      resetPagingBackingStore_();
    } catch (error) {
      Logger.log(
        "Paging backing store was not reset: " + error.message
      );
    }
  }

  try {
    syncPageTableDisplay();
  } catch (error) {
    // The sheet may not have been initialized.
  }

  return state;
}

// ------------------------------------------------------------
// VIRTUAL ADDRESS DECOMPOSITION
// ------------------------------------------------------------

function splitVirtualAddress(virtualAddress) {
  validateVirtualAddress_(virtualAddress);

  const vpn = Math.floor(
    virtualAddress / VIRTUAL_PAGE_SIZE
  );

  const offset = virtualAddress % VIRTUAL_PAGE_SIZE;

  return {
    virtualAddress: virtualAddress,
    vpn: vpn,
    offset: offset,
    vpnHex: vpn.toString(16).toUpperCase(),
    offsetHex: offset.toString(16).toUpperCase().padStart(2, "0"),
    virtualHex: virtualAddress
      .toString(16)
      .toUpperCase()
      .padStart(3, "0")
  };
}

// ------------------------------------------------------------
// MMU TRANSLATION
// ------------------------------------------------------------

function translateVirtualAddress(virtualAddress, isWrite) {
  validateVirtualAddress_(virtualAddress);

  const split = splitVirtualAddress(virtualAddress);
  const state = getPageTable_();
  const entry = state.entries[split.vpn];

  if (!entry) {
    throw new Error(
      "Page table entry not found for VPN: " + split.vpn
    );
  }

  const operation = isWrite ? "WRITE" : "READ";

  // Page Fault: requested page is not resident.
  if (entry.present !== 1 || entry.pfn === null) {
    const faultInfo = {
      success: false,
      fault: true,
      virtualAddress: virtualAddress,
      vpn: split.vpn,
      offset: split.offset,
      pfn: null,
      physicalAddress: null,
      operation: operation,
      status: "PAGE_FAULT",
      message:
        "PAGE FAULT: Virtual Page " + split.vpn +
        " is not resident in RAM (Present = 0)."
    };

    state.lastTranslation = faultInfo;
    savePageTable_(state);

    if (typeof highlightPageFault_ === "function") {
      highlightPageFault_(faultInfo);
    } else {
      try {
        updateMMUMonitorDisplay_(faultInfo);
      } catch (error) {
        // UI unavailable.
      }
    }

    return faultInfo;
  }

  validatePFN_(entry.pfn);

  const physicalAddress =
    (entry.pfn * VIRTUAL_PAGE_SIZE) + split.offset;

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
    operation: operation,
    status: "TRANSLATED",
    message:
      "Translated VPN " + split.vpn +
      " -> PFN " + entry.pfn +
      " (Phys: " + physicalAddress + ")."
  };

  state.lastTranslation = result;
  savePageTable_(state);

  try {
    updateMMUMonitorDisplay_(result);
    syncPageTableDisplay();
  } catch (error) {
    // UI unavailable.
  }

  return result;
}

// ------------------------------------------------------------
// VIRTUAL MEMORY READ / WRITE
// ------------------------------------------------------------

/**
 * Reads one byte from virtual memory.
 *
 * If Present = 0:
 * 1. The Page Fault is highlighted.
 * 2. The paging handler loads the required page.
 * 3. The MMU translates the same address again.
 * 4. The interrupted read completes.
 *
 * Optional accessType: "INSTRUCTION" or "DATA".
 * When omitted, FETCH/DECODE are instruction reads; otherwise data.
 */
function readVirtualMemory(virtualAddress, accessType) {
  let translation = translateVirtualAddress(
    virtualAddress,
    false
  );

  if (translation.fault) {
    if (typeof handlePageFault_ !== "function") {
      throw new Error(translation.message);
    }

    handlePageFault_(translation);

    // Resume the original memory operation.
    translation = translateVirtualAddress(
      virtualAddress,
      false
    );
  }

  if (!translation.success || translation.fault) {
    throw new Error(
      translation.message || "Virtual memory read failed."
    );
  }

  // CPU FETCH/DECODE -> L1I; LOAD and direct API calls -> L1D.
  // The optional accessType makes explicit instruction reads testable.
  // ControlUnit.gs currently calls readVirtualMemory(address) without it,
  // so we infer FETCH/DECODE from the saved execution phase.
  let kind = String(accessType || "").toUpperCase();
  if (!kind) {
    kind = "DATA";
    if (typeof getExecutionState_ === "function") {
      const execution = getExecutionState_();
      if (execution &&
          (execution.phase === "FETCH" || execution.phase === "DECODE")) {
        kind = "INSTRUCTION";
      }
    }
  }

  if (kind !== "DATA" && kind !== "INSTRUCTION") {
    throw new Error("Invalid virtual memory access type: " + kind);
  }

  if (kind === "INSTRUCTION" &&
      typeof cacheReadInstruction === "function") {
    return cacheReadInstruction(translation.physicalAddress);
  }
  if (kind === "DATA" && typeof cacheReadData === "function") {
    return cacheReadData(translation.physicalAddress);
  }

  // Legacy compatibility when Cache.gs has not been installed.
  return Read(translation.physicalAddress);
}

/**
 * Writes one byte to virtual memory.
 *
 * A successful write sets Referenced = 1 and Dirty = 1.
 * Page Fault handling occurs before the physical write.
 */
function writeVirtualMemory(virtualAddress, value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(
      "Invalid byte value: " + value + ". Expected 0-255."
    );
  }

  let translation = translateVirtualAddress(
    virtualAddress,
    true
  );

  if (translation.fault) {
    if (typeof handlePageFault_ !== "function") {
      throw new Error(translation.message);
    }

    handlePageFault_(translation);

    // Resume the original memory operation.
    translation = translateVirtualAddress(
      virtualAddress,
      true
    );
  }

  if (!translation.success || translation.fault) {
    throw new Error(
      translation.message || "Virtual memory write failed."
    );
  }

  // Write-through + write-allocate: L1D -> L2 -> physical RAM.
  // Cache.gs also invalidates L1I for self-modifying code.
  if (typeof cacheWriteData === "function") {
    cacheWriteData(translation.physicalAddress, value);
  } else {
    Write(translation.physicalAddress, value);
  }
}

// ------------------------------------------------------------
// PAGE TABLE ENTRY MANAGEMENT
// ------------------------------------------------------------

function setPageTableEntry(
  vpn,
  pfn,
  present,
  dirty,
  referenced
) {
  validateVPN_(vpn);

  const isPresent =
    present === 1 || present === true ? 1 : 0;

  const isDirty =
    dirty === 1 || dirty === true ? 1 : 0;

  const isReferenced =
    referenced === 1 || referenced === true ? 1 : 0;

  let assignedPFN = null;

  if (isPresent === 1) {
    validatePFN_(pfn);
    assignedPFN = pfn;

    const current = getPageTable_();

    for (let i = 0; i < current.entries.length; i++) {
      const other = current.entries[i];

      if (
        other.vpn !== vpn &&
        other.present === 1 &&
        other.pfn === assignedPFN
      ) {
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
    present: isPresent,
    pfn: assignedPFN,
    dirty: isDirty,
    referenced: isReferenced
  };

  savePageTable_(state);

  try {
    syncPageTableDisplay();
  } catch (error) {
    // Sheet may not be open.
  }

  return state.entries[vpn];
}

// ------------------------------------------------------------
// PAGINAS SHEET
// ------------------------------------------------------------

function paginasSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PAGINAS_LAYOUT.sheet);

  if (!sheet) {
    throw new Error(
      'Sheet "' + PAGINAS_LAYOUT.sheet + '" not found.'
    );
  }

  return sheet;
}

function renderVirtualMemoryDashboard() {
  const sheet = paginasSheet_();
  const C = CONFIG.COLORS;

  // Re-render only the defined dashboard area, preserving paging event rows.
  // Do not call sheet.clear(): it would erase the event log and user content.
  sheet.getRange("A1:Z25").setBackground(C.background);

  function header(range, title) {
    sheet.getRange(range).merge()
      .setValue(title)
      .setBackground(C.panelAlt)
      .setFontColor(C.yellow)
      .setFontWeight("bold")
      .setFontSize(10)
      .setHorizontalAlignment("left");
  }

  function label(cell, title) {
    sheet.getRange(cell)
      .setValue(title)
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

  sheet.getRange("B2:R2").merge()
    .setValue("EitoDiceBanana — VIRTUAL MEMORY & PAGE TABLE (MMU)")
    .setBackground(C.panel)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(13)
    .setHorizontalAlignment("center");

  // Page Table.
  header("B5:H5", "1. PAGE TABLE (16 VIRTUAL PAGES → 8 PHYSICAL FRAMES)");

  const headers = [
    ["B7", "VPN"],
    ["C7", "ADDR RANGE"],
    ["D7", "PRESENT (P)"],
    ["E7", "PFN (FRAME)"],
    ["F7", "DIRTY (D)"],
    ["G7", "REF (R)"],
    ["H7", "STATUS"]
  ];

  headers.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setBackground(C.panelAlt)
      .setFontColor(C.muted)
      .setFontWeight("bold")
      .setFontSize(8)
      .setHorizontalAlignment("center");
  });

  // MMU monitor.
  header("J5:N5", "2. MMU ADDRESS TRANSLATION MONITOR");

  label("J8", "VIRTUAL ADDRESS");
  valueCell("L8");

  label("J9", "VPN (PAGE)");
  valueCell("L9");

  label("J10", "OFFSET");
  valueCell("L10");

  label("J11", "PFN (FRAME)");
  valueCell("L11");

  label("J12", "PHYSICAL ADDRESS");
  valueCell("L12");

  label("J13", "OPERATION");
  valueCell("L13");

  label("J14", "STATUS");
  valueCell("L14");

  // Architecture specifications.
  header("J17:N17", "3. ARCHITECTURE SPECIFICATIONS");

  const specs = [
    ["J19", "Virtual Space:", "L19", "512 Bytes (000h - 1FFh)"],
    ["J20", "Virtual Pages:", "L20", "16 Pages (32 Bytes each)"],
    ["J21", "Physical RAM:", "L21", "256 Bytes (8 Frames of 32B)"],
    ["J22", "Address Bits:", "L22", "9-Bit Virtual = 4b VPN + 5b Offset"],
    ["J23", "Physical Bits:", "L23", "8-Bit Phys = 3b PFN + 5b Offset"],
    ["J24", "Replacement:", "L24", "FIFO"]
  ];

  specs.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.muted)
      .setFontWeight("bold");

    sheet.getRange(item[2])
      .setValue(item[3])
      .setFontColor(C.white);
  });

  // Task 08 event log.
  header("J26:N26", "4. PAGE FAULT / FIFO / SWAP EVENT LOG");

  sheet.getRange("J27:N27")
    .setValues([[
      "TIME",
      "EVENT",
      "VPN",
      "PFN",
      "DETAIL"
    ]])
    .setBackground(C.panelAlt)
    .setFontColor(C.muted)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("J28:N37")
    .setBackground(C.panel)
    .setFontColor(C.white);

  SpreadsheetApp.flush();
  syncPageTableDisplay();
}

function syncPageTableDisplay() {
  const sheet = paginasSheet_();
  const state = getPageTable_();
  const C = CONFIG.COLORS;
  const startRow = PAGINAS_LAYOUT.table.startRow;

  for (let vpn = 0; vpn < VIRTUAL_PAGE_COUNT; vpn++) {
    const entry = state.entries[vpn];
    const row = startRow + vpn;

    const rangeStart = (vpn * VIRTUAL_PAGE_SIZE)
      .toString(16)
      .toUpperCase()
      .padStart(3, "0") + "h";

    const rangeEnd = ((vpn + 1) * VIRTUAL_PAGE_SIZE - 1)
      .toString(16)
      .toUpperCase()
      .padStart(3, "0") + "h";

    sheet.getRange(row, 2)
      .setValue(
        "Page " + vpn +
        " (" + vpn.toString(16).toUpperCase() + "h)"
      )
      .setFontColor(C.white)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    sheet.getRange(row, 3)
      .setValue(rangeStart + " - " + rangeEnd)
      .setFontColor(C.muted)
      .setHorizontalAlignment("center");

    sheet.getRange(row, 4)
      .setValue(entry.present)
      .setFontColor(entry.present === 1 ? C.green : C.red)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    sheet.getRange(row, 5)
      .setValue(entry.present === 1 ? "Frame " + entry.pfn : "-")
      .setFontColor(entry.present === 1 ? C.yellow : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    sheet.getRange(row, 6)
      .setValue(entry.dirty)
      .setFontColor(entry.dirty === 1 ? C.yellow : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    sheet.getRange(row, 7)
      .setValue(entry.referenced)
      .setFontColor(entry.referenced === 1 ? C.green : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    sheet.getRange(row, 8)
      .setValue(entry.present === 1 ? "RESIDENT" : "NON-RESIDENT")
      .setFontColor(entry.present === 1 ? C.green : C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  }
}

function updateMMUMonitorDisplay_(info) {
  const sheet = paginasSheet_();
  const M = PAGINAS_LAYOUT.monitor;
  const C = CONFIG.COLORS;

  sheet.getRange(M.virtualAddress)
    .setValue(
      info.virtualAddress !== null
        ? info.virtualAddress + " (" +
          info.virtualAddress.toString(16).toUpperCase().padStart(3, "0") +
          "h)"
        : "--"
    );

  sheet.getRange(M.vpn)
    .setValue(info.vpn !== null ? "Page " + info.vpn : "--");

  sheet.getRange(M.offset)
    .setValue(
      info.offset !== null
        ? info.offset + " (" +
          info.offset.toString(16).toUpperCase() + "h)"
        : "--"
    );

  sheet.getRange(M.pfn)
    .setValue(info.pfn !== null ? "Frame " + info.pfn : "NONE");

  sheet.getRange(M.physicalAddress)
    .setValue(
      info.physicalAddress !== null
        ? info.physicalAddress + " (" +
          info.physicalAddress.toString(16).toUpperCase().padStart(2, "0") +
          "h)"
        : "--"
    );

  sheet.getRange(M.operation)
    .setValue(info.operation || "-")
    .setFontColor(
      info.operation === "WRITE" ? C.yellow : C.green
    );

  const statusCell = sheet.getRange(M.status);

  const fault = info.status === "PAGE_FAULT";
  statusCell
    .setValue(info.status || "-")
    .setBackground(fault ? C.red : C.panel)
    .setFontColor(fault ? C.background :
      (info.status === "TRANSLATED" ? C.green : C.muted))
    .setFontWeight("bold");
}

/** Restore MMU readout to READY without destroying the page table. */
function resetMMUMonitorDisplay_() {
  const sheet = paginasSheet_();
  const M = PAGINAS_LAYOUT.monitor;
  const C = CONFIG.COLORS;
  [M.virtualAddress, M.vpn, M.offset, M.pfn, M.physicalAddress,
   M.operation].forEach(function(cell) {
    sheet.getRange(cell).setValue('--').setFontColor(C.white)
      .setBackground(C.panel);
  });
  sheet.getRange(M.operation).setValue('-');
  sheet.getRange(M.status).setValue('READY')
    .setBackground(C.panel).setFontColor(C.green)
    .setFontWeight('bold');
}

// ------------------------------------------------------------
// TASK 07 + TASK 08 TESTS
// ------------------------------------------------------------

function assertVM_(condition, message) {
  if (!condition) {
    throw new Error("VM TEST FAILED: " + message);
  }
}

function testVirtualMemoryModule() {
  Logger.log("=== STARTING VIRTUAL MEMORY TESTS ===");

  resetPageTable();

  // TEST 1: Architecture
  assertVM_(
    VIRTUAL_MEMORY_SIZE === 512,
    "Virtual space must be 512 bytes."
  );

  assertVM_(
    VIRTUAL_PAGE_COUNT === 16,
    "There must be 16 virtual pages."
  );

  assertVM_(
    VIRTUAL_PAGE_SIZE === 32,
    "Page size must be 32 bytes."
  );

  assertVM_(
    VM_PHYSICAL_FRAME_COUNT === 8,
    "There must be 8 physical frames."
  );

  Logger.log("PASS: Virtual memory architecture.");

  // TEST 2: Page Table structure
  const state = getPageTable_();

  assertVM_(
    state.entries.length === 16,
    "Page Table must have 16 entries."
  );

  state.entries.forEach(function(entry, index) {
    assertVM_(
      entry.vpn === index,
      "Incorrect VPN index " + index
    );

    assertVM_(
      entry.present === 0 || entry.present === 1,
      "Present bit must be binary."
    );

    assertVM_(
      entry.dirty === 0 || entry.dirty === 1,
      "Dirty bit must be binary."
    );

    assertVM_(
      entry.referenced === 0 || entry.referenced === 1,
      "Reference bit must be binary."
    );

    if (entry.present === 1) {
      assertVM_(
        isValidPFN(entry.pfn),
        "Invalid PFN for resident page."
      );
    } else {
      assertVM_(
        entry.pfn === null,
        "Non-resident page must have null PFN."
      );
    }
  });

  Logger.log("PASS: Page Table structure.");

  // TEST 3: Virtual address decomposition
  const split0 = splitVirtualAddress(0);
  const split31 = splitVirtualAddress(31);
  const split32 = splitVirtualAddress(32);
  const split100 = splitVirtualAddress(100);
  const split511 = splitVirtualAddress(511);

  assertVM_(
    split0.vpn === 0 && split0.offset === 0,
    "Address 0 split failed."
  );

  assertVM_(
    split31.vpn === 0 && split31.offset === 31,
    "Address 31 split failed."
  );

  assertVM_(
    split32.vpn === 1 && split32.offset === 0,
    "Address 32 split failed."
  );

  assertVM_(
    split100.vpn === 3 && split100.offset === 4,
    "Address 100 split failed."
  );

  assertVM_(
    split511.vpn === 15 && split511.offset === 31,
    "Address 511 split failed."
  );

  Logger.log("PASS: Virtual address decomposition.");

  // TEST 4: Resident virtual-to-physical translation
  const translation = translateVirtualAddress(65, false);

  assertVM_(
    translation.success === true,
    "Resident translation must succeed."
  );

  assertVM_(translation.vpn === 2, "Expected VPN 2.");
  assertVM_(translation.offset === 1, "Expected offset 1.");
  assertVM_(translation.pfn === 2, "Expected PFN 2.");

  assertVM_(
    translation.physicalAddress === 65,
    "Expected physical address 65."
  );

  Logger.log("PASS: Resident address translation.");

  // TEST 5: Page Fault detection only.
  // Task 07 verifies detection; Task 08 verifies automatic resolution.
  const fault = translateVirtualAddress(320, false);

  assertVM_(
    fault.fault === true,
    "Page 10 must generate a Page Fault."
  );

  assertVM_(
    fault.vpn === 10,
    "Fault VPN must be 10."
  );

  assertVM_(
    fault.status === "PAGE_FAULT",
    "Fault status must be PAGE_FAULT."
  );

  assertVM_(
    getPageTable_().entries[10].present === 0,
    "Page 10 must remain non-resident after detection."
  );

  Logger.log("PASS: Page Fault detection.");

  // TEST 6: Reference and Dirty bits
  setPageTableEntry(4, 4, 1, 0, 0);

  translateVirtualAddress(128, false);

  let entry4 = getPageTable_().entries[4];

  assertVM_(
    entry4.referenced === 1,
    "Read must set Reference = 1."
  );

  assertVM_(
    entry4.dirty === 0,
    "Read must not set Dirty = 1."
  );

  translateVirtualAddress(129, true);

  entry4 = getPageTable_().entries[4];

  assertVM_(
    entry4.referenced === 1,
    "Write must set Reference = 1."
  );

  assertVM_(
    entry4.dirty === 1,
    "Write must set Dirty = 1."
  );

  Logger.log("PASS: Dirty and Reference bits.");

  // TEST 7: Frame collision prevention
  let collisionCaught = false;

  try {
    setPageTableEntry(9, 3, 1, 0, 0);
  } catch (error) {
    collisionCaught = /collision/i.test(error.message);
  }

  assertVM_(
    collisionCaught,
    "Duplicate PFN assignment must fail."
  );

  Logger.log("PASS: Physical frame collision prevention.");

  // TEST 8: Dynamic Page Table mapping
  setPageTableEntry(1, null, 0, 0, 0);
  setPageTableEntry(12, 1, 1, 0, 0);

  const translation12 = translateVirtualAddress(389, false);

  assertVM_(
    translation12.success === true,
    "Page 12 translation must succeed."
  );

  assertVM_(translation12.vpn === 12, "Expected VPN 12.");
  assertVM_(translation12.pfn === 1, "Expected PFN 1.");

  assertVM_(
    translation12.physicalAddress === 37,
    "Expected physical address 37."
  );

  Logger.log("PASS: Dynamic Page Table mapping.");

  // TEST 9: Invalid virtual addresses
  [-1, 512, 513, 1024, 1.5, "100"].forEach(function(address) {
    let rejected = false;

    try {
      translateVirtualAddress(address, false);
    } catch (error) {
      rejected = true;
    }

    assertVM_(
      rejected,
      "Invalid virtual address accepted: " + address
    );
  });

  Logger.log("PASS: Invalid virtual addresses rejected.");

  // Restore default mapping.
  resetPageTable();

  Logger.log("=== VIRTUAL MEMORY TESTS PASSED ===");

  return {
    passed: true,
    virtualMemorySize: VIRTUAL_MEMORY_SIZE,
    pageCount: VIRTUAL_PAGE_COUNT,
    pageSize: VIRTUAL_PAGE_SIZE,
    physicalFrames: VM_PHYSICAL_FRAME_COUNT
  };
}

// ------------------------------------------------------------
// TASK 09: MMU <-> CACHE INTEGRATION TEST
// ------------------------------------------------------------

/**
 * Tests real cache access after virtual-to-physical translation,
 * including CPU-style instruction reads, data write-through, and
 * page-replacement cache invalidation.
 *
 * Run in a COPY of the simulator with CPU stopped. All RAM pages
 * and page/cache metadata are restored in finally.
 */
function testTask09VirtualCacheIntegration() {
  if (typeof cacheReadInstruction !== "function" ||
      typeof cacheReadData !== "function" ||
      typeof cacheWriteData !== "function") {
    throw new Error("Task 09 requires the installed Cache.gs module.");
  }

  const props = PropertiesService.getDocumentProperties();
  const keys = [PAGE_TABLE_KEY, PAGING_STATE_KEY, CACHE_STATE_KEY];
  const saved = {};
  keys.forEach(function(key) { saved[key] = props.getProperty(key); });
  const frames = [];
  for (let f = 0; f < VM_PHYSICAL_FRAME_COUNT; f++) {
    frames.push(getPhysicalFrame(f).bytes.slice());
  }
  const assert = function(ok, message) {
    if (!ok) throw new Error("TASK 09 INTEGRATION: " + message);
  };

  Logger.log("=== TASK 09 VIRTUAL CACHE INTEGRATION ===");
  try {
    resetPagingSystem();

    // Instruction reads: first misses, repeated byte hits L1I.
    const op1 = readVirtualMemory(0x00, "INSTRUCTION");
    const op2 = readVirtualMemory(0x00, "INSTRUCTION");
    assert(op1 === op2, "Instruction bytes differ");
    let stats = getCacheStatistics();
    assert(stats.l1iMisses >= 1 && stats.l1iHits >= 1,
      "FETCH must use L1I");
    Logger.log("PASS: Instruction fetch uses L1I MISS/HIT");

    // Data access: write must reach actual physical RAM.
    writeVirtualMemory(0x85, 0xA5);
    const data = readVirtualMemory(0x85, "DATA");
    assert(data === 0xA5 && readRawMemory_(0x85) === 0xA5,
      "Virtual write-through consistency failed");
    stats = getCacheStatistics();
    assert(stats.l1dHits >= 1 && stats.writes >= 1,
      "LOAD/STORE must use L1D");
    Logger.log("PASS: Data LOAD/STORE uses L1D and physical RAM");

    // Page 8 is initially non-resident; FIFO overwrites frame 0.
    // L1I cached block 0 of frame 0, and must become invalid.
    readVirtualMemory(0x100, "DATA");
    const newState = getCacheContents();
    assert(newState.l1i.valid === 0,
      "Frame replacement must invalidate L1I");
    const page8 = getPageTable_().entries[8];
    assert(page8.present === 1 && page8.pfn === 0,
      "Page 8 should replace initial page 0 in frame 0");
    Logger.log("PASS: FIFO replacement invalidates affected cache lines");

    Logger.log("=== ALL TASK 09 VIRTUAL CACHE TESTS PASSED ===");
    return { passed: true, cache: getCacheStatistics() };
  } finally {
    // Restore physical bytes before reestablishing previous mappings.
    if (typeof resetCacheModule === "function") {
      resetCacheModule();
    }
    for (let f = 0; f < VM_PHYSICAL_FRAME_COUNT; f++) {
      writePageToPhysicalFrame_(f, frames[f]);
    }
    keys.forEach(function(key) {
      if (saved[key] === null) props.deleteProperty(key);
      else props.setProperty(key, saved[key]);
    });
    try {
      syncPageTableDisplay();
      if (saved[CACHE_STATE_KEY] !== null) {
        syncCacheDashboard_(JSON.parse(saved[CACHE_STATE_KEY]));
      } else {
        syncCacheDashboard_(defaultCacheState_());
      }
    } catch (e) {
      Logger.log("Dashboard refresh after restore: " + e.message);
    }
    Logger.log("Original RAM, Page Table, Paging and Cache states restored");
  }
}
