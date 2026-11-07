
/**
 * EitoDiceBanana CPU Simulator
 * TASK 17 — SCATTERED MEMORY PROGRAM
 *
 * Verifies:
 * - Nonconsecutive virtual page accesses.
 * - Page Fault detection and resolution.
 * - FIFO page replacement.
 * - Dirty page transfers to Swap.
 * - Swap restoration and data preservation.
 * - Page Table Present, PFN, Dirty and Reference bits.
 * - L1D and L2 cache misses.
 * - CPU execution resumption after Page Faults.
 */

// ------------------------------------------------------------
// EXPECTED MEMORY CONTENTS
// ------------------------------------------------------------

const TASK17_EXPECTED_MEMORY_ = [
  { address: 0x105, vpn: 8,  value: 0xA1 },
  { address: 0x145, vpn: 10, value: 0xA2 },
  { address: 0x185, vpn: 12, value: 0xA3 },
  { address: 0x1C5, vpn: 14, value: 0xA4 },
  { address: 0x125, vpn: 9,  value: 0xA5 },
  { address: 0x165, vpn: 11, value: 0xA6 },
  { address: 0x1A5, vpn: 13, value: 0xA7 },
  { address: 0x1E5, vpn: 15, value: 0xA8 }
];

const TASK17_PROGRAM_NAME_ =
  "Program 4 - Scattered Memory Stress Test";


// ------------------------------------------------------------
// ASSERTIONS
// ------------------------------------------------------------

function assertTask17_(condition, message) {
  if (!condition) {
    throw new Error(
      "TASK 17 TEST FAILED: " + message
    );
  }
}


// ------------------------------------------------------------
// CPU EXECUTION
// ------------------------------------------------------------

function runTask17ProgramToHalt_(maxSteps) {
  let state = getExecutionState_();
  let phases = 0;

  const limit = maxSteps || 10000;

  while (!state.halted && phases < limit) {
    state = stepCpu();
    phases++;
  }

  assertTask17_(
    state.halted,
    "CPU did not reach HLT within " +
      limit + " execution phases."
  );

  SpreadsheetApp.flush();

  return {
    state: state,
    phases: phases
  };
}


// ------------------------------------------------------------
// TASK 17 INTEGRATION TEST
// ------------------------------------------------------------

