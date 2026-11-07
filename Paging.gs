/**
 * EitoDiceBanana CPU Simulator
 * Paging, FIFO Replacement and Swap — Task 08
 *
 * Virtual memory:
 *   512 bytes = 16 pages x 32 bytes
 * Physical memory:
 *   256 bytes = 8 frames x 32 bytes
 *
 * Replacement policy: FIFO.
 * Modified victim pages are copied to the emulated Swap store.
 */

const PAGING_STATE_KEY = "EDB_PAGING_STATE";
const PAGING_POLICY = "FIFO";
const PAGING_EVENT_START_ROW = 28;
const PAGING_EVENT_COUNT = 10;

// Task 12: Pin physical Frame 7 for the LCD video buffer (F8h-FFh).
// VPN 7 remains mapped to PFN 7. FIFO can replace only Frames 0-6.
const PAGING_LCD_PINNED_FRAME = 7;

function isPagingPinnedFrame_(frame) {
  return frame === PAGING_LCD_PINNED_FRAME;
}


// ------------------------------------------------------------
// PERSISTENT BACKING STORE
// ------------------------------------------------------------

function createPagingStateFromRAM_() {
  const pageData = {};

  for (let vpn = 0; vpn < VIRTUAL_PAGE_COUNT; vpn++) {
    pageData[vpn] = Array(VIRTUAL_PAGE_SIZE).fill(0);
  }

  // The initial Page Table maps virtual pages 0-7
  // to physical frames 0-7. Preserve their real contents.
  for (let frame = 0; frame < VM_PHYSICAL_FRAME_COUNT; frame++) {
    pageData[frame] = getPhysicalFrame(frame).bytes.slice();
  }

  const loadedAt = {};
  for (let vpn = 0; vpn < VM_PHYSICAL_FRAME_COUNT; vpn++) {
    loadedAt[vpn] = vpn;
  }

  return {
    version: 1,
    policy: PAGING_POLICY,
    nextSequence: VM_PHYSICAL_FRAME_COUNT,
    loadedAt: loadedAt,
    pageData: pageData,
    // Immutable baseline captured when a new program is loaded.
    initialPages: JSON.parse(JSON.stringify(pageData)),
    swapPages: {},
    pageFaults: 0,
    replacements: 0,
    swapWrites: 0,
    swapReads: 0
  };
}

function savePagingState_(paging) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(PAGING_STATE_KEY, JSON.stringify(paging));
}

function getPagingState_() {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty(PAGING_STATE_KEY);

  if (!raw) {
    const initial = createPagingStateFromRAM_();
    savePagingState_(initial);
    return initial;
  }

  try {
    const paging = JSON.parse(raw);

    if (
      !paging ||
      !paging.pageData ||
      !paging.loadedAt ||
      !paging.swapPages
    ) {
      throw new Error("Invalid paging state.");
    }

    if (!Number.isInteger(paging.nextSequence)) {
      paging.nextSequence = VM_PHYSICAL_FRAME_COUNT;
    }

    paging.pageFaults = Number(paging.pageFaults || 0);
    paging.replacements = Number(paging.replacements || 0);
    paging.swapWrites = Number(paging.swapWrites || 0);
    paging.swapReads = Number(paging.swapReads || 0);

    return paging;

  } catch (error) {
    const initial = createPagingStateFromRAM_();
    savePagingState_(initial);
    return initial;
  }
}

/**
 * Rebuilds the emulated secondary storage from the current RAM.
 * This is called when a new program is loaded or the Page Table
 * is explicitly reset.
 */
function resetPagingBackingStore_() {
  const paging = createPagingStateFromRAM_();
  savePagingState_(paging);
  if (typeof resetCacheModule === "function") {
    resetCacheModule();
  }
  return paging;
}

/**
 * Resets both Page Table and paging metadata.
 * Physical RAM is not cleared.
 */
