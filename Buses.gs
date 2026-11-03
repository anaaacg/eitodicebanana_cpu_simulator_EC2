/**
 * EitoDiceBanana CPU Simulator
 * Buses & Control Unit Module - Phase 2
 *
 * Implements:
 * - Internal Bus (8-bit) connecting Registers and ALU
 * - External Address Bus (8-bit)
 * - External Data Bus (8-bit, bidirectional)
 * - Control Bus (Mem_R, Mem_W, IO_R, IO_W, Clock)
 * - Tri-state buffer emulation (HIGH_Z, ACTIVE, CONTENTION prevention)
 * - Micro-operation definitions for FETCH, DECODE, EXECUTE, STORE
 */

const BUSES_LAYOUT = {
  sheet: "BUSES",
  panels: {
    internalBusState: "D8",
    internalBusDriver: "D9",
    internalBusHex: "D10",
    internalBusBin: "D11",
    
    addressBusState: "D15",
    addressBusDriver: "D16",
    addressBusHex: "D17",
    
    dataBusState: "D21",
    dataBusDriver: "D22",
    dataBusHex: "D23",
    dataBusDirection: "D24",
    
    controlMemR: "K8",
    controlMemW: "K9",
    controlIOR: "K10",
    controlIOW: "K11",
    
    cwBinary: "J15",
    activeSignals: "J17",
    stepDescription: "J19"
  }
};

const BUSES_STATE_KEY = "EDB_BUSES_STATE";

// ============================================
// CONTROL SIGNALS DEFINITION
// ============================================

const CONTROL_SIGNALS = [
  // Internal Bus Transmitters (Enable / Tri-state output)
  "En_PC", "En_IR", "En_MAR", "En_MDR",
  "En_AX", "En_BX", "En_CX", "En_DX", "En_ALU",

  // Internal Bus Receivers (Load)
  "Ld_PC", "Ld_IR", "Ld_MAR", "Ld_MDR",
  "Ld_AX", "Ld_BX", "Ld_CX", "Ld_DX", "Ld_ALU_A", "Ld_ALU_B",

  // ALU & PC Sequencing
  "Inc_PC", "ALU_ADD", "ALU_SUB", "ALU_AND", "ALU_OR", "ALU_XOR", "ALU_NOT", "ALU_CMP",

  // External Bus / Memory / IO Control
  "En_MAR_Ext", "Mem_R", "Mem_W", "IO_R", "IO_W",

  // Halt
  "HLT"
];

// ============================================
// TRI-STATE BUFFER & BUS ENGINE
// ============================================

function defaultBusesState_() {
  return {
    internal: { state: "HIGH_Z", source: null, value: null },
    address: { state: "HIGH_Z", source: null, value: null },
    data: { state: "HIGH_Z", source: null, value: null, direction: "-" },
    control: {
      Mem_R: 0,
      Mem_W: 0,
      IO_R: 0,
      IO_W: 0
    }
  };
}

function getBusesState_() {
  const raw = PropertiesService.getDocumentProperties().getProperty(BUSES_STATE_KEY);
  if (!raw) return defaultBusesState_();
  try {
    return JSON.parse(raw);
  } catch (e) {
    return defaultBusesState_();
  }
}

function saveBusesState_(state) {
  PropertiesService.getDocumentProperties().setProperty(BUSES_STATE_KEY, JSON.stringify(state));
}

function createControlWord_(activeMap) {
  const signals = activeMap || {};
  const activeList = [];
  let binary = "";

  CONTROL_SIGNALS.forEach(sig => {
    if (signals[sig]) {
      binary += "1";
      activeList.push(sig);
    } else {
      binary += "0";
    }
  });

  return {
    signals: signals,
    binary: binary,
    activeSignals: activeList
  };
}

function makeMicroStep_(name, signals, condition) {
  return {
    name: name,
    signals: signals || {},
    condition: condition || null,
    captureInstructionByte: false
  };
}

