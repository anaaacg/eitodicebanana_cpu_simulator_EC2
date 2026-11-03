
/**
 * EitoDiceBanana CPU Simulator
 * CPU Registers and Flags - Phase 2
 *
 * General-purpose registers:
 * AX, BX, CX, DX (8 bits each)
 *
 * Control registers:
 * PC, IR, MAR, MDR (8 bits each)
 *
 * Status flags:
 * ZF, CF, SF (1 bit each)
 *
 * State is persisted in DocumentProperties.
 */

// ============================================
// CPU LAYOUT
// ============================================

const CPU_LAYOUT = {
  sheet: "CPU",

  registers: {
    PC: "E7",
    IR: "E8",
    MAR: "E9",
    MDR: "E10",
    AX: "E11",
    BX: "E12",
    CX: "E13",
    DX: "E14"
  },

  flags: {
    ZF: "N7",
    CF: "N8",
    SF: "N9"
  },

  phase: "N14",
  status: "N16"
};

const CPU_STATE_KEY = "EDB_CPU_STATE";

// ============================================
// CPU STATE
// ============================================

function defaultCPUState_() {
  return {
    registers: {
      PC: 0,
      IR: 0,
      MAR: 0,
      MDR: 0,

      AX: 0,
      BX: 0,
      CX: 0,
      DX: 0
    },

    flags: {
      ZF: 0,
      CF: 0,
      SF: 0
    }
  };
}

function getCPUState_() {
  const properties =
    PropertiesService.getDocumentProperties();

  const raw = properties.getProperty(
    CPU_STATE_KEY
  );

  if (!raw) {
    const state = defaultCPUState_();
    saveCPUState_(state);
    return state;
  }

  const saved = JSON.parse(raw);
  const defaults = defaultCPUState_();

  // Preserve existing Phase 1 values while
  // ensuring that all Phase 2 registers exist.
  return {
    registers: {
      ...defaults.registers,
      ...(saved.registers || {})
    },

    flags: {
      ...defaults.flags,
      ...(saved.flags || {})
    }
  };
}

function saveCPUState_(state) {
  PropertiesService.getDocumentProperties()
    .setProperty(
      CPU_STATE_KEY,
      JSON.stringify(state)
    );
}

// ============================================
// UTILITIES
// ============================================

function cpuSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(CPU_LAYOUT.sheet);

  if (!sheet) {
    throw new Error(
      "CPU sheet not found."
    );
  }

  return sheet;
}

function registerToHex_(value) {
  return value
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
}

function isActiveRegister_(name) {
  return (
    CONFIG.CPU.activeRegisters.includes(name) ||
    CONFIG.CPU.controlRegisters.includes(name)
  );
}

function validateCPURegister_(registerName) {
  const name = String(registerName)
    .trim()
    .toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(
    CPU_LAYOUT.registers,
    name
  )) {
    throw new Error(
      "Unknown register: " + name
    );
  }

  if (!isActiveRegister_(name)) {
    throw new Error(
      "Register is not active: " + name
    );
  }

  return name;
}

// ============================================
// REGISTERS
// ============================================

function setRegister(registerName, value) {
  const name = validateCPURegister_(
    registerName
  );

  if (!isValidByte(value)) {
    throw new Error(
      "Invalid 8-bit register value: " +
      value + ". Expected 0-255."
    );
  }

  const state = getCPUState_();

  state.registers[name] = value;

  saveCPUState_(state);
  updateRegisterDisplay(name);

  return value;
}

function getRegister(registerName) {
  const name = validateCPURegister_(
    registerName
  );

  return getCPUState_().registers[name];
}

// ============================================
// FLAGS
// ============================================

function setFlag(flagName, value) {
  const name = String(flagName)
    .trim()
    .toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(
    CPU_LAYOUT.flags,
    name
  )) {
    throw new Error(
      "Unknown flag: " + name
    );
  }

  if (value !== 0 && value !== 1) {
    throw new Error(
      "Flag value must be 0 or 1."
    );
  }

  const state = getCPUState_();

  state.flags[name] = value;

  saveCPUState_(state);
  updateFlagDisplay(name);
}

function getFlag(flagName) {
  const name = String(flagName)
    .trim()
    .toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(
    CPU_LAYOUT.flags,
    name
  )) {
    throw new Error(
      "Unknown flag: " + name
    );
  }

  return getCPUState_().flags[name];
}

