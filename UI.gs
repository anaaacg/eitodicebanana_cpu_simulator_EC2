
/**
 * EitoDiceBanana - UI
 * Phase 1: Visual structure
 *
 * WARNING:
 * setupSimulator() rebuilds the sheets.
 * Run only during initial installation.
 */

function setupSimulator() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  CONFIG.SHEETS.forEach(name => {
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    prepareSheet_(sheet);
  });

  setupHome_();
  setupCPU_();
  setupMemory_();
  setupASM_();
  setupTrace_();
  setupReservedModules_();
  setupTeam_();

  ss.setActiveSheet(ss.getSheetByName("INICIO"));

  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    "EitoDiceBanana instalado correctamente!\n" +
    "Phase 1 interface ready."
  );
}


// ============================================
// GENERAL STYLING
// ============================================

function prepareSheet_(sheet) {
  const C = CONFIG.COLORS;

  sheet.getDataRange().breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();

  const rows = Math.max(sheet.getMaxRows(), 100);
  const columns = Math.max(sheet.getMaxColumns(), 20);

  if (sheet.getMaxRows() < 100) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      100 - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < 20) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      20 - sheet.getMaxColumns()
    );
  }

  sheet.getRange(1, 1, 100, 20)
    .setBackground(C.background)
    .setFontColor(C.white)
    .setFontFamily("Roboto Mono")
    .setFontSize(10)
    .setVerticalAlignment("middle");

  sheet.setHiddenGridlines(true);
  sheet.setColumnWidths(1, 20, 95);
  sheet.setRowHeights(1, 50, 28);
  sheet.setFrozenRows(3);

  sheet.setTabColor(C.yellow);
}


function title_(sheet, title, subtitle) {
  const C = CONFIG.COLORS;

  sheet.getRange("B2:R2").merge()
    .setValue("EitoDiceBanana  /  " + title)
    .setBackground(C.background)
    .setFontColor(C.yellow)
    .setFontSize(19)
    .setFontWeight("bold");

  sheet.getRange("B3:R3").merge()
    .setValue(subtitle)
    .setFontColor(C.muted)
    .setFontSize(10);
}


function section_(sheet, range, text) {
  const C = CONFIG.COLORS;

  sheet.getRange(range)
    .merge()
    .setValue(text)
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(11)
    .setVerticalAlignment("middle");
}


function panel_(sheet, range) {
  const C = CONFIG.COLORS;

  sheet.getRange(range)
    .setBackground(C.panel)
    .setFontColor(C.white);
}


function valueCell_(sheet, cell, value) {
  const C = CONFIG.COLORS;

  sheet.getRange(cell)
    .setValue(value)
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}


// ============================================
// HOME DASHBOARD
// ============================================

function setupHome_() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("INICIO");

  title_(
    s,
    "CPU SIMULATOR",
    "8-BIT COMPUTER ARCHITECTURE | UCB SIS-131"
  );

  section_(s, "B5:R5", "SYSTEM OVERVIEW");

  panel_(s, "B7:R15");

  const data = [
    ["CPU STATUS", "READY"],
    ["ARCHITECTURE", "8-BIT"],
    ["MEMORY", "256 BYTES"],
    ["ACTIVE REGISTERS", "AX / BX"],
    ["RESERVED REGISTERS", "CX / DX"],
    ["EXECUTION PHASE", "FETCH"],
    ["CURRENT MODE", "PHASE 1"]
  ];

  data.forEach((item, i) => {
    const row = 7 + i;

    s.getRange(row, 3)
      .setValue(item[0])
      .setFontColor(CONFIG.COLORS.muted);

    valueCell_(s, "G" + row, item[1]);
  });

  section_(s, "B18:R18", "SIMULATOR MODULES");

  const modules = [
    ["CPU", "ACTIVE"],
    ["MEMORY", "ACTIVE"],
    ["ASSEMBLER", "ACTIVE"],
    ["EXECUTION", "ACTIVE"],
    ["BUSES", "PHASE 2 - PENDING"],
    ["CACHE", "PHASE 2 - PENDING"],
    ["VIRTUAL MEMORY", "PHASE 2 - PENDING"],
    ["INPUT / OUTPUT", "PHASE 2 - PENDING"]
  ];

  modules.forEach((item, i) => {
    const row = 20 + i;

    s.getRange(row, 3).setValue(item[0]);
    valueCell_(s, "G" + row, item[1]);
  });

  section_(s, "B30:R30", "EITODICEBANANA PROJECT");
  s.getRange("B32:R32").merge()
    .setValue("PHASE 1 - FUNCTIONAL CPU FOUNDATION");
}


