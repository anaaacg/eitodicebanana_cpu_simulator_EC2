
/**
 * EitoDiceBanana CPU Simulator
 * Control Unit — Tasks 05, 08, 11 and 12
 *
 * Control Word, buses, ALU and micro-programs.
 * Memory operations use the MMU through VirtualMemory.gs.
 *
 * Task 11: Keyboard input through En_KBD.
 * Task 12: LCD output through Ld_LCD.
 */

// ------------------------------------------------------------
// CONTROL WORD FORMAT
// ------------------------------------------------------------

const CONTROL_WORD_SIGNAL_ORDER = [
  "En_PC", "Ld_PC", "Inc_PC",
  "En_MAR", "Ld_MAR",
  "Mem_R", "Mem_W", "Ld_MDR", "En_MDR",
  "En_IR", "Ld_IR",
  "En_AX", "Ld_AX",
  "En_BX", "Ld_BX",
  "En_CX", "Ld_CX",
  "En_DX", "Ld_DX",
  "En_ALU", "Ld_ALU_A", "Ld_ALU_B", "Ld_FLAGS",
  "En_KBD", "Ld_LCD", "En_IMM"
];

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

// ------------------------------------------------------------
// CONTROL WORD BUILDERS
// ------------------------------------------------------------

function createControlWord_(overrides) {
  const input = overrides || {};
  const suppliedSignals = input.signals || input;
  const signals = {};

  CONTROL_WORD_SIGNAL_ORDER.forEach(function(name) {
    signals[name] = 0;
  });

  CONTROL_WORD_SIGNAL_ORDER.forEach(function(name) {
    if (
      Object.prototype.hasOwnProperty.call(
        suppliedSignals,
        name
      )
    ) {
      const value = suppliedSignals[name];

      if (
        value !== 0 &&
        value !== 1 &&
        value !== false &&
        value !== true
      ) {
        throw new Error(
          "Control signal " + name +
          " must be binary (0 or 1)."
        );
      }

      signals[name] =
        value === 1 || value === true ? 1 : 0;
    }
  });

  Object.keys(suppliedSignals).forEach(function(name) {
    if (
      name !== "signals" &&
      name !== "aluOp" &&
      name !== "ALU_OP" &&
      CONTROL_WORD_SIGNAL_ORDER.indexOf(name) === -1
    ) {
      throw new Error("Unknown control signal: " + name);
    }
  });

  const requestedAluOp =
    input.aluOp || input.ALU_OP || "NONE";

  const aluOpName = String(requestedAluOp)
    .trim()
    .toUpperCase();

  if (
    !Object.prototype.hasOwnProperty.call(
      CONTROL_ALU_OPS,
      aluOpName
    )
  ) {
    throw new Error(
      "Unknown ALU operation in Control Word: " +
      aluOpName
    );
  }

  const word = {
    signals: signals,
    aluOp: aluOpName,
    aluOpCode: CONTROL_ALU_OPS[aluOpName]
  };

  word.binary = controlWordToBinary_(word);

  return word;
}

function controlWordToBinary_(word) {
  if (!word || !word.signals) {
    throw new Error("Invalid Control Word.");
  }

  const signalBits = CONTROL_WORD_SIGNAL_ORDER
    .map(function(name) {
      const value = word.signals[name];

      if (value !== 0 && value !== 1) {
        throw new Error(
          "Invalid bit for control signal " + name
        );
      }

      return String(value);
    })
    .join("");

  const aluCode =
    word.aluOpCode !== undefined
      ? word.aluOpCode
      : CONTROL_ALU_OPS[word.aluOp || "NONE"];

  if (
    !Number.isInteger(aluCode) ||
    aluCode < 0 ||
    aluCode > 15
  ) {
    throw new Error(
      "ALU_OP must fit in four bits."
    );
  }

  return signalBits +
    aluCode.toString(2).padStart(4, "0");
}

function generateControlWord_(microOperation) {
  if (!microOperation) {
    throw new Error(
      "A micro-operation descriptor is required."
    );
  }

  return createControlWord_({
    signals: microOperation.signals || {},
    aluOp:
      microOperation.aluOp ||
      microOperation.ALU_OP ||
      "NONE"
  });
}