// ============================================
// FLAG OPERATIONS
// ============================================

/**
 * Updates ZF and SF using the least
 * significant 8 bits of the result.
 */
function updateResultFlags(result) {
  const value = result & 0xFF;

  setFlag(
    "ZF",
    value === 0 ? 1 : 0
  );

  setFlag(
    "SF",
    (value & 0x80) !== 0 ? 1 : 0
  );
}

/**
 * Updates CF for unsigned arithmetic.
 */
function updateCarryFlag(result) {
  setFlag(
    "CF",
    result > 255 || result < 0 ? 1 : 0
  );
}

// ============================================
// VISUAL UPDATES
// ============================================

function updateRegisterDisplay(registerName) {
  const name = validateCPURegister_(
    registerName
  );

  const state = getCPUState_();

  cpuSheet_()
    .getRange(CPU_LAYOUT.registers[name])
    .setNumberFormat("@")
    .setValue(
      registerToHex_(
        state.registers[name]
      )
    );
}

function updateFlagDisplay(flagName) {
  const name = String(flagName)
    .trim()
    .toUpperCase();

  const state = getCPUState_();

  cpuSheet_()
    .getRange(CPU_LAYOUT.flags[name])
    .setValue(state.flags[name]);
}

function syncCPUDisplay() {
  const state = getCPUState_();
  const sheet = cpuSheet_();

  Object.keys(CPU_LAYOUT.registers)
    .forEach(name => {
      sheet
        .getRange(CPU_LAYOUT.registers[name])
        .setNumberFormat("@")
        .setValue(
          registerToHex_(
            state.registers[name]
          )
        );
    });

  Object.keys(CPU_LAYOUT.flags)
    .forEach(name => {
      sheet
        .getRange(CPU_LAYOUT.flags[name])
        .setValue(
          state.flags[name]
        );
    });
}

// ============================================
// REGISTER HIGHLIGHTING
// ============================================

function clearRegisterHighlights() {
  const sheet = cpuSheet_();

  Object.values(CPU_LAYOUT.registers)
    .forEach(cell => {
      sheet.getRange(cell)
        .setBackground(
          CONFIG.COLORS.panelAlt
        )
        .setFontColor(
          CONFIG.COLORS.yellow
        );
    });
}

function highlightRegisters(names) {
  clearRegisterHighlights();

  const sheet = cpuSheet_();

  names.forEach(registerName => {
    const name = validateCPURegister_(
      registerName
    );

    sheet.getRange(
      CPU_LAYOUT.registers[name]
    )
      .setBackground(
        CONFIG.COLORS.yellow
      )
      .setFontColor(
        CONFIG.COLORS.background
      );
  });
}

// ============================================
// RESET
// ============================================

/**
 * Resets all registers and flags.
 *
 * Does not erase RAM or loaded programs.
 */
function resetCPURegisters() {
  saveCPUState_(
    defaultCPUState_()
  );

  syncCPUDisplay();
  clearRegisterHighlights();

  cpuSheet_()
    .getRange(CPU_LAYOUT.phase)
    .setValue("FETCH");

  cpuSheet_()
    .getRange(CPU_LAYOUT.status)
    .setValue("READY");
}

// ============================================
// PHASE 2 CPU TEST
// ============================================

/**
 * Tests:
 * - Four independent general registers
 * - Control registers
 * - Flags
 * - 8-bit boundaries
 * - Reset
 *
 * This test resets CPU state.
 * It does not delete the RAM program.
 */
