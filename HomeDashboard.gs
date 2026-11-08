
/**
 * EitoDiceBanana - TASK 18
 * HOME DASHBOARD V11
 *
 * Professional unified interface.
 *
 * Header: fixed rows 1-4.
 * Width: columns B:Y.
 * Upper layout: 70% control / 30% CPU cycle.
 *
 * Uses CONFIG.COLORS.
 * Modifies ONLY INICIO.
 *
 * RUN: setupTask18Home()
 */

const T18 = {
  sheet: "INICIO",
  font: "Roboto Mono",
  rows: 56,
  selector: "B7"
};

// ============================================
// UI HELPERS
// ============================================

function t18Cell(sh, address, value, options = {}) {
  const C = CONFIG.COLORS;
  const r = sh.getRange(address);

  if (r.getNumRows() > 1 || r.getNumColumns() > 1) {
    r.merge();
  }

  r.setBackground(options.bg || C.panel)
    .setFontColor(options.fg || C.white)
    .setFontFamily(T18.font)
    .setFontSize(options.size || 10)
    .setFontWeight(options.bold ? "bold" : "normal")
    .setHorizontalAlignment(options.align || "center")
    .setVerticalAlignment("middle")
    .setWrap(options.wrap === true);

  const cell = r.getCell(1, 1);

  if (typeof value === "string" && value.startsWith("=")) {
    cell.setFormula(value);
  } else {
    cell.setValue(value == null ? "" : value);
  }

  return r;
}

function t18Title(sh, address, text) {
  const C = CONFIG.COLORS;

  return t18Cell(sh, address, text, {
    bg: C.panelAlt,
    fg: C.yellow,
    bold: true,
    size: 11,
    align: "left"
  });
}

function t18Label(sh, address, text) {
  return t18Cell(sh, address, text, {
    bg: CONFIG.COLORS.panel,
    fg: CONFIG.COLORS.muted,
    size: 9,
    align: "left"
  });
}

function t18Value(sh, address, value, opt = {}) {
  const C = CONFIG.COLORS;

  return t18Cell(sh, address, value, {
    bg: C.panelAlt,
    fg: opt.fg || C.yellow,
    size: opt.size || 10,
    bold: true,
    wrap: opt.wrap === true
  });
}

function t18Link(sh, address, tab, label) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const target = ss.getSheetByName(tab);
  const C = CONFIG.COLORS;

  if (!target) {
    return t18Cell(sh, address, "N/A", {
      fg: C.muted,
      bg: C.panelAlt
    });
  }

  const title = label.replace(/"/g, '""');

  return t18Cell(
    sh,
    address,
    '=HYPERLINK("#gid=' + target.getSheetId() +
    '","' + title + '")',
    {
      bg: C.panelAlt,
      fg: C.yellow,
      size: 9,
      bold: true
    }
  );
}

// ============================================
// PROGRAM SELECTOR
// ============================================

function t18RefreshPrograms_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(T18.sheet);
  const catalog = ss.getSheetByName("CATALOGO_ASM");

  if (!sh || !catalog) {
    throw new Error("INICIO or CATALOGO_ASM not found.");
  }

  const programs = getCatalogPrograms_();
  const names = programs.map(p => p.name);

  if (!names.length) {
    throw new Error("The ASM catalog is empty.");
  }

  const selector = sh.getRange(T18.selector);

  selector.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(names, true)
      .setAllowInvalid(false)
      .build()
  );

  const current = String(
    catalog.getRange("D5").getValue() || ""
  );

  selector.setValue(
    names.includes(current) ? current : names[0]
  );
}

