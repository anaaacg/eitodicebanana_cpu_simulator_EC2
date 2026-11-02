
/**
 * EitoDiceBanana CPU Simulator
 * CPU Registers and Flags - Phase 1
 *
 * Functional: PC, IR, MAR, MDR, AX, BX, ZF, CF, SF
 * Reserved: CX, DX
 *
 * Register values are persisted in DocumentProperties.
 * Google Sheets displays the current state.
 */

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

  const raw = properties.getProperty("EDB_CPU_STATE");

  if (!raw) {
    const state = defaultCPUState_();
    saveCPUState_(state);
    return state;
  }

  return JSON.parse(raw);
}


function saveCPUState_(state) {
  PropertiesService.getDocumentProperties()
    .setProperty(
      "EDB_CPU_STATE",
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
    throw new Error("CPU sheet not found.");
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
  return CONFIG.CPU.activeRegisters.includes(name) ||
    CONFIG.CPU.controlRegisters.includes(name);
}


// ============================================
// REGISTERS
// ============================================

function setRegister(registerName, value) {
  const name = String(registerName).toUpperCase();

  if (!(name in CPU_LAYOUT.registers)) {
    throw new Error("Unknown register: " + name);
  }

  if (!isActiveRegister_(name)) {
    throw new Error(
      "Register " + name +
      " is reserved for Phase 2."
    );
  }

  if (!isValidByte(value)) {
    throw new Error(
      "Invalid 8-bit register value: " + value
    );
  }

  const state = getCPUState_();
  state.registers[name] = value;

  saveCPUState_(state);
  updateRegisterDisplay(name);
}


function getRegister(registerName) {
  const name = String(registerName).toUpperCase();

  if (!(name in CPU_LAYOUT.registers)) {
    throw new Error("Unknown register: " + name);
  }

  if (!isActiveRegister_(name)) {
    throw new Error(
      "Register " + name +
      " is reserved for Phase 2."
    );
  }

  return getCPUState_().registers[name];
}


// ============================================
// FLAGS
// ============================================

function setFlag(flagName, value) {
  const name = String(flagName).toUpperCase();

  if (!(name in CPU_LAYOUT.flags)) {
    throw new Error("Unknown flag: " + name);
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
  const name = String(flagName).toUpperCase();

  if (!(name in CPU_LAYOUT.flags)) {
    throw new Error("Unknown flag: " + name);
  }

  return getCPUState_().flags[name];
}


/**
 * Updates ZF and SF using an 8-bit result.
 */
function updateResultFlags(result) {
  const value = result & 0xFF;

  setFlag("ZF", value === 0 ? 1 : 0);
  setFlag("SF", (value & 0x80) !== 0 ? 1 : 0);
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
  const state = getCPUState_();
  const sheet = cpuSheet_();

  sheet
    .getRange(CPU_LAYOUT.registers[registerName])
    .setNumberFormat("@")
    .setValue(
      registerToHex_(state.registers[registerName])
    );
}


function updateFlagDisplay(flagName) {
  const state = getCPUState_();

  cpuSheet_()
    .getRange(CPU_LAYOUT.flags[flagName])
    .setValue(state.flags[flagName]);
}


function syncCPUDisplay() {
  const state = getCPUState_();

  Object.keys(state.registers).forEach(name => {
    cpuSheet_()
      .getRange(CPU_LAYOUT.registers[name])
      .setNumberFormat("@")
      .setValue(registerToHex_(state.registers[name]));
  });

  Object.keys(state.flags).forEach(name => {
    updateFlagDisplay(name);
  });
}


// ============================================
// HIGHLIGHTING
// ============================================

function clearRegisterHighlights() {
  const sheet = cpuSheet_();

  Object.values(CPU_LAYOUT.registers)
    .forEach(cell => {
      sheet.getRange(cell)
        .setBackground(CONFIG.COLORS.panelAlt)
        .setFontColor(CONFIG.COLORS.yellow);
    });
}


function highlightRegisters(names) {
  clearRegisterHighlights();

  const sheet = cpuSheet_();

  names.forEach(registerName => {
    const name = String(registerName).toUpperCase();
    const cell = CPU_LAYOUT.registers[name];

    if (!cell) {
      throw new Error("Unknown register: " + name);
    }

    sheet.getRange(cell)
      .setBackground(CONFIG.COLORS.yellow)
      .setFontColor(CONFIG.COLORS.background);
  });
}


// ============================================
// CPU RESET
// ============================================

/**
 * Resets registers and flags.
 * Does not erase RAM or loaded programs.
 */
function resetCPURegisters() {
  saveCPUState_(defaultCPUState_());

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
// TESTS
// ============================================

function testCPUModule() {
  Logger.log("=== CPU MODULE TEST ===");

  resetCPURegisters();

  setRegister("AX", 0x25);
  setRegister("BX", 0xFF);
  setRegister("PC", 0x10);

  if (
    getRegister("AX") !== 0x25 ||
    getRegister("BX") !== 0xFF ||
    getRegister("PC") !== 0x10
  ) {
    throw new Error("Register test failed.");
  }

  Logger.log("PASS: Registers AX, BX, PC");

  setFlag("ZF", 1);
  setFlag("CF", 0);
  setFlag("SF", 1);

  if (
    getFlag("ZF") !== 1 ||
    getFlag("CF") !== 0 ||
    getFlag("SF") !== 1
  ) {
    throw new Error("Flag test failed.");
  }

  Logger.log("PASS: Flags ZF, CF, SF");

  updateResultFlags(0);

  if (getFlag("ZF") !== 1 || getFlag("SF") !== 0) {
    throw new Error("Zero flag test failed.");
  }

  Logger.log("PASS: Zero Flag");

  updateResultFlags(0x80);

  if (getFlag("SF") !== 1) {
    throw new Error("Sign flag test failed.");
  }

  Logger.log("PASS: Sign Flag");

  updateCarryFlag(256);

  if (getFlag("CF") !== 1) {
    throw new Error("Carry flag test failed.");
  }

  Logger.log("PASS: Carry Flag");

  let reservedRejected = false;

  try {
    setRegister("CX", 5);
  } catch (error) {
    reservedRejected =
      error.message.includes("reserved");
  }

  if (!reservedRejected) {
    throw new Error(
      "Reserved register CX was accepted."
    );
  }

  Logger.log("PASS: CX reserved");

  highlightRegisters(["PC", "MAR", "MDR", "IR"]);

  Logger.log("PASS: Register highlighting");

  resetCPURegisters();

  Logger.log("=== ALL CPU TESTS PASSED ===");
}
