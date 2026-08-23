/**
 * A ReceiptPrinter that produces the ESC/POS byte stream instead of sending it.
 *
 * This is a model of the *native module*, not of our app: every method here is
 * a transcription of the corresponding method in
 * node_modules/@vardrz/react-native-bluetooth-escpos-printer/android/src/main/
 * java/cn/jystudio/bluetooth/escpos/, down to the commands the library slips in
 * that we never asked for. That is the point — the trailing feed and the cut
 * command under the logo are invisible in our source but very visible on paper,
 * and they only show up in a preview if the model is faithful to the library
 * rather than to our intent.
 *
 * Only the dev tooling uses this; it is not part of the app bundle.
 */
import zlib from 'node:zlib';
import type { PicOptions, ReceiptPrinter, TextOptions } from '../lib/escpos';

const ESC = 0x1b;
const GS = 0x1d;

/** 58mm paper. RNBluetoothEscposPrinterModule.WIDTH_58. */
export const PAPER_WIDTH_DOTS = 384;

export interface Recorder {
  printer: ReceiptPrinter;
  bytes(): Buffer;
}

export function createRecorder(): Recorder {
  const chunks: Buffer[] = [];
  const emit = (...bytes: (number | Buffer)[]) => {
    for (const b of bytes) {
      chunks.push(typeof b === 'number' ? Buffer.from([b]) : b);
    }
  };

  /**
   * PrinterCommand.POS_Print_Text. Note it prefixes every string with the size,
   * codepage and font commands and appends nothing — no implicit newline.
   */
  const printText = (text: string, options: TextOptions = {}) => {
    if (text.length === 0) return; // the native side drops empty strings

    const widthTimes = options.widthtimes ?? 0;
    const heightTimes = options.heigthtimes ?? 0;
    const intToWidth = [0x00, 0x10, 0x20, 0x30];
    const intToHeight = [0x00, 0x01, 0x02, 0x03];

    emit(GS, 0x21, intToWidth[widthTimes] + intToHeight[heightTimes]); // GS ! n
    emit(ESC, 0x74, options.codepage ?? 0); // ESC t n
    emit(ESC, 0x4d, options.fonttype ?? 0); // ESC M n

    // The library calls String.getBytes("GBK"), which is ASCII-compatible for
    // the range receipts actually use. Anything outside it would encode
    // differently on the device, so refuse rather than preview a lie.
    if (/[^\x00-\x7f]/.test(text)) {
      throw new Error(
        `non-ASCII text would be GBK-encoded on the device, which this ` +
          `recorder does not model: ${JSON.stringify(text)}`
      );
    }
    emit(Buffer.from(text, 'latin1'));
  };

  return {
    bytes: () => Buffer.concat(chunks),
    printer: {
      async align(align: number) {
        emit(ESC, 0x61, align); // ESC a n
      },

      async text(text: string, options?: TextOptions) {
        printText(text, options);
      },

      /**
       * Transcribed from RNBluetoothEscposPrinterModule.printColumn. Each
       * column reserves one character of right padding, and the split loop's
       * `counter + l < width` means a column of declared width w fits w - 1
       * characters before wrapping. Chinese-width handling is dropped: it
       * cannot trigger, since printText above rejects non-ASCII.
       */
      async column(
        widths: number[],
        aligns: number[],
        texts: string[],
        options?: TextOptions
      ) {
        if (widths.length !== texts.length || widths.length !== aligns.length) {
          throw new Error('COLUMN_WIDTHS_ALIGNS_AND_TEXTS_NOT_MATCH');
        }
        const total = widths.reduce((a, b) => a + b, 0);
        if (total > PAPER_WIDTH_DOTS / 8) {
          throw new Error('COLUNM_WIDTHS_TOO_LARGE');
        }

        const padding = 1;
        const table = widths.map((declaredWidth, i) => {
          const width = declaredWidth - padding;
          const text = texts[i];

          const pieces: string[] = [];
          let counter = 0;
          let temp = '';
          for (const ch of text) {
            temp += ch;
            if (counter + 1 < width) {
              counter += 1;
            } else {
              pieces.push(temp);
              temp = '';
              counter = 0;
            }
          }
          if (temp.length > 0) pieces.push(temp);

          return pieces.map((piece) => {
            const cells = new Array(width + padding).fill(' ');
            let startIdx = 0;
            if (aligns[i] === 1 && piece.length < width) {
              startIdx = Math.floor((width - piece.length) / 2);
              if (startIdx + piece.length > width) startIdx--;
              if (startIdx < 0) startIdx = 0;
            } else if (aligns[i] === 2 && piece.length < width) {
              startIdx = width - piece.length;
            }
            for (let c = 0; c < piece.length; c++) cells[startIdx + c] = piece[c];
            return cells.join('');
          });
        });

        const rowCount = Math.max(...table.map((rows) => rows.length));
        for (let row = 0; row < rowCount; row++) {
          const line = table
            .map((rows, column) => rows[row] ?? ' '.repeat(widths[column]))
            .join('');
          printText(line + '\n\r', options);
        }
      },

      /**
       * Transcribed from printPic. The three commands after the raster are the
       * library's, not ours: a 30-dot feed, an optional cut, and a reinit.
       */
      async pic(base64: string, options: PicOptions) {
        const paperWidth =
          options.paperSize === 80 ? 576 : PAPER_WIDTH_DOTS;
        let width = options.width;
        if (width > paperWidth || width === 0) width = paperWidth;

        let leftPadding = options.left ?? 0;
        if (options.center ?? true) {
          leftPadding = Math.max(0, Math.floor((paperWidth - width) / 2));
        }

        emit(ESC, 0x40); // ESC @
        emit(rasterise(Buffer.from(base64, 'base64'), width, leftPadding));
        emit(ESC, 0x4a, 30); // ESC J 30 — hardcoded 30-dot feed
        if (options.autoCut ?? true) {
          emit(GS, 0x56, 0x42, 0x01); // GS V B 1 — feed to cutter, then cut
        }
        emit(ESC, 0x40); // ESC @
      },
    },
  };
}