function resetPagingSystem() {
  const pageTable = defaultPageTableState_();
  savePageTable_(pageTable);

  const paging = createPagingStateFromRAM_();
  savePagingState_(paging);

  // A newly loaded program changes RAM bytes. Old cache tags must go.
  if (typeof resetCacheModule === "function") {
    resetCacheModule();
  }

  try {
    syncPageTableDisplay();
  } catch (error) {
    // The spreadsheet may not be initialized yet.
  }

  try {
    SpreadsheetApp.flush();
  } catch (error) {
    // Ignore unavailable UI.
  }

  return {
    passed: true,
    policy: PAGING_POLICY,
    pages: VIRTUAL_PAGE_COUNT,
    frames: VM_PHYSICAL_FRAME_COUNT,
    pageSize: VIRTUAL_PAGE_SIZE
  };
}

/**
 * CPU RESET: restores the original physical layout of the loaded program.
 * IMPORTANT: RAM might contain different virtual pages after FIFO swapping,
 * so resetting the page table alone would corrupt the mapping. Restore
 * the initial 8 page images before mapping VPN 0..7 -> PFN 0..7.
 *
 * RESET starts a fresh execution, unlike PAUSE/RESUME. Runtime modifications
 * and swap contents are discarded; the loaded program and initial data remain.
 */
function resetPagingForCpu_() {
  const previous = getPagingState_();
  const baseline = previous.initialPages || previous.pageData;

  // Validate the complete image before writing any RAM cells.
  for (let frame = 0; frame < VM_PHYSICAL_FRAME_COUNT; frame++) {
    validatePagingPageBytes_(baseline[frame], 'RESET page ' + frame);
  }

  // RESET restores the loaded program's baseline in physical RAM,
  // therefore all cached blocks must be discarded first.
  if (typeof resetCacheModule === "function") {
    resetCacheModule();
  }

  for (let frame = 0; frame < VM_PHYSICAL_FRAME_COUNT; frame++) {
    writePageToPhysicalFrame_(frame, baseline[frame]);
  }

  const fresh = {
    version: 1,
    policy: PAGING_POLICY,
    nextSequence: VM_PHYSICAL_FRAME_COUNT,
    loadedAt: {},
    pageData: JSON.parse(JSON.stringify(baseline)),
    initialPages: JSON.parse(JSON.stringify(baseline)),
    swapPages: {},
    pageFaults: 0,
    replacements: 0,
    swapWrites: 0,
    swapReads: 0
  };

  for (let vpn = 0; vpn < VM_PHYSICAL_FRAME_COUNT; vpn++) {
    fresh.loadedAt[vpn] = vpn;
  }
  savePagingState_(fresh);
  savePageTable_(defaultPageTableState_());
  syncPageTableDisplay();
  clearPagingEventLog_();
  resetMMUMonitorDisplay_();
  Logger.log('RESET: Physical frames, Page Table, FIFO and Swap restored.');
  return fresh;
}

/** Clears only paging events. Never clears the PAGINAS sheet. */
function clearPagingEventLog_() {
  const sheet = paginasSheet_();
  const C = CONFIG.COLORS;
  ensurePagingEventPanel_();
  const range = sheet.getRange(PAGING_EVENT_START_ROW, 10, PAGING_EVENT_COUNT, 5);
  range.clearContent().setBackground(C.panel).setFontColor(C.white);
  sheet.getRange(PAGING_EVENT_START_ROW, 10, PAGING_EVENT_COUNT, 1)
    .setNumberFormat('HH:mm:ss');
}

// ------------------------------------------------------------
// PHYSICAL FRAME HELPERS
// ------------------------------------------------------------

function validatePagingPageBytes_(bytes, description) {
  if (!Array.isArray(bytes) || bytes.length !== VIRTUAL_PAGE_SIZE) {
    throw new Error(
      (description || "Page") +
      " must contain exactly " + VIRTUAL_PAGE_SIZE + " bytes."
    );
  }

  bytes.forEach(function(value, index) {
    if (!isValidByte(value)) {
      throw new Error(
        "Invalid byte at page offset " + index + ": " + value
      );
    }
  });

  return true;
}

