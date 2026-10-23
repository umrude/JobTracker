import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

// Moving a card with the keyboard: ←/→ jump a whole column at a time.
// dnd-kit's default moves 25px per key press, which would take a dozen
// presses to cross one column.

export type Box = { left: number; top: number; width: number; height: number };

// Where to put the dragged card's top-left corner to land in the column
// next to the one it's over, or undefined at either end of the board.
// Pure, so it's tested with plain numbers (column-keyboard.test.ts).
export function nextColumnPosition(direction: "left" | "right", dragged: Box, columns: Box[]): { x: number; y: number } | undefined {
  if (columns.length === 0) return undefined;
  const sorted = [...columns].sort((a, b) => a.left - b.left);
  const center = dragged.left + dragged.width / 2;
  // The column the card is over, or the nearest one if it's between two.
  const distance = (column: Box) =>
    center < column.left ? column.left - center : center > column.left + column.width ? center - (column.left + column.width) : 0;
  const current = sorted.reduce((best, column, index) => (distance(column) < distance(sorted[best]) ? index : best), 0);
  const target = sorted[current + (direction === "right" ? 1 : -1)];
  if (!target) return undefined;
  // Centered in the target, just below its heading, so it's over that
  // column even when the column is shorter than the card's old position.
  return { x: target.left + (target.width - dragged.width) / 2, y: target.top + 48 };
}

export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return undefined;
  // Arrow keys move the card, not the page, while one is picked up.
  event.preventDefault();
  const dragged = context.collisionRect;
  if (!dragged || (event.code !== "ArrowLeft" && event.code !== "ArrowRight")) return undefined;
  return nextColumnPosition(event.code === "ArrowRight" ? "right" : "left", dragged, [...context.droppableRects.values()]);
};
