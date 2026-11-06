
/**
 * EitoDiceBanana CPU Simulator
 * Task 14 — Three-Program ASM Catalog
 *
 * Persistent program catalog stored in the CATALOGO_ASM sheet.
 * Selecting a program copies its source into ASM!D8:D37.
 *
 * IMPORTANT:
 * - The catalog is the source of truth.
 * - The ASM editor receives an independent copy.
 * - This module never calls setupSimulator() and never clears
 *   the existing simulator sheets.
 */

// ============================================================
// CONFIGURATION
// ============================================================

const PROGRAM_CATALOG_CONFIG = {
  sheetName: "CATALOGO_ASM",
  selectorCell: "D5",
  headerRow: 10,
  firstDataRow: 11,
  editorRange: "D8:D37",
  machineCodeRange: "O8:O37",
  statusCell: "D42",
  activeProgramProperty: "EDB_ACTIVE_CATALOG_PROGRAM",
  maxEditorLines: 30
};

// ============================================================
// INITIAL PROGRAMS
// These are seeded into the sheet only when their IDs are absent.
// Editing the sheet does not change these definitions.
// ============================================================

const PROGRAM_CATALOG_SEED_ = [
  {
    id: "TASK14_ARITHMETIC_LOOPS",
    name: "Program 1 - Arithmetic and Loops",
    description: "Uses AX, BX, CX and DX in an arithmetic loop. Calculates 2 x 5 and stores the result at virtual address 120h.",
    lines: [
      "; PROGRAM 1: ARITHMETIC AND LOOPS",
      "; AX accumulates the sum, BX is the increment,",
      "; CX is the loop counter and DX counts iterations.",
      "MOV AX, 00h",
      "MOV BX, 02h",
      "MOV CX, 05h",
      "MOV DX, 00h",
      "LOOP:",
      "ADD AX, BX",
      "INC DX",
      "DEC CX",
      "JNZ LOOP",
      "STORE [120h], AX",
      "HLT"
    ]
  },
  {
    id: "TASK14_KEYBOARD_LCD",
    name: "Program 2 - Keyboard to LCD Echo",
    description: "Reads eight characters from the keyboard FIFO and sends them in order to the 8x1 LCD. Preload EITO2026 before execution.",
    lines: [
      "; PROGRAM 2: KEYBOARD TO LCD ECHO",
      "; Preload the keyboard FIFO with: EITO2026",
      "IN AX, [KBD]",
      "OUT [LCD], AX",
      "IN BX, [KBD]",
      "OUT [LCD], BX",
      "IN CX, [KBD]",
      "OUT [LCD], CX",
      "IN DX, [KBD]",
      "OUT [LCD], DX",
      "IN AX, [KBD]",
      "OUT [LCD], AX",
      "IN BX, [KBD]",
      "OUT [LCD], BX",
      "IN CX, [KBD]",
      "OUT [LCD], CX",
      "IN DX, [KBD]",
      "OUT [LCD], DX",
      "HLT"
    ]
  },
  {
    id: "TASK14_SCATTERED_MEMORY",
    name: "Program 3 - Scattered Memory Access",
    description: "Writes to virtual pages 8, 10, 12 and 14, then reads page 8. Demonstrates page faults, FIFO replacement and cache misses.",
    lines: [
      "; PROGRAM 3: SCATTERED MEMORY ACCESS",
      "; The following addresses belong to different virtual pages:",
      "; 100h = VPN 8 | 140h = VPN 10",
      "; 180h = VPN 12 | 1C0h = VPN 14",
      "MOV AX, A5h",
      "STORE [100h], AX",
      "STORE [140h], AX",
      "STORE [180h], AX",
      "STORE [1C0h], AX",
      "LOAD DX, [100h]",
      "HLT"
    ]
  }
];

// ============================================================
// SHEET ACCESS
// ============================================================

function programCatalogSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PROGRAM_CATALOG_CONFIG.sheetName);

  if (!sheet) {
    throw new Error(
      "CATALOGO_ASM sheet not found. Run setupProgramCatalog() first."
    );
  }

  return sheet;
}