/**
 * Writes a complete 32-byte page into one physical frame.
 * The two spreadsheet rows correspond to 16 bytes each.
 */
function writePageToPhysicalFrame_(frame, bytes) {
  validatePFN_(frame);
  validatePagingPageBytes_(bytes, "Page data");

  const startAddress = physicalFrameToAddress(frame, 0);
  const row = MEMORY_LAYOUT.startRow + Math.floor(startAddress / 16);

  const values = [
    bytes.slice(0, 16).map(byteToHex_),
    bytes.slice(16, 32).map(byteToHex_)
  ];

  memorySheet_()
    .getRange(row, MEMORY_LAYOUT.startColumn, 2, 16)
    .setNumberFormat("@")
    .setValues(values);
}

/**
 * Returns all virtual pages currently mapped to physical frames.
 */
function getResidentPages_() {
  const table = getPageTable_();

  return table.entries
    .filter(function(entry) {
      return entry.present === 1 && isValidPFN(entry.pfn);
    })
    .map(function(entry) {
      return {
        vpn: entry.vpn,
        pfn: entry.pfn,
        dirty: entry.dirty,
        referenced: entry.referenced
      };
    });
}

/**
 * Finds an unused physical frame by inspecting the actual Page Table.
 * It does not assume that any frame is reserved.
 */
function findFreePhysicalFrame_() {
  const residents = getResidentPages_();
  const occupied = new Set(
    residents.map(function(entry) {
      return entry.pfn;
    })
  );

  for (let frame = 0; frame < VM_PHYSICAL_FRAME_COUNT; frame++) {
    if (isPagingPinnedFrame_(frame)) continue;
    if (!occupied.has(frame)) {
      return frame;
    }
  }

  return -1;
}

// ------------------------------------------------------------
// FIFO VICTIM SELECTION
// ------------------------------------------------------------

/**
 * FIFO selects the resident page with the oldest load sequence.
 * Reads and writes do not change its FIFO position.
 */
function selectFIFOVictim_(paging) {
  const residents = getResidentPages_().filter(function(entry) {
    return !isPagingPinnedFrame_(entry.pfn);
  });

  if (residents.length === 0) {
    throw new Error("FIFO cannot select a victim: no replaceable resident pages.");
  }

  residents.sort(function(a, b) {
    const orderA = Number(paging.loadedAt[a.vpn]);
    const orderB = Number(paging.loadedAt[b.vpn]);

    const safeA = Number.isFinite(orderA) ? orderA : a.vpn;
    const safeB = Number.isFinite(orderB) ? orderB : b.vpn;

    return safeA - safeB;
  });

  return residents[0];
}

// ------------------------------------------------------------
// PAGING EVENT DISPLAY
// ------------------------------------------------------------

function ensurePagingEventPanel_() {
  const sheet = paginasSheet_();
  const C = CONFIG.COLORS;

  sheet.getRange("J26")
    .setValue("4. PAGE FAULT / FIFO / SWAP EVENT LOG")
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  // Make EVENT and DETAIL fully readable.
  sheet.setColumnWidth(10, 105); // J time
  sheet.setColumnWidth(11, 165); // K event
  sheet.setColumnWidth(12, 105); // L VPN / MMU values
  sheet.setColumnWidth(13, 75);  // M PFN
  sheet.setColumnWidth(14, 405); // N detail

  sheet.getRange("J27:N27")
    .setValues([[
      "TIME",
      "EVENT",
      "VPN",
      "PFN",
      "DETAIL"
    ]])
    .setBackground(C.panelAlt)
    .setFontColor(C.muted)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}

