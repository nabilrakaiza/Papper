/**
 * The slice of the ESC/POS printer API that the receipt layouts use.
 *
 * The layouts in receiptLayout.ts are written against this interface rather
 * than against BluetoothEscposPrinter directly, so the exact same code that
 * drives the cashier's printer can be replayed into a recorder on a laptop
 * (scripts/escposRecorder.ts) and rendered to an image. One implementation
 * means the preview cannot drift from what the printer actually produces.
 *
 * This file deliberately imports nothing: the preview tooling runs under plain
 * Node, where importing the native module would fail.
 */

/** Mirrors BluetoothEscposPrinter.ALIGN — these are the `n` of ESC a n. */
export const ALIGN = {
  LEFT: 0,
  CENTER: 1,
  RIGHT: 2,
} as const;

/**
 * Option keys are the native module's, misspelling included: it reads
 * "heigthtimes" off the options map, so renaming it here would silently
 * fall back to the default.
 */
export type TextOptions = {
  encoding?: string;
  codepage?: number;
  widthtimes?: number;
  heigthtimes?: number;
  fonttype?: number;
};

export type PicOptions = {
  /**
   * Printed width in dots. Must equal the source image's own pixel width,
   * otherwise the native side rescales with a smoothing filter and destroys
   * the pre-binarised artwork — see printerLogo.ts.
   */
  width: number;
  left?: number;
  autoCut?: boolean;
  center?: boolean;
  paperSize?: number;
};

export interface ReceiptPrinter {
  align(align: number): Promise<void>;
  text(text: string, options?: TextOptions): Promise<void>;
  column(
    widths: number[],
    aligns: number[],
    texts: string[],
    options?: TextOptions
  ): Promise<void>;
  pic(base64: string, options: PicOptions): Promise<void>;
}