// ============================================================
// INSTALLATION
// Safe to run more than once.
// Never clears existing catalog records.
// ============================================================

function setupProgramCatalog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(
    PROGRAM_CATALOG_CONFIG.sheetName
  );

  const isNewSheet = !sheet;

  if (!sheet) {
    sheet = ss.insertSheet(
      PROGRAM_CATALOG_CONFIG.sheetName
    );
  }

  const C = CONFIG.COLORS;

  // Only create or update the catalog's presentation.
  // Existing program records are never cleared.
  sheet.setHiddenGridlines(true);
  sheet.setTabColor(C.yellow);

  sheet.getRange("B2:H2")
    .breakApart()
    .merge()
    .setValue("EitoDiceBanana / ASM PROGRAM CATALOG")
    .setBackground(C.background)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(16);

  sheet.getRange("B3:H3")
    .breakApart()
    .merge()
    .setValue(
      "SELECT A PROGRAM TO COPY ITS SOURCE INTO THE ASM EDITOR"
    )
    .setBackground(C.background)
    .setFontColor(C.muted);

  sheet.getRange("B5")
    .setValue("SELECT PROGRAM")
    .setFontColor(C.muted)
    .setFontWeight("bold");

  sheet.getRange("D5")
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("left")
    .setNote(
      "Choose a program. Its source will be copied to ASM!D8:D37. " +
      "You can edit that copy without changing the catalog original."
    );

  sheet.getRange("B7:H7")
    .breakApart()
    .merge()
    .setValue(
      "WORKFLOW: SELECT → EDIT ASM COPY → ASSEMBLE → LOAD → RUN"
    )
    .setBackground(C.panelAlt)
    .setFontColor(C.green)
    .setFontWeight("bold");

  const headers = [[
    "PROGRAM ID",
    "PROGRAM NAME",
    "DESCRIPTION",
    "LINE",
    "ASSEMBLY SOURCE"
  ]];

  sheet.getRange(
    PROGRAM_CATALOG_CONFIG.headerRow,
    1,
    1,
    headers[0].length
  )
    .setValues(headers)
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setWrap(true);

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 440);
  sheet.setColumnWidth(4, 65);
  sheet.setColumnWidth(5, 360);
  sheet.setFrozenRows(10);

  // Seed missing default programs without overwriting existing ones.
  seedProgramCatalog_();

  // Rebuild the dropdown from the actual stored catalog.
  refreshProgramCatalogSelector_();

  // Install the selector trigger if it is not already present.
  installProgramCatalogTrigger();

  SpreadsheetApp.flush();

  ss.toast(
    isNewSheet
      ? "ASM Program Catalog created"
      : "ASM Program Catalog checked",
    "EitoDiceBanana",
    4
  );

  return true;
}

// ============================================================
// SEED DATA
// ============================================================

function seedProgramCatalog_() {
  const sheet = programCatalogSheet_();
  const config = PROGRAM_CATALOG_CONFIG;

  const lastRow = sheet.getLastRow();
  const existingIds = new Set();

  if (lastRow >= config.firstDataRow) {
    const values = sheet.getRange(
      config.firstDataRow,
      1,
      lastRow - config.firstDataRow + 1,
      1
    ).getValues();

    values.forEach(function(row) {
      const id = String(row[0] || "").trim();
      if (id) existingIds.add(id);
    });
  }

  PROGRAM_CATALOG_SEED_.forEach(function(program) {
    if (existingIds.has(program.id)) {
      return;
    }

    const rows = program.lines.map(function(line, index) {
      return [
        program.id,
        program.name,
        program.description,
        index + 1,
        String(line)
      ];
    });

    const startRow = Math.max(
      config.firstDataRow,
      sheet.getLastRow() + 1
    );

    sheet.getRange(
      startRow,
      1,
      rows.length,
      5
    )
      .setValues(rows)
      .setVerticalAlignment("middle")
      .setWrap(true);

    existingIds.add(program.id);
  });

  const finalRow = sheet.getLastRow();

  if (finalRow >= config.firstDataRow) {
    sheet.getRange(
      config.firstDataRow,
      1,
      finalRow - config.firstDataRow + 1,
      5
    ).setFontColor(CONFIG.COLORS.white);

    sheet.getRange(
      config.firstDataRow,
      4,
      finalRow - config.firstDataRow + 1,
      1
    ).setHorizontalAlignment("center");

    sheet.getRange(
      config.firstDataRow,
      5,
      finalRow - config.firstDataRow + 1,
      1
    ).setFontFamily("Roboto Mono");
  }

  return existingIds.size;
}

