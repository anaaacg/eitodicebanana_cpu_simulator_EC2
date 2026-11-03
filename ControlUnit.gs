/**
 * EitoDiceBanana CPU Simulator
 * Control Unit - Task 05
 *
 * Responsibility:
 * - Build a binary Control Word for each micro-operation.
 * - Validate register Enable/Load and memory control signals.
 * - Resolve the internal, address and external data buses.
 * - Enforce one transmitter per shared bus (inactive = HIGH-Z).
 * - Execute one micro-operation at a time.
 * - Provide FETCH and instruction micro-programs for the current ISA.
 *
 * Integration note:
 * Execution.gs must be connected to:
 * getFetchMicroProgram_()
 * getInstructionMicroProgram_()
 * executeMicroOperation_()
 */

// ============================================================================
// CONTROL WORD FORMAT
// ============================================================================

const CONTROL_WORD_SIGNAL_ORDER = [
  // Program counter and address register
  "En_PC", "Ld_PC", "Inc_PC",
  "En_MAR", "Ld_MAR",

  // Memory and memory data register
  "Mem_R", "Mem_W", "Ld_MDR", "En_MDR",
  "En_IR", "Ld_IR",

  // General-purpose registers
  "En_AX", "Ld_AX",
  "En_BX", "Ld_BX",
  "En_CX", "Ld_CX",
  "En_DX", "Ld_DX",

  // ALU
  "En_ALU", "Ld_ALU_A", "Ld_ALU_B", "Ld_FLAGS",

  // I/O and immediate operand source
  "En_KBD", "Ld_LCD", "En_IMM"
];

/** Four-bit operation codes encoded in the Control Word. */
const CONTROL_ALU_OPS = {
  NONE: 0,
  ADD: 1,
  SUB: 2,
  INC: 3,
  DEC: 4,
  CMP: 5,
  AND: 6,
  OR: 7,
  XOR: 8,
  NOT: 9
};

const CONTROL_UNIT_REGISTER_SIGNALS = {
  AX: { enable: "En_AX", load: "Ld_AX" },
  BX: { enable: "En_BX", load: "Ld_BX" },
  CX: { enable: "En_CX", load: "Ld_CX" },
  DX: { enable: "En_DX", load: "Ld_DX" }
};

const CONTROL_UNIT_INTERNAL_DRIVERS = [
  "En_PC", "En_IR",
  "En_AX", "En_BX", "En_CX", "En_DX",
  "En_MDR", "En_ALU", "En_KBD", "En_IMM"
];

const CONTROL_UNIT_INTERNAL_LOADS = [
  "Ld_PC", "Ld_MAR", "Ld_MDR", "Ld_IR",
  "Ld_AX", "Ld_BX", "Ld_CX", "Ld_DX",
  "Ld_ALU_A", "Ld_ALU_B", "Ld_LCD"
];

// ============================================================================
// CONTROL WORD BUILDERS
// ============================================================================

/**
 * Creates a zero-filled Control Word and applies overrides.
 */
function createControlWord_(overrides) {
  const input = overrides || {};
  const suppliedSignals = input.signals || input;
  const signals = {};

  CONTROL_WORD_SIGNAL_ORDER.forEach(function (name) {
    signals[name] = 0;
  });

  CONTROL_WORD_SIGNAL_ORDER.forEach(function (name) {
    if (Object.prototype.hasOwnProperty.call(suppliedSignals, name)) {
      const value = suppliedSignals[name];

      if (value !== 0 && value !== 1 &&
          value !== false && value !== true) {
        throw new Error(
          "Control signal " + name + " must be binary (0 or 1)."
        );
      }

      signals[name] = value === 1 || value === true ? 1 : 0;
    }
  });

  Object.keys(suppliedSignals).forEach(function (name) {
    if (
      name !== "signals" &&
      name !== "aluOp" &&
      name !== "ALU_OP" &&
      CONTROL_WORD_SIGNAL_ORDER.indexOf(name) === -1
    ) {
      throw new Error("Unknown control signal: " + name);
    }
  });

  const requestedAluOp = input.aluOp || input.ALU_OP || "NONE";
  const aluOpName = String(requestedAluOp).trim().toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(CONTROL_ALU_OPS, aluOpName)) {
    throw new Error("Unknown ALU operation in Control Word: " + aluOpName);
  }

  const word = {
    signals: signals,
    aluOp: aluOpName,
    aluOpCode: CONTROL_ALU_OPS[aluOpName]
  };

  word.binary = controlWordToBinary_(word);
  return word;
}

