
/**
 * EitoDiceBanana CPU Simulator
 * Execution Engine - Phase 1
 *
 * FETCH -> DECODE -> EXECUTE -> STORE
 *
 * Functional: CPU, RAM, ALU, ASM and visual feedback
 * Reserved: Buses, Cache, MMU, I/O, CX and DX
 */

const EXECUTION_KEY = "EDB_EXECUTION_STATE";

const EXECUTION_PHASE_CELLS = {
  FETCH: "C21",
  DECODE: "G21",
  EXECUTE: "K21",
  STORE: "O21"
};

// ============================================
// EXECUTION STATE
// ============================================

function defaultExecutionState_() {
  return {
    phase: "FETCH",
    decoded: null,
    result: null,
    halted: false,
    paused: false,
    steps: 0,
    instructionPC: 0,
    lastPhase: "-"
  };
}

function getExecutionState_() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(EXECUTION_KEY);

  return raw
    ? JSON.parse(raw)
    : defaultExecutionState_();
}

function saveExecutionState_(state) {
  PropertiesService.getDocumentProperties()
    .setProperty(EXECUTION_KEY, JSON.stringify(state));
}

function resetExecutionState() {
  const state = defaultExecutionState_();

  saveExecutionState_(state);

  clearRegisterHighlights();
  clearMemoryHighlight();
  updateExecutionVisuals_(state, null, []);

  return state;
}

// ============================================
// VISUAL FEEDBACK
// ============================================

function updateExecutionVisuals_(
  state,
  executedPhase,
  changedFlags
) {
  const sheet = cpuSheet_();
  const C = CONFIG.COLORS;

  // Reset the four phase indicators.
  Object.keys(EXECUTION_PHASE_CELLS)
    .forEach(phase => {
      sheet.getRange(EXECUTION_PHASE_CELLS[phase])
        .setBackground(C.panelAlt)
        .setFontColor(C.muted)
        .setFontWeight("bold");
    });

  // Highlight the phase just executed.
  const visiblePhase =
    executedPhase || state.phase;

  if (EXECUTION_PHASE_CELLS[visiblePhase]) {
    sheet.getRange(
      EXECUTION_PHASE_CELLS[visiblePhase]
    )
      .setBackground(C.yellow)
      .setFontColor(C.background)
      .setFontWeight("bold");
  }

  // Current phase panel.
  sheet.getRange(CPU_LAYOUT.phase)
    .setValue(visiblePhase)
    .setBackground(C.yellow)
    .setFontColor(C.background);

  // CPU status.
  const status = state.halted
    ? "HALT"
    : state.paused
      ? "PAUSED"
      : "READY";

  const statusColor = state.halted
    ? C.red
    : state.paused
      ? C.yellow
      : C.green;

  sheet.getRange(CPU_LAYOUT.status)
    .setValue(status)
    .setBackground(C.panelAlt)
    .setFontColor(statusColor);

  // Highlight modified flags.
  CONFIG.CPU.flags.forEach(flag => {
    const cell = sheet.getRange(
      CPU_LAYOUT.flags[flag]
    );

    if (
      changedFlags &&
      changedFlags.includes(flag)
    ) {
      cell.setBackground(C.yellow)
        .setFontColor(C.background);
    } else {
      cell.setBackground(C.panelAlt)
        .setFontColor(C.yellow);
    }
  });

  // Synchronize HOME dashboard.
  const home = SpreadsheetApp.getActive()
    .getSheetByName("INICIO");

  if (home) {
    home.getRange("G7").setValue(status);
    home.getRange("G12").setValue(visiblePhase);
  }
}

function snapshotFlags_() {
  return {
    ZF: getFlag("ZF"),
    CF: getFlag("CF"),
    SF: getFlag("SF")
  };
}

function changedFlags_(before) {
  return CONFIG.CPU.flags.filter(
    flag => before[flag] !== getFlag(flag)
  );
}

// ============================================
// DECODING UTILITIES
// ============================================

function decodeRegister_(code) {
  const registers = {
    0: "AX",
    1: "BX"
  };

  if (!Object.prototype.hasOwnProperty.call(
    registers, code
  )) {
    throw new Error(
      "Invalid register code: " + code
    );
  }

  return registers[code];
}

function readInstructionByte_() {
  const pc = getRegister("PC");

  if (pc > CONFIG.MEMORY.codeEnd) {
    throw new Error(
      "PC outside code segment: " + pc
    );
  }

  const value = Read(pc);

  setRegister("PC", toByte(pc + 1));

  return value;
}

function resolveInstructionOperand_(ins) {
  if (ins.mode === "IMMEDIATE") {
    return ins.operand;
  }

  if (ins.mode === "REGISTER") {
    return getRegister(
      decodeRegister_(ins.operand)
    );
  }

  throw new Error("Invalid addressing mode.");
}