// ============================================================
// CATALOG READING
// ============================================================

function getCatalogPrograms_() {
  const sheet = programCatalogSheet_();
  const config = PROGRAM_CATALOG_CONFIG;
  const lastRow = sheet.getLastRow();

  if (lastRow < config.firstDataRow) {
    return [];
  }

  const values = sheet.getRange(
    config.firstDataRow,
    1,
    lastRow - config.firstDataRow + 1,
    5
  ).getValues();

  const grouped = new Map();

  values.forEach(function(row) {
    const id = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    const description = String(row[2] || "").trim();
    const lineNumber = Number(row[3]);
    const source = String(row[4] || "");

    if (!id || !name || !Number.isInteger(lineNumber)) {
      return;
    }

    if (!grouped.has(id)) {
      grouped.set(id, {
        id: id,
        name: name,
        description: description,
        lines: []
      });
    }

    grouped.get(id).lines.push({
      number: lineNumber,
      source: source
    });
  });

  return Array.from(grouped.values()).map(function(program) {
    program.lines.sort(function(a, b) {
      return a.number - b.number;
    });

    program.lines = program.lines.map(function(item) {
      return item.source;
    });

    return program;
  });
}

function getCatalogProgramByName_(name) {
  const target = String(name || "").trim();

  if (!target) {
    throw new Error("Select a program from the catalog first.");
  }

  const program = getCatalogPrograms_().find(function(item) {
    return item.name === target;
  });

  if (!program) {
    throw new Error(
      "Program not found in CATALOGO_ASM: " + target
    );
  }

  if (program.lines.length === 0) {
    throw new Error(
      "The selected catalog program has no source lines."
    );
  }

  if (
    program.lines.length >
    PROGRAM_CATALOG_CONFIG.maxEditorLines
  ) {
    throw new Error(
      "The selected program has " + program.lines.length +
      " lines. The ASM editor supports only " +
      PROGRAM_CATALOG_CONFIG.maxEditorLines + "."
    );
  }

  return program;
}

// ============================================================
// DROPDOWN
// ============================================================

function refreshProgramCatalogSelector_() {
  const sheet = programCatalogSheet_();
  const programs = getCatalogPrograms_();

  if (programs.length === 0) {
    throw new Error("The program catalog is empty.");
  }

  const names = programs.map(function(program) {
    return program.name;
  });

  const rule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(names, true)
    .setAllowInvalid(false)
    .setHelpText(
      "Select a program to copy its source into the ASM editor."
    )
    .build();

  const selector = sheet.getRange(
    PROGRAM_CATALOG_CONFIG.selectorCell
  );

  selector.setDataValidation(rule);

  const current = String(selector.getValue() || "");

  if (names.indexOf(current) === -1) {
    selector.setValue(names[0]);
  }

  return names;
}

// ============================================================
// OPEN CATALOG
// ============================================================


function openProgramCatalog() {
  setupProgramCatalog();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = programCatalogSheet_();

  ss.setActiveSheet(sheet);
  return true;
}


// ============================================================
// SELECT AND COPY PROGRAM TO ASM
// ============================================================