/** Returns the Control Word as one binary string. */
function controlWordToBinary_(word) {
  if (!word || !word.signals) {
    throw new Error("Invalid Control Word.");
  }

  const signalBits = CONTROL_WORD_SIGNAL_ORDER.map(function (name) {
    const value = word.signals[name];

    if (value !== 0 && value !== 1) {
      throw new Error("Invalid bit for control signal " + name);
    }

    return String(value);
  }).join("");

  const aluCode = word.aluOpCode !== undefined
    ? word.aluOpCode
    : CONTROL_ALU_OPS[word.aluOp || "NONE"];

  if (!Number.isInteger(aluCode) || aluCode < 0 || aluCode > 15) {
    throw new Error("ALU_OP must fit in four bits.");
  }

  return signalBits + aluCode.toString(2).padStart(4, "0");
}

/** Creates a Control Word from a micro-operation descriptor. */
function generateControlWord_(microOperation) {
  if (!microOperation) {
    throw new Error("A micro-operation descriptor is required.");
  }

  return createControlWord_({
    signals: microOperation.signals || {},
    aluOp: microOperation.aluOp || microOperation.ALU_OP || "NONE"
  });
}

/** Returns the currently asserted signals. */
function getActiveControlSignals_(word) {
  validateControlWord_(word);

  const active = CONTROL_WORD_SIGNAL_ORDER.filter(function (name) {
    return word.signals[name] === 1;
  });

  if (word.aluOp !== "NONE") {
    active.push("ALU_OP=" + word.aluOp);
  }

  return active;
}

// ============================================================================
// CONTROL WORD VALIDATION AND BUS CONTENTION
// ============================================================================

function validateControlWord_(word) {
  if (!word || !word.signals) {
    throw new Error("Invalid Control Word: missing signals.");
  }

  CONTROL_WORD_SIGNAL_ORDER.forEach(function (name) {
    const value = word.signals[name];

    if (value !== 0 && value !== 1) {
      throw new Error("Control signal " + name + " must be 0 or 1.");
    }
  });

  if (!Object.prototype.hasOwnProperty.call(CONTROL_ALU_OPS, word.aluOp)) {
    throw new Error("Invalid ALU_OP: " + word.aluOp);
  }

  const s = word.signals;

  if (s.Mem_R && s.Mem_W) {
    throw new Error("Mem_R and Mem_W cannot be active together.");
  }

  if (s.Mem_R && (!s.En_MAR || !s.Ld_MDR)) {
    throw new Error("Mem_R requires En_MAR and Ld_MDR.");
  }

  if (s.Mem_W && (!s.En_MAR || !s.En_MDR)) {
    throw new Error("Mem_W requires En_MAR and En_MDR.");
  }

  if (
    s.Ld_MDR &&
    !s.Mem_R &&
    !s.En_MDR &&
    !s.En_PC &&
    !s.En_AX &&
    !s.En_BX &&
    !s.En_CX &&
    !s.En_DX &&
    !s.En_IR &&
    !s.En_ALU &&
    !s.En_KBD &&
    !s.En_IMM
  ) {
    throw new Error(
      "Ld_MDR requires Mem_R or an active transmitter."
    );
  }

  if (s.Ld_PC && s.Inc_PC) {
    throw new Error("Ld_PC and Inc_PC cannot be active together.");
  }

  if ((s.En_ALU || s.Ld_FLAGS) && word.aluOp === "NONE") {
    throw new Error("En_ALU/Ld_FLAGS requires a valid ALU_OP.");
  }

  if (word.aluOp !== "NONE" && !(s.En_ALU || s.Ld_FLAGS)) {
    throw new Error("ALU_OP is set but no ALU signal is active.");
  }

  const internalDrivers = CONTROL_UNIT_INTERNAL_DRIVERS.filter(
    function (name) {
      if (name === "En_MDR" && s.Mem_W) return false;
      return s[name] === 1;
    }
  );

    // Only one internal bus transmitter is allowed.
  if (internalDrivers.length > 1) {
    throw new Error(
      "Internal bus contention: " +
      internalDrivers.join(", ")
    );
  }

  // Every internal bus receiver requires a source.
  // Memory read is the exception because RAM loads MDR
  // through the external data bus.
  const activeBusLoads =
    CONTROL_UNIT_INTERNAL_LOADS.filter(function(signal) {
      return (
        s[signal] === 1 &&
        !(signal === "Ld_MDR" && s.Mem_R === 1)
      );
    });

  if (
    activeBusLoads.length > 0 &&
    internalDrivers.length === 0
  ) {
    throw new Error(
      "Internal bus load without transmitter: " +
      activeBusLoads.join(", ")
    );
  }

  return true;
}