// ============================================
// FETCH
// ============================================

function fetchPhase_(state) {
  const pc = getRegister("PC");

  if (pc > CONFIG.MEMORY.codeEnd) {
    throw new Error(
      "PC outside code segment: " + pc
    );
  }

  state.instructionPC = pc;

  setRegister("MAR", pc);

  const opcode = Read(pc);

  setRegister("MDR", opcode);
  setRegister("IR", opcode);
  setRegister("PC", toByte(pc + 1));

  state.decoded = null;
  state.result = null;

  highlightRegisters([
    "PC", "MAR", "MDR", "IR"
  ]);

  return (
    "PC=" + byteToHex_(pc) +
    "h -> MAR | MDR=" +
    byteToHex_(opcode) + "h -> IR"
  );
}

// ============================================
// DECODE
// ============================================

function decodePhase_(state) {
  const opcode = getRegister("IR");
  const table = {};

  Object.keys(ISA).forEach(key => {
    table[ISA[key].opcode] = key;
  });

  const type = table[opcode];

  if (!type) {
    throw new Error(
      "Unknown opcode: " +
      byteToHex_(opcode) + "h"
    );
  }

  const ins = {
    type,
    opcode,
    register: null,
    mode: null,
    operand: null,
    address: null
  };

  switch (type) {
    case "MOV_IMM":
      ins.register = decodeRegister_(
        readInstructionByte_()
      );

      if (
        readInstructionByte_() !==
        ASM_MODES.IMMEDIATE
      ) {
        throw new Error(
          "Invalid MOV immediate mode."
        );
      }

      ins.mode = "IMMEDIATE";
      ins.operand = readInstructionByte_();
      break;

    case "MOV_REG":
      ins.register = decodeRegister_(
        readInstructionByte_()
      );
      ins.mode = "REGISTER";
      ins.operand = readInstructionByte_();
      decodeRegister_(ins.operand);
      break;

    case "LOAD":
      ins.register = decodeRegister_(
        readInstructionByte_()
      );
      ins.address = readInstructionByte_();
      break;

    case "STORE":
      ins.address = readInstructionByte_();
      ins.register = decodeRegister_(
        readInstructionByte_()
      );
      break;

    case "INC":
    case "DEC":
    case "NOT":
      ins.register = decodeRegister_(
        readInstructionByte_()
      );
      break;

    case "ADD":
    case "SUB":
    case "CMP":
    case "AND":
    case "OR":
    case "XOR": {
      ins.register = decodeRegister_(
        readInstructionByte_()
      );

      const mode = readInstructionByte_();

      if (mode === ASM_MODES.IMMEDIATE) {
        ins.mode = "IMMEDIATE";
      } else if (mode === ASM_MODES.REGISTER) {
        ins.mode = "REGISTER";
      } else {
        throw new Error(
          "Invalid addressing mode: " + mode
        );
      }

      ins.operand = readInstructionByte_();

      if (ins.mode === "REGISTER") {
        decodeRegister_(ins.operand);
      }

      break;
    }

    case "JMP":
    case "JZ":
    case "JNZ":
      ins.address = readInstructionByte_();
      break;

    case "HLT":
      break;
  }

  state.decoded = ins;

  highlightRegisters(["IR", "PC"]);

  return (
    "Decoded " + type +
    " | Next PC=" +
    byteToHex_(getRegister("PC")) + "h"
  );
}

// ============================================
// EXECUTE
// ============================================