function loadSelectedCatalogProgramToASM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const catalog = programCatalogSheet_();
  const asm = ss.getSheetByName("ASM");

  if (!asm) {
    throw new Error("ASM sheet not found.");
  }

  const selectedName = String(
    catalog.getRange(
      PROGRAM_CATALOG_CONFIG.selectorCell
    ).getValue() || ""
  ).trim();

  const program = getCatalogProgramByName_(selectedName);

  const sourceRange = asm.getRange(
    PROGRAM_CATALOG_CONFIG.editorRange
  );

  const machineCodeRange = asm.getRange(
    PROGRAM_CATALOG_CONFIG.machineCodeRange
  );

  // Clear only the editor's source and machine-code cells.
  // The catalog originals and other ASM areas remain untouched.
  sourceRange.clearContent();
  machineCodeRange.clearContent();

  const editorLines = Array.from(
    { length: PROGRAM_CATALOG_CONFIG.maxEditorLines },
    function(_, index) {
      return [program.lines[index] || ""];
    }
  );

  sourceRange.setValues(editorLines);

  asm.getRange(PROGRAM_CATALOG_CONFIG.statusCell)
    .setValue(
      "CATALOG COPY: " + program.name + " | EDIT BEFORE LOAD"
    )
    .setFontColor(CONFIG.COLORS.yellow);

  PropertiesService
    .getDocumentProperties()
    .setProperty(
      PROGRAM_CATALOG_CONFIG.activeProgramProperty,
      program.id
    );

  SpreadsheetApp.flush();

  ss.toast(
    "Copied to ASM: " + program.name,
    "ASM Program Catalog",
    4
  );

  return {
    id: program.id,
    name: program.name,
    lineCount: program.lines.length,
    lines: program.lines.slice()
  };
}

// ============================================================
// EDIT TRIGGER
// ============================================================

function edbCatalogOnEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  if (
    sheet.getName() !== PROGRAM_CATALOG_CONFIG.sheetName ||
    range.getA1Notation() !== PROGRAM_CATALOG_CONFIG.selectorCell
  ) {
    return;
  }

  try {
    loadSelectedCatalogProgramToASM();
  } catch (error) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      error.message,
      "ASM Catalog Error",
      6
    );
    Logger.log(error.stack || error.message);
  }
}

function installProgramCatalogTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const existing = ScriptApp.getProjectTriggers().some(
    function(trigger) {
      return (
        trigger.getHandlerFunction() === "edbCatalogOnEdit" &&
        trigger.getEventType() === ScriptApp.EventType.ON_EDIT
      );
    }
  );

  if (!existing) {
    ScriptApp.newTrigger("edbCatalogOnEdit")
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }

  return true;
}

// ============================================================
// TASK 14 TEST HELPERS
// ============================================================

function assertTask14_(condition, message) {
  if (!condition) {
    throw new Error(
      "TASK 14 TEST FAILED: " + message
    );
  }
}

function runTask14ProgramToHalt_(maxSteps) {
  let state = getExecutionState_();
  let steps = 0;
  const limit = maxSteps || 2500;

  while (!state.halted && steps < limit) {
    state = stepCpu();
    steps++;
  }

  assertTask14_(
    state.halted,
    "Program did not reach HLT within " + limit + " CPU phases."
  );

  return {
    state: state,
    phases: steps
  };
}

// ============================================================
// TEST 1 — CATALOG, SELECTION, SWITCHING AND COPY ISOLATION
// Does not execute programs.
// Restores the ASM editor and selector after the test.
// ============================================================