function testTask17ScatteredMemoryProgram() {

  Logger.log(
    "=== TASK 17: SCATTERED MEMORY PROGRAM ==="
  );

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const catalog = programCatalogSheet_();
  const asm = ss.getSheetByName("ASM");

  assertTask17_(
    !!asm,
    "ASM sheet not found."
  );

  // ----------------------------------------------------------
  // TEST 1: CATALOG AVAILABILITY AND SELECTION
  // ----------------------------------------------------------

  const program = getCatalogProgramByName_(
    TASK17_PROGRAM_NAME_
  );

  assertTask17_(
    program.lines.length <=
      PROGRAM_CATALOG_CONFIG.maxEditorLines,
    "Program exceeds ASM editor capacity."
  );

  catalog.getRange(
    PROGRAM_CATALOG_CONFIG.selectorCell
  ).setValue(program.name);

  loadSelectedCatalogProgramToASM();

  const sourceLines = asm.getRange(
    PROGRAM_CATALOG_CONFIG.editorRange
  )
    .getValues()
    .map(function(row) {
      return String(row[0] || "");
    });

  const nonEmptyLines = sourceLines.filter(
    function(line) {
      return line.trim() !== "";
    }
  );

  assertTask17_(
    nonEmptyLines.length === program.lines.length,
    "Catalog source was not copied correctly into ASM."
  );

  Logger.log(
    "PASS: Task 17 program found and copied from catalog."
  );


  // ----------------------------------------------------------
  // TEST 2: ASSEMBLY
  // ----------------------------------------------------------

  const machineCode = assembleProgram(sourceLines);

  assertTask17_(
    machineCode.length > 0 &&
    machineCode.length <= CONFIG.MEMORY.codeEnd + 1,
    "Machine code exceeds the available code segment."
  );

  assertTask17_(
    machineCode.length === 59,
    "Unexpected machine code size. Expected 59 bytes."
  );

  Logger.log(
    "PASS: Program assembled successfully: " +
      machineCode.length + " bytes."
  );


  // ----------------------------------------------------------
  // TEST 3: LOAD THROUGH ASM INTERFACE
  // ----------------------------------------------------------

  const loadedBytes = loadProgramFromInterface();

  assertTask17_(
    loadedBytes === machineCode.length,
    "ASM interface did not load the complete program."
  );

  Logger.log(
    "PASS: Program loaded into virtual memory."
  );


  // ----------------------------------------------------------
  // TEST 4: CPU EXECUTION
  // ----------------------------------------------------------

  const execution = runTask17ProgramToHalt_(10000);

  const state = execution.state;

  assertTask17_(
    state.halted,
    "CPU must complete the program."
  );

  assertTask17_(
    getRegister("BX") === 0xA1,
    "BX must contain A1h after loading virtual address 105h."
  );

  assertTask17_(
    getRegister("DX") === 0xA8,
    "DX must contain A8h after loading virtual address 1E5h."
  );

  Logger.log(
    "PASS: CPU completed execution and resumed after Page Faults."
  );


  // ----------------------------------------------------------
  // TEST 5: PAGE FAULTS, FIFO AND SWAP
  // Capture metrics before the additional verification reads.
  // ----------------------------------------------------------

  const pagingDuringCPU = getPagingStatistics();

  assertTask17_(
    pagingDuringCPU.pageFaults >= 8,
    "Expected Page Faults across the eight data pages."
  );

  assertTask17_(
    pagingDuringCPU.replacements > 0,
    "FIFO page replacement was not executed."
  );

  assertTask17_(
    pagingDuringCPU.swapWrites > 0,
    "No modified page was saved to Swap."
  );

  assertTask17_(
    pagingDuringCPU.pinnedFrames.indexOf(7) !== -1,
    "LCD frame 7 must remain pinned."
  );

  Logger.log(
    "PASS: Page Faults generated: " +
      pagingDuringCPU.pageFaults
  );

  Logger.log(
    "PASS: FIFO replacements: " +
      pagingDuringCPU.replacements
  );

  Logger.log(
    "PASS: Dirty page Swap writes: " +
      pagingDuringCPU.swapWrites
  );


  // ----------------------------------------------------------
  // TEST 6: PAGE TABLE CONSISTENCY
  // ----------------------------------------------------------

  const pageTableAfterCPU = getPageTable_();

  const residents = pageTableAfterCPU.entries.filter(
    function(entry) {
      return entry.present === 1;
    }
  );

  const residentFrames = residents.map(
    function(entry) {
      return entry.pfn;
    }
  );

  assertTask17_(
    residentFrames.every(Number.isInteger),
    "A resident page has an invalid PFN."
  );

  assertTask17_(
    new Set(residentFrames).size === residentFrames.length,
    "Two virtual pages are mapped to the same physical frame."
  );

  const lcdEntry = pageTableAfterCPU.entries[7];

  assertTask17_(
    lcdEntry.present === 1 &&
    lcdEntry.pfn === 7,
    "Virtual page 7 must remain mapped to pinned frame 7."
  );

  const dirtyReferencedPage =
    TASK17_EXPECTED_MEMORY_.some(function(item) {
      const entry =
        pageTableAfterCPU.entries[item.vpn];

      return (
        entry.present === 1 &&
        entry.dirty === 1 &&
        entry.referenced === 1
      );
    });

  assertTask17_(
    dirtyReferencedPage,
    "No resident data page has both Dirty and Reference bits set."
  );

  Logger.log(
    "PASS: Page Table Present/PFN mappings are consistent."
  );

  Logger.log(
    "PASS: Dirty and Reference bits updated."
  );


  // ----------------------------------------------------------
  // TEST 7: L1D AND L2 CACHE PERFORMANCE
  // ----------------------------------------------------------

  const cacheDuringCPU =
    getCachePerformanceMetrics();

  assertTask17_(
    cacheDuringCPU.l1d.misses > 0,
    "Program did not generate L1D Cache Misses."
  );

  assertTask17_(
    cacheDuringCPU.l2.misses > 0,
    "Program did not generate L2 Cache Misses."
  );

  Logger.log(
    "PASS: L1D misses: " +
      cacheDuringCPU.l1d.misses
  );

  Logger.log(
    "PASS: L2 misses: " +
      cacheDuringCPU.l2.misses
  );


  // ----------------------------------------------------------
  // TEST 8: DATA PRESERVATION AFTER SWAP
  // Read all eight pages again through virtual memory.
  // These accesses may cause additional Page Faults and
  // Swap IN operations.
  // ----------------------------------------------------------

  const verifiedMemory = [];

  TASK17_EXPECTED_MEMORY_.forEach(
    function(item) {

      const actual = readVirtualMemory(
        item.address,
        "DATA"
      );

      assertTask17_(
        actual === item.value,
        "Data corruption at virtual address " +
          item.address.toString(16).toUpperCase() +
          "h. Expected " +
          item.value.toString(16).toUpperCase() +
          "h, got " +
          actual.toString(16).toUpperCase() +
          "h."
      );

      const entry =
        getPageTable_().entries[item.vpn];

      assertTask17_(
        entry.present === 1 &&
        Number.isInteger(entry.pfn),
        "Page " + item.vpn +
          " was not correctly restored into RAM."
      );

      assertTask17_(
        entry.referenced === 1,
        "Reference bit was not updated for VPN " +
          item.vpn + "."
      );

      verifiedMemory.push({
        address: item.address,
        vpn: item.vpn,
        expected: item.value,
        actual: actual,
        pfn: entry.pfn
      });
    }
  );

  const finalPaging = getPagingStatistics();

  assertTask17_(
    finalPaging.swapReads > 0,
    "No page was restored from Swap."
  );

  Logger.log(
    "PASS: All eight memory values survived replacement and reload."
  );

  Logger.log(
    "PASS: Swap reads: " +
      finalPaging.swapReads
  );


  // ----------------------------------------------------------
  // TEST 9: FINAL RESULTS
  // ----------------------------------------------------------

  const finalCache = getCachePerformanceMetrics();

  const results = {
    passed: true,
    program: TASK17_PROGRAM_NAME_,
    machineCodeBytes: machineCode.length,
    executionPhases: execution.phases,

    registers: {
      BX: getRegister("BX"),
      DX: getRegister("DX")
    },

    pagingDuringCPU: {
      pageFaults: pagingDuringCPU.pageFaults,
      replacements: pagingDuringCPU.replacements,
      swapWrites: pagingDuringCPU.swapWrites,
      pinnedFrames: pagingDuringCPU.pinnedFrames
    },

    pagingAfterVerification: {
      pageFaults: finalPaging.pageFaults,
      replacements: finalPaging.replacements,
      swapWrites: finalPaging.swapWrites,
      swapReads: finalPaging.swapReads
    },

    cacheDuringCPU: {
      l1dMisses: cacheDuringCPU.l1d.misses,
      l2Misses: cacheDuringCPU.l2.misses
    },

    cacheAfterVerification: {
      l1dMisses: finalCache.l1d.misses,
      l2Misses: finalCache.l2.misses
    },

    verifiedMemory: verifiedMemory
  };

  Logger.log(
    "=== TASK 17 ALL TESTS PASSED ==="
  );

  Logger.log(
    JSON.stringify(results, null, 2)
  );

  return results;
}