// ============================================
// CPU DASHBOARD
// ============================================

function setupCPU_() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("CPU");

  title_(
    s,
    "PROCESSOR CORE",
    "8-BIT CPU | REGISTERS | ALU | CONTROL UNIT"
  );

  section_(s, "B5:H5", "CPU REGISTERS");

  const registers = [
    ["PC", "00"],
    ["IR", "00"],
    ["MAR", "00"],
    ["MDR", "00"],
    ["AX", "00"],
    ["BX", "00"],
    ["CX", "00"],
    ["DX", "00"]
  ];

  registers.forEach((item, i) => {
    const row = 7 + i;

    s.getRange(row, 3).setValue(item[0]);
    valueCell_(s, "E" + row, item[1]);

    if (item[0] === "CX" || item[0] === "DX") {
      s.getRange(row, 7)
        .setValue("RESERVED")
        .setFontColor(CONFIG.COLORS.muted);
    }
  });

  section_(s, "J5:R5", "STATUS FLAGS");

  ["ZF", "CF", "SF"].forEach((flag, i) => {
    const row = 7 + i;

    s.getRange(row, 11).setValue(flag);
    valueCell_(s, "N" + row, 0);
  });

  section_(s, "J12:R12", "CONTROL UNIT");

  s.getRange("K14").setValue("CURRENT PHASE");
  valueCell_(s, "N14", "FETCH");

  s.getRange("K16").setValue("CPU STATUS");
  valueCell_(s, "N16", "READY");

  section_(s, "B19:R19", "INSTRUCTION CYCLE");

  const phases = [
    "FETCH",
    "DECODE",
    "EXECUTE",
    "STORE"
  ];

  const positions = ["C21", "G21", "K21", "O21"];

  phases.forEach((phase, i) => {
    valueCell_(s, positions[i], phase);
  });

  section_(s, "B25:R25", "EXECUTION CONTROLS");

  s.getRange("C27").setValue("STEP");
  s.getRange("G27").setValue("RUN");
  s.getRange("K27").setValue("PAUSE");
  s.getRange("O27").setValue("RESET");

  s.getRange("C29").setValue("SPEED");

  s.getRange("G29")
    .setValue("Normal")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(
          ["Lento", "Normal", "Rapido"],
          true
        )
        .build()
    );

  s.getRange("B32:R32").merge()
    .setValue(
      "CONTROLS ARE VISUAL PLACEHOLDERS"
    )
    .setFontColor(CONFIG.COLORS.muted);
}


// ============================================
// PHYSICAL MEMORY
// ============================================

function setupMemory_() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("MEMORIA");

  title_(
    s,
    "MAIN MEMORY",
    "256 BYTE RAM | ADDRESS SPACE 00h - FFh"
  );

  section_(s, "B4:Q4", "MEMORY MATRIX");

  // Address headers
  for (let c = 0; c < 16; c++) {
    s.getRange(5, 2 + c)
      .setValue(c.toString(16).toUpperCase())
      .setFontColor(CONFIG.COLORS.yellow);
  }

  // Memory data: 16 x 16
  const values = Array.from(
    { length: 16 },
    () => Array(16).fill("00")
  );

  s.getRange(6, 2, 16, 16)
    .setValues(values)
    .setBackground(CONFIG.COLORS.panel)
    .setFontColor(CONFIG.COLORS.white)
    .setHorizontalAlignment("center");

  // Row addresses
  for (let r = 0; r < 16; r++) {
    s.getRange(6 + r, 1)
      .setValue(
        (r * 16).toString(16)
          .toUpperCase().padStart(2, "0")
      )
      .setFontColor(CONFIG.COLORS.yellow);
  }

  // Code / Data segmentation
  s.getRange("B6:Q13")
    .setBackground("#29271F");

  s.getRange("B14:Q21")
    .setBackground(CONFIG.COLORS.panel);

  section_(s, "B24:Q24", "MEMORY INSPECTOR");

  ["ADDRESS", "HEX", "BINARY", "DECIMAL", "MNEMONIC"]
    .forEach((label, i) => {
      const row = 26 + i;

      s.getRange(row, 3).setValue(label);
      valueCell_(s, "G" + row, "-");
    });

  s.getRange("B33:Q33").merge()
    .setValue(
      "CODE: 00h-7Fh   |   DATA: 80h-FFh"
    )
    .setFontColor(CONFIG.COLORS.yellow);
}


