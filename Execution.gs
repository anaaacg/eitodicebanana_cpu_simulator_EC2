
/**
 * EitoDiceBanana CPU Simulator
 * Execution Engine - Phase 2
 *
 * FETCH -> DECODE -> EXECUTE -> STORE
 *
 * Functional: CPU, RAM, ALU, ASM and visual feedback
 * Registers: AX, BX, CX, DX (8-bit)
 * Reserved: Buses, Cache, MMU, I/O
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
    lastPhase: "-",

    // Current micro-program and clock position.
    microProgram: null,
    microIndex: 0,

    // Context is preserved between STEP presses.
    microContext: {
      instructionBytes: []
    },

    lastInstructionType: "FETCH",
    lastMicroStep: "-",
    lastControlWord: "",
    lastActiveSignals: [],
    lastBuses: {
      internal: { state: "HIGH_Z", source: null, value: null },
      address: { state: "HIGH_Z", source: null, value: null },
      data: { state: "HIGH_Z", source: null, value: null }
    },
    lastChanges: []
  };
}

function getExecutionState_() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(EXECUTION_KEY);

  if (!raw) {
    return defaultExecutionState_();
  }

  const saved = JSON.parse(raw);
  const state = Object.assign(
    defaultExecutionState_(),
    saved
  );

  // Migrate old states created before micro-step execution.
  if (!Object.prototype.hasOwnProperty.call(saved, "microIndex")) {
    state.phase = "FETCH";
    state.decoded = null;
    state.result = null;
    state.microProgram = null;
    state.microIndex = 0;
    state.microContext = { instructionBytes: [] };
    state.lastInstructionType = "FETCH";
  }

  state.microContext = Object.assign(
    { instructionBytes: [] },
    state.microContext || {}
  );

  if (!Array.isArray(state.microContext.instructionBytes)) {
    state.microContext.instructionBytes = [];
  }

  if (!Array.isArray(state.microProgram)) {
    state.microProgram = null;
  }

  if (!Number.isInteger(state.microIndex) || state.microIndex < 0) {
    state.microIndex = 0;
  }

  if (!Array.isArray(state.lastActiveSignals)) {
    state.lastActiveSignals = [];
  }

  if (!Array.isArray(state.lastChanges)) {
    state.lastChanges = [];
  }

  return state;
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

  if (typeof updateControlUnitPanel_ === "function") {
    updateControlUnitPanel_(state);
  }

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
    1: "BX",
    2: "CX",
    3: "DX"
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

/** Returns the mnemonic associated with a machine opcode. */
function instructionTypeFromOpcode_(opcode) {
  const type = Object.keys(ISA).find(function(name) {
    return ISA[name].opcode === opcode;
  });

  if (!type) {
    throw new Error(
      "Unknown opcode: " + byteToHex_(opcode) + "h"
    );
  }

  return type;
}


/** Builds the decoded instruction from bytes fetched through MDR. */
function decodeFetchedInstruction_(type, bytes) {
  const expectedBytes = ISA[type].bytes - 1;

  if (!Array.isArray(bytes) || bytes.length !== expectedBytes) {
    throw new Error(
      "Invalid operand byte count for " + type +
      ": expected " + expectedBytes + ", got " +
      (Array.isArray(bytes) ? bytes.length : "invalid")
    );
  }

  function read(index) {
    const value = bytes[index];

    if (!isValidByte(value)) {
      throw new Error(
        "Invalid instruction byte at operand index " + index
      );
    }

    return value;
  }

  const ins = {
    type: type,
    opcode: getRegister("IR"),
    register: null,
    mode: null,
    operand: null,
    address: null
  };

  switch (type) {
    case "MOV_IMM":
      ins.register = decodeRegister_(read(0));

      if (read(1) !== ASM_MODES.IMMEDIATE) {
        throw new Error("Invalid MOV immediate mode.");
      }

      ins.mode = "IMMEDIATE";
      ins.operand = read(2);
      break;

    case "MOV_REG":
      ins.register = decodeRegister_(read(0));
      ins.mode = "REGISTER";
      ins.operand = read(1);
      decodeRegister_(ins.operand);
      break;

    case "LOAD":
      ins.register = decodeRegister_(read(0));
      ins.address = read(1);
      break;

    case "STORE":
      ins.address = read(0);
      ins.register = decodeRegister_(read(1));
      break;

    case "INC":
    case "DEC":
    case "NOT":
      ins.register = decodeRegister_(read(0));
      break;

    case "ADD":
    case "SUB":
    case "CMP":
    case "AND":
    case "OR":
    case "XOR": {
      ins.register = decodeRegister_(read(0));
      const mode = read(1);

      if (mode === ASM_MODES.IMMEDIATE) {
        ins.mode = "IMMEDIATE";
      } else if (mode === ASM_MODES.REGISTER) {
        ins.mode = "REGISTER";
      } else {
        throw new Error("Invalid addressing mode: " + mode);
      }

      ins.operand = read(2);

      if (ins.mode === "REGISTER") {
        decodeRegister_(ins.operand);
      }
      break;
    }

    case "JMP":
    case "JZ":
    case "JNZ":
      ins.address = read(0);
      break;

    case "HLT":
      break;

    default:
      throw new Error("Unsupported instruction: " + type);
  }

  return ins;
}