// ============================================================================
// BUS CONTROLLER
// ============================================================================

function resolveControlBuses_(word, context) {
  validateControlWord_(word);

  const s = word.signals;
  const ctx = context || {};
  const internalSources = [];

  function addSource(signal, name, value) {
    if (s[signal]) {
      if (
        value === undefined ||
        value === null ||
        !isValidByte(value)
      ) {
        throw new Error(
          signal + " source value is unavailable or invalid."
        );
      }

      internalSources.push({
        signal: signal,
        name: name,
        value: value
      });
    }
  }

  addSource("En_PC", "PC", getRegister("PC"));
  addSource("En_IR", "IR", getRegister("IR"));
  addSource("En_AX", "AX", getRegister("AX"));
  addSource("En_BX", "BX", getRegister("BX"));
  addSource("En_CX", "CX", getRegister("CX"));
  addSource("En_DX", "DX", getRegister("DX"));

  if (s.En_MDR && !s.Mem_W) {
    addSource("En_MDR", "MDR", getRegister("MDR"));
  }

  if (s.En_ALU) {
    addSource("En_ALU", "ALU", ctx.aluResult);
  }

  if (s.En_IMM) {
    addSource("En_IMM", "IMMEDIATE", ctx.immediate);
  }

  if (s.En_KBD) {
    let keyboardValue = ctx.keyboardValue;

    if (
      keyboardValue === undefined &&
      Array.isArray(ctx.keyboardQueue)
    ) {
      keyboardValue = ctx.keyboardQueue.length
        ? ctx.keyboardQueue[0]
        : undefined;
    }

    addSource("En_KBD", "KEYBOARD", keyboardValue);
  }

  if (internalSources.length > 1) {
    throw new Error(
      "Internal bus contention: " +
      internalSources.map(function (source) {
        return source.name;
      }).join(" and ")
    );
  }

  const internalBus = internalSources.length
    ? {
        state: "ACTIVE",
        source: internalSources[0].name,
        signal: internalSources[0].signal,
        value: internalSources[0].value
      }
    : {
        state: "HIGH_Z",
        source: null,
        signal: null,
        value: null
      };

  const addressBus = s.En_MAR
    ? {
        state: "ACTIVE",
        source: "MAR",
        value: getRegister("MAR")
      }
    : {
        state: "HIGH_Z",
        source: null,
        value: null
      };

  let dataBus;

  if (s.Mem_R) {
    dataBus = {
      state: "ACTIVE",
      source: "MEMORY",
      value: null
    };
  } else if (s.Mem_W && s.En_MDR) {
    dataBus = {
      state: "ACTIVE",
      source: "MDR",
      value: getRegister("MDR")
    };
  } else {
    dataBus = {
      state: "HIGH_Z",
      source: null,
      value: null
    };
  }

    // Individual tri-state buffer status.
  const buffers = {
    internal: {
      PC: s.En_PC ? "ACTIVE" : "HIGH_Z",
      IR: s.En_IR ? "ACTIVE" : "HIGH_Z",

      AX: s.En_AX ? "ACTIVE" : "HIGH_Z",
      BX: s.En_BX ? "ACTIVE" : "HIGH_Z",
      CX: s.En_CX ? "ACTIVE" : "HIGH_Z",
      DX: s.En_DX ? "ACTIVE" : "HIGH_Z",

      MDR: (s.En_MDR && !s.Mem_W)
        ? "ACTIVE" : "HIGH_Z",

      ALU: s.En_ALU ? "ACTIVE" : "HIGH_Z",
      KBD: s.En_KBD ? "ACTIVE" : "HIGH_Z",
      IMM: s.En_IMM ? "ACTIVE" : "HIGH_Z"
    },

    address: {
      MAR: s.En_MAR ? "ACTIVE" : "HIGH_Z"
    },

    data: {
      MEMORY: s.Mem_R ? "ACTIVE" : "HIGH_Z",

      MDR: (s.Mem_W && s.En_MDR)
        ? "ACTIVE" : "HIGH_Z"
    }
  };

  return {
    internal: internalBus,
    address: addressBus,
    data: dataBus,
    buffers: buffers
  };
}

// ============================================================================
// CONTROLLED ALU
// ============================================================================