function testCPUModule() {
  Logger.log(
    "=== PHASE 2 CPU MODULE TEST ==="
  );

  resetCPURegisters();

  // ----------------------------------------
  // TEST 1: FOUR GENERAL REGISTERS
  // ----------------------------------------

  const values = {
    AX: 10,
    BX: 20,
    CX: 30,
    DX: 40
  };

  Object.keys(values).forEach(name => {
    setRegister(name, values[name]);
  });

  Object.keys(values).forEach(name => {
    if (getRegister(name) !== values[name]) {
      throw new Error(
        name + " value mismatch."
      );
    }
  });

  Logger.log(
    "PASS: AX, BX, CX, DX are independent"
  );

  // ----------------------------------------
  // TEST 2: REGISTER ISOLATION
  // ----------------------------------------

  setRegister("CX", 99);

  if (
    getRegister("AX") !== 10 ||
    getRegister("BX") !== 20 ||
    getRegister("CX") !== 99 ||
    getRegister("DX") !== 40
  ) {
    throw new Error(
      "Register independence test failed."
    );
  }

  Logger.log(
    "PASS: Changing CX does not affect others"
  );

  // ----------------------------------------
  // TEST 3: CONTROL REGISTERS
  // ----------------------------------------

  setRegister("PC", 0x10);
  setRegister("IR", 0x01);
  setRegister("MAR", 0x80);
  setRegister("MDR", 0xAB);

  const controls = {
    PC: 0x10,
    IR: 0x01,
    MAR: 0x80,
    MDR: 0xAB
  };

  Object.keys(controls).forEach(name => {
    if (
      getRegister(name) !== controls[name]
    ) {
      throw new Error(
        "Control register failed: " + name
      );
    }
  });

  Logger.log(
    "PASS: PC, IR, MAR, MDR"
  );

  // ----------------------------------------
  // TEST 4: STATUS FLAGS
  // ----------------------------------------

  setFlag("ZF", 1);
  setFlag("CF", 0);
  setFlag("SF", 1);

  if (
    getFlag("ZF") !== 1 ||
    getFlag("CF") !== 0 ||
    getFlag("SF") !== 1
  ) {
    throw new Error(
      "Flag test failed."
    );
  }

  Logger.log(
    "PASS: ZF, CF, SF"
  );

  // ----------------------------------------
  // TEST 5: FLAG CALCULATIONS
  // ----------------------------------------

  updateResultFlags(0);

  if (
    getFlag("ZF") !== 1 ||
    getFlag("SF") !== 0
  ) {
    throw new Error(
      "Zero flag failed."
    );
  }

  updateResultFlags(0x80);

  if (getFlag("SF") !== 1) {
    throw new Error(
      "Sign flag failed."
    );
  }

  updateCarryFlag(256);

  if (getFlag("CF") !== 1) {
    throw new Error(
      "Carry flag failed."
    );
  }

  Logger.log(
    "PASS: ZF, CF, SF calculations"
  );

  // ----------------------------------------
  // TEST 6: 8-BIT BOUNDARIES
  // ----------------------------------------

  [
    "AX", "BX", "CX", "DX"
  ].forEach(name => {
    setRegister(name, 0);
    setRegister(name, 255);

    if (getRegister(name) !== 255) {
      throw new Error(
        "8-bit upper bound failed: " + name
      );
    }

    const invalidValues = [
      -1, 256, 1.5
    ];

    invalidValues.forEach(value => {
      let rejected = false;

      try {
        setRegister(name, value);
      } catch (error) {
        rejected = true;
      }

      if (!rejected) {
        throw new Error(
          name + " accepted invalid value: " +
          value
        );
      }
    });
  });

  Logger.log(
    "PASS: 8-bit limits (0-255)"
  );

  // ----------------------------------------
  // TEST 7: VISUAL DISPLAY
  // ----------------------------------------

  const sheet = cpuSheet_();

  [
    "AX", "BX", "CX", "DX"
  ].forEach(name => {
    const expected = registerToHex_(
      getRegister(name)
    );

    const displayed = sheet
      .getRange(CPU_LAYOUT.registers[name])
      .getDisplayValue();

    if (displayed !== expected) {
      throw new Error(
        name + " display mismatch."
      );
    }
  });

  Logger.log(
    "PASS: Four-register visual display"
  );

  // ----------------------------------------
  // TEST 8: HIGHLIGHTING
  // ----------------------------------------

  highlightRegisters([
    "AX", "BX", "CX", "DX"
  ]);

  Logger.log(
    "PASS: Four-register highlighting"
  );

  // ----------------------------------------
  // TEST 9: RESET
  // ----------------------------------------

  resetCPURegisters();

  [
    "PC", "IR", "MAR", "MDR",
    "AX", "BX", "CX", "DX"
  ].forEach(name => {
    if (getRegister(name) !== 0) {
      throw new Error(
        "Reset failed: " + name
      );
    }
  });

  Logger.log(
    "PASS: Register reset"
  );

  Logger.log(
    "=== ALL PHASE 2 CPU TESTS PASSED ==="
  );
}