/**
 * Creates one memory-read triplet per instruction operand:
 * T0: PC -> MAR
 * T1: RAM[MAR] -> MDR
 * T2: capture MDR in micro-context and increment PC
 */
function getDecodeMicroProgram_(byteCount) {
  const steps = [];

  for (let i = 0; i < byteCount; i++) {
    steps.push(
      makeMicroStep_("DECODE_T" + i + "_PC_TO_MAR", {
        En_PC: 1,
        Ld_MAR: 1
      })
    );

    steps.push(
      makeMicroStep_("DECODE_T" + i + "_MEMORY_READ", {
        En_MAR: 1,
        Mem_R: 1,
        Ld_MDR: 1
      })
    );

    const captureStep = makeMicroStep_(
      "DECODE_T" + i + "_CAPTURE_BYTE",
      {
        En_MDR: 1,
        Inc_PC: 1
      }
    );

    captureStep.captureInstructionByte = true;
    steps.push(captureStep);
  }

  return steps;
}


/** Prepares the next micro-program without executing a clock step. */
function prepareCurrentMicroProgram_(state) {
  let guard = 0;

  while (!state.microProgram && guard < 5) {
    guard++;
    state.microIndex = 0;

    switch (state.phase) {
      case "FETCH": {
        const pc = getRegister("PC");

        if (
          pc < CONFIG.MEMORY.codeStart ||
          pc > CONFIG.MEMORY.codeEnd
        ) {
          throw new Error("PC outside code segment: " + pc);
        }

        state.instructionPC = pc;
        state.decoded = null;
        state.result = null;
        state.lastInstructionType = "FETCH";
        state.microContext = { instructionBytes: [] };
        state.microProgram = getFetchMicroProgram_();
        break;
      }

      case "DECODE": {
        const type = instructionTypeFromOpcode_(getRegister("IR"));
        const operandCount = ISA[type].bytes - 1;
        const pc = getRegister("PC");

        if (
          operandCount > 0 &&
          pc + operandCount - 1 > CONFIG.MEMORY.codeEnd
        ) {
          throw new Error(
            "Instruction operands exceed code segment 00h-7Fh."
          );
        }

        state.lastInstructionType = type;

        if (operandCount === 0) {
          state.decoded = decodeFetchedInstruction_(
            type,
            state.microContext.instructionBytes
          );
          state.phase = "EXECUTE";
          continue;
        }

        state.microProgram = getDecodeMicroProgram_(operandCount);
        break;
      }

      case "EXECUTE":
        if (!state.decoded) {
          throw new Error("No decoded instruction for execution.");
        }

        state.lastInstructionType = state.decoded.type;
        state.microProgram = getInstructionMicroProgram_(state.decoded);
        break;

      default:
        throw new Error("Unknown CPU phase: " + state.phase);
    }
  }

  if (!state.microProgram || state.microProgram.length === 0) {
    throw new Error("Could not prepare a valid CPU micro-program.");
  }
}


/** Moves the state machine to the next architectural phase. */
function completeMicroProgram_(state, completedPhase, haltRequested) {
  state.microProgram = null;
  state.microIndex = 0;

  switch (completedPhase) {
    case "FETCH":
      state.phase = "DECODE";
      break;

    case "DECODE": {
      const type = instructionTypeFromOpcode_(getRegister("IR"));

      state.decoded = decodeFetchedInstruction_(
        type,
        state.microContext.instructionBytes
      );

      state.lastInstructionType = type;
      state.phase = "EXECUTE";
      break;
    }

    case "EXECUTE":
      if (haltRequested) {
        state.halted = true;
      }

      state.phase = "FETCH";
      state.decoded = null;
      state.microContext = { instructionBytes: [] };
      break;

    default:
      throw new Error("Cannot complete CPU phase: " + completedPhase);
  }
}


/** Human-readable bus value used by the execution trace and CPU panel. */
function formatMicroBus_(bus) {
  if (!bus || bus.state !== "ACTIVE") {
    return "HIGH_Z";
  }

  const value =
    bus.value === undefined || bus.value === null
      ? ""
      : " = " + byteToHex_(bus.value) + "h";

  return (bus.source || "BUS") + value;
}