function calculateControlledALU_(operation, a, b) {
  const op = String(operation || "NONE").toUpperCase();

  if (!isValidByte(a)) {
    throw new Error("ALU operand A must be an 8-bit value.");
  }

  if (
    op !== "INC" &&
    op !== "DEC" &&
    op !== "NOT" &&
    !isValidByte(b)
  ) {
    throw new Error(
      "ALU operand B must be an 8-bit value for " + op + "."
    );
  }

  let raw;
  let result;
  let carry = 0;

  switch (op) {
    case "ADD":
      raw = a + b;
      result = raw & 0xFF;
      carry = raw > 255 ? 1 : 0;
      break;

    case "SUB":
    case "CMP":
      raw = a - b;
      result = raw & 0xFF;
      carry = raw < 0 ? 1 : 0;
      break;

    case "INC":
      raw = a + 1;
      result = raw & 0xFF;
      carry = raw > 255 ? 1 : 0;
      break;

    case "DEC":
      raw = a - 1;
      result = raw & 0xFF;
      carry = raw < 0 ? 1 : 0;
      break;

    case "AND":
      result = (a & b) & 0xFF;
      break;

    case "OR":
      result = (a | b) & 0xFF;
      break;

    case "XOR":
      result = (a ^ b) & 0xFF;
      break;

    case "NOT":
      result = (~a) & 0xFF;
      break;

    default:
      throw new Error(
        "Unsupported controlled ALU operation: " + op
      );
  }

  return {
    operation: op,
    result: result,
    flags: {
      ZF: result === 0 ? 1 : 0,
      CF: carry,
      SF: (result & 0x80) !== 0 ? 1 : 0
    }
  };
}

// ============================================================================
// EXECUTE ONE MICRO-OPERATION
// ============================================================================

function executeMicroOperation_(wordOrStep, context) {
  const step = wordOrStep && wordOrStep.controlWord
    ? wordOrStep
    : null;

  const word = step ? step.controlWord : wordOrStep;
  const ctx = context || {};

  if (step && step.inputs) {
    Object.keys(step.inputs).forEach(function (key) {
      ctx[key] = step.inputs[key];
    });
  }

  validateControlWord_(word);

  const s = word.signals;
  let alu = null;

  if (word.aluOp !== "NONE") {
    alu = calculateControlledALU_(
      word.aluOp,
      ctx.aluA,
      ctx.aluB === undefined ? 0 : ctx.aluB
    );

    ctx.aluResult = alu.result;
    ctx.aluFlags = alu.flags;
  }

  const buses = resolveControlBuses_(word, ctx);
  const internalValue = buses.internal.value;
  const changes = [];

  // MEMORY READ
  if (s.Mem_R) {
    const address = getRegister("MAR");
    const memoryValue = Read(address);

    buses.data.value = memoryValue;

    setRegister("MDR", memoryValue);
    changes.push("MDR <- RAM[" + address + "]");
  }

  // GENERAL REGISTER LOADS
  if (s.Ld_PC) {
    setRegister("PC", internalValue);
    changes.push("PC <- BUS");
  }

  if (s.Ld_MAR) {
    setRegister("MAR", internalValue);
    changes.push("MAR <- BUS");
  }

  if (s.Ld_IR) {
    setRegister("IR", internalValue);
    changes.push("IR <- BUS");
  }

  ["AX", "BX", "CX", "DX"].forEach(
    function (registerName) {
      const loadSignal =
        CONTROL_UNIT_REGISTER_SIGNALS[registerName].load;

      if (s[loadSignal]) {
        setRegister(registerName, internalValue);
        changes.push(registerName + " <- BUS");
      }
    }
  );

  // MDR LOAD
  if (s.Ld_MDR && !s.Mem_R) {
    setRegister("MDR", internalValue);
    changes.push("MDR <- BUS");
  }

  // ALU OPERANDS
  if (s.Ld_ALU_A) {
    ctx.aluA = internalValue;
    changes.push("ALU_A <- BUS");
  }

  if (s.Ld_ALU_B) {
    ctx.aluB = internalValue;
    changes.push("ALU_B <- BUS");
  }

  // FLAGS
  if (s.Ld_FLAGS) {
    if (!ctx.aluFlags) {
      throw new Error(
        "Ld_FLAGS is active but no ALU result/flags are available."
      );
    }

    setFlag("ZF", ctx.aluFlags.ZF);
    setFlag("CF", ctx.aluFlags.CF);
    setFlag("SF", ctx.aluFlags.SF);

    changes.push("FLAGS <- ALU");
  }

  // LCD OUTPUT
  if (s.Ld_LCD) {
    if (
      internalValue === null ||
      internalValue === undefined
    ) {
      throw new Error(
        "Ld_LCD requires a valid internal-bus value."
      );
    }

    const charCode =
      internalValue >= 32 && internalValue <= 126
        ? internalValue
        : 63;

    ctx.lcdBuffer =
      String(ctx.lcdBuffer || "") +
      String.fromCharCode(charCode);

    ctx.lcdBuffer = ctx.lcdBuffer.slice(-8);
    ctx.lastLCDValue = internalValue;

    changes.push("LCD <- BUS");
  }

  // MEMORY WRITE
  if (s.Mem_W) {
    const address = getRegister("MAR");
    const data = getRegister("MDR");

    buses.data.value = data;

    Write(address, data);

    changes.push("RAM[" + address + "] <- MDR");
  }

  // KEYBOARD INPUT
  if (s.En_KBD) {
    if (
      Array.isArray(ctx.keyboardQueue) &&
      ctx.keyboardQueue.length
    ) {
      ctx.keyboardQueue.shift();
    } else if (ctx.keyboardValue !== undefined) {
      delete ctx.keyboardValue;
    }

    changes.push("KEYBOARD -> BUS");
  }

  // PROGRAM COUNTER INCREMENT
  if (s.Inc_PC) {
    setRegister(
      "PC",
      (getRegister("PC") + 1) & 0xFF
    );

    changes.push("PC <- PC + 1");
  }

  return {
    controlWord: word,
    binary: controlWordToBinary_(word),
    activeSignals: getActiveControlSignals_(word),
    buses: buses,
    changes: changes,
    context: ctx,
    halt: Boolean(step && step.halt),
    description: step
      ? step.name
      : "MICRO_OPERATION"
  };
}