function logPagingEvent_(eventName, vpn, pfn, detail) {
  try {
    const sheet = paginasSheet_();
    const C = CONFIG.COLORS;

    ensurePagingEventPanel_();

    const range = sheet.getRange(
      PAGING_EVENT_START_ROW,
      10,
      PAGING_EVENT_COUNT,
      5
    );

    let events = range.getValues();

    events.push([
      new Date(),
      String(eventName || ""),
      vpn === null || vpn === undefined ? "-" : vpn,
      pfn === null || pfn === undefined ? "-" : pfn,
      String(detail || "")
    ]);

    events = events
      .filter(function(row) {
        return row.some(function(value) {
          return value !== "" && value !== null;
        });
      })
      .slice(-PAGING_EVENT_COUNT);

    while (events.length < PAGING_EVENT_COUNT) {
      events.unshift(["", "", "", "", ""]);
    }

    // Reapply event-specific colors to every row; previous faults remain red.
    const backgrounds = [];
    const fontColors = [];
    events.forEach(function(event) {
      const name = String(event[1] || '').toUpperCase();
      const bg = Array(5).fill(C.panel);
      const fg = Array(5).fill(C.white);
      if (name === 'PAGE FAULT') {
        bg[1] = C.red;
        fg[1] = C.background;
      } else if (name === 'FIFO VICTIM' || name === 'SWAP OUT') {
        bg[1] = C.yellow;
        fg[1] = C.background;
      } else if (name === 'PAGE LOADED' || name === 'SWAP IN') {
        bg[1] = C.green;
        fg[1] = C.background;
      }
      backgrounds.push(bg);
      fontColors.push(fg);
    });
    range.setValues(events);
    range.setBackgrounds(backgrounds);
    range.setFontColors(fontColors);
    range.setVerticalAlignment('middle');
    sheet.getRange(PAGING_EVENT_START_ROW, 10, PAGING_EVENT_COUNT, 1)
      .setNumberFormat('HH:mm:ss');

    SpreadsheetApp.flush();

  } catch (error) {
    Logger.log("Could not update paging event log: " + error.message);
  }
}

/**
 * Makes the Page Fault visible in red on the PAGINAS dashboard.
 */
function highlightPageFault_(faultInfo) {
  const C = CONFIG.COLORS;

  try {
    updateMMUMonitorDisplay_(faultInfo);

    const sheet = paginasSheet_();
    const statusCell = sheet.getRange(
      PAGINAS_LAYOUT.monitor.status
    );

    statusCell
      .setValue("PAGE FAULT")
      .setBackground(C.red)
      .setFontColor(C.background)
      .setFontWeight("bold");

    SpreadsheetApp.flush();

  } catch (error) {
    Logger.log("Could not highlight Page Fault: " + error.message);
  }

  logPagingEvent_(
    "PAGE FAULT",
    faultInfo.vpn,
    null,
    "Virtual address " + faultInfo.virtualAddress +
    " is not resident. Present bit = 0."
  );
}

// ------------------------------------------------------------
// PAGE FAULT HANDLER
// ------------------------------------------------------------

/**
 * Resolves one Page Fault:
 * 1. Finds a free physical frame.
 * 2. If RAM is full, selects the FIFO victim.
 * 3. Writes a dirty victim to Swap.
 * 4. Marks the victim as non-resident.
 * 5. Loads the requested 32-byte page.
 * 6. Updates the Page Table.
 *
 * The caller then repeats the virtual address translation and
 * completes the original memory operation.
 */