function testTask14CatalogModule() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const catalog = programCatalogSheet_();
  const asm = ss.getSheetByName("ASM");

  if (!asm) {
    throw new Error("ASM sheet not found.");
  }

  const oldSource = asm.getRange("D8:D37").getValues();
  const oldMachineCode = asm.getRange("O8:O37").getValues();
  const oldStatus = asm.getRange("D42").getValue();
  const oldSelection = catalog.getRange("D5").getValue();

  const props = PropertiesService.getDocumentProperties();
  const oldActiveProgram = props.getProperty(
    PROGRAM_CATALOG_CONFIG.activeProgramProperty
  );

  try {
    const programs = getCatalogPrograms_();

    assertTask14_(
      programs.length >= 3,
      "At least three programs must exist in the catalog."
    );

    const expectedIds = [
      "TASK14_ARITHMETIC_LOOPS",
      "TASK14_KEYBOARD_LCD",
      "TASK14_SCATTERED_MEMORY"
    ];

    expectedIds.forEach(function(id) {
      assertTask14_(
        programs.some(function(program) {
          return program.id === id && program.lines.length > 0;
        }),
        "Missing or empty program: " + id
      );
    });

    programs.forEach(function(program) {
      catalog.getRange("D5").setValue(program.name);

      const copied = loadSelectedCatalogProgramToASM();
      const editor = asm.getRange("D8:D37")
        .getValues()
        .map(function(row) {
          return String(row[0] || "");
        });

      assertTask14_(
        copied.name === program.name,
        "Selected program name must match the copied program."
      );

      assertTask14_(
        JSON.stringify(editor.slice(0, program.lines.length)) ===
        JSON.stringify(program.lines),
        "ASM source copy does not match " + program.name
      );
    });

    // Verify that editing the ASM copy does not modify the original.
    const firstProgram = programs[0];
    catalog.getRange("D5").setValue(firstProgram.name);
    loadSelectedCatalogProgramToASM();

    const originalFirstLine = getCatalogProgramByName_(
      firstProgram.name
    ).lines[0];

    asm.getRange("D8").setValue("; USER MODIFIED COPY");

    const originalAfterEdit = getCatalogProgramByName_(
      firstProgram.name
    ).lines[0];

    assertTask14_(
      originalAfterEdit === originalFirstLine,
      "Editing ASM must not modify the catalog original."
    );

    Logger.log(
      "PASS: Three catalog programs, selection switching and copy isolation."
    );

    return {
      passed: true,
      programsFound: programs.length,
      selectionSwitching: true,
      originalPreservation: true
    };

  } finally {
    asm.getRange("D8:D37").setValues(oldSource);
    asm.getRange("O8:O37").setValues(oldMachineCode);
    asm.getRange("D42").setValue(oldStatus);
    catalog.getRange("D5").setValue(oldSelection);

    if (oldActiveProgram === null) {
      props.deleteProperty(
        PROGRAM_CATALOG_CONFIG.activeProgramProperty
      );
    } else {
      props.setProperty(
        PROGRAM_CATALOG_CONFIG.activeProgramProperty,
        oldActiveProgram
      );
    }
  }
}

// ============================================================
// TEST 2 — ASSEMBLE, LOAD AND EXECUTE ALL THREE PROGRAMS
//
// NOTE:
// This test intentionally executes the programs in the simulator.
// After completion, the CPU will be halted after Program 3.
// ============================================================