/**
 * PrintPicture.POS_PrintBMP: scale to a multiple-of-8 width, desaturate,
 * pad left with white, threshold at the mean grey, emit one GS v 0 per row.
 */
function rasterise(png: Buffer, requestedWidth: number, leftPadding: number): Buffer {
  const image = decodeGrayPng(png);
  const width = Math.floor((requestedWidth + 7) / 8) * 8;
  const left = leftPadding === 0 ? 0 : Math.floor((leftPadding + 7) / 8) * 8;

  if (image.width !== width) {
    // POS_PrintBMP would call createScaledBitmap here, which resamples and
    // reintroduces grey. Rather than model Android's scaler badly, refuse:
    // this mismatch is a real bug worth failing the preview over.
    throw new Error(
      `logo is ${image.width} dots wide but printPic was told ${requestedWidth}. ` +
        `The device would rescale and re-smooth it, undoing the pre-binarisation.`
    );
  }

  const totalWidth = width + left;
  const gray = new Uint8Array(totalWidth * image.height).fill(255);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < width; x++) {
      gray[y * totalWidth + left + x] = image.pixels[y * width + x];
    }
  }

  let sum = 0;
  for (const v of gray) sum += v;
  const threshold = Math.floor(Math.floor(sum / image.height) / totalWidth);

  const bytesPerLine = totalWidth / 8;
  const out = Buffer.alloc(image.height * (8 + bytesPerLine));
  for (let y = 0; y < image.height; y++) {
    const base = y * (8 + bytesPerLine);
    out.set([GS, 0x76, 0x30, 0x00, bytesPerLine % 256, (bytesPerLine / 256) | 0, 1, 0], base);
    for (let b = 0; b < bytesPerLine; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        // format_K_threshold marks a dot black when grey <= mean.
        if (gray[y * totalWidth + b * 8 + bit] <= threshold) byte |= 0x80 >> bit;
      }
      out[base + 8 + b] = byte;
    }
  }
  return out;
}

/**
 * Minimal PNG reader for exactly what build_receipt_logo.py emits: 8-bit
 * greyscale, no interlacing. Anything else is a mistake worth shouting about
 * rather than silently mis-rendering.
 */
function decodeGrayPng(png: Buffer): { width: number; height: number; pixels: Uint8Array } {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colorType, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colorType !== 0 || interlace !== 0) {
        throw new Error(
          `expected 8-bit non-interlaced greyscale, got depth=${depth} ` +
            `colorType=${colorType} interlace=${interlace}`
        );
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)];
    const line = raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1));
    for (let x = 0; x < width; x++) {
      const a = x > 0 ? pixels[y * width + x - 1] : 0; // bpp is 1 for grey8
      const b = y > 0 ? pixels[(y - 1) * width + x] : 0;
      const c = x > 0 && y > 0 ? pixels[(y - 1) * width + x - 1] : 0;
      let value: number;
      switch (filter) {
        case 0: value = line[x]; break;
        case 1: value = line[x] + a; break;
        case 2: value = line[x] + b; break;
        case 3: value = line[x] + ((a + b) >> 1); break;
        case 4: value = line[x] + paeth(a, b, c); break;
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      pixels[y * width + x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
