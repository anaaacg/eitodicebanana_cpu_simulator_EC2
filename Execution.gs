
/**
 * EitoDiceBanana CPU Simulator
 * Execution Engine — Phase 2 / Task 10
 *
 * FETCH -> DECODE -> EXECUTE -> STORE
 * Memory operations use MMU and virtual memory.
 */

const EXECUTION_KEY = "EDB_EXECUTION_STATE";

const EXECUTION_PHASE_CELLS = {
  FETCH: "C21",
  DECODE: "G21",
  EXECUTE: "K21",
  STORE: "O21"
};

// ------------------------------------------------------------
// EXECUTION STATE
// ------------------------------------------------------------

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
    microProgram: null,
    microIndex: 0,
    microContext: {
      instructionBytes: []
    },
    lastInstructionType: "FETCH",
    lastMicroStep: "-",
    lastControlWord: "",
    lastActiveSignals: [],
    lastBuses: {
      internal: {
        state: "HIGH_Z",
        source: null,
        value: null
      },
      address: {
        state: "HIGH_Z",
        source: null,
        value: null
      },
      data: {
        state: "HIGH_Z",
        source: null,
        value: null
      }
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

  if (
    !Object.prototype.hasOwnProperty.call(
      saved,
      "microIndex"
    )
  ) {
    state.phase = "FETCH";
    state.decoded = null;
    state.result = null;
    state.microProgram = null;
    state.microIndex = 0;
    state.microContext = {
      instructionBytes: []
    };
    state.lastInstructionType = "FETCH";
  }

  state.microContext = Object.assign(
    { instructionBytes: [] },
    state.microContext || {}
  );

  if (
    !Array.isArray(
      state.microContext.instructionBytes
    )
  ) {
    state.microContext.instructionBytes = [];
  }

  if (!Array.isArray(state.microProgram)) {
    state.microProgram = null;
  }

  if (
    !Number.isInteger(state.microIndex) ||
    state.microIndex < 0
  ) {
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
  PropertiesService
    .getDocumentProperties()
    .setProperty(
      EXECUTION_KEY,
      JSON.stringify(state)
    );
}

function resetExecutionState() {
  const state = defaultExecutionState_();

  saveExecutionState_(state);

  clearRegisterHighlights();
  clearMemoryHighlight();

  updateExecutionVisuals_(
    state,
    null,
    []
  );

  if (
    typeof updateControlUnitPanel_ ===
    "function"
  ) {
    updateControlUnitPanel_(state);
  }

  return state;
}

// ------------------------------------------------------------
// VISUAL FEEDBACK
// ------------------------------------------------------------

function updateExecutionVisuals_(
  state,
  executedPhase,
  changedFlags
) {
  const sheet = cpuSheet_();
  const C = CONFIG.COLORS;

  Object.keys(EXECUTION_PHASE_CELLS)
    .forEach(function(phase) {
      sheet.getRange(
        EXECUTION_PHASE_CELLS[phase]
      )
        .setBackground(C.panelAlt)
        .setFontColor(C.muted)
        .setFontWeight("bold");
    });

  const visiblePhase =
    executedPhase || state.phase;

  if (
    EXECUTION_PHASE_CELLS[visiblePhase]
  ) {
    sheet.getRange(
      EXECUTION_PHASE_CELLS[visiblePhase]
    )
      .setBackground(C.yellow)
      .setFontColor(C.background)
      .setFontWeight("bold");
  }

  sheet.getRange(CPU_LAYOUT.phase)
    .setValue(visiblePhase)
    .setBackground(C.yellow)
    .setFontColor(C.background);

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

  CONFIG.CPU.flags.forEach(
    function(flag) {
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
    }
  );

  const home = SpreadsheetApp.getActive()
    .getSheetByName("INICIO");

  if (home) {
    home.getRange("G7").setValue(status);
    home.getRange("G12")
      .setValue(visiblePhase);
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
    function(flag) {
      return before[flag] !== getFlag(flag);
    }
  );
}

// ------------------------------------------------------------
// DECODING UTILITIES
// ------------------------------------------------------------

function decodeRegister_(code) {
  const registers = {
    0: "AX",
    1: "BX",
    2: "CX",
    3: "DX"
  };

  if (
    !Object.prototype.hasOwnProperty.call(
      registers,
      code
    )
  ) {
    throw new Error(
      "Invalid register code: " + code
    );
  }

  return registers[code];
}

function instructionTypeFromOpcode_(opcode) {
  const type = Object.keys(ISA).find(
    function(name) {
      return ISA[name].opcode === opcode;
    }
  );

  if (!type) {
    throw new Error(
      "Unknown opcode: " +
      byteToHex_(opcode) + "h"
    );
  }

  return type;
}

/**
 * Decodes operands from MDR/virtual memory.
 *
 * LOAD: opcode, reg, addressHigh, addressLow
 * STORE: opcode, addressHigh, addressLow, reg
 */

function decodeFetchedInstruction_(
  type,
  bytes
) {
  const expectedBytes =
    ISA[type].bytes - 1;

  if (
    !Array.isArray(bytes) ||
    bytes.length !== expectedBytes
  ) {
    throw new Error(
      "Invalid operand byte count for " +
      type +
      ": expected " + expectedBytes +
      ", got " +
      (
        Array.isArray(bytes)
          ? bytes.length
          : "invalid"
      )
    );
  }

  function read(index) {
    const value = bytes[index];

    if (!isValidByte(value)) {
      throw new Error(
        "Invalid instruction byte at operand index " +
        index
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
      ins.register = decodeRegister_(
        read(0)
      );

      if (
        read(1) !==
        ASM_MODES.IMMEDIATE
      ) {
        throw new Error(
          "Invalid MOV immediate mode."
        );
      }

      ins.mode = "IMMEDIATE";
      ins.operand = read(2);
      break;

    case "MOV_REG":
      ins.register = decodeRegister_(
        read(0)
      );

      ins.mode = "REGISTER";
      ins.operand = read(1);

      decodeRegister_(ins.operand);
      break;

    case "LOAD": {
      ins.register = decodeRegister_(
        read(0)
      );

      const addressHigh = read(1);
      const addressLow = read(2);

      ins.address =
        (addressHigh << 8) |
        addressLow;

      if (
        !isValidVirtualAddress(
          ins.address
        )
      ) {
        throw new Error(
          "Invalid LOAD virtual address: " +
          ins.address
        );
      }

      break;
    }

    case "STORE": {
      const addressHigh = read(0);
      const addressLow = read(1);

      ins.address =
        (addressHigh << 8) |
        addressLow;

      ins.register = decodeRegister_(
        read(2)
      );

      if (
        !isValidVirtualAddress(
          ins.address
        )
      ) {
        throw new Error(
          "Invalid STORE virtual address: " +
          ins.address
        );
      }

      break;
    }

    case "INC":
    case "DEC":
    case "NOT":
      ins.register = decodeRegister_(
        read(0)
      );
      break;

    case "ADD":
    case "SUB":
    case "CMP":
    case "AND":
    case "OR":
    case "XOR": {
      ins.register = decodeRegister_(
        read(0)
      );

      const mode = read(1);

      if (
        mode ===
        ASM_MODES.IMMEDIATE
      ) {
        ins.mode = "IMMEDIATE";
      } else if (
        mode ===
        ASM_MODES.REGISTER
      ) {
        ins.mode = "REGISTER";
      } else {
        throw new Error(
          "Invalid addressing mode: " +
          mode
        );
      }

      ins.operand = read(2);

      if (
        ins.mode === "REGISTER"
      ) {
        decodeRegister_(
          ins.operand
        );
      }

      break;
    }

    case "JMP":
    case "JZ":
    case "JNZ":
      ins.address = read(0);
      break;

    case "IN":
      ins.register = decodeRegister_(
        read(0)
      );

      ins.mode = "IO";
      ins.operand = "KBD";
      break;

    case "OUT":
      ins.register = decodeRegister_(
        read(0)
      );

      ins.mode = "IO";
      ins.operand = "LCD";
      break;

    case "HLT":
      break;

    default:
      throw new Error(
        "Unsupported instruction: " +
        type
      );
  }

  return ins;
}

// ------------------------------------------------------------
// DECODE MICRO-PROGRAM
// ------------------------------------------------------------

function getDecodeMicroProgram_(
  byteCount
) {
  const steps = [];

  for (
    let i = 0;
    i < byteCount;
    i++
  ) {
    steps.push(
      makeMicroStep_(
        "DECODE_T" +
        i +
        "_PC_TO_MAR",
        {
          En_PC: 1,
          Ld_MAR: 1
        },
        {
          inputs: {
            virtualMemory: true,
            virtualAddressHigh: 0
          }
        }
      )
    );

    steps.push(
      makeMicroStep_(
        "DECODE_T" +
        i +
        "_VIRTUAL_MEMORY_READ",
        {
          En_MAR: 1,
          Mem_R: 1,
          Ld_MDR: 1
        },
        {
          inputs: {
            virtualMemory: true
          }
        }
      )
    );

    const captureStep = makeMicroStep_(
      "DECODE_T" +
      i +
      "_CAPTURE_BYTE",
      {
        En_MDR: 1,
        Inc_PC: 1
      }
    );

    captureStep.captureInstructionByte =
      true;

    steps.push(captureStep);
  }

  return steps;
}

// ------------------------------------------------------------
// MICRO-PROGRAM PREPARATION
// ------------------------------------------------------------

function prepareCurrentMicroProgram_(state) {
  let guard = 0;

  while (
    !state.microProgram &&
    guard < 5
  ) {
    guard++;
    state.microIndex = 0;

    switch (state.phase) {
      case "FETCH": {
        const pc = getRegister(
          "PC"
        );

        if (
          pc <
            CONFIG.MEMORY.codeStart ||
          pc >
            CONFIG.MEMORY.codeEnd
        ) {
          throw new Error(
            "PC outside code segment: " +
            pc
          );
        }

        state.instructionPC = pc;
        state.decoded = null;
        state.result = null;
        state.lastInstructionType =
          "FETCH";

        state.microContext = {
          instructionBytes: []
        };

        state.microProgram =
          getFetchMicroProgram_();

        break;
      }

      case "DECODE": {
        const type =
          instructionTypeFromOpcode_(
            getRegister("IR")
          );

        const operandCount =
          ISA[type].bytes - 1;

        const pc = getRegister(
          "PC"
        );

        if (
          operandCount > 0 &&
          pc + operandCount - 1 >
            CONFIG.MEMORY.codeEnd
        ) {
          throw new Error(
            "Instruction operands exceed code segment 00h-7Fh."
          );
        }

        state.lastInstructionType =
          type;

        if (
          operandCount === 0
        ) {
          state.decoded =
            decodeFetchedInstruction_(
              type,
              state.microContext
                .instructionBytes
            );

          state.phase = "EXECUTE";
          continue;
        }

        state.microProgram =
          getDecodeMicroProgram_(
            operandCount
          );

        break;
      }

      case "EXECUTE":
        if (!state.decoded) {
          throw new Error(
            "No decoded instruction for execution."
          );
        }

        state.lastInstructionType =
          state.decoded.type;

        state.microProgram =
          getInstructionMicroProgram_(
            state.decoded
          );

        break;

      default:
        throw new Error(
          "Unknown CPU phase: " +
          state.phase
        );
    }
  }

  if (
    !state.microProgram ||
    state.microProgram.length === 0
  ) {
    throw new Error(
      "Could not prepare a valid CPU micro-program."
    );
  }
}

function completeMicroProgram_(
  state,
  completedPhase,
  haltRequested
) {
  state.microProgram = null;
  state.microIndex = 0;

  switch (completedPhase) {
    case "FETCH":
      state.phase = "DECODE";
      break;

    case "DECODE": {
      const type =
        instructionTypeFromOpcode_(
          getRegister("IR")
        );

      state.decoded =
        decodeFetchedInstruction_(
          type,
          state.microContext
            .instructionBytes
        );

      state.lastInstructionType =
        type;

      state.phase = "EXECUTE";
      break;
    }

    case "EXECUTE":
      if (haltRequested) {
        state.halted = true;
      }

      state.phase = "FETCH";
      state.decoded = null;

      state.microContext = {
        instructionBytes: []
      };

      break;

    default:
      throw new Error(
        "Cannot complete CPU phase: " +
        completedPhase
      );
  }
}

// ------------------------------------------------------------
// BUS DISPLAY
// ------------------------------------------------------------

function formatMicroBus_(bus) {
  if (
    !bus ||
    bus.state !== "ACTIVE"
  ) {
    return "HIGH_Z";
  }

  const value =
    bus.value === undefined ||
    bus.value === null
      ? ""
      : " = " +
        byteToHex_(bus.value) +
        "h";

  return (
    bus.source || "BUS"
  ) + value;
}

function highlightMicroStepRegisters_(
  microResult
) {
  const signals = (
    microResult &&
    microResult.controlWord &&
    microResult.controlWord.signals
  ) || {};

  const buses =
    (
      microResult &&
      microResult.buses
    ) || {};

  const internal =
    buses.internal || {};

  const validNames = [
    "PC", "IR", "MAR", "MDR",
    "AX", "BX", "CX", "DX"
  ];

  const senders = [];
  const receivers = [];

  if (
    validNames.indexOf(
      internal.source
    ) !== -1
  ) {
    senders.push(
      internal.source
    );
  }

  if (
    signals.En_MAR === 1
  ) {
    senders.push("MAR");
  }

  if (
    signals.En_MDR === 1 &&
    (
      signals.Mem_W === 1 ||
      signals.IO_W === 1
    )
  ) {
    senders.push("MDR");
  }

  validNames.forEach(
    function(name) {
      if (
        signals["Ld_" + name] === 1
      ) {
        receivers.push(name);
      }
    }
  );

  if (
    signals.Mem_R === 1 &&
    receivers.indexOf(
      "MDR"
    ) === -1
  ) {
    receivers.push("MDR");
  }

  if (
    signals.Inc_PC === 1 &&
    receivers.indexOf(
      "PC"
    ) === -1
  ) {
    receivers.push("PC");
  }

  highlightRegisters(
    Array.from(
      new Set(
        senders.concat(receivers)
      )
    )
  );

  const sheet = cpuSheet_();
  const C = CONFIG.COLORS;

  receivers.forEach(
    function(name) {
      if (
        senders.indexOf(
          name
        ) === -1
      ) {
        sheet.getRange(
          CPU_LAYOUT.registers[name]
        )
          .setBackground(C.green)
          .setFontColor(
            C.background
          );
      }
    }
  );
}

// ------------------------------------------------------------
// EXECUTION TRACE
// ------------------------------------------------------------

function appendExecutionTrace_(
  state,
  phase,
  detail,
  instructionName
) {
  const sheet =
    SpreadsheetApp
      .getActive()
      .getSheetByName(
        "TRAZA"
      );

  if (!sheet) {
    throw new Error(
      "TRAZA sheet not found."
    );
  }

  const row = Math.max(
    6,
    sheet.getLastRow() + 1
  );

  sheet.getRange(
    row,
    2,
    1,
    6
  )
    .setValues([[
      state.steps,
      phase,
      byteToHex_(
        state.instructionPC
      ) + "h",
      byteToHex_(
        getRegister("IR")
      ) + "h",
      instructionName ||
        state.lastInstructionType ||
        "FETCH",
      detail
    ]])
    .setBackground(
      CONFIG.COLORS.panel
    )
    .setFontColor(
      CONFIG.COLORS.white
    );
}

// ------------------------------------------------------------
// CPU STEP
// ------------------------------------------------------------

function stepCpu() {
  const state =
    getExecutionState_();

  if (
    state.halted ||
    state.paused
  ) {
    return state;
  }

  if (
    !state.microProgram ||
    state.microIndex >=
      state.microProgram.length
  ) {
    state.microProgram = null;
    state.microIndex = 0;

    prepareCurrentMicroProgram_(
      state
    );
  }

  const phaseBefore =
    state.phase;

  const flagsBefore =
    snapshotFlags_();

  const microStep =
    state.microProgram[
      state.microIndex
    ];

  if (!microStep) {
    throw new Error(
      "Micro-step not found at index " +
      state.microIndex
    );
  }

  const instructionName =
    state.decoded
      ? state.decoded.type
      : state.lastInstructionType;

  let microResult;

  if (
    shouldExecuteMicroStep_(
      microStep
    )
  ) {
    microResult =
      executeMicroOperation_(
        microStep,
        state.microContext
      );

  } else {
    const idleWord =
      createControlWord_({});

    microResult = {
      controlWord: idleWord,
      binary: idleWord.binary,
      activeSignals: [],
      buses:
        resolveControlBuses_(
          idleWord,
          state.microContext
        ),
      changes: [
        "SKIPPED: " +
        microStep.condition
      ],
      context:
        state.microContext,
      halt: false,
      description:
        microStep.name
    };
  }

  if (
    microStep.captureInstructionByte
  ) {
    state.microContext
      .instructionBytes
      .push(
        getRegister("MDR")
      );
  }

  if (
    microResult.context &&
    microResult.context.aluResult !==
      undefined
  ) {
    state.result =
      microResult.context.aluResult;
  }

  state.lastMicroStep =
    microResult.description;

  state.lastControlWord =
    microResult.binary;

  state.lastActiveSignals =
    microResult.activeSignals;

  state.lastBuses =
    microResult.buses;

  state.lastChanges =
    microResult.changes;

  state.microIndex++;
  state.steps++;

  const completed =
    state.microIndex >=
    state.microProgram.length;

  const displayedPhase =
    phaseBefore === "EXECUTE" &&
    completed
      ? "STORE"
      : phaseBefore;

  if (completed) {
    completeMicroProgram_(
      state,
      phaseBefore,
      microResult.halt
    );
  }

  state.lastPhase =
    displayedPhase;

  const changesText =
    microResult.changes.length > 0
      ? microResult.changes.join(
          " / "
        )
      : "No register changes";

  const detail =
    microResult.description +
    " | CW=" +
    microResult.binary +
    " | " +
    changesText +
    " | INT=" +
    formatMicroBus_(
      microResult.buses.internal
    ) +
    " | ADDR=" +
    formatMicroBus_(
      microResult.buses.address
    ) +
    " | DATA=" +
    formatMicroBus_(
      microResult.buses.data
    );

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
    microResult.controlWord
      .signals.Ld_FLAGS === 1
      ? CONFIG.CPU.flags.slice()
      : changedFlags_(
          flagsBefore
        )
  );

  highlightMicroStepRegisters_(
    microResult
  );

    if (
      typeof updateControlUnitPanel_ ===
      "function"
    ) {
      updateControlUnitPanel_(
        state
      );
    }

    // Keep the BUSES dashboard synchronized with each micro-operation.
    if (
      typeof syncTask11BusesFromExecution_ ===
      "function"
    ) {
      syncTask11BusesFromExecution_(state);
    }

  return state;
}

// ------------------------------------------------------------
// RUN
// ------------------------------------------------------------

function runCpu() {
  // One click runs until HLT/PAUSE or near the Apps Script time limit.
  // A time guard avoids abrupt server termination on lengthy programs.
  const MAX_RUN_MILLISECONDS = 240000;
  const started = Date.now();

  let state = getExecutionState_();
  if (state.halted) return state;

  state.paused = false;
  saveExecutionState_(state);

  const speed = String(
    cpuSheet_().getRange("G29").getValue()
  ).trim().toLowerCase();

  // Apps Script spreadsheet operations already provide visible delay.
  // Avoid the previous 20-step cap and costly half-second sleeps.
  const delays = {
    lento: 350,
    normal: 0,
    rapido: 0,
    "rápido": 0
  };
  const delay = delays[speed] === undefined ? 0 : delays[speed];

  let stepsThisRun = 0;
  while (Date.now() - started < MAX_RUN_MILLISECONDS) {
    state = getExecutionState_();
    if (state.halted || state.paused) break;

    state = stepCpu();
    stepsThisRun++;

    if (state.halted || state.paused) break;

    if (delay > 0) Utilities.sleep(delay);
  }

  // If Apps Script's execution window is nearly exhausted, return safely.
  // The CPU remains resumable with another RUN click.
  if (!state.halted && !state.paused) {
    Logger.log(
      "RUN stopped at safety limit after " + stepsThisRun +
      " micro-steps. Press RUN to continue."
    );
    SpreadsheetApp.getActive().toast(
      "Execution time limit reached; RUN again to continue.",
      "EitoDiceBanana",
      5
    );
  }

  return getExecutionState_();
}

// ------------------------------------------------------------
// PAUSE / RESUME
// ------------------------------------------------------------

function pauseCpu() {
  const state =
    getExecutionState_();

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
  const state =
    getExecutionState_();

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

// ------------------------------------------------------------
// RESET
// ------------------------------------------------------------

function resetCpu() {
  // Restore original physical pages and mapping
  // before resetting PC to 0.
  if (
    typeof resetPagingForCpu_ ===
    "function"
  ) {
    resetPagingForCpu_();
  } else if (
    typeof resetCacheModule ===
    "function"
  ) {
    resetCacheModule();
  }

  resetCPURegisters();
  resetExecutionState();

  // Paging restored the initial RAM image, including the LCD buffer.
  // Reset the LCD cursor and status without overwriting RAM.
  if (typeof lcdResetController_ === "function") {
    lcdResetController_();
  }

  const trace =
    SpreadsheetApp
      .getActive()
      .getSheetByName(
        "TRAZA"
      );

  const lastRow =
    trace.getLastRow();

  if (lastRow >= 6) {
    trace.getRange(
      6,
      2,
      lastRow - 5,
      6
    ).clearContent();
  }

  SpreadsheetApp.flush();
}

// ------------------------------------------------------------
// EXECUTION TESTS
// ------------------------------------------------------------

function testExecutionModule() {
  Logger.log(
    "=== MICRO-OP EXECUTION TEST ==="
  );

  const program =
    assembleProgram([
      "MOV AX, 5",
      "ADD AX, 3",
      "STORE [80h], AX",
      "LOAD BX, [80h]",
      "HLT"
    ]);

  loadProgram(program);
  resetCpu();

  let state =
    getExecutionState_();
  let guard = 0;

  while (
    !state.halted &&
    guard < 350
  ) {
    state = stepCpu();
    guard++;
  }

  if (!state.halted) {
    throw new Error(
      "HLT was not reached within 350 micro-steps."
    );
  }

  if (
    getRegister("AX") !== 8
  ) {
    throw new Error(
      "AX expected 8."
    );
  }

  if (
    getRegister("BX") !== 8
  ) {
    throw new Error(
      "BX expected 8."
    );
  }

  if (
    Read(0x80) !== 8
  ) {
    throw new Error(
      "RAM[80h] expected 8."
    );
  }

  if (
    state.steps !== 62
  ) {
    throw new Error(
      "Expected 62 clock micro-steps, got " +
      state.steps
    );
  }

  Logger.log(
    "PASS: AX = 08h"
  );
  Logger.log(
    "PASS: BX = 08h"
  );
  Logger.log(
    "PASS: RAM[80h] = 08h"
  );
  Logger.log(
    "PASS: 62 clock micro-steps executed"
  );
  Logger.log(
    "PASS: CPU halted"
  );

  return {
    passed: true,
    microSteps: state.steps,
    AX: getRegister("AX"),
    BX: getRegister("BX"),
    RAM80: Read(0x80)
  };
}

function testFlagsDiagnostics() {
  const program =
    assembleProgram([
      "MOV AX, 255",
      "ADD AX, 1",
      "HLT"
    ]);

  loadProgram(program);
  resetCpu();

  Logger.log(
    "=== FLAGS DIAGNOSTICS ==="
  );

  let state =
    getExecutionState_();
  let guard = 0;

  while (
    !state.halted &&
    guard < 100
  ) {
    state = stepCpu();

    Logger.log(
      "STEP " + state.steps +
      " | MICRO=" +
      state.lastMicroStep +
      " | AX=" +
      byteToHex_(
        getRegister("AX")
      ) +
      " | ZF=" +
      getFlag("ZF") +
      " | CF=" +
      getFlag("CF") +
      " | SF=" +
      getFlag("SF")
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
    throw new Error(
      "Flags or ALU micro-operation integration failed."
    );
  }

  return {
    passed: true,
    microSteps: state.steps,
    AX: getRegister("AX"),
    ZF: getFlag("ZF"),
    CF: getFlag("CF"),
    SF: getFlag("SF")
  };
}

// ------------------------------------------------------------
// FOUR REGISTER INTEGRATION TEST
// ------------------------------------------------------------

function testPhase2ExecutionModule() {
  Logger.log(
    "=== FOUR REGISTER MICRO-OP TEST ==="
  );

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

  const program =
    assembleProgram(lines);

  loadProgram(program);
  resetCpu();

  let state =
    getExecutionState_();
  let guard = 0;

  while (
    !state.halted &&
    guard < 550
  ) {
    state = stepCpu();
    guard++;
  }

  if (
    !state.halted ||
    state.steps !== 156
  ) {
    throw new Error(
      "Expected 156 micro-steps and HLT; got " +
      state.steps
    );
  }

  const expected = {
    AX: 0,
    BX: 2,
    CX: 2,
    DX: 2
  };

  Object.keys(expected).forEach(
    function(name) {
      const actual =
        getRegister(name);

      if (
        actual !== expected[name]
      ) {
        throw new Error(
          name +
          " expected " +
          expected[name] +
          ", got " +
          actual
        );
      }
    }
  );

  if (
    Read(0x80) !== 2
  ) {
    throw new Error(
      "RAM[80h] must contain 02h."
    );
  }

  if (
    getFlag("ZF") !== 1 ||
    getFlag("CF") !== 0 ||
    getFlag("SF") !== 0
  ) {
    throw new Error(
      "CMP flags are incorrect."
    );
  }

  if (
    getRegister("IR") !==
      ISA.HLT.opcode ||
    getRegister("PC") !==
      program.length
  ) {
    throw new Error(
      "PC or IR execution state is incorrect."
    );
  }

  if (
    !isValidByte(
      getRegister("MAR")
    ) ||
    !isValidByte(
      getRegister("MDR")
    )
  ) {
    throw new Error(
      "MAR or MDR is out of 8-bit range."
    );
  }

  Logger.log(
    "PASS: 156 clock micro-steps and HLT."
  );
  Logger.log(
    "PASS: AX, BX, CX, DX."
  );
  Logger.log(
    "PASS: Virtual LOAD/STORE through MMU."
  );
  Logger.log(
    "PASS: CMP flags."
  );
  Logger.log(
    "PASS: PC, IR, MAR and MDR."
  );

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

// ------------------------------------------------------------
// TASK 08 CPU PAGE FAULT REGRESSION TEST
// ------------------------------------------------------------

function testTask08CPUPageFaultProgram() {
  Logger.log(
    "=== TASK 08 CPU PAGE FAULT PROGRAM ==="
  );

  const lines = [
    "MOV AX, A5h",
    "STORE [100h], AX",
    "STORE [120h], AX",
    "STORE [140h], AX",
    "STORE [160h], AX",
    "STORE [180h], AX",
    "STORE [1A0h], AX",
    "STORE [1C0h], AX",
    "STORE [1E0h], AX",
    "LOAD BX, [100h]",
    "HLT"
  ];

  const program =
    assembleProgram(lines);

  loadProgram(program);

  let state =
    getExecutionState_();
  let guard = 0;

  while (
    !state.halted &&
    guard < 5000
  ) {
    state = stepCpu();
    guard++;
  }

  if (!state.halted) {
    throw new Error(
      "CPU did not reach HLT. Steps: " +
      state.steps
    );
  }

  if (
    getRegister("BX") !== 0xA5
  ) {
    throw new Error(
      "Swap preservation failed. Expected BX=A5h, got " +
      byteToHex_(
        getRegister("BX")
      ) +
      "h"
    );
  }

  const stats =
    getPagingStatistics();

  if (
    stats.pageFaults < 8
  ) {
    throw new Error(
      "The program did not generate enough Page Faults."
    );
  }

  if (
    stats.replacements < 1
  ) {
    throw new Error(
      "The program did not perform page replacement."
    );
  }

  if (
    stats.swapWrites < 1
  ) {
    throw new Error(
      "No dirty page was written to Swap."
    );
  }

  Logger.log(
    "PASS: CPU reached HLT."
  );
  Logger.log(
    "PASS: Page Faults generated."
  );
  Logger.log(
    "PASS: FIFO replacement executed."
  );
  Logger.log(
    "PASS: Dirty pages written to Swap."
  );
  Logger.log(
    "PASS: BX preserved A5h after Swap."
  );

  return {
    passed: true,
    microSteps: state.steps,
    BX: getRegister("BX"),
    paging: stats
  };
}

// ------------------------------------------------------------
// TASK 12: OUT DECODER TEST (NON-DESTRUCTIVE)
// ------------------------------------------------------------

function testTask12ExecutionOutDecode() {
  const registers = ["AX", "BX", "CX", "DX"];

  registers.forEach(function(name, code) {
    const decoded = decodeFetchedInstruction_("OUT", [code]);

    if (
      decoded.type !== "OUT" ||
      decoded.register !== name ||
      decoded.mode !== "IO" ||
      decoded.operand !== "LCD"
    ) {
      throw new Error("OUT decoder failed for " + name);
    }

    const program = getInstructionMicroProgram_(decoded);
    if (
      program.length !== 1 ||
      program[0].controlWord.signals.Ld_LCD !== 1 ||
      program[0].controlWord.signals["En_" + name] !== 1
    ) {
      throw new Error("OUT microprogram failed for " + name);
    }
  });

  if (instructionTypeFromOpcode_(0x06) !== "OUT") {
    throw new Error("Opcode 06h must decode as OUT.");
  }

  Logger.log("PASS: OUT opcode 06h recognized.");
  Logger.log("PASS: OUT AX/BX/CX/DX operands decoded.");
  Logger.log("PASS: OUT activates Ld_LCD and exactly one transmitter.");
  Logger.log("=== ALL TASK 12 EXECUTION DECODER TESTS PASSED ===");
  return { passed: true, opcode: "06h", registers: 4 };
}