// ============================================================================
// MICRO-PROGRAMS FOR THE CURRENT ISA
// ============================================================================

function makeMicroStep_(name, signals, options) {
  const opts = options || {};

  return {
    name: name,

    controlWord: createControlWord_({
      signals: signals || {},
      aluOp: opts.aluOp || "NONE"
    }),

    inputs: opts.inputs || {},
    condition: opts.condition || null,
    halt: Boolean(opts.halt)
  };
}

/**
 * FETCH:
 * T0: PC -> MAR
 * T1: RAM -> MDR
 * T2: MDR -> IR and increment PC
 */
function getFetchMicroProgram_() {
  return [
    makeMicroStep_("FETCH_T0_PC_TO_MAR", {
      En_PC: 1,
      Ld_MAR: 1
    }),

    makeMicroStep_("FETCH_T1_MEMORY_READ", {
      En_MAR: 1,
      Mem_R: 1,
      Ld_MDR: 1
    }),

    makeMicroStep_("FETCH_T2_MDR_TO_IR", {
      En_MDR: 1,
      Ld_IR: 1,
      Inc_PC: 1
    })
  ];
}

// ============================================================================
// REGISTER HELPERS
// ============================================================================

function controlUnitRegisterName_(value) {
  if (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      CONTROL_UNIT_REGISTER_SIGNALS,
      value.toUpperCase()
    )
  ) {
    return value.toUpperCase();
  }

  const codeMap = {
    0: "AX",
    1: "BX",
    2: "CX",
    3: "DX"
  };

  if (
    Object.prototype.hasOwnProperty.call(
      codeMap,
      value
    )
  ) {
    return codeMap[value];
  }

  throw new Error(
    "Invalid register in micro-program: " + value
  );
}

function registerEnable_(registerName) {
  return CONTROL_UNIT_REGISTER_SIGNALS[registerName].enable;
}

function registerLoad_(registerName) {
  return CONTROL_UNIT_REGISTER_SIGNALS[registerName].load;
}

// ============================================================================
// INSTRUCTION MICRO-PROGRAM GENERATOR
// ============================================================================

