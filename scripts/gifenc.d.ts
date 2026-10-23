// Types for the parts of gifenc (which ships none) that scripts/demo-gif.ts
// uses, written from its README: https://github.com/mattdesl/gifenc
declare module "gifenc" {
  export type Color = number[];
  export type Format = "rgb565" | "rgb444" | "rgba4444";

  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: Format }): Color[];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Color[], format?: Format): Uint8Array;

  export type FrameOptions = {
    // Required for the first frame (it becomes the global color table).
    palette?: Color[];
    // In milliseconds.
    delay?: number;
    // 0 loops forever.
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    // GIF disposal method; 1 keeps the previous frame under this one.
    dispose?: number;
  };

  export type Encoder = {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  };

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder;
}