function executePhase_(state) {
  const ins = state.decoded;

  if (!ins) {
    throw new Error(
      "No decoded instruction."
    );
  }

  const reg = ins.register;

  if (reg) {
    highlightRegisters([reg]);
  } else {
    clearRegisterHighlights();
  }

  let detail = ins.type;

  switch (ins.type) {
    case "MOV_IMM":
    case "MOV_REG":
      state.result =
        resolveInstructionOperand_(ins);
      break;

    case "ADD":
      state.result = aluAdd(
        getRegister(reg),
        resolveInstructionOperand_(ins)
      );
      break;

    case "SUB":
      state.result = aluSub(
        getRegister(reg),
        resolveInstructionOperand_(ins)
      );
      break;

    case "INC":
      state.result = aluInc(
        getRegister(reg)
      );
      break;

    case "DEC":
      state.result = aluDec(
        getRegister(reg)
      );
      break;

    case "CMP":
      aluCmp(
        getRegister(reg),
        resolveInstructionOperand_(ins)
      );
      break;

    case "AND":
      state.result = aluAnd(
        getRegister(reg),
        resolveInstructionOperand_(ins)
      );
      break;

    case "OR":
      state.result = aluOr(
        getRegister(reg),
        resolveInstructionOperand_(ins)
      );
      break;

    case "XOR":
      state.result = aluXor(
        getRegister(reg),
        resolveInstructionOperand_(ins)
      );
      break;

    case "NOT":
      state.result = aluNot(
        getRegister(reg)
      );
      break;

    case "LOAD":
      setRegister("MAR", ins.address);
      setRegister(
        "MDR",
        Read(ins.address)
      );

      state.result = getRegister("MDR");

      highlightRegisters([
        "MAR", "MDR", reg
      ]);
      break;

    case "STORE":
      state.result = getRegister(reg);

      highlightRegisters([reg]);
      break;

    case "JMP":
      setRegister("PC", ins.address);
      highlightRegisters(["PC"]);
      break;

    case "JZ":
      if (getFlag("ZF") === 1) {
        setRegister("PC", ins.address);
      }
      highlightRegisters(["PC"]);
      break;

    case "JNZ":
      if (getFlag("ZF") === 0) {
        setRegister("PC", ins.address);
      }
      highlightRegisters(["PC"]);
      break;

    case "HLT":
      detail = "HLT detected";
      break;
  }

  if (state.result !== null) {
    detail +=
      " | Result=" +
      byteToHex_(state.result) + "h";
  }

  if (
    ["ADD", "SUB", "INC", "DEC",
     "CMP", "AND", "OR", "XOR", "NOT"]
      .includes(ins.type)
  ) {
    detail +=
      " | ZF=" + getFlag("ZF") +
      " CF=" + getFlag("CF") +
      " SF=" + getFlag("SF");
  }

  return detail;
}

// ============================================
// STORE / WRITE-BACK
// ============================================

function storePhase_(state) {
  const ins = state.decoded;

  if (!ins) {
    throw new Error(
      "No instruction to store."
    );
  }

  const writingRegisters = [
    "MOV_IMM", "MOV_REG",
    "ADD", "SUB",
    "INC", "DEC",
    "AND", "OR",
    "XOR", "NOT",
    "LOAD"
  ];

  if (writingRegisters.includes(ins.type)) {
    setRegister(
      ins.register,
      toByte(state.result)
    );

    highlightRegisters([ins.register]);

    return (
      ins.register + " <- " +
      byteToHex_(
        getRegister(ins.register)
      ) + "h"
    );
  }

  if (ins.type === "STORE") {
    setRegister("MAR", ins.address);
    setRegister(
      "MDR",
      toByte(state.result)
    );

    Write(
      ins.address,
      getRegister("MDR")
    );

    highlightRegisters(["MAR", "MDR"]);

    return (
      "RAM[" +
      byteToHex_(ins.address) +
      "h] <- " +
      byteToHex_(state.result) + "h"
    );
  }

  if (ins.type === "HLT") {
    state.halted = true;
    return "CPU halted";
  }

  return "No write-back required";
}

// ============================================
// EXECUTION TRACE
// ============================================

function appendExecutionTrace_(
  state,
  phase,
  detail
) {
  const sheet = SpreadsheetApp.getActive()
    .getSheetByName("TRAZA");

  const row = Math.max(
    6,
    sheet.getLastRow() + 1
  );

  sheet.getRange(row, 2, 1, 6)
    .setValues([[
      state.steps,
      phase,
      byteToHex_(state.instructionPC) + "h",
      byteToHex_(getRegister("IR")) + "h",
      state.decoded
        ? state.decoded.type
        : "FETCH",
      detail
    ]])
    .setBackground(CONFIG.COLORS.panel)
    .setFontColor(CONFIG.COLORS.white);
}

// ============================================
// STEP
// ============================================

function stepCpu() {
  const state = getExecutionState_();

  if (state.halted || state.paused) {
    return state;
  }

  const phase = state.phase;
  const flagsBefore = snapshotFlags_();

  let detail = "";

  switch (phase) {
    case "FETCH":
      detail = fetchPhase_(state);
      state.phase = "DECODE";
      break;

    case "DECODE":
      detail = decodePhase_(state);
      state.phase = "EXECUTE";
      break;

    case "EXECUTE":
      detail = executePhase_(state);
      state.phase = "STORE";
      break;

    case "STORE":
      detail = storePhase_(state);
      state.phase = "FETCH";
      break;

    default:
      throw new Error(
        "Unknown CPU phase: " + phase
      );
  }

  state.steps++;
  state.lastPhase = phase;

  saveExecutionState_(state);

  appendExecutionTrace_(
    state,
    phase,
    detail
  );

  updateExecutionVisuals_(
    state,
    phase,
    changedFlags_(flagsBefore)
  );

  return state;
}