function t18HomeOnEdit(e) {
  if (!e || !e.range) return;

  const edited = e.range;

  if (
    edited.getSheet().getName() !== T18.sheet ||
    edited.getRow() !== 7 ||
    edited.getColumn() !== 2
  ) {
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const catalog = ss.getSheetByName("CATALOGO_ASM");
  const home = ss.getSheetByName(T18.sheet);

  if (!catalog || !home) return;

  const selected = String(
    home.getRange(T18.selector).getValue() || ""
  );

  if (!selected) return;

  const previous = catalog.getRange("D5").getValue();

  const lock = LockService.getDocumentLock();

  if (!lock || !lock.tryLock(0)) {
    home.getRange(T18.selector).setValue(previous);

    ss.toast(
      "CPU busy. Pause before changing programs.",
      "EitoDiceBanana",
      5
    );

    return;
  }

  try {
    const programs = getCatalogPrograms_();

    if (!programs.some(p => p.name === selected)) {
      throw new Error("Unknown Assembly program.");
    }

    catalog.getRange("D5").setValue(selected);

    // Copies the program into ASM.
    // Does not execute or load machine code.
    loadSelectedCatalogProgramToASM();

    ss.toast(
      "Program selected. Press LOAD PROGRAM.",
      "EitoDiceBanana",
      4
    );

  } catch (error) {
    catalog.getRange("D5").setValue(previous);
    home.getRange(T18.selector).setValue(previous);

    ss.toast(
      error.message,
      "Program selection error",
      5
    );

  } finally {
    lock.releaseLock();
  }
}

function t18InstallTrigger_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const exists = ScriptApp.getProjectTriggers()
    .some(trigger =>
      trigger.getHandlerFunction() === "t18HomeOnEdit" &&
      trigger.getEventType() === ScriptApp.EventType.ON_EDIT
    );

  if (!exists) {
    ScriptApp.newTrigger("t18HomeOnEdit")
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }
}

// ============================================
// DYNAMIC INDICATORS
// ============================================

function t18Rules(sh) {
  const C = CONFIG.COLORS;
  const rules = [];

  function exact(address, value, bg, fg) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(value)
        .setBackground(bg)
        .setFontColor(fg)
        .setRanges([sh.getRange(address)])
        .build()
    );
  }

  exact("N5:Q5", "READY", C.green, C.background);
  exact("N5:Q5", "HALT", C.red, C.background);
  exact("N5:Q5", "PAUSED", C.yellow, C.background);

  ["H28:L28", "H31:L31", "H34:L34"].forEach(address => {
    exact(address, "ACTIVE", C.green, C.background);
    exact(address, "HIGH_Z", C.panelAlt, C.muted);
  });

  exact("H43:L43", "PAGE_FAULT", C.red, C.background);

  const phases = [
    ["FETCH", "S7:Y9"],
    ["DECODE", "S11:Y13"],
    ["EXECUTE", "S15:Y17"],
    ["STORE", "S19:Y21"]
  ];

  phases.forEach(item => {
    exact(
      item[1],
      "▶ " + item[0],
      C.yellow,
      C.background
    );
  });

  sh.setConditionalFormatRules(rules);
}

// ============================================
// HEADER
// ============================================

function t18BuildHeader_(sh) {
  const C = CONFIG.COLORS;

  sh.setRowHeight(1, 16);
  sh.setRowHeight(2, 52);
  sh.setRowHeight(3, 30);
  sh.setRowHeight(4, 5);

  // Identical structure to the original
  // EitoDiceBanana sheet header.
  t18Cell(
    sh,
    "B2:Y2",
    "EitoDiceBanana  /  COMPUTER ARCHITECTURE",
    {
      bg: C.background,
      fg: C.yellow,
      size: 19,
      bold: true,
      align: "left"
    }
  );

  t18Cell(
    sh,
    "B3:Y3",
    "8-BIT CPU  |  REGISTERS  |  ALU  |  CONTROL UNIT  |  MEMORY",
    {
      bg: C.background,
      fg: C.muted,
      size: 10,
      align: "left"
    }
  );

  sh.getRange("B4:Y4")
    .setBackground(C.border);

  // This is what makes it a real, fixed header.
  sh.setFrozenRows(4);
}

// ============================================
// UPPER LEFT: EXECUTION CONTROLS
// ============================================