// ============================================
// ASM EDITOR
// ============================================

function setupASM_() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("ASM");

  title_(
    s,
    "ASSEMBLY EDITOR",
    "WRITE, ASSEMBLE AND LOAD 8-BIT INSTRUCTIONS"
  );

  section_(s, "B5:R5", "PROGRAM EDITOR");

  s.getRange("B7").setValue("LINE");
  s.getRange("D7").setValue("ASM INSTRUCTION");

  for (let i = 0; i < 30; i++) {
    const row = 8 + i;

    s.getRange(row, 2).setValue(i + 1);

    s.getRange(row, 4, 1, 10).merge()
      .setBackground(CONFIG.COLORS.panelAlt);
  }

  s.getRange("D8").setValue("MOV AX, 05h");
  s.getRange("D9").setValue("ADD AX, 03h");
  s.getRange("D10").setValue("HLT");

  section_(s, "B40:R40", "ASSEMBLER STATUS");

  valueCell_(s, "D42", "NOT LOADED");
}


// ============================================
// EXECUTION TRACE
// ============================================

function setupTrace_() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("TRAZA");

  title_(
    s,
    "EXECUTION TRACE",
    "FETCH | DECODE | EXECUTE | STORE"
  );

  const headers = [
    "STEP",
    "PHASE",
    "PC",
    "OPCODE",
    "OPERATION",
    "DETAIL"
  ];

  s.getRange(5, 2, 1, headers.length)
    .setValues([headers])
    .setBackground(CONFIG.COLORS.panelAlt)
    .setFontColor(CONFIG.COLORS.yellow)
    .setFontWeight("bold");

  s.setColumnWidth(6, 340);
  s.setColumnWidth(7, 420);
}


// ============================================
// RESERVED PHASE 2 MODULES
// ============================================

function setupReservedModules_() {
  const modules = [
    ["BUSES", "SYSTEM BUSES", "TRI-STATE BUFFERS"],
    ["CACHE", "CACHE HIERARCHY", "L1I / L1D / L2"],
    ["PAGINAS", "VIRTUAL MEMORY", "PAGING / MMU"],
    ["E-S", "INPUT / OUTPUT", "KEYBOARD / LCD"]
  ];

  modules.forEach(item => {
    const s = SpreadsheetApp.getActive()
      .getSheetByName(item[0]);

    title_(s, item[1], item[2]);

    section_(s, "B6:R6", "PHASE 2 MODULE");

    s.getRange("B9:R11").merge()
      .setValue("NOT IMPLEMENTED - PHASE 2")
      .setBackground(CONFIG.COLORS.panel)
      .setFontColor(CONFIG.COLORS.yellow)
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    s.getRange("B14:R14").merge()
      .setValue(
        "Module reserved for future implementation."
      )
      .setFontColor(CONFIG.COLORS.muted);
  });
}


// ============================================
// TEAM IDENTITY
// ============================================

function setupTeam_() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("EQUIPO");

  title_(
    s,
    "OUR TEAM",
    "EITODICEBANANA | UCB SIS-131"
  );

  section_(s, "B5:R5", "TEAM MEMBERS");

  const members = [
    "Ana Cabrera",
    "Eito Ygei",
    "Eduardo Miranda"
  ];

  members.forEach((name, i) => {
    const row = 8 + i * 3;

    s.getRange(row, 3).setValue(name)
      .setFontColor(CONFIG.COLORS.white)
      .setFontWeight("bold");
  });

  section_(s, "B20:R20", "PROJECT INFORMATION");

  s.getRange("C23").setValue("TEAM");
  valueCell_(s, "G23", "EitoDiceBanana");

  s.getRange("C25").setValue("COURSE");
  valueCell_(s, "G25", "SIS-131");

  s.getRange("C27").setValue("STAGE");
  valueCell_(s, "G27", "CPU FOUNDATION");
}


