/**
 * EitoDiceBanana CPU Simulator
 * Buses & Tri-State Buffers — Task 04
 *
 * Responsibility: Physical bus layer.
 *   - Tri-state buffer state per transmitter (ACTIVE / HIGH_Z)
 *   - Control bus with Clock signal
 *   - Data bus routing: RAM / CACHE / IO
 *   - Visual dashboard on the BUSES sheet
 *
 * Logic delegation — do NOT redefine these functions here:
 *   createControlWord_()          → ControlUnit.gs
 *   validateControlWord_()        → ControlUnit.gs
 *   resolveControlBuses_()        → ControlUnit.gs
 *   makeMicroStep_()              → ControlUnit.gs
 *   shouldExecuteMicroStep_()     → ControlUnit.gs
 *   executeMicroOperation_()      → ControlUnit.gs
 *   getFetchMicroProgram_()       → ControlUnit.gs
 *   getInstructionMicroProgram_() → ControlUnit.gs
 */

// ============================================================
// LAYOUT
// ============================================================

const BUSES_LAYOUT = {
  sheet: "BUSES",

  panels: {
    // 1. Internal bus
    internalBusState:  "D8",
    internalBusDriver: "D9",
    internalBusHex:    "D10",
    internalBusBin:    "D11",

    // 2. External address bus
    addressBusState:   "D15",
    addressBusDriver:  "D16",
    addressBusHex:     "D17",

    // 3. External data bus (bidirectional)
    dataBusState:      "D21",
    dataBusDriver:     "D22",
    dataBusHex:        "D23",
    dataBusDirection:  "D24",
    dataBusRoute:      "D25",   // Routing source: RAM / CACHE / IO

    // 4. Control bus signals
    controlMemR:       "K8",
    controlMemW:       "K9",
    controlIOR:        "K10",
    controlIOW:        "K11",
    controlClock:      "K12",   // Clock pulse per micro-step

    // 5. Control unit status
    cwBinary:          "J15",
    activeSignals:     "J17",
    stepDescription:   "J19"
  },

  // 6. Tri-state buffer map table
  bufferTable: {
    startRow: 27,   // Title row
    startCol: 2     // Column B
  }
};

const BUSES_STATE_KEY = "EDB_BUSES_STATE";

// ============================================================
// DATA BUS ROUTING SOURCES
// ============================================================

/**
 * Enum for data bus routing.
 * Determines which memory or peripheral drives the external data bus.
 *
 *   RAM   — standard physical memory (00h–FFh), currently implemented.
 *   CACHE — L1/L2 cache (Phase 2 future module, stubs HIGH_Z).
 *   IO    — keyboard / LCD peripheral (Phase 2 future module, stubs HIGH_Z).
 *   MDR   — MDR driving the data bus on WRITE operations.
 */
const BUS_DATA_SOURCES = {
  RAM:   "RAM",
  CACHE: "CACHE",
  IO:    "IO",
  MDR:   "MDR"
};

// ============================================================
// BUS STATE
// ============================================================

/**
 * Default state for all buses and tri-state buffers.
 * Reflects the CPU with no active micro-operation (all buffers HIGH_Z).
 *
 * Layout:
 *   internal  — 8-bit shared bus between registers and ALU.
 *   address   — 8-bit unidirectional bus driven by MAR.
 *   data      — 8-bit bidirectional bus: RAM/CACHE/IO ↔ MDR.
 *   control   — Memory/IO control lines + Clock.
 *   buffers   — Per-transmitter ACTIVE / HIGH_Z map.
 */