function t18BuildControlPanel_(sh) {
  const C = CONFIG.COLORS;

  t18Title(
    sh,
    "B5:M5",
    "EXECUTION CONTROL"
  );

  t18Value(
    sh,
    "N5:Q5",
    '=IFERROR(CPU!N16,"READY")',
    { fg: C.green }
  );

  // Program selector.
  t18Cell(
    sh,
    "B7:Q9",
    "",
    {
      bg: C.panelAlt,
      fg: C.yellow,
      bold: true,
      size: 10,
      wrap: true
    }
  );

  t18RefreshPrograms_();

  // Five placeholders for Google Sheets drawings.
  const buttons = [
    ["B11:C13", "▷\nSTEP", C.yellow, C.background],
    ["E11:F13", "▶\nRUN", C.panelAlt, C.white],
    ["H11:I13", "Ⅱ\nPAUSE", C.panelAlt, C.white],
    ["K11:L13", "↺\nRESET", C.panelAlt, C.white],
    ["N11:Q13", "↓\nLOAD PROGRAM", C.yellow, C.background]
  ];

  buttons.forEach(item => {
    t18Cell(
      sh,
      item[0],
      item[1],
      {
        bg: item[2],
        fg: item[3],
        size: 10,
        bold: true,
        wrap: true
      }
    );
  });

  // Control unit.
  t18Title(
    sh,
    "B15:Q15",
    "CONTROL UNIT"
  );

  t18Label(
    sh,
    "B16:D17",
    "MICRO-OPERATION"
  );

  t18Value(
    sh,
    "E16:Q17",
    '=IFERROR(BUSES!J19,"--")',
    {
      fg: C.white,
      size: 9,
      wrap: true
    }
  );

  t18Label(sh, "B19:D19", "SIGNALS");

  t18Value(
    sh,
    "E19:Q19",
    '=IFERROR(BUSES!J17,"--")',
    {
      fg: C.green,
      size: 9,
      wrap: true
    }
  );

  t18Label(sh, "B21:D21", "CONTROL WORD");

  t18Value(
    sh,
    "E21:Q21",
    '=IFERROR(BUSES!J15,"--")',
    {
      fg: C.yellow,
      size: 9,
      wrap: true
    }
  );
}

// ============================================
// UPPER RIGHT: INSTRUCTION CYCLE
// ============================================

function t18BuildCycle_(sh) {
  const C = CONFIG.COLORS;

  t18Title(
    sh,
    "S5:Y5",
    "CPU INSTRUCTION CYCLE"
  );

  const phases = [
    ["FETCH", "S7:Y9"],
    ["DECODE", "S11:Y13"],
    ["EXECUTE", "S15:Y17"],
    ["STORE", "S19:Y21"]
  ];

  phases.forEach(item => {
    const phase = item[0];

    t18Cell(
      sh,
      item[1],
      '=IF(CPU!N14="' + phase +
        '","▶ ' + phase + '","' + phase + '")',
      {
        bg: C.panelAlt,
        fg: C.muted,
        size: 11,
        bold: true
      }
    );
  });
}

// ============================================
// SYSTEM ARCHITECTURE
// ============================================