/**
 * EitoDiceBanana - Automatic CPU Controls
 *
 * Builds styled controls using cells and checkboxes.
 * Does not erase RAM, programs or execution state.
 */

function setupCPUControls() {
  const s = SpreadsheetApp.getActive()
    .getSheetByName("CPU");

  const C = CONFIG.COLORS;

  const controls = [
    {range:"B27:E27", box:"C28", title:"STEP", primary:true},
    {range:"F27:I27", box:"G28", title:"RUN", primary:false},
    {range:"J27:M27", box:"K28", title:"PAUSE", primary:false},
    {range:"N27:Q27", box:"O28", title:"RESET", primary:false}
  ];

  // Consistent dimensions
  s.setColumnWidths(2, 16, 42);
  s.setRowHeight(27, 36);
  s.setRowHeight(28, 34);

  controls.forEach(control => {
    const range = s.getRange(control.range);
    range.breakApart();
    range.merge();

    range
      .setValue(control.title)
      .setBackground(
        control.primary ? C.yellow : C.panelAlt
      )
      .setFontColor(
        control.primary ? C.background : C.white
      )
      .setFontWeight("bold")
      .setFontSize(11)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    const cell = s.getRange(control.box);

    cell.clearDataValidations();
    cell.insertCheckboxes();
    cell.setValue(false);

    cell.setBackground(C.panel)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setNote("Check to execute " + control.title);
  });

  // Speed selector remains in G29
  s.getRange("C29").setValue("SPEED");
  s.getRange("G29")
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow);

  s.getRange("B32:R32")
    .setValue("SELECT A CHECKBOX TO EXECUTE A COMMAND")
    .setFontColor(C.muted);

  SpreadsheetApp.flush();
}

/**
 * Install an authorized edit trigger.
 * Run once during setup.
 */
function installCPUControlTrigger() {
  const ss = SpreadsheetApp.getActive();

  ScriptApp.getProjectTriggers()
    .filter(t =>
      t.getHandlerFunction() === "edbControlOnEdit"
    )
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("edbControlOnEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ss.toast(
    "CPU controls installed",
    "EitoDiceBanana",
    4
  );
}

/**
 * Executes commands when checkboxes are selected.
 */
function edbControlOnEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== "CPU") return;
  if (e.value !== "TRUE") return;

  const actions = {
    C28: "STEP",
    G28: "RUN",
    K28: "PAUSE",
    O28: "RESET"
  };

  const action = actions[range.getA1Notation()];
  if (!action) return;

  // Release the control immediately.
  range.setValue(false);

  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(1000)) {
    e.source.toast("CPU busy", "EitoDiceBanana", 3);
    return;
  }

  try {
    switch (action) {
      case "STEP":
        const state = getExecutionState_();
        if (state.paused) resumeCpu();
        if (!state.halted) stepCpu();
        break;

      case "RUN":
        runCpu();
        break;

      case "PAUSE":
        pauseCpu();
        break;

      case "RESET":
        resetCpu();
        break;
    }

  } catch (error) {
    e.source.toast(
      error.message,
      "CPU ERROR",
      8
    );

  } finally {
    lock.releaseLock();
  }
}


function removeCPUControlTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(trigger =>
      trigger.getHandlerFunction() === "edbControlOnEdit"
    )
    .forEach(trigger =>
      ScriptApp.deleteTrigger(trigger)
    );

  SpreadsheetApp.getActive().toast(
    "Checkbox controls disabled",
    "EitoDiceBanana",
    3
  );
}

function upgradeCPUInterfacePhase2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cpu = ss.getSheetByName("CPU");
  const home = ss.getSheetByName("INICIO");
  const C = CONFIG.COLORS;

  // Activate CX and DX visually.
  ["G13", "G14"].forEach(cell => {
    cpu.getRange(cell)
      .clearContent()
      .setBackground(C.background);
  });

  // Update register information on HOME.
  home.getRange("G10")
    .setValue("AX / BX / CX / DX");

  home.getRange("C11")
    .setValue("GENERAL REGISTERS");

  home.getRange("G11")
    .setValue("4 x 8-BIT");

  home.getRange("G13")
    .setValue("PHASE 2");

  // Refresh registers and flags.
  syncCPUDisplay();

  ss.toast(
    "Four-register CPU interface activated",
    "EitoDiceBanana",
    4
  );
}
