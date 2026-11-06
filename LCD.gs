/**
 * EitoDiceBanana — Task 12 LCD 8x1
 * Video buffer: physical RAM F8h-FFh, pinned Frame 7.
 * One byte per character. Cursor wraps modulo 8.
 */
const LCD_BUFFER_START = 0xF8;
const LCD_BUFFER_END = 0xFF;
const LCD_BUFFER_CAPACITY = 8;
const LCD_RESERVED_FRAME = 7;
const LCD_STATE_KEY = "EDB_LCD_STATE";
const LCD_LAYOUT = {
  sheet: "E-S",
  header: "B25:R25",
  display: "B28:I28",
  status: "K28",
  position: "K30",
  lastByte: "K32",
  tableHeader: "B33:E33",
  tableBody: "B34:E41",
  info: "B43:R43"
};

function lcdIsMappedPhysicalAddress_(address) {
  return Number.isInteger(address) &&
    address >= LCD_BUFFER_START && address <= LCD_BUFFER_END;
}
function lcdValidateByte_(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("LCD byte must be between 0 and 255.");
  }
  return value;
}
function lcdAssertBufferLayout_() {
  if (LCD_BUFFER_END - LCD_BUFFER_START + 1 !== 8 ||
      Math.floor(LCD_BUFFER_START / VIRTUAL_PAGE_SIZE) !== LCD_RESERVED_FRAME ||
      LCD_BUFFER_END >= VM_PHYSICAL_RAM_SIZE) {
    throw new Error("LCD physical memory mapping is invalid.");
  }
  return true;
}
function lcdDefaultState_() {
  return {cursor: 0, lastByte: null, writes: 0};
}
function lcdGetState_() {
  const raw = PropertiesService.getDocumentProperties().getProperty(LCD_STATE_KEY);
  if (!raw) return lcdDefaultState_();
  try {
    const saved = JSON.parse(raw);
    const state = Object.assign(lcdDefaultState_(), saved);
    if (!Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor >= 8) state.cursor = 0;
    if (!Number.isInteger(state.writes) || state.writes < 0) state.writes = 0;
    if (state.lastByte !== null && !isValidByte(state.lastByte)) state.lastByte = null;
    return state;
  } catch (e) {
    return lcdDefaultState_();
  }
}
function lcdSaveState_(state) {
  PropertiesService.getDocumentProperties().setProperty(LCD_STATE_KEY, JSON.stringify(state));
}
function lcdReadBuffer_() {
  lcdAssertBufferLayout_();
  const bytes = [];
  for (let i = 0; i < 8; i++) {
    const value = Read(LCD_BUFFER_START + i);
    lcdValidateByte_(value);
    bytes.push(value);
  }
  return bytes;
}
function lcdWritePhysicalByte_(address, value) {
  lcdAssertBufferLayout_();
  if (!lcdIsMappedPhysicalAddress_(address)) throw new Error("LCD address must be F8h-FFh.");
  lcdValidateByte_(value);
  Write(address, value);
  if (typeof invalidateCachePhysicalFrame === "function") {
    invalidateCachePhysicalFrame(LCD_RESERVED_FRAME);
  }
  return value;
}
function lcdWriteByte_(value) {
  lcdValidateByte_(value);
  const state = lcdGetState_();
  const position = state.cursor;
  const physicalAddress = LCD_BUFFER_START + position;
  lcdWritePhysicalByte_(physicalAddress, value);
  state.cursor = (position + 1) % 8;
  state.lastByte = value;
  state.writes++;
  lcdSaveState_(state);
  lcdSyncDisplay_();
  return {value: value, position: position, physicalAddress: physicalAddress, nextCursor: state.cursor};
}
function lcdWritePosition_(position, value) {
  if (!Number.isInteger(position) || position < 0 || position >= 8) {
    throw new Error("LCD position must be between 0 and 7.");
  }
  lcdWritePhysicalByte_(LCD_BUFFER_START + position, value);
  lcdSyncDisplay_();
  return {position: position, address: LCD_BUFFER_START + position, value: value};
}
function lcdByteToCharacter_(value) {
  lcdValidateByte_(value);
  if (value === 0 || value === 32) return " ";
  if (value >= 33 && value <= 126) return String.fromCharCode(value);
  return "?";
}
function lcdByteToHex_(value) {
  return lcdValidateByte_(value).toString(16).toUpperCase().padStart(2, "0") + "h";
}
function lcdGetText_() {
  return lcdReadBuffer_().map(lcdByteToCharacter_).join("");
}
function lcdReset_() {
  lcdAssertBufferLayout_();
  for (let i = 0; i < 8; i++) Write(LCD_BUFFER_START + i, 0);
  if (typeof invalidateCachePhysicalFrame === "function") {
    invalidateCachePhysicalFrame(LCD_RESERVED_FRAME);
  }
  lcdSaveState_(lcdDefaultState_());
  lcdSyncDisplay_();
  return true;
}
function lcdResetController_() {
  lcdSaveState_(lcdDefaultState_());
  lcdSyncDisplay_();
  return true;
}
function lcdSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LCD_LAYOUT.sheet);
}
function setupLCDPanel() {
  const sheet = lcdSheet_();
  if (!sheet) throw new Error("E-S sheet not found.");
  const C = CONFIG.COLORS;
  // Only touch the LCD section; keyboard rows 6-22 are preserved.
  const area = sheet.getRange("B25:R43");
  area.breakApart();
  area.clearContent();
  area.setBackground(C.background);

  sheet.getRange(LCD_LAYOUT.header).merge()
    .setValue("LCD DISPLAY  |  8 x 1  |  VIDEO BUFFER F8h-FFh")
    .setBackground(C.panelAlt).setFontColor(C.yellow)
    .setFontWeight("bold").setFontSize(11);

  sheet.getRange("B27").setValue("CHARACTER OUTPUT")
    .setFontColor(C.muted).setFontWeight("bold");

  const lcdCells = sheet.getRange(LCD_LAYOUT.display);
  lcdCells.setNumberFormat("@").setBackground("#20382D")
    .setFontColor("#C9F7D5").setFontFamily("Roboto Mono")
    .setFontSize(17).setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, "#748F7E", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.setRowHeight(28, 62);
  // Keep all eight character slots the same width.
  for (let col = 2; col <= 9; col++) sheet.setColumnWidth(col, 110);
  sheet.getRange("B29:I29").setValues([["0", "1", "2", "3", "4", "5", "6", "7"]])
    .setHorizontalAlignment("center").setFontColor(C.muted)
    .setFontWeight("bold").setFontSize(9);

  sheet.getRange("K27").setValue("LCD STATUS").setFontColor(C.muted).setFontWeight("bold");
  sheet.getRange(LCD_LAYOUT.status).setBackground(C.panel).setFontColor(C.green).setFontWeight("bold");
  sheet.getRange("K29").setValue("NEXT SLOT").setFontColor(C.muted);
  sheet.getRange(LCD_LAYOUT.position).setBackground(C.panel).setFontColor(C.yellow);
  sheet.getRange("K31").setValue("LAST BYTE").setFontColor(C.muted);
  sheet.getRange(LCD_LAYOUT.lastByte).setBackground(C.panel).setFontColor(C.white);

  sheet.getRange(LCD_LAYOUT.tableHeader)
    .setValues([["SLOT", "PHYS ADDRESS", "HEX BYTE", "CHAR"]])
    .setBackground(C.panelAlt).setFontColor(C.yellow)
    .setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange(LCD_LAYOUT.tableBody).setBackground(C.panel)
    .setFontColor(C.white).setHorizontalAlignment("center");
  sheet.getRange(LCD_LAYOUT.info).merge()
    .setValue("Register -> internal bus -> Ld_LCD -> RAM F8h-FFh. Frame 7 protected from FIFO.")
    .setFontColor(C.muted).setWrap(true);
  lcdSyncDisplay_();
  SpreadsheetApp.flush();
  return true;
}
function lcdSyncDisplay_() {
  const sheet = lcdSheet_();
  if (!sheet) return false;
  const C = CONFIG.COLORS;
  const bytes = lcdReadBuffer_();
  const state = lcdGetState_();
  const chars = bytes.map(lcdByteToCharacter_);
  const display = sheet.getRange(LCD_LAYOUT.display);
  display.setValues([chars]);
  // Uniform slots with a thin, consistent outline.
  // Highlight only the border of the next slot, not half of the screen.
  const bg = [Array(8).fill("#20382D")];
  display.setBackgrounds(bg);
  display.setBorder(true, true, true, true, true, true, "#748F7E", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  const cursorCell = sheet.getRange(28, 2 + state.cursor);
  cursorCell.setBackground("#355A45");

  const rows = bytes.map(function(value, index) {
    return [index, (LCD_BUFFER_START + index).toString(16).toUpperCase().padStart(2,"0") + "h",
      lcdByteToHex_(value), value === 0 ? "EMPTY" : lcdByteToCharacter_(value)];
  });
  sheet.getRange(LCD_LAYOUT.tableBody).setValues(rows);
  sheet.getRange(LCD_LAYOUT.status).setValue("READY / 8 SLOTS").setFontColor(C.green);
  sheet.getRange(LCD_LAYOUT.position).setValue(state.cursor + " / 7");
  sheet.getRange(LCD_LAYOUT.lastByte).setValue(state.lastByte === null ? "--" : lcdByteToHex_(state.lastByte));
  return true;
}
function getLCDStatus() {
  const state = lcdGetState_();
  const bytes = lcdReadBuffer_();
  return {capacity: 8, physicalStart: "F8h", physicalEnd: "FFh",
    reservedFrame: 7, cursor: state.cursor, writes: state.writes,
    lastByte: state.lastByte, bytes: bytes, text: lcdGetText_()};
}