function handlePageFault_(faultInfo) {
  if (!faultInfo || faultInfo.fault !== true) {
    throw new Error("handlePageFault_ requires a valid Page Fault.");
  }

  const vpn = Number(faultInfo.vpn);
  validateVPN_(vpn);

  const table = getPageTable_();

  // Another call may already have loaded this page.
  if (table.entries[vpn].present === 1) {
    return {
      success: true,
      vpn: vpn,
      pfn: table.entries[vpn].pfn,
      alreadyResident: true
    };
  }

  const paging = getPagingState_();
  paging.pageFaults++;

  let frame = findFreePhysicalFrame_();
  let victim = null;

  // No replaceable frames are free (Frame 7 is pinned).
  if (frame === -1) {
    victim = selectFIFOVictim_(paging);
    frame = victim.pfn;
    if (isPagingPinnedFrame_(frame)) {
      throw new Error("FIFO attempted to evict the LCD-pinned frame.");
    }

    const victimFrame = getPhysicalFrame(frame);
    const victimBytes = victimFrame.bytes.slice();

    if (victim.dirty === 1) {
      // Dirty page: preserve all 32 bytes in the emulated Swap.
      paging.pageData[victim.vpn] = victimBytes.slice();
      paging.swapPages[victim.vpn] = victimBytes.slice();
      paging.swapWrites++;

      logPagingEvent_(
        "SWAP OUT",
        victim.vpn,
        frame,
        "Dirty page saved: 32 bytes written to Swap."
      );

    } else {
      // Clean page: do not perform an unnecessary Swap write.
      logPagingEvent_(
        "CLEAN EVICTION",
        victim.vpn,
        frame,
        "Dirty bit = 0. No Swap write was required."
      );
    }

    paging.replacements++;

    // Release the selected physical frame.
    setPageTableEntry(
      victim.vpn,
      null,
      0,
      0,
      0
    );

    delete paging.loadedAt[victim.vpn];

    logPagingEvent_(
      "FIFO VICTIM",
      victim.vpn,
      frame,
      "Oldest resident page selected by FIFO."
    );

  } else {
    logPagingEvent_(
      "FREE FRAME",
      vpn,
      frame,
      "Physical frame " + frame + " was free."
    );
  }

  // Never overwrite the pinned LCD frame during a Page Fault.
  if (isPagingPinnedFrame_(frame)) {
    throw new Error("Page Fault attempted to overwrite the LCD video buffer.");
  }

  // Read the requested page from Swap or secondary backing storage.
  let pageBytes;

  if (
    Object.prototype.hasOwnProperty.call(
      paging.swapPages,
      String(vpn)
    )
  ) {
    pageBytes = paging.swapPages[vpn].slice();
    paging.pageData[vpn] = pageBytes.slice();
    delete paging.swapPages[vpn];
    paging.swapReads++;

    logPagingEvent_(
      "SWAP IN",
      vpn,
      frame,
      "32-byte page restored from Swap."
    );

  } else if (
    Object.prototype.hasOwnProperty.call(
      paging.pageData,
      String(vpn)
    )
  ) {
    pageBytes = paging.pageData[vpn].slice();

  } else {
    pageBytes = Array(VIRTUAL_PAGE_SIZE).fill(0);
    paging.pageData[vpn] = pageBytes.slice();
  }

  validatePagingPageBytes_(pageBytes, "Requested virtual page");

  // A PFN is a physical address: after reuse it could contain cached
  // lines belonging to the evicted VPN. Invalidate BEFORE overwriting RAM.
  // Write-through ensures dirty victim bytes were already committed to RAM.
  if (typeof invalidateCachePhysicalFrame === "function") {
    invalidateCachePhysicalFrame(frame);
  }

  // Transfer the entire 32-byte page into the selected frame.
  writePageToPhysicalFrame_(frame, pageBytes);

  // A page read from backing storage or Swap is clean after loading.
  setPageTableEntry(
    vpn,
    frame,
    1,
    0,
    0
  );

  paging.loadedAt[vpn] = paging.nextSequence;
  paging.nextSequence++;

  savePagingState_(paging);
  syncPageTableDisplay();

  logPagingEvent_(
    "PAGE LOADED",
    vpn,
    frame,
    "32 bytes transferred into physical frame " + frame + "."
  );

  SpreadsheetApp.flush();

  return {
    success: true,
    vpn: vpn,
    pfn: frame,
    victimVPN: victim ? victim.vpn : null,
    victimPFN: victim ? victim.pfn : null,
    policy: PAGING_POLICY,
    pageSize: VIRTUAL_PAGE_SIZE
  };
}