function getInstructionMicroProgram_(instruction) {
  if (!instruction || !instruction.type) {
    throw new Error("A decoded instruction is required.");
  }

  const type = String(instruction.type).toUpperCase();

  const target = instruction.register
    ? controlUnitRegisterName_(instruction.register)
    : null;

  const steps = [];

  function add(name, signals, options) {
    steps.push(
      makeMicroStep_(name, signals, options)
    );
  }

  function addALU(operation, writeBack) {
    add(type + "_T0_LOAD_ALU_A", {
      [registerEnable_(target)]: 1,
      Ld_ALU_A: 1
    });

    if (
      operation !== "INC" &&
      operation !== "DEC" &&
      operation !== "NOT"
    ) {
      if (instruction.mode === "REGISTER") {
        const source =
          controlUnitRegisterName_(instruction.operand);

        add(type + "_T1_LOAD_ALU_B", {
          [registerEnable_(source)]: 1,
          Ld_ALU_B: 1
        });
      } else {
        add(type + "_T1_LOAD_IMMEDIATE", {
          En_IMM: 1,
          Ld_ALU_B: 1
        }, {
          inputs: {
            immediate: instruction.operand
          }
        });
      }
    }

    const finalSignals = {
      Ld_FLAGS: 1
    };

    if (writeBack) {
      finalSignals.En_ALU = 1;
      finalSignals[registerLoad_(target)] = 1;
    }

    add(
      type + "_T_FINAL_ALU_" +
      (writeBack ? "WRITEBACK" : "FLAGS"),

      finalSignals,

      { aluOp: operation }
    );
  }

  switch (type) {

    case "MOV_IMM":
      add("MOV_IMM_WRITEBACK", {
        En_IMM: 1,
        [registerLoad_(target)]: 1
      }, {
        inputs: {
          immediate: instruction.operand
        }
      });
      break;

    case "MOV_REG": {
      const source =
        controlUnitRegisterName_(instruction.operand);

      add("MOV_REG_TRANSFER", {
        [registerEnable_(source)]: 1,
        [registerLoad_(target)]: 1
      });

      break;
    }

    case "ADD":
    case "SUB":
    case "AND":
    case "OR":
    case "XOR":
      addALU(type, true);
      break;

    case "CMP":
      addALU(type, false);
      break;

    case "INC":
    case "DEC":
    case "NOT":
      addALU(type, true);
      break;

    case "LOAD":
      add("LOAD_T0_ADDRESS_TO_MAR", {
        En_IMM: 1,
        Ld_MAR: 1
      }, {
        inputs: {
          immediate: instruction.address
        }
      });

      add("LOAD_T1_MEMORY_READ", {
        En_MAR: 1,
        Mem_R: 1,
        Ld_MDR: 1
      });

      add("LOAD_T2_MDR_TO_REGISTER", {
        En_MDR: 1,
        [registerLoad_(target)]: 1
      });

      break;

    case "STORE":
      add("STORE_T0_ADDRESS_TO_MAR", {
        En_IMM: 1,
        Ld_MAR: 1
      }, {
        inputs: {
          immediate: instruction.address
        }
      });

      add("STORE_T1_REGISTER_TO_MDR", {
        [registerEnable_(target)]: 1,
        Ld_MDR: 1
      });

      add("STORE_T2_MDR_TO_MEMORY", {
        En_MAR: 1,
        En_MDR: 1,
        Mem_W: 1
      });

      break;

    case "JMP":
      add("JMP_LOAD_PC", {
        En_IMM: 1,
        Ld_PC: 1
      }, {
        inputs: {
          immediate: instruction.address
        }
      });

      break;

    case "JZ":
      add("JZ_LOAD_PC", {
        En_IMM: 1,
        Ld_PC: 1
      }, {
        inputs: {
          immediate: instruction.address
        },
        condition: "ZF=1"
      });

      break;

    case "JNZ":
      add("JNZ_LOAD_PC", {
        En_IMM: 1,
        Ld_PC: 1
      }, {
        inputs: {
          immediate: instruction.address
        },
        condition: "ZF=0"
      });

      break;

    case "HLT":
      add("HALT", {}, {
        halt: true
      });
      break;

    default:
      throw new Error(
        "No micro-program defined for instruction: " + type
      );
  }

  return steps;
}

// ============================================================================
// CONDITIONAL MICRO-OPERATIONS
// ============================================================================

function shouldExecuteMicroStep_(step) {
  if (!step || !step.condition) {
    return true;
  }

  if (step.condition === "ZF=1") {
    return getFlag("ZF") === 1;
  }

  if (step.condition === "ZF=0") {
    return getFlag("ZF") === 0;
  }

  throw new Error(
    "Unknown micro-step condition: " + step.condition
  );
}

// ============================================================================
// TEST HELPERS
// ============================================================================

function assertControlUnit_(condition, message) {
  if (!condition) {
    throw new Error(
      "CONTROL UNIT TEST FAILED: " + message
    );
  }
}