// ============================================
// RUN
// ============================================

function runCpu() {
  let state = getExecutionState_();

  if (state.halted) {
    return state;
  }

  state.paused = false;
  saveExecutionState_(state);

  const speed = String(
    cpuSheet_()
      .getRange("G29")
      .getValue()
  )
    .trim()
    .toLowerCase();

  const delays = {
    lento: 1000,
    normal: 500,
    rapido: 100,
    "rápido": 100
  };

  const delay = delays[speed] === undefined
    ? 500
    : delays[speed];

  // Phase 1: bounded batches.
  const maxPhases = 20;

  for (let i = 0; i < maxPhases; i++) {
    state = getExecutionState_();

    if (state.halted || state.paused) {
      break;
    }

    state = stepCpu();

    SpreadsheetApp.flush();

    if (state.halted || state.paused) {
      break;
    }

    Utilities.sleep(delay);
  }

  return getExecutionState_();
}

// ============================================
// PAUSE / RESUME
// ============================================

function pauseCpu() {
  const state = getExecutionState_();

  state.paused = true;

  saveExecutionState_(state);

  updateExecutionVisuals_(
    state,
    state.lastPhase === "-"
      ? state.phase
      : state.lastPhase,
    []
  );

  return state;
}

function resumeCpu() {
  const state = getExecutionState_();

  if (state.halted) {
    return state;
  }

  state.paused = false;

  saveExecutionState_(state);

  updateExecutionVisuals_(
    state,
    state.lastPhase === "-"
      ? state.phase
      : state.lastPhase,
    []
  );

  return state;
}

// ============================================
// RESET
// ============================================

function resetCpu() {
  resetCPURegisters();
  resetExecutionState();

  const trace = SpreadsheetApp.getActive()
    .getSheetByName("TRAZA");

  const lastRow = trace.getLastRow();

  if (lastRow >= 6) {
    trace.getRange(
      6, 2,
      lastRow - 5,
      6
    ).clearContent();
  }

  SpreadsheetApp.flush();
}

// ============================================
// TEST
// ============================================

function testExecutionModule() {
  Logger.log("=== EXECUTION TEST ===");

  const program = assembleProgram([
    "MOV AX, 5",
    "ADD AX, 3",
    "STORE [80h], AX",
    "LOAD BX, [80h]",
    "HLT"
  ]);

  loadProgram(program);
  resetCpu();

  let state = getExecutionState_();
  let guard = 0;

  while (!state.halted && guard < 40) {
    state = stepCpu();
    guard++;
  }

  if (!state.halted) {
    throw new Error("HLT was not reached.");
  }

  if (getRegister("AX") !== 8) {
    throw new Error("AX expected 8.");
  }

  Logger.log("PASS: AX = 08h");

  if (getRegister("BX") !== 8) {
    throw new Error("BX expected 8.");
  }

  Logger.log("PASS: BX = 08h");

  if (Read(0x80) !== 8) {
    throw new Error("RAM[80h] expected 8.");
  }

  Logger.log("PASS: RAM[80h] = 08h");

  if (state.steps !== 20) {
    throw new Error(
      "Expected 20 execution phases."
    );
  }

  Logger.log("PASS: 20 phases executed");
  Logger.log("PASS: CPU halted");

  Logger.log(
    "=== ALL EXECUTION TESTS PASSED ==="
  );
}


function testFlagsDiagnostics() {
  const program = assembleProgram([
    "MOV AX, 255",
    "ADD AX, 1",
    "HLT"
  ]);

  loadProgram(program);
  resetCpu();

  Logger.log("=== FLAGS DIAGNOSTICS ===");

  for (let i = 1; i <= 8; i++) {
    const state = stepCpu();

    Logger.log(
      "STEP " + i +
      " | Phase=" + state.lastPhase +
      " | AX=" + byteToHex_(getRegister("AX")) +
      " | ZF=" + getFlag("ZF") +
      " | CF=" + getFlag("CF") +
      " | SF=" + getFlag("SF")
    );
  }

  const sheet = SpreadsheetApp.getActive()
    .getSheetByName("CPU");

  Logger.log(
    "SHEET FLAGS: ZF=" +
    sheet.getRange("N7").getValue() +
    " CF=" +
    sheet.getRange("N8").getValue() +
    " SF=" +
    sheet.getRange("N9").getValue()
  );

  const passed =
    getRegister("AX") === 0 &&
    getFlag("ZF") === 1 &&
    getFlag("CF") === 1 &&
    getFlag("SF") === 0;

  Logger.log(
    passed
      ? "PASS: Flags and ALU are correct"
      : "FAIL: Check ALU or CPU flag updates"
  );
}