function t18BuildArchitecture_(sh) {
  const C = CONFIG.COLORS;

  t18Title(
    sh,
    "B24:Y24",
    "LIVE SYSTEM ARCHITECTURE"
  );

  const panels = [
    "B25:F37",
    "H25:L37",
    "N25:R37",
    "T25:Y37"
  ];

  panels.forEach(address => {
    sh.getRange(address)
      .setBackground(C.panel);
  });

  // ----------------------------------------
  // 01 CPU / ALU
  // ----------------------------------------

  t18Title(sh, "B25:F25", "01  CPU / ALU");

  const registers = [
    [27, "AX", "E11", "BX", "E12"],
    [29, "CX", "E13", "DX", "E14"],
    [31, "PC", "E7", "IR", "E8"],
    [33, "MAR", "E9", "MDR", "E10"]
  ];

  registers.forEach(item => {
    const row = item[0];

    t18Label(sh, "B" + row, item[1]);

    t18Value(
      sh,
      "C" + row,
      '=IFERROR(CPU!' + item[2] + ',"--")'
    );

    t18Label(sh, "D" + row, item[3]);

    t18Value(
      sh,
      "E" + row + ":F" + row,
      '=IFERROR(CPU!' + item[4] + ',"--")'
    );
  });

  t18Label(
    sh,
    "B35:D35",
    "ZF / CF / SF"
  );

  t18Value(
    sh,
    "E35:F35",
    '=IFERROR(CPU!N7&"/"&CPU!N8&"/"&CPU!N9,"--")',
    {
      fg: C.green,
      size: 9
    }
  );

  // ----------------------------------------
  // 02 BUSES
  // ----------------------------------------

  t18Title(sh, "H25:L25", "02  SYSTEM BUSES");

  const buses = [
    [27, 28, "INTERNAL", "D8"],
    [30, 31, "ADDRESS", "D15"],
    [33, 34, "DATA", "D21"]
  ];

  buses.forEach(item => {
    t18Label(
      sh,
      "H" + item[0] + ":L" + item[0],
      item[2]
    );

    t18Value(
      sh,
      "H" + item[1] + ":L" + item[1],
      '=IFERROR(BUSES!' + item[3] + ',"HIGH_Z")',
      { size: 9 }
    );
  });

  t18Label(
    sh,
    "H36:L36",
    "ACTIVE TRANSMITTER"
  );

  t18Value(
    sh,
    "H37:L37",
    '=IFERROR(BUSES!D9,"--")',
    {
      fg: C.white,
      size: 9
    }
  );

  // ----------------------------------------
  // 03 CACHE
  // ----------------------------------------

  t18Title(sh, "N25:R25", "03  CACHE");

  const cacheLevels = [
    [27, 28, "L1I / 8B", 20],
    [30, 31, "L1D / 8B", 21],
    [33, 34, "L2 / 32B", 22]
  ];

  cacheLevels.forEach(item => {
    t18Label(
      sh,
      "N" + item[0] + ":R" + item[0],
      item[2]
    );

    t18Value(
      sh,
      "N" + item[1] + ":R" + item[1],
      '=IFERROR("H "&CACHE!H' + item[3] +
        '&" / M "&CACHE!I' + item[3] + ',"--")',
      {
        fg: C.green,
        size: 9
      }
    );
  });

  t18Label(
    sh,
    "N36:R36",
    "LAST CACHE EVENT"
  );

  t18Value(
    sh,
    "N37:R37",
    '=IFERROR(CACHE!D22,"--")',
    {
      size: 9,
      wrap: true
    }
  );

  // ----------------------------------------
  // 04 MEMORY
  // ----------------------------------------

  t18Title(sh, "T25:Y25", "04  MEMORY");

  t18Label(
    sh,
    "T27:Y27",
    "PHYSICAL RAM"
  );

  t18Value(
    sh,
    "T28:Y28",
    "256 BYTES"
  );

  t18Label(
    sh,
    "T29:Y29",
    "8 FRAMES × 32B"
  );

  t18Label(
    sh,
    "T31:Y31",
    "VIRTUAL MEMORY"
  );

  t18Value(
    sh,
    "T32:Y32",
    "512 BYTES"
  );

  t18Label(
    sh,
    "T33:Y33",
    "16 PAGES × 32B"
  );

  t18Value(
    sh,
    "T35:Y35",
    '=IFERROR(COUNTIF(PAGINAS!D8:D23,1)&" / 16 RESIDENT","--")',
    {
      fg: C.green,
      size: 9
    }
  );

  // Static architectural connections.
  ["G", "M", "S"].forEach(column => {
    t18Cell(
      sh,
      column + "30",
      "→",
      {
        bg: C.background,
        fg: C.yellow,
        size: 15,
        bold: true
      }
    );
  });
}

// ============================================
// PAGING AND PERIPHERALS
// ============================================