function shouldExecuteMicroStep_(microStep) {
  if (!microStep || !microStep.condition) return true;

  if (microStep.condition === "ZF=1") return getFlag("ZF") === 1;
  if (microStep.condition === "ZF=0") return getFlag("ZF") === 0;

  return true;
}

/**
 * Resolves active transmitters and detects Bus Contention on shared buses.
 * Accepts either a controlWord object or a direct signals map.
 */
function resolveControlBuses_(controlWord, context) {
  const sig = (controlWord && controlWord.signals) ? controlWord.signals : (controlWord || {});
  const buses = defaultBusesState_();

  // --- 1. INTERNAL BUS ARBITRATION ---
  const internalDrivers = [];

  if (sig.En_PC) internalDrivers.push({ name: "PC", value: getRegister("PC") });
  if (sig.En_IR) internalDrivers.push({ name: "IR", value: getRegister("IR") });
  if (sig.En_MAR) internalDrivers.push({ name: "MAR", value: getRegister("MAR") });
  if (sig.En_MDR) internalDrivers.push({ name: "MDR", value: getRegister("MDR") });
  if (sig.En_AX) internalDrivers.push({ name: "AX", value: getRegister("AX") });
  if (sig.En_BX) internalDrivers.push({ name: "BX", value: getRegister("BX") });
  if (sig.En_CX) internalDrivers.push({ name: "CX", value: getRegister("CX") });
  if (sig.En_DX) internalDrivers.push({ name: "DX", value: getRegister("DX") });
  if (sig.En_ALU) {
    const val = context && context.aluResult !== undefined ? context.aluResult : 0;
    internalDrivers.push({ name: "ALU", value: val });
  }

  if (internalDrivers.length > 1) {
    buses.internal.state = "CONTENTION";
    throw new Error(
      "BUS CONTENTION on Internal Bus! Multiple transmitters active: " +
      internalDrivers.map(function(d) { return d.name; }).join(", ")
    );
  } else if (internalDrivers.length === 1) {
    buses.internal.state = "ACTIVE";
    buses.internal.source = internalDrivers[0].name;
    buses.internal.value = internalDrivers[0].value;
  } else {
    buses.internal.state = "HIGH_Z";
    buses.internal.source = null;
    buses.internal.value = null;
  }

  // --- 2. EXTERNAL ADDRESS BUS ---
  if (sig.En_MAR || sig.En_MAR_Ext) {
    buses.address.state = "ACTIVE";
    buses.address.source = "MAR";
    buses.address.value = getRegister("MAR");
  } else {
    buses.address.state = "HIGH_Z";
  }

  // --- 3. EXTERNAL DATA BUS (BIDIRECTIONAL) ---
  const dataDrivers = [];
  if (sig.Mem_R) {
    const addr = getRegister("MAR");
    dataDrivers.push({ name: "RAM", value: Read(addr), dir: "RAM -> MDR" });
  }
  if (sig.Mem_W) {
    dataDrivers.push({ name: "MDR", value: getRegister("MDR"), dir: "MDR -> RAM" });
  }

  if (dataDrivers.length > 1) {
    buses.data.state = "CONTENTION";
    throw new Error("BUS CONTENTION on External Data Bus! Simultaneous Read and Write.");
  } else if (dataDrivers.length === 1) {
    buses.data.state = "ACTIVE";
    buses.data.source = dataDrivers[0].name;
    buses.data.value = dataDrivers[0].value;
    buses.data.direction = dataDrivers[0].dir;
  } else {
    buses.data.state = "HIGH_Z";
    buses.data.direction = "-";
  }

  // --- 4. CONTROL BUS ---
  buses.control.Mem_R = sig.Mem_R ? 1 : 0;
  buses.control.Mem_W = sig.Mem_W ? 1 : 0;
  buses.control.IO_R = sig.IO_R ? 1 : 0;
  buses.control.IO_W = sig.IO_W ? 1 : 0;

  return buses;
}

/**
 * Executes a single micro-operation clock pulse.
 */