// ============================================================================
// TEST 1: CONTROL WORD
// ============================================================================

function testControlWordModule() {
  const word = createControlWord_({
    signals: {
      En_PC: 1,
      Ld_MAR: 1
    },
    aluOp: "NONE"
  });

  assertControlUnit_(
    word.binary.length ===
    CONTROL_WORD_SIGNAL_ORDER.length + 4,
    "Incorrect Control Word width"
  );

  assertControlUnit_(
    CONTROL_WORD_SIGNAL_ORDER.length === 26,
    "Expected 26 control signals"
  );
  
  assertControlUnit_(
    word.binary.length === 30,
    "Control Word must contain 30 bits"
  );

  assertControlUnit_(
    word.signals.En_PC === 1,
    "En_PC was not activated"
  );

  assertControlUnit_(
    word.signals.Ld_MAR === 1,
    "Ld_MAR was not activated"
  );

  assertControlUnit_(
    word.signals.Mem_R === 0,
    "Unused bits must default to zero"
  );

  const fetch = getFetchMicroProgram_();

  assertControlUnit_(
    fetch.length === 3,
    "FETCH must contain three micro-steps"
  );

  assertControlUnit_(
    fetch[0].controlWord.signals.En_PC === 1,
    "FETCH T0 must enable PC"
  );

  assertControlUnit_(
    fetch[1].controlWord.signals.Mem_R === 1,
    "FETCH T1 must read memory"
  );

  assertControlUnit_(
    fetch[2].controlWord.signals.Ld_IR === 1,
    "FETCH T2 must load IR"
  );

  return {
    passed: true,
    controlWordBits: word.binary.length,
    fetchMicroSteps: fetch.length,
    binary: word.binary
  };
}

// ============================================================================
// TEST 2: BUS CONTENTION AND HIGH-Z
// ============================================================================

function testControlBusContention() {

  // TEST 1: Reject two simultaneous transmitters.
  let rejectedContention = false;

  try {
    const invalid = createControlWord_({
      signals: {
        En_AX: 1,
        En_BX: 1
      }
    });

    validateControlWord_(invalid);

  } catch (error) {
    rejectedContention =
      /contention/i.test(error.message);
  }

  assertControlUnit_(
    rejectedContention,
    "Two internal transmitters must cause contention"
  );


  // TEST 2: Real HIGH-Z bus resolution.
  const idleWord = createControlWord_({});

  const buses = resolveControlBuses_(
    idleWord,
    {}
  );

  assertControlUnit_(
    buses.internal.state === "HIGH_Z",
    "Internal bus must be HIGH_Z"
  );

  assertControlUnit_(
    buses.address.state === "HIGH_Z",
    "Address bus must be HIGH_Z"
  );

  assertControlUnit_(
    buses.data.state === "HIGH_Z",
    "Data bus must be HIGH_Z"
  );


  // TEST 3: IR must transmit to the internal bus.
  const irWord = createControlWord_({
    signals: {
      En_IR: 1
    }
  });

  const irBus = resolveControlBuses_(
    irWord,
    {}
  );

  assertControlUnit_(
    irBus.internal.state === "ACTIVE",
    "IR must activate the internal bus"
  );

  assertControlUnit_(
    irBus.internal.source === "IR",
    "IR must be the active transmitter"
  );


  // TEST 4: Reject a load with no transmitter.
  let rejectedMissingSource = false;

  try {
    const invalidLoad = createControlWord_({
      signals: {
        Ld_AX: 1
      }
    });

    validateControlWord_(invalidLoad);

  } catch (error) {
    rejectedMissingSource =
      /without transmitter/i.test(error.message);
  }

  assertControlUnit_(
    rejectedMissingSource,
    "A register load without a transmitter must be rejected"
  );


  return {
    passed: true,
    contentionRejected: rejectedContention,
    missingSourceRejected: rejectedMissingSource,

    buses: {
      internal: buses.internal.state,
      address: buses.address.state,
      data: buses.data.state
    },

    irTransmitter: irBus.internal.source
  };
}