function t18BuildSecondary_(sh) {
  const C = CONFIG.COLORS;

  // Backgrounds preserve the same panel height.
  sh.getRange("B39:L45")
    .setBackground(C.panel);

  sh.getRange("N39:Y45")
    .setBackground(C.panel);

  // MMU
  t18Title(
    sh,
    "B39:L39",
    "05  MMU / PAGING"
  );

  t18Label(sh, "B41:G41", "VIRTUAL ADDRESS");

  t18Value(
    sh,
    "H41:L41",
    '=IFERROR(PAGINAS!L8,"--")',
    { size: 9 }
  );

  t18Label(sh, "B42:G42", "VPN → PFN");

  t18Value(
    sh,
    "H42:L42",
    '=IFERROR(PAGINAS!L9&" → "&PAGINAS!L11,"--")',
    { size: 9 }
  );

  t18Label(sh, "B43:G43", "PAGE STATUS");

  t18Value(
    sh,
    "H43:L43",
    '=IFERROR(PAGINAS!L14,"--")',
    { size: 9 }
  );

  t18Label(
    sh,
    "B44:L44",
    "PAGE TABLE / SWAP / PAGE FAULT"
  );

  // PERIPHERALS
  t18Title(
    sh,
    "N39:Y39",
    "06  KEYBOARD / LCD"
  );

  t18Label(
    sh,
    "N41:S41",
    "KEYBOARD INPUT"
  );

  t18Value(
    sh,
    "T41:Y41",
    '=IFERROR(\'E-S\'!D8,"")',
    {
      fg: C.white,
      size: 10
    }
  );

  t18Label(
    sh,
    "N42:S42",
    "LCD 8×1"
  );

  t18Value(
    sh,
    "T42:Y42",
    '=IFERROR(TEXTJOIN("",FALSE,\'E-S\'!B28:I28),"")',
    {
      fg: C.green,
      size: 11
    }
  );

  t18Cell(
    sh,
    "N44:Y44",
    "KEYBOARD  →  CPU  →  LCD",
    {
      bg: C.panelAlt,
      fg: C.yellow,
      size: 9,
      bold: true
    }
  );
}

// ============================================
// NAVIGATION
// ============================================

function t18BuildNavigation_(sh) {
  t18Title(
    sh,
    "B47:Y47",
    "EXPLORE THE SIMULATOR"
  );

  const links = [
    ["B49:E49", "CPU", "CPU"],
    ["F49:I49", "BUSES", "BUSES"],
    ["J49:M49", "CACHE", "CACHE"],
    ["N49:Q49", "MEMORIA", "RAM"],
    ["R49:U49", "PAGINAS", "PAGES"],
    ["V49:Y49", "E-S", "I/O"],

    ["B51:H51", "ASM", "ASM EDITOR"],
    ["J51:Q51", "CATALOGO_ASM", "ASM CATALOG"],
    ["S51:Y51", "TRAZA", "TRACE"]
  ];

  links.forEach(item => {
    t18Link(
      sh,
      item[0],
      item[1],
      item[2]
    );
  });
}

// ============================================
// MAIN SETUP
// ============================================

function setupTask18Home() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const C = CONFIG.COLORS;

  let sh = ss.getSheetByName(T18.sheet);

  if (!sh) {
    sh = ss.insertSheet(T18.sheet, 0);
  }

  // Ensure full A:Z layout.
  if (sh.getMaxColumns() < 26) {
    sh.insertColumnsAfter(
      sh.getMaxColumns(),
      26 - sh.getMaxColumns()
    );
  }

  if (sh.getMaxRows() < T18.rows) {
    sh.insertRowsAfter(
      sh.getMaxRows(),
      T18.rows - sh.getMaxRows()
    );
  }

  // Clear ONLY the INICIO sheet.
  // Break all previous merges first.
  const all = sh.getRange(
    1,
    1,
    sh.getMaxRows(),
    sh.getMaxColumns()
  );

  all.breakApart();
  all.clearContent();
  all.clearFormat();
  all.clearDataValidations();

  all.setBackground(C.background)
    .setFontColor(C.white)
    .setFontFamily(T18.font)
    .setFontSize(10)
    .setVerticalAlignment("middle");

  sh.setConditionalFormatRules([]);
  sh.setHiddenGridlines(true);
  sh.setTabColor(C.yellow);

  // Standard layout for INICIO.
  // Existing CPU and other sheet widths are untouched.
  sh.setColumnWidths(1, 26, 54);
  sh.setColumnWidth(1, 25);
  sh.setColumnWidth(26, 25);

  sh.setRowHeights(1, T18.rows, 28);

  // Consistent spacing between sections.
  [6, 10, 14, 18, 22, 23, 38, 46, 48, 50, 52]
    .forEach(row => {
      sh.setRowHeight(row, 14);
    });

  sh.setRowHeight(5, 34);
  sh.setRowHeight(15, 34);
  sh.setRowHeight(24, 34);
  sh.setRowHeight(39, 34);
  sh.setRowHeight(47, 34);

  // Build each dashboard zone.
  t18BuildHeader_(sh);
  t18BuildControlPanel_(sh);
  t18BuildCycle_(sh);
  t18BuildArchitecture_(sh);
  t18BuildSecondary_(sh);
  t18BuildNavigation_(sh);

  // Dynamic highlights and ASM trigger.
  t18Rules(sh);
  t18InstallTrigger_();

  // Position at the beginning of the sheet.
  ss.setActiveSheet(sh);
  sh.setActiveSelection("B5");

  SpreadsheetApp.flush();

  ss.toast(
    "EitoDiceBanana Home Dashboard updated.",
    "Task 18",
    4
  );

  return true;
}