function getActiveControlSignals_(word) {
  validateControlWord_(word);

  const active = CONTROL_WORD_SIGNAL_ORDER
    .filter(function(name) {
      return word.signals[name] === 1;
    });

  if (word.aluOp !== "NONE") {
    active.push("ALU_OP=" + word.aluOp);
  }

  return active;
}

// ------------------------------------------------------------
// CONTROL WORD VALIDATION
// ------------------------------------------------------------

function validateControlWord_(word) {
  if (!word || !word.signals) {
    throw new Error(
      "Invalid Control Word: missing signals."
    );
  }

  CONTROL_WORD_SIGNAL_ORDER.forEach(function(name) {
    const value = word.signals[name];

    if (value !== 0 && value !== 1) {
      throw new Error(
        "Control signal " + name + " must be 0 or 1."
      );
    }
  });

  if (
    !Object.prototype.hasOwnProperty.call(
      CONTROL_ALU_OPS,
      word.aluOp
    )
  ) {
    throw new Error(
      "Invalid ALU_OP: " + word.aluOp
    );
  }

  const s = word.signals;

  if (s.Mem_R && s.Mem_W) {
    throw new Error(
      "Mem_R and Mem_W cannot be active together."
    );
  }

  if (
    s.Mem_R &&
    (!s.En_MAR || !s.Ld_MDR)
  ) {
    throw new Error(
      "Mem_R requires En_MAR and Ld_MDR."
    );
  }

  if (
    s.Mem_W &&
    (!s.En_MAR || !s.En_MDR)
  ) {
    throw new Error(
      "Mem_W requires En_MAR and En_MDR."
    );
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
    throw new Error(
      "Ld_PC and Inc_PC cannot be active together."
    );
  }

  if (
    (s.En_ALU || s.Ld_FLAGS) &&
    word.aluOp === "NONE"
  ) {
    throw new Error(
      "En_ALU/Ld_FLAGS requires a valid ALU_OP."
    );
  }

  if (
    word.aluOp !== "NONE" &&
    !(s.En_ALU || s.Ld_FLAGS)
  ) {
    throw new Error(
      "ALU_OP is set but no ALU signal is active."
    );
  }

  // Exactly one transmitter may drive
  // the shared internal bus.
  const internalDrivers =
    CONTROL_UNIT_INTERNAL_DRIVERS.filter(
      function(name) {
        if (name === "En_MDR" && s.Mem_W) {
          return false;
        }

        return s[name] === 1;
      }
    );

  if (internalDrivers.length > 1) {
    throw new Error(
      "Internal bus contention: " +
      internalDrivers.join(", ")
    );
  }

  const activeBusLoads =
    CONTROL_UNIT_INTERNAL_LOADS.filter(
      function(signal) {
        return (
          s[signal] === 1 &&
          !(signal === "Ld_MDR" && s.Mem_R === 1)
        );
      }
    );

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

// ------------------------------------------------------------
// BUS CONTROLLER
// ------------------------------------------------------------

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
          signal +
          " source value is unavailable or invalid."
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
    addSource(
      "En_MDR",
      "MDR",
      getRegister("MDR")
    );
  }

  if (s.En_ALU) {
    addSource(
      "En_ALU",
      "ALU",
      ctx.aluResult
    );
  }

  if (s.En_IMM) {
    addSource(
      "En_IMM",
      "IMMEDIATE",
      ctx.immediate
    );
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

    addSource(
      "En_KBD",
      "KEYBOARD",
      keyboardValue
    );
  }

  if (internalSources.length > 1) {
    throw new Error(
      "Internal bus contention: " +
      internalSources
        .map(function(source) {
          return source.name;
        })
        .join(" and ")
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

  return {
    internal: internalBus,
    address: addressBus,
    data: dataBus
  };
}

// ------------------------------------------------------------
// CONTROLLED ALU
// ------------------------------------------------------------

function calculateControlledALU_(operation, a, b) {
  const op = String(
    operation || "NONE"
  ).toUpperCase();

  if (!isValidByte(a)) {
    throw new Error(
      "ALU operand A must be an 8-bit value."
    );
  }

  if (
    op !== "INC" &&
    op !== "DEC" &&
    op !== "NOT" &&
    !isValidByte(b)
  ) {
    throw new Error(
      "ALU operand B must be an 8-bit value for " +
      op + "."
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

// ------------------------------------------------------------
// EXECUTE ONE MICRO-OPERATION
// ------------------------------------------------------------

function executeMicroOperation_(wordOrStep, context) {
  const step =
    wordOrStep && wordOrStep.controlWord
      ? wordOrStep
      : null;

  const word = step
    ? step.controlWord
    : wordOrStep;

  const ctx = context || {};

  if (step && step.inputs) {
    Object.keys(step.inputs).forEach(function(key) {
      ctx[key] = step.inputs[key];
    });
  }

  validateControlWord_(word);

  const s = word.signals;
  let alu = null;
  let keyboardByte = null;

  // KEYBOARD INPUT
  // En_KBD consumes exactly one byte from FIFO.
  if (s.En_KBD) {
    if (
      typeof keyboardDequeue_ !== "function"
    ) {
      throw new Error(
        "Keyboard peripheral is not installed."
      );
    }

    keyboardByte = keyboardDequeue_();
    ctx.keyboardValue = keyboardByte;
  }

  // ALU
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

  if (s.En_KBD) {
    delete ctx.keyboardValue;
  }

  const internalValue = buses.internal.value;
  const changes = [];

  // MEMORY READ
  if (s.Mem_R) {
    const physicalRegisterAddress =
      getRegister("MAR");

    let memoryValue;

    if (ctx.virtualMemory === true) {
      const virtualAddress =
        Number.isInteger(ctx.virtualAddress)
          ? ctx.virtualAddress
          : physicalRegisterAddress;

      memoryValue =
        readVirtualMemory(virtualAddress);

      changes.push(
        "VIRTUAL RAM[" +
        virtualAddress + "] -> MDR"
      );

    } else {
      memoryValue =
        Read(physicalRegisterAddress);

      changes.push(
        "RAM[" +
        physicalRegisterAddress + "] -> MDR"
      );
    }

    buses.data.value = memoryValue;
    setRegister("MDR", memoryValue);
  }

  // REGISTER LOADS
  if (s.Ld_PC) {
    setRegister("PC", internalValue);
    changes.push("PC <- BUS");
  }

  if (s.Ld_MAR) {
    setRegister("MAR", internalValue);

    if (ctx.virtualMemory === true) {
      const high =
        Number.isInteger(ctx.virtualAddressHigh)
          ? ctx.virtualAddressHigh
          : 0;

      ctx.virtualAddress =
        (high << 8) | getRegister("MAR");

      if (
        !isValidVirtualAddress(
          ctx.virtualAddress
        )
      ) {
        throw new Error(
          "Invalid virtual address in MAR: " +
          ctx.virtualAddress
        );
      }
    }

    changes.push("MAR <- BUS");
  }

  if (s.Ld_IR) {
    setRegister("IR", internalValue);
    changes.push("IR <- BUS");
  }

  ["AX", "BX", "CX", "DX"].forEach(
    function(registerName) {
      const loadSignal =
        CONTROL_UNIT_REGISTER_SIGNALS[
          registerName
        ].load;

      if (s[loadSignal]) {
        setRegister(
          registerName,
          internalValue
        );

        changes.push(
          registerName + " <- BUS"
        );
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
        "Ld_FLAGS is active but no ALU " +
        "result/flags are available."
      );
    }

    setFlag("ZF", ctx.aluFlags.ZF);
    setFlag("CF", ctx.aluFlags.CF);
    setFlag("SF", ctx.aluFlags.SF);

    changes.push("FLAGS <- ALU");
  }

  // LCD OUTPUT — TASK 12
  //
  // Ld_LCD is a receiver.
  // The source register drives the internal bus.
  // LCD.gs writes the exact 8-bit byte into
  // physical video buffer F8h-FFh.
  if (s.Ld_LCD) {
    if (
      internalValue === null ||
      internalValue === undefined ||
      !isValidByte(internalValue)
    ) {
      throw new Error(
        "Ld_LCD requires a valid " +
        "8-bit internal-bus value."
      );
    }

    if (
      typeof lcdWriteByte_ !== "function"
    ) {
      throw new Error(
        "LCD.gs is not installed. " +
        "lcdWriteByte_ is required."
      );
    }

    const transfer =
      lcdWriteByte_(internalValue);

    ctx.lastLCDValue = internalValue;
    ctx.lastLCDPosition = transfer.position;
    ctx.lastLCDAddress =
      transfer.physicalAddress;

    changes.push(
      "LCD[" + transfer.position +
      "] <- " +
      byteToHex_(internalValue) +
      "h via INTERNAL BUS"
    );
  }

  // MEMORY WRITE
  if (s.Mem_W) {
    const physicalRegisterAddress =
      getRegister("MAR");

    const data = getRegister("MDR");

    buses.data.value = data;

    if (ctx.virtualMemory === true) {
      const virtualAddress =
        Number.isInteger(ctx.virtualAddress)
          ? ctx.virtualAddress
          : physicalRegisterAddress;

      writeVirtualMemory(
        virtualAddress,
        data
      );

      changes.push(
        "VIRTUAL RAM[" +
        virtualAddress + "] <- MDR"
      );

    } else {
      Write(
        physicalRegisterAddress,
        data
      );

      changes.push(
        "RAM[" +
        physicalRegisterAddress + "] <- MDR"
      );
    }
  }

  // KEYBOARD TRANSFER DIAGNOSTICS
  if (s.En_KBD) {
    changes.push(
      "KEYBOARD " +
      keyboardByte
        .toString(16)
        .toUpperCase()
        .padStart(2, "0") +
      "h -> INTERNAL BUS"
    );
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

// ------------------------------------------------------------
// MICRO-PROGRAM BUILDERS
// ------------------------------------------------------------

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
 * T0: PC -> MAR and build virtual address.
 * T1: virtual memory -> MDR.
 * T2: MDR -> IR and increment PC.
 */
function getFetchMicroProgram_() {
  return [
    makeMicroStep_(
      "FETCH_T0_PC_TO_MAR",
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
    ),

    makeMicroStep_(
      "FETCH_T1_VIRTUAL_MEMORY_READ",
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
    ),

    makeMicroStep_(
      "FETCH_T2_MDR_TO_IR",
      {
        En_MDR: 1,
        Ld_IR: 1,
        Inc_PC: 1
      }
    )
  ];
}

// ------------------------------------------------------------
// REGISTER HELPERS
// ------------------------------------------------------------

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
    "Invalid register in micro-program: " +
    value
  );
}

function registerEnable_(registerName) {
  return CONTROL_UNIT_REGISTER_SIGNALS[
    registerName
  ].enable;
}

function registerLoad_(registerName) {
  return CONTROL_UNIT_REGISTER_SIGNALS[
    registerName
  ].load;
}

// ------------------------------------------------------------
// INSTRUCTION MICRO-PROGRAM GENERATOR
// ------------------------------------------------------------

function getInstructionMicroProgram_(instruction) {
  if (!instruction || !instruction.type) {
    throw new Error(
      "A decoded instruction is required."
    );
  }

  const type = String(
    instruction.type
  ).toUpperCase();

  const target = instruction.register
    ? controlUnitRegisterName_(
        instruction.register
      )
    : null;

  const steps = [];

  function add(name, signals, options) {
    steps.push(
      makeMicroStep_(
        name,
        signals,
        options
      )
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
          controlUnitRegisterName_(
            instruction.operand
          );

        add(type + "_T1_LOAD_ALU_B", {
          [registerEnable_(source)]: 1,
          Ld_ALU_B: 1
        });

      } else {
        add(
          type + "_T1_LOAD_IMMEDIATE",
          {
            En_IMM: 1,
            Ld_ALU_B: 1
          },
          {
            inputs: {
              immediate: instruction.operand
            }
          }
        );
      }
    }

    const finalSignals = {
      Ld_FLAGS: 1
    };

    if (writeBack) {
      finalSignals.En_ALU = 1;
      finalSignals[
        registerLoad_(target)
      ] = 1;
    }

    add(
      type + "_T_FINAL_ALU_" +
        (writeBack ? "WRITEBACK" : "FLAGS"),
      finalSignals,
      {
        aluOp: operation
      }
    );
  }

  switch (type) {
    case "MOV_IMM":
      add(
        "MOV_IMM_WRITEBACK",
        {
          En_IMM: 1,
          [registerLoad_(target)]: 1
        },
        {
          inputs: {
            immediate: instruction.operand
          }
        }
      );
      break;

    case "MOV_REG": {
      const source =
        controlUnitRegisterName_(
          instruction.operand
        );

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
      add(
        "LOAD_T0_VIRTUAL_ADDRESS_TO_MAR",
        {
          En_IMM: 1,
          Ld_MAR: 1
        },
        {
          inputs: {
            immediate:
              instruction.address & 0xFF,
            virtualMemory: true,
            virtualAddressHigh:
              Math.floor(
                instruction.address / 256
              )
          }
        }
      );

      add(
        "LOAD_T1_VIRTUAL_MEMORY_READ",
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
      );

      add(
        "LOAD_T2_MDR_TO_REGISTER",
        {
          En_MDR: 1,
          [registerLoad_(target)]: 1
        }
      );

      break;

    case "STORE":
      add(
        "STORE_T0_VIRTUAL_ADDRESS_TO_MAR",
        {
          En_IMM: 1,
          Ld_MAR: 1
        },
        {
          inputs: {
            immediate:
              instruction.address & 0xFF,
            virtualMemory: true,
            virtualAddressHigh:
              Math.floor(
                instruction.address / 256
              )
          }
        }
      );

      add(
        "STORE_T1_REGISTER_TO_MDR",
        {
          [registerEnable_(target)]: 1,
          Ld_MDR: 1
        }
      );

      add(
        "STORE_T2_VIRTUAL_MEMORY_WRITE",
        {
          En_MAR: 1,
          En_MDR: 1,
          Mem_W: 1
        },
        {
          inputs: {
            virtualMemory: true
          }
        }
      );

      break;

    case "JMP":
      add(
        "JMP_LOAD_PC",
        {
          En_IMM: 1,
          Ld_PC: 1
        },
        {
          inputs: {
            immediate: instruction.address
          }
        }
      );
      break;

    case "JZ":
      add(
        "JZ_LOAD_PC",
        {
          En_IMM: 1,
          Ld_PC: 1
        },
        {
          inputs: {
            immediate: instruction.address
          },
          condition: "ZF=1"
        }
      );
      break;

    case "JNZ":
      add(
        "JNZ_LOAD_PC",
        {
          En_IMM: 1,
          Ld_PC: 1
        },
        {
          inputs: {
            immediate: instruction.address
          },
          condition: "ZF=0"
        }
      );
      break;

    // TASK 11 — KEYBOARD INPUT
    case "IN":
      add(
        "IN_T0_KEYBOARD_TO_REGISTER",
        {
          En_KBD: 1,
          [registerLoad_(target)]: 1
        }
      );
      break;

    // TASK 12 — LCD OUTPUT
    //
    // Source register -> Internal Bus -> LCD.
    //
    // One active transmitter:
    // En_AX / En_BX / En_CX / En_DX.
    //
    // LCD is a receiver, enabled by Ld_LCD.
    case "OUT":
      add(
        "OUT_T0_REGISTER_TO_LCD",
        {
          [registerEnable_(target)]: 1,
          Ld_LCD: 1
        }
      );
      break;

    case "HLT":
      add(
        "HALT",
        {},
        {
          halt: true
        }
      );
      break;

    default:
      throw new Error(
        "No micro-program defined for instruction: " +
        type
      );
  }

  return steps;
}

// ------------------------------------------------------------
// CONDITIONAL MICRO-OPERATIONS
// ------------------------------------------------------------

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
    "Unknown micro-step condition: " +
    step.condition
  );
}

// ------------------------------------------------------------
// TEST HELPERS
// ------------------------------------------------------------

function assertControlUnit_(condition, message) {
  if (!condition) {
    throw new Error(
      "CONTROL UNIT TEST FAILED: " +
      message
    );
  }
}

// ------------------------------------------------------------
// TEST 1: CONTROL WORD
// ------------------------------------------------------------

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

  assertControlUnit_(
    fetch[1].inputs.virtualMemory === true,
    "FETCH memory read must use virtual memory."
  );

  return {
    passed: true,
    controlWordBits: word.binary.length,
    fetchMicroSteps: fetch.length,
    binary: word.binary
  };
}

// ------------------------------------------------------------
// TEST 2: BUS CONTENTION AND HIGH-Z
// ------------------------------------------------------------

function testControlBusContention() {
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

// ------------------------------------------------------------
// TASK 12: LCD CONTROL SIGNAL AND BUS TEST
// ------------------------------------------------------------

/**
 * Non-destructive:
 * validates the OUT microprogram and bus signals.
 * Does not write to the LCD or modify memory.
 */
function testTask12LCDControlUnit() {
  const registers = [
    "AX", "BX", "CX", "DX"
  ];

  registers.forEach(function(registerName) {
    const program = getInstructionMicroProgram_({
      type: "OUT",
      register: registerName,
      mode: "IO",
      operand: "LCD"
    });

    assertControlUnit_(
      program.length === 1,
      "OUT must execute in one micro-operation."
    );

    const step = program[0];
    const word = step.controlWord;
    const enable =
      CONTROL_UNIT_REGISTER_SIGNALS[
        registerName
      ].enable;

    assertControlUnit_(
      step.name === "OUT_T0_REGISTER_TO_LCD",
      "Incorrect OUT micro-operation name."
    );

    assertControlUnit_(
      word.signals[enable] === 1,
      registerName + " must drive the bus."
    );

    assertControlUnit_(
      word.signals.Ld_LCD === 1,
      "Ld_LCD must be enabled."
    );

    validateControlWord_(word);

    const drivers =
      CONTROL_UNIT_INTERNAL_DRIVERS.filter(
        function(name) {
          return word.signals[name] === 1;
        }
      );

    assertControlUnit_(
      drivers.length === 1 &&
      drivers[0] === enable,
      "OUT must use exactly one transmitter."
    );
  });

  const idleWord = createControlWord_({});
  const idleBuses = resolveControlBuses_(
    idleWord,
    {}
  );

  assertControlUnit_(
    idleBuses.internal.state === "HIGH_Z",
    "Internal bus must remain HIGH_Z when idle."
  );

  assertControlUnit_(
    idleWord.signals.Ld_LCD === 0,
    "Ld_LCD must be disabled when idle."
  );

  let rejectedContention = false;

  try {
    const invalid = createControlWord_({
      signals: {
        En_AX: 1,
        En_BX: 1,
        Ld_LCD: 1
      }
    });

    validateControlWord_(invalid);
  } catch (error) {
    rejectedContention =
      /contention/i.test(error.message);
  }

  assertControlUnit_(
    rejectedContention,
    "LCD transfer must reject two transmitters."
  );

  let rejectedMissingSource = false;

  try {
    const invalid = createControlWord_({
      signals: {
        Ld_LCD: 1
      }
    });

    validateControlWord_(invalid);
  } catch (error) {
    rejectedMissingSource =
      /without transmitter/i.test(
        error.message
      );
  }

  assertControlUnit_(
    rejectedMissingSource,
    "LCD cannot load without a transmitter."
  );

  Logger.log(
    "PASS: OUT microprogram uses a single register transmitter."
  );

  Logger.log(
    "PASS: Ld_LCD is enabled during OUT."
  );

  Logger.log(
    "PASS: Idle bus remains HIGH_Z."
  );

  Logger.log(
    "PASS: Bus contention and missing transmitter rejected."
  );

  Logger.log(
    "=== ALL TASK 12 LCD CONTROL UNIT TESTS PASSED ==="
  );

  return {
    passed: true,
    registersTested: registers.length,
    signal: "Ld_LCD",
    microSteps: 1
  };
}

// ------------------------------------------------------------
// RUN CONTROL UNIT TESTS
// ------------------------------------------------------------

function runControlUnitTests() {
  Logger.log("================================");
  Logger.log("CONTROL UNIT - TASKS 05 / 08 / 11 / 12");
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
      name: "LCD OUTPUT CONTROL",
      fn: testTask12LCDControlUnit
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