function testTask14ProgramsExecution() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const catalog = programCatalogSheet_();
  const asm = ss.getSheetByName("ASM");

  if (!asm) {
    throw new Error("ASM sheet not found.");
  }

  const results = {};

  // ----------------------------------------------------------
  // PROGRAM 1 — ARITHMETIC AND LOOPS
  // ----------------------------------------------------------

  const p1 = getCatalogProgramByName_(
    "Program 1 - Arithmetic and Loops"
  );

  catalog.getRange("D5").setValue(p1.name);
  loadSelectedCatalogProgramToASM();

  const p1Source = asm.getRange("D8:D37")
    .getValues()
    .map(function(row) {
      return String(row[0] || "");
    });

  const p1Bytes = assembleProgram(p1Source);
  loadProgram(p1Bytes, 0x00);

  const p1Run = runTask14ProgramToHalt_(2500);

  assertTask14_(
    getRegister("AX") === 10,
    "Program 1: AX must equal 10 (0Ah)."
  );

  assertTask14_(
    getRegister("BX") === 2,
    "Program 1: BX must equal 2."
  );

  assertTask14_(
    getRegister("CX") === 0,
    "Program 1: CX loop counter must reach zero."
  );

  assertTask14_(
    getRegister("DX") === 5,
    "Program 1: DX must count five loop iterations."
  );

  assertTask14_(
    readVirtualMemory(0x120) === 10,
    "Program 1: virtual memory [120h] must contain 0Ah."
  );

  results.program1 = {
    passed: true,
    phases: p1Run.phases,
    AX: getRegister("AX"),
    BX: getRegister("BX"),
    CX: getRegister("CX"),
    DX: getRegister("DX")
  };

  Logger.log("PASS: Program 1 — Arithmetic and Loops.");

  // ----------------------------------------------------------
  // PROGRAM 2 — KEYBOARD TO LCD ECHO
  // ----------------------------------------------------------

  const p2 = getCatalogProgramByName_(
    "Program 2 - Keyboard to LCD Echo"
  );

  catalog.getRange("D5").setValue(p2.name);
  loadSelectedCatalogProgramToASM();

  const p2Source = asm.getRange("D8:D37")
    .getValues()
    .map(function(row) {
      return String(row[0] || "");
    });

  const p2Bytes = assembleProgram(p2Source);

  // RUN is synchronous, so preload the FIFO before execution.
  keyboardReset_();

  "EITO2026".split("").forEach(function(character) {
    keyboardEnqueueCharacter_(character);
  });

  loadProgram(p2Bytes, 0x00);

  const p2Run = runTask14ProgramToHalt_(2500);
  const lcd = getLCDStatus();

  assertTask14_(
    p2Run.state.halted,
    "Program 2 must reach HLT."
  );

  assertTask14_(
    lcd.text === "EITO2026",
    "Program 2 LCD output must equal EITO2026. Actual: " + lcd.text
  );

  assertTask14_(
    keyboardQueueSize_() === 0,
    "Program 2 must consume all eight keyboard characters."
  );

  results.program2 = {
    passed: true,
    phases: p2Run.phases,
    lcdText: lcd.text,
    lcdWrites: lcd.writes,
    remainingKeyboardBytes: keyboardQueueSize_()
  };

  Logger.log("PASS: Program 2 — Keyboard to LCD Echo.");

  // ----------------------------------------------------------
  // PROGRAM 3 — SCATTERED MEMORY / PAGE FAULT / CACHE MISS
  // ----------------------------------------------------------

  const p3 = getCatalogProgramByName_(
    "Program 3 - Scattered Memory Access"
  );

  catalog.getRange("D5").setValue(p3.name);
  loadSelectedCatalogProgramToASM();

  const p3Source = asm.getRange("D8:D37")
    .getValues()
    .map(function(row) {
      return String(row[0] || "");
    });

  const p3Bytes = assembleProgram(p3Source);
  loadProgram(p3Bytes, 0x00);

  const p3Run = runTask14ProgramToHalt_(2500);

  const paging = getPagingStatistics();
  const cache = getCachePerformanceMetrics();

  assertTask14_(
    getRegister("DX") === 0xA5,
    "Program 3: DX must read back A5h from virtual page 8."
  );

  assertTask14_(
    paging.pageFaults > 0,
    "Program 3 must generate at least one Page Fault."
  );

  assertTask14_(
    paging.replacements > 0,
    "Program 3 must demonstrate FIFO page replacement."
  );

  assertTask14_(
    cache.overall.misses > 0,
    "Program 3 must generate Cache Misses."
  );

  assertTask14_(
    paging.pinnedFrames.indexOf(7) !== -1,
    "LCD physical frame 7 must remain pinned."
  );

  results.program3 = {
    passed: true,
    phases: p3Run.phases,
    DX: getRegister("DX"),
    pageFaults: paging.pageFaults,
    replacements: paging.replacements,
    cacheMisses: cache.overall.misses,
    pinnedFrames: paging.pinnedFrames
  };

  Logger.log("PASS: Program 3 — Scattered Memory Access.");

  Logger.log(
    "=== ALL TASK 14 PROGRAM EXECUTION TESTS PASSED ==="
  );

  return {
    passed: true,
    programsExecuted: 3,
    results: results
  };
}

function refreshTask15Catalog() {
  const programs = refreshProgramCatalogSelector_();
  Logger.log("Catalog updated: " + programs.join(", "));
}