/**
 * Public entry point for the Page Fault handler.
 */
function handlePageFault(faultInfo) {
  return handlePageFault_(faultInfo);
}

// ------------------------------------------------------------
// PAGING STATISTICS
// ------------------------------------------------------------

function getPagingStatistics() {
  const paging = getPagingState_();
  const residents = getResidentPages_();

  return {
    policy: PAGING_POLICY,
    pageFaults: paging.pageFaults,
    replacements: paging.replacements,
    swapWrites: paging.swapWrites,
    swapReads: paging.swapReads,
    residentPages: residents.length,
    freeFrames: VM_PHYSICAL_FRAME_COUNT - residents.length,
    pinnedFrames: [PAGING_LCD_PINNED_FRAME],
    replaceableFrameCount: VM_PHYSICAL_FRAME_COUNT - 1,
    residents: residents
  };
}

// ------------------------------------------------------------
// TASK 08 TESTS
// ------------------------------------------------------------

function assertPaging_(condition, message) {
  if (!condition) {
    throw new Error("TASK 08 PAGING TEST FAILED: " + message);
  }
}

/**
 * Integration test:
 * - Causes a Page Fault.
 * - Forces FIFO replacement.
 * - Writes to a page so it becomes dirty.
 * - Forces that dirty page out to Swap.
 * - Reloads it and verifies that the modified byte survived.
 *
 * RAM and document properties are restored in finally.
 */
function testTask08PagingModule() {
  const props = PropertiesService.getDocumentProperties();

  const oldPageTable = props.getProperty(PAGE_TABLE_KEY);
  const oldPagingState = props.getProperty(PAGING_STATE_KEY);
  const oldCacheState = typeof CACHE_STATE_KEY !== "undefined"
    ? props.getProperty(CACHE_STATE_KEY) : null;

  const ramSnapshot = [];

  for (let frame = 0; frame < VM_PHYSICAL_FRAME_COUNT; frame++) {
    ramSnapshot.push(getPhysicalFrame(frame).bytes.slice());
  }

  try {
    resetPagingSystem();

    const testAddress = (8 * VIRTUAL_PAGE_SIZE) + 5;

    // First access to page 8 must generate and resolve a Page Fault.
    writeVirtualMemory(testAddress, 0xA5);

    let entry8 = getPageTable_().entries[8];

    assertPaging_(
      entry8.present === 1,
      "Page 8 must be loaded after the first access."
    );

    assertPaging_(
      entry8.dirty === 1,
      "Writing to page 8 must set Dirty = 1."
    );

    // Access pages 9-15. With eight frames, FIFO must evict page 8.
    for (let vpn = 9; vpn <= 15; vpn++) {
      readVirtualMemory(vpn * VIRTUAL_PAGE_SIZE);
    }

    // Page 8 es la más antigua. Esta falta obliga a FIFO a expulsarla.
    readVirtualMemory(0);

    entry8 = getPageTable_().entries[8];

    assertPaging_(
      entry8.present === 0,
      "FIFO must have evicted page 8."
    );

    const pagingAfterEviction = getPagingState_();

    assertPaging_(
      Object.prototype.hasOwnProperty.call(
        pagingAfterEviction.swapPages,
        "8"
      ),
      "Dirty page 8 must have been saved to Swap."
    );

    assertPaging_(
      pagingAfterEviction.swapWrites >= 1,
      "At least one Swap write must have occurred."
    );

    // Re-access page 8: it must be restored from Swap.
    const restoredValue = readVirtualMemory(testAddress);

    assertPaging_(
      restoredValue === 0xA5,
      "Modified data must survive Swap out and Swap in."
    );

    const finalEntry8 = getPageTable_().entries[8];

    assertPaging_(
      finalEntry8.present === 1,
      "Page 8 must be resident again."
    );

    assertPaging_(
      finalEntry8.dirty === 0,
      "A page restored from Swap must start clean."
    );

    const stats = getPagingStatistics();

    Logger.log("PASS: Page Fault detected and resolved.");
    Logger.log("PASS: FIFO replacement selected a victim.");
    Logger.log("PASS: Dirty page saved to Swap.");
    Logger.log("PASS: 32-byte page restored.");
    Logger.log("PASS: Modified byte A5h preserved.");

    return {
      passed: true,
      policy: PAGING_POLICY,
      restoredValue: restoredValue,
      pageFaults: stats.pageFaults,
      replacements: stats.replacements,
      swapWrites: stats.swapWrites,
      swapReads: stats.swapReads
    };

  } finally {
    // Restore the original physical RAM.
    for (let frame = 0; frame < VM_PHYSICAL_FRAME_COUNT; frame++) {
      writePageToPhysicalFrame_(frame, ramSnapshot[frame]);
    }

    if (oldPageTable === null) {
      props.deleteProperty(PAGE_TABLE_KEY);
    } else {
      props.setProperty(PAGE_TABLE_KEY, oldPageTable);
    }

    if (oldPagingState === null) {
      props.deleteProperty(PAGING_STATE_KEY);
    } else {
      props.setProperty(PAGING_STATE_KEY, oldPagingState);
    }

    if (typeof CACHE_STATE_KEY !== "undefined") {
      if (oldCacheState === null) props.deleteProperty(CACHE_STATE_KEY);
      else props.setProperty(CACHE_STATE_KEY, oldCacheState);
    }

    try {
      if (typeof syncCacheDashboard_ === "function") {
        syncCacheDashboard_(oldCacheState ?
          JSON.parse(oldCacheState) : defaultCacheState_());
      }
      syncPageTableDisplay();
      SpreadsheetApp.flush();
    } catch (error) {
      Logger.log("Could not refresh dashboard after test restoration.");
    }
  }
}
// ------------------------------------------------------------
// TASK 12: NON-DESTRUCTIVE PINNED-FRAME VALIDATION
// ------------------------------------------------------------