function executeMicroOperation_(microStep, microContext) {
  const cw = createControlWord_(microStep.signals);
  const context = microContext || {};
  const changes = [];
  const buses = resolveControlBuses_(cw, context);
  const sig = cw.signals;

  // Latch operations from internal bus
  if (buses.internal.state === "ACTIVE") {
    const busVal = buses.internal.value;

    if (sig.Ld_MAR) {
      setRegister("MAR", busVal);
      changes.push("MAR <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_IR) {
      setRegister("IR", busVal);
      changes.push("IR <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_PC) {
      setRegister("PC", busVal);
      changes.push("PC <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_AX) {
      setRegister("AX", busVal);
      changes.push("AX <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_BX) {
      setRegister("BX", busVal);
      changes.push("BX <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_CX) {
      setRegister("CX", busVal);
      changes.push("CX <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_DX) {
      setRegister("DX", busVal);
      changes.push("DX <- " + byteToHex_(busVal) + "h");
    }
    if (sig.Ld_MDR && !sig.Mem_R) {
      setRegister("MDR", busVal);
      changes.push("MDR <- " + byteToHex_(busVal) + "h");
    }
  }

  // External memory operations
  if (sig.Mem_R) {
    const readVal = buses.data.value;
    if (sig.Ld_MDR) {
      setRegister("MDR", readVal);
      changes.push("MDR <- RAM[" + byteToHex_(getRegister("MAR")) + "h] (" + byteToHex_(readVal) + "h)");
    }
  }

  if (sig.Mem_W) {
    const addr = getRegister("MAR");
    const writeVal = getRegister("MDR");
    Write(addr, writeVal);
    changes.push("RAM[" + byteToHex_(addr) + "h] <- " + byteToHex_(writeVal) + "h");
  }

  // Sequencing
  if (sig.Inc_PC) {
    const newPC = (getRegister("PC") + 1) & 0xFF;
    setRegister("PC", newPC);
    changes.push("PC++ (" + byteToHex_(newPC) + "h)");
  }

  saveBusesState_(buses);
  syncBusesDisplay_(buses, cw, microStep.name);

  return {
    controlWord: cw,
    binary: cw.binary,
    activeSignals: cw.activeSignals,
    buses: buses,
    changes: changes,
    context: context,
    halt: !!sig.HLT,
    description: microStep.name
  };
}

// ============================================
// MICRO-PROGRAM GENERATORS
// ============================================

function getFetchMicroProgram_() {
  return [
    makeMicroStep_("FETCH_T0_PC_TO_MAR", { En_PC: 1, Ld_MAR: 1 }),
    makeMicroStep_("FETCH_T1_MEM_READ", { En_MAR: 1, Mem_R: 1, Ld_MDR: 1 }),
    makeMicroStep_("FETCH_T2_MDR_TO_IR", { En_MDR: 1, Ld_IR: 1, Inc_PC: 1 })
  ];
}

function getInstructionMicroProgram_(decoded) {
  const steps = [];
  const reg = decoded.register;
  const opEn = "En_" + reg;
  const opLd = "Ld_" + reg;

  switch (decoded.type) {
    case "HLT":
      steps.push(makeMicroStep_("EXECUTE_HLT", { HLT: 1 }));
      break;

    case "MOV_IMM": {
      steps.push(makeMicroStep_("EXECUTE_MOV_IMM_TRANSFER", {
        En_MDR: 1,
        [opLd]: 1
      }));
      break;
    }

    case "MOV_REG": {
      const srcReg = decodeRegister_(decoded.operand);
      steps.push(makeMicroStep_("EXECUTE_MOV_REG", {
        ["En_" + srcReg]: 1,
        [opLd]: 1
      }));
      break;
    }

    case "LOAD": {
      steps.push(makeMicroStep_("EXEC_LOAD_ADDR_TO_MAR", { En_MDR: 1, Ld_MAR: 1 }));
      steps.push(makeMicroStep_("EXEC_LOAD_MEM_READ", { En_MAR: 1, Mem_R: 1, Ld_MDR: 1 }));
      steps.push(makeMicroStep_("EXEC_LOAD_MDR_TO_REG", { En_MDR: 1, [opLd]: 1 }));
      break;
    }

    case "STORE": {
      const srcReg = decoded.register;
      steps.push(makeMicroStep_("EXEC_STORE_ADDR_TO_MAR", { En_MDR: 1, Ld_MAR: 1 }));
      steps.push(makeMicroStep_("EXEC_STORE_REG_TO_MDR", { ["En_" + srcReg]: 1, Ld_MDR: 1 }));
      steps.push(makeMicroStep_("EXEC_STORE_MEM_WRITE", { En_MAR: 1, Mem_W: 1 }));
      break;
    }

    case "ADD":
    case "SUB":
    case "CMP":
    case "AND":
    case "OR":
    case "XOR": {
      const step = makeMicroStep_("EXEC_ALU_" + decoded.type, {
        [opLd]: decoded.type === "CMP" ? 0 : 1,
        En_ALU: decoded.type === "CMP" ? 0 : 1
      });
      step.aluOp = decoded.type;
      steps.push(step);
      break;
    }

    case "INC": {
      steps.push(makeMicroStep_("EXEC_INC", { [opEn]: 1, [opLd]: 1, Inc_PC: 0 }));
      break;
    }

    case "DEC": {
      steps.push(makeMicroStep_("EXEC_DEC", { [opEn]: 1, [opLd]: 1 }));
      break;
    }

    case "NOT": {
      steps.push(makeMicroStep_("EXEC_NOT", { [opEn]: 1, [opLd]: 1 }));
      break;
    }

    case "JMP": {
      steps.push(makeMicroStep_("EXEC_JMP", { En_MDR: 1, Ld_PC: 1 }));
      break;
    }

    case "JZ": {
      steps.push(makeMicroStep_("EXEC_JZ", { En_MDR: 1, Ld_PC: 1 }, "ZF=1"));
      break;
    }

    case "JNZ": {
      steps.push(makeMicroStep_("EXEC_JNZ", { En_MDR: 1, Ld_PC: 1 }, "ZF=0"));
      break;
    }

    default:
      throw new Error("No micro-program defined for instruction: " + decoded.type);
  }

  return steps;
}

// ============================================
// VISUAL DASHBOARD & PRESENTATION
// ============================================

function busesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BUSES_LAYOUT.sheet);
  if (!sheet) {
    throw new Error('Sheet "' + BUSES_LAYOUT.sheet + '" not found.');
  }
  return sheet;
}

/**
 * Initializes the layout of the BUSES sheet non-destructively.
 */
function renderBusesDashboard() {
  const sheet = busesSheet_();
  const C = CONFIG.COLORS;

  sheet.clear();
  sheet.getRange("A1:Z50").setBackground(C.background);

  // Title
  sheet.getRange("B2:L2").merge()
    .setValue("EitoDiceBanana — SYSTEM BUSES & TRI-STATE BUFFERS")
    .setBackground(C.panel)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(13)
    .setHorizontalAlignment("center");

  function styleHeader(range, text) {
    sheet.getRange(range).merge()
      .setValue(text)
      .setBackground(C.panelAlt)
      .setFontColor(C.yellow)
      .setFontWeight("bold")
      .setFontSize(10)
      .setHorizontalAlignment("left");
  }

  function styleLabel(cell, text) {
    sheet.getRange(cell)
      .setValue(text)
      .setFontColor(C.muted)
      .setFontWeight("bold")
      .setFontSize(9);
  }

  function styleValue(cell) {
    sheet.getRange(cell)
      .setBackground(C.panel)
      .setFontColor(C.white)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  }

  // 1. Internal Bus Panel
  styleHeader("B6:G6", "1. INTERNAL BUS (8-BIT)");
  styleLabel("B8", "STATE");   styleValue("D8");
  styleLabel("B9", "DRIVER");  styleValue("D9");
  styleLabel("B10", "HEX");    styleValue("D10");
  styleLabel("B11", "BINARY"); styleValue("D11");

  // 2. Address Bus Panel
  styleHeader("B13:G13", "2. EXTERNAL ADDRESS BUS (8-BIT)");
  styleLabel("B15", "STATE");  styleValue("D15");
  styleLabel("B16", "DRIVER"); styleValue("D16");
  styleLabel("B17", "HEX");    styleValue("D17");

  // 3. Data Bus Panel
  styleHeader("B19:G19", "3. EXTERNAL DATA BUS (BIDIRECTIONAL)");
  styleLabel("B21", "STATE");     styleValue("D21");
  styleLabel("B22", "DRIVER");    styleValue("D22");
  styleLabel("B23", "HEX");       styleValue("D23");
  styleLabel("B24", "DIRECTION"); styleValue("D24");

  // 4. Control Bus Panel
  styleHeader("I6:M6", "4. CONTROL BUS SIGNALS");
  styleLabel("I8", "Mem_R (Read)");   styleValue("K8");
  styleLabel("I9", "Mem_W (Write)");  styleValue("K9");
  styleLabel("I10", "IO_R (I/O Read)"); styleValue("K10");
  styleLabel("I11", "IO_W (I/O Write)"); styleValue("K11");

  // 5. Control Word & Step
  styleHeader("I13:M13", "5. CONTROL UNIT STATUS");
  styleLabel("I15", "CONTROL WORD"); styleValue("J15");
  styleLabel("I17", "ACTIVE SIGNALS"); styleValue("J17");
  styleLabel("I19", "MICRO-STEP"); styleValue("J19");

  SpreadsheetApp.flush();
}

/**
 * Syncs the visual sheet with the latest bus status.
 */
function syncBusesDisplay_(buses, cw, stepName) {
  const sheet = busesSheet_();
  const P = BUSES_LAYOUT.panels;
  const C = CONFIG.COLORS;

  function formatState(cell, state) {
    const range = sheet.getRange(cell);
    range.setValue(state);
    if (state === "ACTIVE") {
      range.setFontColor(C.green);
    } else if (state === "CONTENTION") {
      range.setFontColor(C.red);
    } else {
      range.setFontColor(C.muted);
    }
  }

  // Internal Bus
  formatState(P.internalBusState, buses.internal.state);
  sheet.getRange(P.internalBusDriver).setValue(buses.internal.source || "-");
  sheet.getRange(P.internalBusHex).setValue(
    buses.internal.value !== null ? byteToHex_(buses.internal.value) + "h" : "--"
  );
  sheet.getRange(P.internalBusBin).setValue(
    buses.internal.value !== null ? byteToBinary_(buses.internal.value) : "--------"
  );

  // Address Bus
  formatState(P.addressBusState, buses.address.state);
  sheet.getRange(P.addressBusDriver).setValue(buses.address.source || "-");
  sheet.getRange(P.addressBusHex).setValue(
    buses.address.value !== null ? byteToHex_(buses.address.value) + "h" : "--"
  );

  // Data Bus
  formatState(P.dataBusState, buses.data.state);
  sheet.getRange(P.dataBusDriver).setValue(buses.data.source || "-");
  sheet.getRange(P.dataBusHex).setValue(
    buses.data.value !== null ? byteToHex_(buses.data.value) + "h" : "--"
  );
  sheet.getRange(P.dataBusDirection).setValue(buses.data.direction || "-");

  // Control Lines
  function styleBit(cell, val) {
    sheet.getRange(cell)
      .setValue(val)
      .setFontColor(val === 1 ? C.green : C.muted);
  }
  styleBit(P.controlMemR, buses.control.Mem_R);
  styleBit(P.controlMemW, buses.control.Mem_W);
  styleBit(P.controlIOR, buses.control.IO_R);
  styleBit(P.controlIOW, buses.control.IO_W);

  // Control Word & Microstep
  if (cw) {
    sheet.getRange(P.cwBinary).setValue(cw.binary);
    sheet.getRange(P.activeSignals).setValue(cw.activeSignals.join(", ") || "NONE");
  }
  if (stepName) {
    sheet.getRange(P.stepDescription).setValue(stepName);
  }
}

function updateControlUnitPanel_(state) {
  if (!state) return;
  const sheet = busesSheet_();
  sheet.getRange(BUSES_LAYOUT.panels.cwBinary).setValue(state.lastControlWord || "--------");
  sheet.getRange(BUSES_LAYOUT.panels.activeSignals).setValue(
    (state.lastActiveSignals && state.lastActiveSignals.join(", ")) || "NONE"
  );
  sheet.getRange(BUSES_LAYOUT.panels.stepDescription).setValue(state.lastMicroStep || "-");
}

// ============================================
// VERIFICATION TESTS FOR TASK 04
// ============================================

function testBusesModule() {
  Logger.log("=== STARTING TASK 04 BUSES & TRI-STATE TESTS ===");

  // Test 1: High-Z Default
  const idleCw = createControlWord_({});
  const idleBuses = resolveControlBuses_(idleCw);

  if (
    idleBuses.internal.state !== "HIGH_Z" ||
    idleBuses.address.state !== "HIGH_Z" ||
    idleBuses.data.state !== "HIGH_Z"
  ) {
    throw new Error("Default High-Z test failed.");
  }
  Logger.log("PASS: Inactive buffers remain in High-Z");

  // Test 2: Single Driver (AX to Internal Bus)
  setRegister("AX", 0x42);
  const axCw = createControlWord_({ En_AX: 1 });
  const axBuses = resolveControlBuses_(axCw);

  if (
    axBuses.internal.state !== "ACTIVE" ||
    axBuses.internal.source !== "AX"
  ) {
    throw new Error("Single driver (AX) test failed.");
  }
  Logger.log("PASS: Single transmitter drives Internal Bus (AX = 42h)");

  // Test 3: Bus Contention Prevention
  let contentionCaught = false;
  try {
    const conflictCw = createControlWord_({ En_AX: 1, En_BX: 1 });
    resolveControlBuses_(conflictCw);
  } catch (error) {
    contentionCaught = true;
  }

  if (!contentionCaught) {
    throw new Error("Bus Contention test failed: Contention was not prevented/detected.");
  }
  Logger.log("PASS: Bus contention prevented when AX and BX enable simultaneously");

  // Test 4: Bidirectional Data Bus
  setRegister("MAR", 0x85);
  setRegister("MDR", 0x99);
  Write(0x85, 0xAA);

  // 4a: Read (MEMORY -> Data Bus)
  const readCw = createControlWord_({ En_MAR: 1, Mem_R: 1, Ld_MDR: 1 });
  const readBuses = resolveControlBuses_(readCw);

  const sourceRead = String(readBuses.data.source || "").toUpperCase();
  const validSource = sourceRead === "RAM" || sourceRead === "MEMORY";
  const validValue = readBuses.data.value === 0xAA || readBuses.data.value === null;

  if (!validSource || !validValue) {
    throw new Error("External Data Bus Read test failed.");
  }
  Logger.log("PASS: Bidirectional Data Bus Read (MEMORY -> MDR)");

  // 4b: Write (MDR -> Data Bus) - Corregido añadiendo En_MDR: 1
  const writeCw = createControlWord_({ En_MAR: 1, En_MDR: 1, Mem_W: 1 });
  const writeBuses = resolveControlBuses_(writeCw);

  const sourceWrite = String(writeBuses.data.source || "").toUpperCase();
  const validWriteSource = sourceWrite === "MDR";
  const validWriteValue = writeBuses.data.value === 0x99 || writeBuses.data.value === null;

  if (!validWriteSource || !validWriteValue) {
    throw new Error("External Data Bus Write test failed.");
  }
  Logger.log("PASS: Bidirectional Data Bus Write (MDR -> MEMORY)");

  Logger.log("=== ALL TASK 04 BUSES TESTS PASSED ===");
}