// ============================================
// OPEN HOME
// ============================================

function openTask18Home() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(T18.sheet);

  if (!sh) {
    throw new Error(
      "INICIO not found. Run setupTask18Home()."
    );
  }

  ss.setActiveSheet(sh);
  sh.setActiveSelection("B5");
}

/**
 * TASK 18 - Live CPU Highlight Synchronization
 *
 * Copies register and flag highlight colors from
 * the original CPU dashboard to INICIO.
 *
 * Does not modify CPU values or execution state.
 */

function t18SyncCPUHighlights_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cpu = ss.getSheetByName("CPU");
  const home = ss.getSheetByName("INICIO");

  if (!cpu || !home) return;

  const registers = [
    ["E11", "C27"],     // AX
    ["E12", "E27:F27"], // BX
    ["E13", "C29"],     // CX
    ["E14", "E29:F29"], // DX
    ["E7",  "C31"],     // PC
    ["E8",  "E31:F31"], // IR
    ["E9",  "C33"],     // MAR
    ["E10", "E33:F33"]  // MDR
  ];

  registers.forEach(function(item) {
    const source = cpu.getRange(item[0]);
    const target = home.getRange(item[1]);

    target
      .setBackground(source.getBackground())
      .setFontColor(source.getFontColor());
  });

  // FLAGS: ZF, CF, SF are grouped in INICIO.
  const flagCells = ["N7", "N8", "N9"];

  const changedFlag = flagCells.some(function(address) {
    return cpu.getRange(address)
      .getBackground()
      .toUpperCase() === CONFIG.COLORS.yellow.toUpperCase();
  });

  home.getRange("E35:F35")
    .setBackground(
      changedFlag
        ? CONFIG.COLORS.yellow
        : CONFIG.COLORS.panelAlt
    )
    .setFontColor(
      changedFlag
        ? CONFIG.COLORS.background
        : CONFIG.COLORS.green
    );

  SpreadsheetApp.flush();
}

/**
 * STEP from the Home Dashboard.
 * Execute one real CPU micro-step, then synchronize
 * the highlights from CPU to INICIO.
 */
function t18HomeStep() {
  uiStep();
  t18SyncCPUHighlights_();
}

/**
 * RESET from the Home Dashboard.
 */
function t18HomeReset() {
  uiReset();
  t18SyncCPUHighlights_();
}

/**
 * LOAD from the Home Dashboard.
 */
function t18HomeLoad() {
  uiLoadProgram();
  t18SyncCPUHighlights_();
}

/**
 * RUN from the Home Dashboard.
 * Synchronizes highlights after RUN returns.
 */
function t18HomeRun() {
  uiRun();
  t18SyncCPUHighlights_();
}

function t18HomeReset() {
  uiReset();
  t18SyncCPUHighlights_();
}