/**
 * Run before enabling LCD output. Does not modify RAM or page metadata.
 * Checks that the physical frame containing F8h-FFh cannot be allocated
 * as a free frame or selected as a FIFO victim.
 */
function testTask12LCDFrameProtection() {
  if (PAGING_LCD_PINNED_FRAME !== 7 ||
      LCD_BUFFER_START !== 0xF8 || LCD_BUFFER_END !== 0xFF) {
    throw new Error("LCD video buffer must use physical F8h-FFh in Frame 7.");
  }

  const table = getPageTable_();
  const pinned = table.entries.filter(function(entry) {
    return entry.present === 1 && entry.pfn === PAGING_LCD_PINNED_FRAME;
  });

  if (pinned.length !== 1 || pinned[0].vpn !== 7) {
    throw new Error("VPN 7 must remain resident in pinned PFN 7. Reload the program before testing.");
  }

  const freeFrame = findFreePhysicalFrame_();
  if (freeFrame === PAGING_LCD_PINNED_FRAME) {
    throw new Error("Frame allocator returned pinned Frame 7.");
  }

  const victim = selectFIFOVictim_(getPagingState_());
  if (victim.pfn === PAGING_LCD_PINNED_FRAME) {
    throw new Error("FIFO returned pinned Frame 7.");
  }

  Logger.log("PASS: LCD Frame 7 is pinned and VPN 7 remains resident.");
  Logger.log("PASS: Free-frame allocation excludes Frame 7.");
  Logger.log("PASS: FIFO victim selection excludes Frame 7.");
  Logger.log("=== ALL TASK 12 LCD FRAME PROTECTION TESTS PASSED ===");
  return {passed:true, pinnedFrame:7, videoBuffer:"F8h-FFh", fifoVictimPFN:victim.pfn};
}