function defaultBusesState_() {
  return {
    internal: {
      state:  "HIGH_Z",
      source: null,
      value:  null
    },

    address: {
      state:  "HIGH_Z",
      source: null,
      value:  null
    },

    data: {
      state:      "HIGH_Z",
      source:     null,
      value:      null,
      direction:  "-",
      dataSource: BUS_DATA_SOURCES.RAM
    },

    control: {
      Mem_R: 0,
      Mem_W: 0,
      IO_R:  0,
      IO_W:  0,
      Clock: 0
    },

    // Per-transmitter tri-state buffer map.
    // Populated by buildBusSnapshot_() from ControlUnit.resolveControlBuses_().
    buffers: {
      internal: {
        PC:  "HIGH_Z",
        IR:  "HIGH_Z",
        AX:  "HIGH_Z",
        BX:  "HIGH_Z",
        CX:  "HIGH_Z",
        DX:  "HIGH_Z",
        MDR: "HIGH_Z",
        ALU: "HIGH_Z",
        IMM: "HIGH_Z",
        KBD: "HIGH_Z"
      },
      address: {
        MAR: "HIGH_Z"
      },
      data: {
        RAM:   "HIGH_Z",
        CACHE: "HIGH_Z",   // future: L1/L2 cache
        IO:    "HIGH_Z",   // future: I/O peripherals
        MDR:   "HIGH_Z"
      }
    }
  };
}

function getBusesState_() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(BUSES_STATE_KEY);

  if (!raw) {
    return defaultBusesState_();
  }

  try {
    const saved    = JSON.parse(raw);
    const defaults = defaultBusesState_();

    // Merge saved state; ensures new fields (Clock, buffers) always exist.
    return {
      internal: Object.assign({}, defaults.internal, saved.internal),
      address:  Object.assign({}, defaults.address,  saved.address),
      data:     Object.assign({}, defaults.data,      saved.data),
      control:  Object.assign({}, defaults.control,   saved.control),
      buffers: {
        internal: Object.assign(
          {},
          defaults.buffers.internal,
          ((saved.buffers || {}).internal || {})
        ),
        address: Object.assign(
          {},
          defaults.buffers.address,
          ((saved.buffers || {}).address || {})
        ),
        data: Object.assign(
          {},
          defaults.buffers.data,
          ((saved.buffers || {}).data || {})
        )
      }
    };

  } catch (e) {
    return defaultBusesState_();
  }
}

function saveBusesState_(state) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(BUSES_STATE_KEY, JSON.stringify(state));
}

// ============================================================
// SHEET UTILITY
// ============================================================

function busesSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(BUSES_LAYOUT.sheet);

  if (!sheet) {
    throw new Error(
      'Sheet "' + BUSES_LAYOUT.sheet + '" not found.'
    );
  }

  return sheet;
}

// ============================================================
// BUS SNAPSHOT BUILDER
// ============================================================

/**
 * Builds a complete bus state snapshot from the object returned by
 * ControlUnit.resolveControlBuses_().
 *
 * Adds:
 *   - control.Clock  (1 during micro-step execution, 0 when idle)
 *   - data.direction (human-readable transfer direction string)
 *   - data.dataSource (BUS_DATA_SOURCES routing: RAM / CACHE / IO / MDR)
 *   - buffers         (per-transmitter ACTIVE / HIGH_Z map)
 *
 * Data bus routing priority:
 *   Cache_R (future) → IO_R (future) → Mem_R → Mem_W → IO_W → idle
 *
 * @param {Object} resolved   Result of resolveControlBuses_() from ControlUnit.gs.
 * @param {Object} signals    The control word's signals map (word.signals).
 * @param {number} clockPulse 1 if executing a micro-step, 0 otherwise.
 * @returns {Object} Full bus state for saveBusesState_() and syncBusesDisplay_().
 */