// ============================================
// EXECUTION TRACE
// ============================================

function appendExecutionTrace_(
  state,
  phase,
  detail,
  instructionName
) {
  const sheet = SpreadsheetApp.getActive()
    .getSheetByName("TRAZA");

  if (!sheet) {
    throw new Error("TRAZA sheet not found.");
  }

  const row = Math.max(6, sheet.getLastRow() + 1);

  sheet.getRange(row, 2, 1, 6)
    .setValues([[
      state.steps,
      phase,
      byteToHex_(state.instructionPC) + "h",
      byteToHex_(getRegister("IR")) + "h",
      instructionName || state.lastInstructionType || "FETCH",
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

  // Prepare the program only; this does not consume a clock step.
  if (
    !state.microProgram ||
    state.microIndex >= state.microProgram.length
  ) {
    state.microProgram = null;
    state.microIndex = 0;
    prepareCurrentMicroProgram_(state);
  }

  const phaseBefore = state.phase;
  const flagsBefore = snapshotFlags_();
  const microStep = state.microProgram[state.microIndex];

  if (!microStep) {
    throw new Error("Micro-step not found at index " + state.microIndex);
  }

  const instructionName =
    state.decoded
      ? state.decoded.type
      : state.lastInstructionType;

  let microResult;

  if (shouldExecuteMicroStep_(microStep)) {
    microResult = executeMicroOperation_(
      microStep,
      state.microContext
    );
  } else {
    // A skipped conditional micro-step still consumes one clock,
    // but no transmitter is enabled and all buses remain HIGH-Z.
    const idleWord = createControlWord_({});

    microResult = {
      controlWord: idleWord,
      binary: idleWord.binary,
      activeSignals: [],
      buses: resolveControlBuses_(idleWord, state.microContext),
      changes: ["SKIPPED: " + microStep.condition],
      context: state.microContext,
      halt: false,
      description: microStep.name
    };
  }

  // Capture each fetched instruction operand after MDR was loaded.
  if (microStep.captureInstructionByte) {
    state.microContext.instructionBytes.push(getRegister("MDR"));
  }

  if (
    microResult.context &&
    microResult.context.aluResult !== undefined
  ) {
    state.result = microResult.context.aluResult;
  }

  state.lastMicroStep = microResult.description;
  state.lastControlWord = microResult.binary;
  state.lastActiveSignals = microResult.activeSignals;
  state.lastBuses = microResult.buses;
  state.lastChanges = microResult.changes;

  // Exactly one micro-operation is executed per call to stepCpu().
  state.microIndex++;
  state.steps++;

  const completed =
    state.microIndex >= state.microProgram.length;

  const displayedPhase =
    phaseBefore === "EXECUTE" && completed
      ? "STORE"
      : phaseBefore;

  if (completed) {
    completeMicroProgram_(
      state,
      phaseBefore,
      microResult.halt
    );
  }

  state.lastPhase = displayedPhase;

  const changesText =
    microResult.changes.length > 0
      ? microResult.changes.join(" / ")
      : "No register changes";

  const detail =
    microResult.description +
    " | CW=" + microResult.binary +
    " | " + changesText +
    " | INT=" + formatMicroBus_(microResult.buses.internal) +
    " | ADDR=" + formatMicroBus_(microResult.buses.address) +
    " | DATA=" + formatMicroBus_(microResult.buses.data);

  saveExecutionState_(state);

  appendExecutionTrace_(
    state,
    displayedPhase,
    detail,
    instructionName
  );

  updateExecutionVisuals_(
    state,
    displayedPhase,
    changedFlags_(flagsBefore)
  );

  if (typeof updateControlUnitPanel_ === "function") {
    updateControlUnitPanel_(state);
  }

  return state;
}

// ============================================
// RUN
// ============================================

function runCpu() {
  // Main.gs contains the pause-aware continuous runner.
  // Use it when available so RUN can execute the full program.
  if (typeof edbRunContinuous_ === "function") {
    return edbRunContinuous_();
  }

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

  // Fallback: bounded batch of clock micro-steps.
  const maxMicroSteps = 20;

  for (let i = 0; i < maxMicroSteps; i++) {
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
  Logger.log("=== MICRO-OP EXECUTION TEST ===");

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

  while (!state.halted && guard < 300) {
    state = stepCpu();
    guard++;
  }

  if (!state.halted) {
    throw new Error("HLT was not reached within 300 micro-steps.");
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

  if (state.steps !== 56) {
    throw new Error(
      "Expected 56 clock micro-steps, got " + state.steps
    );
  }

  Logger.log("PASS: 56 clock micro-steps executed");
  Logger.log("PASS: CPU halted");
  Logger.log("=== ALL MICRO-OP EXECUTION TESTS PASSED ===");

  return {
    passed: true,
    microSteps: state.steps,
    AX: getRegister("AX"),
    BX: getRegister("BX"),
    RAM80: Read(0x80)
  };
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

  let state = getExecutionState_();
  let guard = 0;

  while (!state.halted && guard < 100) {
    state = stepCpu();

    Logger.log(
      "STEP " + state.steps +
      " | MICRO=" + state.lastMicroStep +
      " | AX=" + byteToHex_(getRegister("AX")) +
      " | ZF=" + getFlag("ZF") +
      " | CF=" + getFlag("CF") +
      " | SF=" + getFlag("SF")
    );

    guard++;
  }

  const passed =
    state.halted &&
    getRegister("AX") === 0 &&
    getFlag("ZF") === 1 &&
    getFlag("CF") === 1 &&
    getFlag("SF") === 0;

  if (!passed) {
    throw new Error("Flags or ALU micro-operation integration failed.");
  }

  Logger.log("PASS: AX=00h");
  Logger.log("PASS: ZF=1, CF=1, SF=0");
  Logger.log("=== FLAGS TEST PASSED ===");

  return {
    passed: true,
    microSteps: state.steps,
    AX: getRegister("AX"),
    ZF: getFlag("ZF"),
    CF: getFlag("CF"),
    SF: getFlag("SF")
  };
}


// ============================================
// PHASE 2 - FOUR REGISTER INTEGRATION TEST
// ============================================

/**
 * Tests the full FETCH/DECODE/EXECUTE/STORE pipeline
 * using AX, BX, CX, DX, ALU, flags and memory.
 *
 * NOTE: Replaces the current program in code RAM,
 * resets CPU registers and clears the execution trace.
 */
function testPhase2ExecutionModule() {
  Logger.log("=== FOUR REGISTER MICRO-OP TEST ===");

  const lines = [
    "MOV AX, FFh",
    "MOV BX, 01h",
    "MOV CX, 02h",
    "MOV DX, 03h",
    "ADD AX, BX",
    "MOV CX, AX",
    "SUB DX, BX",
    "OR CX, DX",
    "STORE [80h], CX",
    "LOAD BX, [80h]",
    "CMP BX, DX",
    "HLT"
  ];

  const program = assembleProgram(lines);
  loadProgram(program);
  resetCpu();

  let state = getExecutionState_();
  let guard = 0;

  while (!state.halted && guard < 500) {
    state = stepCpu();
    guard++;
  }

  if (!state.halted || state.steps !== 150) {
    throw new Error(
      "Expected 150 micro-steps and HLT; got " + state.steps
    );
  }
  Logger.log("PASS: 150 clock micro-steps and HLT");

  const expected = { AX: 0, BX: 2, CX: 2, DX: 2 };

  Object.keys(expected).forEach(name => {
    const actual = getRegister(name);

    if (actual !== expected[name]) {
      throw new Error(
        name + " expected " + expected[name] + ", got " + actual
      );
    }
  });

  Logger.log("PASS: AX, BX, CX, DX execute independently");

  if (Read(0x80) !== 2) {
    throw new Error("RAM[80h] must contain 02h.");
  }
  Logger.log("PASS: STORE and LOAD through RAM[80h]");

  if (
    getFlag("ZF") !== 1 ||
    getFlag("CF") !== 0 ||
    getFlag("SF") !== 0
  ) {
    throw new Error("CMP flags are incorrect.");
  }
  Logger.log("PASS: ZF=1, CF=0, SF=0");

  if (
    getRegister("IR") !== ISA.HLT.opcode ||
    getRegister("PC") !== program.length
  ) {
    throw new Error("PC or IR execution state is incorrect.");
  }
  Logger.log("PASS: PC and IR after HLT");

  if (
    !isValidByte(getRegister("MAR")) ||
    !isValidByte(getRegister("MDR"))
  ) {
    throw new Error("MAR or MDR is out of 8-bit range.");
  }
  Logger.log("PASS: MAR and MDR remain 8-bit");

  Logger.log("=== ALL FOUR REGISTER MICRO-OP TESTS PASSED ===");

  return {
    passed: true,
    microSteps: state.steps,
    registers: {
      AX: getRegister("AX"),
      BX: getRegister("BX"),
      CX: getRegister("CX"),
      DX: getRegister("DX")
    },
    RAM80: Read(0x80),
    flags: {
      ZF: getFlag("ZF"),
      CF: getFlag("CF"),
      SF: getFlag("SF")
    }
  };
}