function runControlUnitTests() {

  Logger.log("================================");
  Logger.log("CONTROL UNIT - TASK 05");
  Logger.log("STARTING TESTS");
  Logger.log("================================");

  const tests = [
    {
      name: "CONTROL WORD",
      fn: testControlWordModule
    },
    {
      name: "BUS CONTENTION AND HIGH-Z",
      fn: testControlBusContention
    },
    {
      name: "INSTRUCTION MICROPROGRAMS",
      fn: testInstructionMicroProgramCoverage
    },
    {
      name: "KEYBOARD AND LCD SIGNALS",
      fn: testControlUnitPeripheralSignals
    }
  ];

  const failures = [];

  tests.forEach(function(test, index) {

    try {
      const result = test.fn();

      Logger.log(
        "PASS TEST " + (index + 1) +
        ": " + test.name
      );

      Logger.log(
        JSON.stringify(result, null, 2)
      );

    } catch (error) {

      failures.push(
        test.name + ": " + error.message
      );

      Logger.log(
        "FAIL TEST " + (index + 1) +
        ": " + error.message
      );
    }

  });

  Logger.log("================================");

  if (failures.length > 0) {

    Logger.log("CONTROL UNIT TESTS FAILED");

    throw new Error(
      failures.join("\n")
    );
  }

  Logger.log("ALL CONTROL UNIT TESTS PASSED");

  return {
    passed: true,
    totalTests: tests.length
  };
}

function testInstructionMicroProgramCoverage() {
  const instructions = [
    {
      type: "MOV_IMM",
      register: "AX",
      mode: "IMMEDIATE",
      operand: 10
    },
    {
      type: "MOV_REG",
      register: "AX",
      mode: "REGISTER",
      operand: 1
    },
    {
      type: "LOAD",
      register: "AX",
      address: 128
    },
    {
      type: "STORE",
      register: "AX",
      address: 128
    },
    {
      type: "ADD",
      register: "AX",
      mode: "REGISTER",
      operand: 1
    },
    {
      type: "SUB",
      register: "AX",
      mode: "IMMEDIATE",
      operand: 1
    },
    {
      type: "INC",
      register: "AX"
    },
    {
      type: "DEC",
      register: "AX"
    },
    {
      type: "CMP",
      register: "AX",
      mode: "REGISTER",
      operand: 1
    },
    {
      type: "AND",
      register: "AX",
      mode: "REGISTER",
      operand: 1
    },
    {
      type: "OR",
      register: "AX",
      mode: "REGISTER",
      operand: 1
    },
    {
      type: "XOR",
      register: "AX",
      mode: "REGISTER",
      operand: 1
    },
    {
      type: "NOT",
      register: "AX"
    },
    {
      type: "JMP",
      address: 16
    },
    {
      type: "JZ",
      address: 16
    },
    {
      type: "JNZ",
      address: 16
    },
    {
      type: "HLT"
    }
  ];

  const results = [];

  instructions.forEach(function(instruction) {
    const steps = getInstructionMicroProgram_(
      instruction
    );

    assertControlUnit_(
      steps.length > 0,
      instruction.type + " has no micro-operations"
    );

    steps.forEach(function(step) {
      validateControlWord_(step.controlWord);
    });

    results.push({
      instruction: instruction.type,
      microSteps: steps.length
    });
  });

  Logger.log(
    "PASS: All " + instructions.length +
    " instruction micro-programs are valid."
  );

  Logger.log(JSON.stringify(results, null, 2));

  return {
    passed: true,
    instructions: results
  };
}


function testControlUnitPeripheralSignals() {

  // KEYBOARD TEST
  const keyboardContext = {
    keyboardQueue: [65, 66]
  };

  const keyboardStep = makeMicroStep_(
    "TEST_KEYBOARD_READ",
    {
      En_KBD: 1
    }
  );

  const keyboardResult = executeMicroOperation_(
    keyboardStep,
    keyboardContext
  );

  assertControlUnit_(
    keyboardResult.buses.internal.value === 65,
    "Keyboard must transmit its first value"
  );

  assertControlUnit_(
    keyboardContext.keyboardQueue.length === 1,
    "Keyboard must remove the consumed value"
  );


  // LCD TEST
  const lcdContext = {};

  const lcdStep = makeMicroStep_(
    "TEST_LCD_WRITE",
    {
      En_IMM: 1,
      Ld_LCD: 1
    },
    {
      inputs: {
        immediate: 65
      }
    }
  );

  executeMicroOperation_(
    lcdStep,
    lcdContext
  );

  assertControlUnit_(
    lcdContext.lcdBuffer === "A",
    "LCD must receive character A"
  );

  Logger.log(
    "PASS: En_KBD and Ld_LCD"
  );

  return {
    passed: true,
    keyboardConsumed: 65,
    lcdBuffer: lcdContext.lcdBuffer
  };
}