function buildBusSnapshot_(resolved, signals, clockPulse) {
  const sig   = signals || {};
  const state = defaultBusesState_();

  // ── Internal bus ──────────────────────────────────────
  state.internal.state  = resolved.internal.state;
  state.internal.source = resolved.internal.source;
  state.internal.value  = resolved.internal.value;

  // ── External address bus ──────────────────────────────
  state.address.state  = resolved.address.state;
  state.address.source = resolved.address.source;
  state.address.value  = resolved.address.value;

  // ── External data bus: state from ControlUnit ─────────
  state.data.state  = resolved.data.state;
  state.data.source = resolved.data.source;
  state.data.value  = resolved.data.value;

  // Data bus routing and direction (priority order)
  if (sig.Cache_R) {
    // Future: Cache module drives data bus toward MDR.
    state.data.dataSource = BUS_DATA_SOURCES.CACHE;
    state.data.direction  = "CACHE \u2192 MDR";

  } else if (sig.IO_R) {
    // Future: I/O peripheral drives data bus toward MDR.
    state.data.dataSource = BUS_DATA_SOURCES.IO;
    state.data.direction  = "IO \u2192 MDR";

  } else if (sig.Mem_R) {
    // Physical RAM drives data bus toward MDR (current implementation).
    state.data.dataSource = BUS_DATA_SOURCES.RAM;
    state.data.direction  = "RAM \u2192 MDR";

  } else if (sig.Mem_W) {
    // MDR drives data bus toward physical RAM.
    state.data.dataSource = BUS_DATA_SOURCES.MDR;
    state.data.direction  = "MDR \u2192 RAM";

  } else if (sig.IO_W) {
    // Future: MDR drives data bus toward I/O peripheral.
    state.data.dataSource = BUS_DATA_SOURCES.MDR;
    state.data.direction  = "MDR \u2192 IO";

  } else {
    state.data.direction  = "-";
    state.data.dataSource = BUS_DATA_SOURCES.RAM;
  }

  // ── Control bus ───────────────────────────────────────
  state.control.Mem_R = sig.Mem_R ? 1 : 0;
  state.control.Mem_W = sig.Mem_W ? 1 : 0;
  state.control.IO_R  = sig.IO_R  ? 1 : 0;
  state.control.IO_W  = sig.IO_W  ? 1 : 0;
  state.control.Clock = clockPulse === 1 ? 1 : 0;

  // ── Per-transmitter buffer map ──────────────────────────
  // If ControlUnit.resolveControlBuses_() provides buffers, use it;
  // otherwise, derive directly from active control signals (fallback).
  const src = (resolved && resolved.buffers) ? resolved.buffers : null;

  // Internal bus transmitters (10 entries)
  state.buffers.internal.PC  = (src && src.internal && src.internal.PC)  || (sig.En_PC  ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.IR  = (src && src.internal && src.internal.IR)  || (sig.En_IR  ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.AX  = (src && src.internal && src.internal.AX)  || (sig.En_AX  ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.BX  = (src && src.internal && src.internal.BX)  || (sig.En_BX  ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.CX  = (src && src.internal && src.internal.CX)  || (sig.En_CX  ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.DX  = (src && src.internal && src.internal.DX)  || (sig.En_DX  ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.MDR = (src && src.internal && src.internal.MDR) || ((sig.En_MDR && !sig.Mem_W) ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.ALU = (src && src.internal && src.internal.ALU) || (sig.En_ALU ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.IMM = (src && src.internal && src.internal.IMM) || (sig.En_IMM ? "ACTIVE" : "HIGH_Z");
  state.buffers.internal.KBD = (src && src.internal && src.internal.KBD) || (sig.En_KBD ? "ACTIVE" : "HIGH_Z");

  // Address bus transmitter
  state.buffers.address.MAR  = (src && src.address && src.address.MAR)   || (sig.En_MAR ? "ACTIVE" : "HIGH_Z");

  // Data bus transmitters
  state.buffers.data.RAM   = (src && src.data && (src.data.RAM || src.data.MEMORY)) || (sig.Mem_R ? "ACTIVE" : "HIGH_Z");
  state.buffers.data.MDR   = (src && src.data && src.data.MDR)                       || ((sig.Mem_W && sig.En_MDR) ? "ACTIVE" : "HIGH_Z");
  state.buffers.data.CACHE = "HIGH_Z";
  state.buffers.data.IO    = "HIGH_Z";

  return state;
}

// ============================================================
// VISUAL DASHBOARD
// ============================================================

/**
 * Initializes the BUSES sheet layout.
 * Adds all panels including Clock and the per-transmitter buffer map.
 * Safe to call repeatedly (always rebuilds from scratch).
 */
function renderBusesDashboard() {
  const sheet = busesSheet_();
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

  // ── Title ─────────────────────────────────────────────
  sheet.getRange("B2:Q2").merge()
    .setValue("EitoDiceBanana \u2014 BUSES & TRI-STATE BUFFERS")
    .setBackground(C.panel)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(13)
    .setHorizontalAlignment("center");

  // ── 1. Internal Bus ───────────────────────────────────
  header("B6:G6",  "1. INTERNAL BUS (8-BIT)");
  label("B8",  "STATE");   valueCell("D8");
  label("B9",  "DRIVER");  valueCell("D9");
  label("B10", "HEX");     valueCell("D10");
  label("B11", "BINARY");  valueCell("D11");

  // ── 2. Address Bus ────────────────────────────────────
  header("B13:G13", "2. EXTERNAL ADDRESS BUS (8-BIT)");
  label("B15", "STATE");   valueCell("D15");
  label("B16", "DRIVER");  valueCell("D16");
  label("B17", "HEX");     valueCell("D17");

  // ── 3. Data Bus ───────────────────────────────────────
  header("B19:G19", "3. EXTERNAL DATA BUS (BIDIRECTIONAL)");
  label("B21", "STATE");     valueCell("D21");
  label("B22", "DRIVER");    valueCell("D22");
  label("B23", "HEX");       valueCell("D23");
  label("B24", "DIRECTION"); valueCell("D24");
  label("B25", "ROUTE");     valueCell("D25");

  // ── 4. Control Bus ────────────────────────────────────
  header("I6:M6", "4. CONTROL BUS SIGNALS");
  label("I8",  "Mem_R (Read)");     valueCell("K8");
  label("I9",  "Mem_W (Write)");    valueCell("K9");
  label("I10", "IO_R  (I/O Read)"); valueCell("K10");
  label("I11", "IO_W  (I/O Write)");valueCell("K11");
  label("I12", "Clock");            valueCell("K12");

  // ── 5. Control Unit Status ────────────────────────────
  header("I14:M14", "5. CONTROL UNIT STATUS");
  label("I16", "CONTROL WORD");   valueCell("J15");
  label("I17", "ACTIVE SIGNALS"); valueCell("J17");
  label("I19", "MICRO-STEP");     valueCell("J19");

  // ── 6. Tri-State Buffer Map ───────────────────────────
  header("B27:Q27", "6. TRI-STATE BUFFER MAP  (per transmitter)");

  const headerRow = BUSES_LAYOUT.bufferTable.startRow + 1; // row 28
  sheet.getRange(headerRow, 2)
    .setValue("TRANSMITTER").setFontColor(C.muted).setFontWeight("bold");
  sheet.getRange(headerRow, 4)
    .setValue("BUS").setFontColor(C.muted).setFontWeight("bold");
  sheet.getRange(headerRow, 6)
    .setValue("STATE").setFontColor(C.muted).setFontWeight("bold");

  var currentRow = headerRow + 1; // row 29

  // Internal bus transmitters
  var internalList = ["PC", "IR", "AX", "BX", "CX", "DX", "MDR", "ALU", "IMM", "KBD"];
  internalList.forEach(function (name) {
    sheet.getRange(currentRow, 2).setValue(name).setFontColor(C.white);
    sheet.getRange(currentRow, 4).setValue("INTERNAL").setFontColor(C.muted);
    sheet.getRange(currentRow, 6)
      .setValue("HIGH_Z")
      .setBackground(C.panel)
      .setFontColor(C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    currentRow++;
  });

  // Address bus transmitters
  sheet.getRange(currentRow, 2).setValue("MAR").setFontColor(C.white);
  sheet.getRange(currentRow, 4).setValue("ADDRESS").setFontColor(C.muted);
  sheet.getRange(currentRow, 6)
    .setValue("HIGH_Z")
    .setBackground(C.panel)
    .setFontColor(C.muted)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  currentRow++;

  // Data bus transmitters
  var dataList = ["RAM", "CACHE", "IO", "MDR"];
  dataList.forEach(function (name) {
    sheet.getRange(currentRow, 2).setValue(name).setFontColor(C.white);
    sheet.getRange(currentRow, 4).setValue("DATA").setFontColor(C.muted);
    sheet.getRange(currentRow, 6)
      .setValue("HIGH_Z")
      .setBackground(C.panel)
      .setFontColor(C.muted)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    currentRow++;
  });

  SpreadsheetApp.flush();
}

// ============================================================
// DISPLAY SYNCHRONIZATION
// ============================================================

/**
 * Syncs the BUSES sheet with the current snapshot.
 *
 * @param {Object} busState  Full state from buildBusSnapshot_().
 * @param {Object} cw        Control Word object from ControlUnit.gs (optional).
 * @param {string} stepName  Micro-step name (optional).
 */
function syncBusesDisplay_(busState, cw, stepName) {
  const sheet = busesSheet_();
  const P     = BUSES_LAYOUT.panels;
  const C     = CONFIG.COLORS;
  const state = busState || defaultBusesState_();

  function stateColor_(s) {
    if (s === "ACTIVE")     return C.green;
    if (s === "CONTENTION") return C.red;
    return C.muted;
  }

  function formatState_(cell, s) {
    sheet.getRange(cell).setValue(s).setFontColor(stateColor_(s));
  }

  function formatBit_(cell, val) {
    sheet.getRange(cell)
      .setValue(val)
      .setFontColor(val === 1 ? C.green : C.muted);
  }

  // ── 1. Internal bus ───────────────────────────────────
  formatState_(P.internalBusState, state.internal.state);
  sheet.getRange(P.internalBusDriver)
    .setValue(state.internal.source || "-");
  sheet.getRange(P.internalBusHex)
    .setValue(
      state.internal.value !== null
        ? byteToHex_(state.internal.value) + "h"
        : "--"
    );
  sheet.getRange(P.internalBusBin)
    .setNumberFormat("@")
    .setValue(
      state.internal.value !== null
        ? byteToBinary_(state.internal.value)
        : "--------"
    );

  // ── 2. Address bus ────────────────────────────────────
  formatState_(P.addressBusState, state.address.state);
  sheet.getRange(P.addressBusDriver)
    .setValue(state.address.source || "-");
  sheet.getRange(P.addressBusHex)
    .setValue(
      state.address.value !== null
        ? byteToHex_(state.address.value) + "h"
        : "--"
    );

  // ── 3. Data bus ───────────────────────────────────────
  formatState_(P.dataBusState, state.data.state);
  sheet.getRange(P.dataBusDriver)
    .setValue(state.data.source || "-");
  sheet.getRange(P.dataBusHex)
    .setValue(
      state.data.value !== null
        ? byteToHex_(state.data.value) + "h"
        : "--"
    );
  sheet.getRange(P.dataBusDirection)
    .setValue(state.data.direction || "-");
  sheet.getRange(P.dataBusRoute)
    .setValue(
      state.data.state === "ACTIVE"
        ? (state.data.dataSource || BUS_DATA_SOURCES.RAM)
        : "-"
    );

  // ── 4. Control bus ────────────────────────────────────
  formatBit_(P.controlMemR,  state.control.Mem_R);
  formatBit_(P.controlMemW,  state.control.Mem_W);
  formatBit_(P.controlIOR,   state.control.IO_R);
  formatBit_(P.controlIOW,   state.control.IO_W);
  formatBit_(P.controlClock, state.control.Clock);

  // ── 5. Control unit status ────────────────────────────
  if (cw) {
    sheet.getRange(P.cwBinary)
      .setValue(cw.binary || "");

    const signals = cw.activeSignals || [];
    sheet.getRange(P.activeSignals)
      .setValue(signals.length ? signals.join(", ") : "NONE");
  }

  if (stepName) {
    sheet.getRange(P.stepDescription).setValue(stepName);
  }

  // ── 6. Buffer map ─────────────────────────────────────
  syncBufferMapDisplay_(sheet, state.buffers, C);
}

/**
 * Updates the per-transmitter tri-state buffer rows in the BUSES sheet.
 * Row positions mirror the order established by renderBusesDashboard().
 */
function syncBufferMapDisplay_(sheet, buffers, C) {
  // First data row starts two rows below the section title (row 29).
  var row = BUSES_LAYOUT.bufferTable.startRow + 2;

  function writeBufState_(r, bufState) {
    sheet.getRange(r, 6)
      .setValue(bufState)
      .setFontColor(bufState === "ACTIVE" ? C.green : C.muted);
  }

  // Internal bus transmitters (10 entries)
  var internalList = ["PC", "IR", "AX", "BX", "CX", "DX", "MDR", "ALU", "IMM", "KBD"];
  internalList.forEach(function (name) {
    writeBufState_(row, (buffers.internal || {})[name] || "HIGH_Z");
    row++;
  });

  // Address bus: MAR (1 entry)
  writeBufState_(row, (buffers.address || {}).MAR || "HIGH_Z");
  row++;

  // Data bus transmitters (4 entries: RAM, CACHE, IO, MDR)
  var dataList = ["RAM", "CACHE", "IO", "MDR"];
  dataList.forEach(function (name) {
    writeBufState_(row, (buffers.data || {})[name] || "HIGH_Z");
    row++;
  });
}

/**
 * Updates the Control Unit status panel from an Execution.gs state object.
 * Called by Execution.gs → stepCpu() after each micro-operation.
 *
 * Also rebuilds and saves a full bus snapshot so the buffer map
 * and Clock signal stay in sync with the last executed micro-step.
 */
function updateControlUnitPanel_(state) {
  if (!state) return;

  const sheet = busesSheet_();
  const P     = BUSES_LAYOUT.panels;

  // Control word binary string
  sheet.getRange(P.cwBinary)
    .setValue(state.lastControlWord || "");

  // Active signals list
  const signals = state.lastActiveSignals || [];
  sheet.getRange(P.activeSignals)
    .setValue(signals.length ? signals.join(", ") : "NONE");

  // Current micro-step name
  sheet.getRange(P.stepDescription)
    .setValue(state.lastMicroStep || "-");

  // Rebuild full snapshot from last resolved buses + active signals
  if (state.lastBuses) {
    // Reconstruct a plain signals map from the active-signals list.
    // Items like "ALU_OP=ADD" are metadata, not individual signals; skip them.
    const sigSet = {};
    signals.forEach(function (sig) {
      if (sig.indexOf("=") === -1) {
        sigSet[sig] = 1;
      }
    });

    const snapshot = buildBusSnapshot_(state.lastBuses, sigSet, 1);
    saveBusesState_(snapshot);
    syncBusesDisplay_(snapshot, null, state.lastMicroStep);
  }
}

// ============================================================
// TESTS FOR TASK 04
// ============================================================

/**
 * Verifies buses, individual tri-state buffers, Clock signal and
 * data bus routing. All signal logic is delegated to ControlUnit.gs.
 *
 * Tests:
 *   T1 — Default state: all buses HIGH_Z, Clock = 0.
 *   T2 — Single driver (AX): internal bus ACTIVE, buffer AX=ACTIVE, Clock=1.
 *   T3 — Contention (AX + BX): ControlUnit detects and throws.
 *   T4 — Address bus: En_MAR → ACTIVE, buffer MAR=ACTIVE.
 *   T5 — Data bus READ: Mem_R → RAM routing, buffer RAM=ACTIVE, Mem_R=1.
 *   T6 — Data bus WRITE: Mem_W → MDR routing, buffer MDR=ACTIVE, Mem_W=1.
 *   T7 — Clock = 0 when no micro-step is executing.
 *   T8 — CACHE and IO buffers remain HIGH_Z (not yet implemented).
 *   T9 — BUS_DATA_SOURCES enum is correct.
 */
function testBusesModule() {
  Logger.log("=== TASK 04: BUSES & TRI-STATE BUFFER TESTS ===");

  // ── T1: Default state all HIGH_Z ─────────────────────
  const idle = defaultBusesState_();

  if (
    idle.internal.state !== "HIGH_Z" ||
    idle.address.state  !== "HIGH_Z" ||
    idle.data.state     !== "HIGH_Z"
  ) {
    throw new Error("T1 FAIL: defaultBusesState_ must initialize all buses to HIGH_Z.");
  }

  if (idle.control.Clock !== 0) {
    throw new Error("T1 FAIL: Clock must default to 0.");
  }

  Object.keys(idle.buffers.internal).forEach(function (k) {
    if (idle.buffers.internal[k] !== "HIGH_Z") {
      throw new Error("T1 FAIL: internal buffer " + k + " must default to HIGH_Z.");
    }
  });

  if (idle.buffers.address.MAR !== "HIGH_Z") {
    throw new Error("T1 FAIL: address buffer MAR must default to HIGH_Z.");
  }

  Object.keys(idle.buffers.data).forEach(function (k) {
    if (idle.buffers.data[k] !== "HIGH_Z") {
      throw new Error("T1 FAIL: data buffer " + k + " must default to HIGH_Z.");
    }
  });

  Logger.log("PASS T1: Default state all HIGH_Z (Clock=0, all buffers HIGH_Z)");

  // ── T2: Single driver (AX) ───────────────────────────
  setRegister("AX", 0x42);

  const axWord  = createControlWord_({ signals: { En_AX: 1 } });
  const axBuses = resolveControlBuses_(axWord, {});
  const axSnap  = buildBusSnapshot_(axBuses, axWord.signals, 1);

  if (
    axSnap.internal.state  !== "ACTIVE" ||
    axSnap.internal.source !== "AX"     ||
    axSnap.internal.value  !== 0x42
  ) {
    throw new Error("T2 FAIL: AX must drive internal bus as ACTIVE with value 42h.");
  }

  if (axSnap.buffers.internal.AX !== "ACTIVE") {
    throw new Error("T2 FAIL: Individual buffer AX must be ACTIVE.");
  }

  if (axSnap.control.Clock !== 1) {
    throw new Error("T2 FAIL: Clock must be 1 during a micro-step.");
  }

  Logger.log("PASS T2: AX drives internal bus (ACTIVE 42h, buffer AX=ACTIVE, Clock=1)");

  // ── T3: Bus contention (AX + BX) ─────────────────────
  var contentionCaught = false;

  try {
    const conflictWord = createControlWord_({
      signals: { En_AX: 1, En_BX: 1 }
    });
    validateControlWord_(conflictWord);
  } catch (err) {
    if (/contention/i.test(err.message)) {
      contentionCaught = true;
    } else {
      throw err;
    }
  }

  if (!contentionCaught) {
    throw new Error("T3 FAIL: Contention between AX and BX was not detected.");
  }

  Logger.log("PASS T3: Bus contention detected (AX + BX simultaneous)");

  // ── T4: Address bus via En_MAR ────────────────────────
  setRegister("MAR", 0x85);

  const marWord  = createControlWord_({
    signals: { En_MAR: 1, Mem_R: 1, Ld_MDR: 1 }
  });
  const marBuses = resolveControlBuses_(marWord, {});
  const marSnap  = buildBusSnapshot_(marBuses, marWord.signals, 1);

  if (
    marSnap.address.state  !== "ACTIVE" ||
    marSnap.address.source !== "MAR"    ||
    marSnap.address.value  !== 0x85
  ) {
    throw new Error("T4 FAIL: MAR must drive the address bus as ACTIVE with value 85h.");
  }

  if (marSnap.buffers.address.MAR !== "ACTIVE") {
    throw new Error("T4 FAIL: Individual buffer MAR must be ACTIVE.");
  }

  Logger.log("PASS T4: Address bus ACTIVE (MAR=85h, buffer MAR=ACTIVE)");

  // ── T5: Data bus READ (RAM \u2192 MDR) ─────────────────────
  Write(0x85, 0xAA);

  const readWord  = createControlWord_({
    signals: { En_MAR: 1, Mem_R: 1, Ld_MDR: 1 }
  });
  const readBuses = resolveControlBuses_(readWord, {});
  const readSnap  = buildBusSnapshot_(readBuses, readWord.signals, 1);

  if (readSnap.data.state !== "ACTIVE") {
    throw new Error("T5 FAIL: Data bus must be ACTIVE during Mem_R.");
  }

  if (readSnap.data.dataSource !== BUS_DATA_SOURCES.RAM) {
    throw new Error("T5 FAIL: Data bus dataSource must be RAM on Mem_R.");
  }

  if (readSnap.data.direction.indexOf("RAM") === -1) {
    throw new Error("T5 FAIL: Direction string must contain 'RAM'.");
  }

  if (readSnap.buffers.data.RAM !== "ACTIVE") {
    throw new Error("T5 FAIL: RAM data buffer must be ACTIVE during read.");
  }

  if (readSnap.control.Mem_R !== 1) {
    throw new Error("T5 FAIL: Control bus Mem_R must be 1.");
  }

  Logger.log("PASS T5: Data bus READ \u2014 RAM\u2192MDR, Mem_R=1, buffer RAM=ACTIVE");

  // ── T6: Data bus WRITE (MDR \u2192 RAM) ────────────────────
  setRegister("MAR", 0x85);
  setRegister("MDR", 0x99);

  const writeWord  = createControlWord_({
    signals: { En_MAR: 1, En_MDR: 1, Mem_W: 1 }
  });
  const writeBuses = resolveControlBuses_(writeWord, {});
  const writeSnap  = buildBusSnapshot_(writeBuses, writeWord.signals, 1);

  if (writeSnap.data.state !== "ACTIVE") {
    throw new Error("T6 FAIL: Data bus must be ACTIVE during Mem_W.");
  }

  if (writeSnap.data.dataSource !== BUS_DATA_SOURCES.MDR) {
    throw new Error("T6 FAIL: Data bus dataSource must be MDR on Mem_W.");
  }

  if (writeSnap.data.direction.indexOf("MDR") === -1) {
    throw new Error("T6 FAIL: Direction string must contain 'MDR'.");
  }

  if (writeSnap.buffers.data.MDR !== "ACTIVE") {
    throw new Error("T6 FAIL: MDR data buffer must be ACTIVE during write.");
  }

  if (writeSnap.control.Mem_W !== 1) {
    throw new Error("T6 FAIL: Control bus Mem_W must be 1.");
  }

  Logger.log("PASS T6: Data bus WRITE \u2014 MDR\u2192RAM, Mem_W=1, buffer MDR=ACTIVE");

  // ── T7: Clock = 0 when idle ───────────────────────────
  const idleWord  = createControlWord_({});
  const idleBuses = resolveControlBuses_(idleWord, {});
  const idleSnap  = buildBusSnapshot_(idleBuses, idleWord.signals, 0);

  if (idleSnap.control.Clock !== 0) {
    throw new Error("T7 FAIL: Clock must be 0 when no micro-step is executing.");
  }

  Logger.log("PASS T7: Clock=0 when idle");

  // ── T8: CACHE and IO stubs remain HIGH_Z ─────────────
  if (
    idleSnap.buffers.data.CACHE !== "HIGH_Z" ||
    idleSnap.buffers.data.IO    !== "HIGH_Z"
  ) {
    throw new Error(
      "T8 FAIL: CACHE and IO buffers must remain HIGH_Z (modules not yet implemented)."
    );
  }

  Logger.log("PASS T8: CACHE and IO buffers HIGH_Z (future modules stubbed)");

  // ── T9: BUS_DATA_SOURCES enum ────────────────────────
  if (
    BUS_DATA_SOURCES.RAM   !== "RAM"   ||
    BUS_DATA_SOURCES.CACHE !== "CACHE" ||
    BUS_DATA_SOURCES.IO    !== "IO"    ||
    BUS_DATA_SOURCES.MDR   !== "MDR"
  ) {
    throw new Error("T9 FAIL: BUS_DATA_SOURCES enum values are incorrect.");
  }

  Logger.log("PASS T9: BUS_DATA_SOURCES enum (RAM / CACHE / IO / MDR)");

  Logger.log("=== ALL TASK 04 BUSES & TRI-STATE TESTS PASSED ===");

  return { passed: true, tests: 9 };
}
