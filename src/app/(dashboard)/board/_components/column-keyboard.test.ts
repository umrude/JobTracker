import { describe, expect, it } from "vitest";
import { nextColumnPosition, type Box } from "./column-keyboard";

// Three 280px columns, 16px apart, starting at x=100.
const column = (i: number): Box => ({ left: 100 + i * 296, top: 200, width: 280, height: 600 });
const COLUMNS = [column(2), column(0), column(1)]; // any order
const card = (left: number): Box => ({ left, top: 400, width: 256, height: 90 });

describe("nextColumnPosition", () => {
  it("moves one whole column right or left, centered, under the heading", () => {
    expect(nextColumnPosition("right", card(112), COLUMNS)).toEqual({ x: 396 + 12, y: 248 });
    expect(nextColumnPosition("left", card(408), COLUMNS)).toEqual({ x: 112, y: 248 });
  });

  it("stays put at either end of the board", () => {
    expect(nextColumnPosition("left", card(112), COLUMNS)).toBeUndefined();
    expect(nextColumnPosition("right", card(704), COLUMNS)).toBeUndefined();
  });

  it("uses the nearest column when the card is between two", () => {
    // Center at 390: in the gap, 10px past column 0, 6px before column 1.
    expect(nextColumnPosition("right", card(262), COLUMNS)).toEqual({ x: 704, y: 248 });
  });

  it("does nothing with no columns", () => {
    expect(nextColumnPosition("right", card(0), [])).toBeUndefined();
  });
});
