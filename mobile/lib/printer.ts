import { BluetoothEscposPrinter, BluetoothManager } from '@vardrz/react-native-bluetooth-escpos-printer';
import { PermissionsAndroid, Platform, Linking } from 'react-native';
import { Order } from '../types/order';
import { CurrentUser } from '@/hooks/useUser';
import type { PicOptions, ReceiptPrinter, TextOptions } from './escpos';
import { renderCustomerReceipt, renderKitchenTicket } from './receiptLayout';
import { breadcrumb } from './printerTrail';

/**
 * One radio, one caller.
 *
 * The native module keeps a single connection for the whole app: it stores the
 * pending connect promise under one fixed "CONNECT" key, and BluetoothService
 * keeps one mConnectedThread. A second connect arriving while one is still in
 * flight overwrites that slot, and both halves of the print then go wrong — the
 * first promise is never settled, so the await that started the print hangs for
 * the rest of the session, and the second is rejected by the *first* attempt's
 * failure, reporting "printer mati" about a printer that just connected fine.
 *
 * The module is only safe with one caller at a time and nothing enforced that:
 * the print button opens a connection, and so does the printer picker, which
 * could be opened while a print was still running. Every exported function here
 * goes through this queue instead.
 */
let printerQueue: Promise<unknown> = Promise.resolve();

function withPrinter<T>(work: () => Promise<T>): Promise<T> {
  // Runs whether the previous job succeeded or failed — the queue only tracks
  // when the radio is free, never what the last caller made of it.
  const result = printerQueue.then(work, work);
  printerQueue = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * The native side gives up on an unreachable device after ~10-12s, so anything
 * still outstanding at 15s is a promise that is never going to settle.
 */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * The cap on a whole print, connect included. The longest receipt we produce is
 * ~166mm of paper, a few seconds of printing, so this is nowhere near a
 * performance budget — it is the outer guarantee that the caller always gets an
 * answer. A connect timeout alone is not enough: a write to a socket the
 * printer has already dropped can block in the native module too, and an await
 * that never returns is what leaves the print button dead.
 */
const PRINT_DEADLINE_MS = 60_000;

/**
 * Scanning waits on a system dialog, which can be dismissed in ways that never
 * come back as a result.
 */
const SCAN_DEADLINE_MS = 60_000;

/**
 * A timed-out operation is abandoned by us, not by the native thread, which is
 * still sitting inside BluetoothSocket.connect(). Handing the radio straight to
 * the next caller is what races BluetoothService.stop() against a socket that
 * has not been assigned yet, so the queue is held a little longer afterwards to
 * let the abandoned attempt fall over on its own first.
 */
const COOLDOWN_MS = 5_000;

class PrinterTimeout extends Error {}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rejects with a PrinterTimeout if `work` has not settled in time. It cancels
 * nothing — the native side carries on — which is why every caller that sees
 * one also holds the queue through a cooldown afterwards.
 */
async function withDeadline<T>(
  ms: number,
  message: string,
  work: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PrinterTimeout(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * `e.message` on its own throws when the rejection is not an Error — which the
 * native module does produce — and a throw inside a catch block escapes the
 * function that was supposed to be reporting the failure, taking the caller's
 * "printing finished" bookkeeping with it.
 */
function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}

async function connectWithTimeout(address: string): Promise<void> {
  breadcrumb(`connect:start ${address}`);
  try {
    await withDeadline(
      CONNECT_TIMEOUT_MS,
      'Printer tidak merespons. Pastikan printer menyala dan dalam jangkauan.',
      () => BluetoothManager.connect(address)
    );
    breadcrumb('connect:ok');
  } catch (e) {
    breadcrumb(`connect:failed ${errorMessage(e, 'unknown')}`);
    throw e;
  }
}

async function requestBluetoothPermissions(): Promise<{
  granted: boolean;
  permanentlyDenied: boolean;
}> {
  if (Platform.OS !== 'android') {
    return { granted: true, permanentlyDenied: false };
  }

  try {
    // Android 12+ (API 31+)
    if (Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      const values = Object.values(result);

      const granted = values.every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED
      );

      const permanentlyDenied = values.some(
        (r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      );

      return { granted, permanentlyDenied };
    }

    // Android < 12
    const location = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    return {
      granted: location === PermissionsAndroid.RESULTS.GRANTED,
      permanentlyDenied:
        location === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  } catch (e) {
    return { granted: false, permanentlyDenied: false };
  }
}

/**
 * Null when the app may talk to the radio, otherwise the reason it may not.
 *
 * Checked on the print path too, not just when picking a printer. A printer
 * restored from AsyncStorage goes straight to connect() without the picker ever
 * opening, and an ungranted permission then surfaces as a SecurityException on
 * the module's own Bluetooth thread — which no try/catch here can reach, and
 * which takes the whole app down with it.
 *
 * `openSettings` only for the picker: sending the cashier out to a system
 * screen in the middle of printing a bill is worse than telling them why
 * nothing came out.
 */
async function permissionError(openSettings: boolean): Promise<string | null> {
  const permission = await requestBluetoothPermissions();

  if (permission.granted) {
    return null;
  }

  if (permission.permanentlyDenied) {
    if (openSettings) {
      Linking.openSettings();
    }
    return 'Izin Bluetooth ditolak secara permanen. Aktifkan di Pengaturan.';
  }

  return 'Izin Bluetooth ditolak.';
}

export async function scanAndConnectPrinter(): Promise<{
  devices: { name: string; address: string }[];
  error: string | null;
}> {
  return withPrinter(async () => {
    const denied = await permissionError(true);

    if (denied) {
      return { devices: [], error: denied };
    }

    try {
      // The module ships no types, so the payload is `any` either way; naming
      // it here just stops the deadline wrapper inferring `unknown`.
      const paired = await withDeadline<any[]>(
        SCAN_DEADLINE_MS,
        'Bluetooth tidak merespons.',
        () => BluetoothManager.enableBluetooth()
      );

      const devices = paired
        .map((d: any) => (typeof d === 'string' ? JSON.parse(d) : d))
        .filter((d: any) => d.name);

      return { devices, error: null };
    } catch (e) {
      if (e instanceof PrinterTimeout) {
        await delay(COOLDOWN_MS);
      }
      return { devices: [], error: errorMessage(e, 'Kesalahan Bluetooth') };
    }
  });
}

export async function connectToPrinter(address: string): Promise<{ error: string | null }> {
  return withPrinter(async () => {
    const denied = await permissionError(false);

    if (denied) {
      return { error: denied };
    }

    try {
      await connectWithTimeout(address);
      return { error: null };
    } catch (e) {
      if (e instanceof PrinterTimeout) {
        await delay(COOLDOWN_MS);
      }
      return { error: errorMessage(e, 'Gagal terhubung ke printer.') };
    }
  });
}

/**
 * Drives the real printer. Every call is a straight pass-through to the native
 * module — the adapter exists only so receiptLayout.ts can be handed a
 * recorder instead when previewing on a laptop.
 *
 * Options are forwarded as `{}` rather than undefined to match what the layout
 * code sent before it was extracted; the native side treats them the same, but
 * keeping it identical means the byte stream is provably unchanged.
 */
const bluetoothPrinter: ReceiptPrinter = {
  align: (align: number) => BluetoothEscposPrinter.printerAlign(align),
  text: (text: string, options?: TextOptions) =>
    BluetoothEscposPrinter.printText(text, options ?? {}),
  column: (widths: number[], aligns: number[], texts: string[], options?: TextOptions) =>
    BluetoothEscposPrinter.printColumn(widths, aligns, texts, options ?? {}),
  pic: (base64: string, options: PicOptions) =>
    BluetoothEscposPrinter.printPic(base64, options),
};

// Print to both printers sequentially, skipping either one that isn't configured.
export async function printReceipt(
  order: Order,
  cashierPrinter: { address: string } | null,
  kitchenPrinter: { address: string } | null,
  user: CurrentUser,
): Promise<{ error: string | null }> {
  return withPrinter(async () => {
    const runPrint = async (): Promise<{ error: string | null }> => {
      breadcrumb(
        `print:start order=${order.id} cashier=${cashierPrinter ? 'yes' : 'no'} kitchen=${kitchenPrinter ? 'yes' : 'no'}`
      );

      const denied = await permissionError(false);

      if (denied) {
        breadcrumb('print:failed permission');
        return { error: denied };
      }

      let errors: string[] = [];
      // Held past the end of the print, so the next attempt does not start a
      // connect on top of a native thread still blocked on this one.
      let timedOut = false;

      // 1. Print customer receipt on cashier printer
      if (cashierPrinter) {
        try {
          await connectWithTimeout(cashierPrinter.address);
          // The receipt recomputes the total itself, off the same rounded formula
          // the payment screen uses, so passing orderTotal() separately only risked
          // the printed TOTAL and the change disagreeing by a rupiah.
          await renderCustomerReceipt(bluetoothPrinter, {
            order,
            cashierName: user.name,
            moneyGiven: order.paymentAmount,
          });
          breadcrumb('render:cashier ok');
        } catch (e) {
          timedOut = timedOut || e instanceof PrinterTimeout;
          errors.push(`Error Printer Kasir: ${errorMessage(e, 'gagal mencetak')}`);
        }
      }

      // 2. Print kitchen ticket on kitchen printer
      if (kitchenPrinter) {
        try {
          // Adding a tiny delay when switching between bluetooth devices
          // can sometimes prevent connection drops in react-native-bluetooth-escpos-printer
          if (cashierPrinter) {
            await delay(500);
          }

          await connectWithTimeout(kitchenPrinter.address);
          await renderKitchenTicket(bluetoothPrinter, order);
          breadcrumb('render:kitchen ok');
        } catch (e) {
          timedOut = timedOut || e instanceof PrinterTimeout;
          errors.push(`Error Printer Dapur: ${errorMessage(e, 'gagal mencetak')}`);
        }
      }

      if (timedOut) {
        await delay(COOLDOWN_MS);
      }

      // 3. Return combined errors if any failed
      if (errors.length > 0) {
        breadcrumb(`print:failed ${errors.join(' | ')}`);
        return { error: errors.join(' | ') };
      }

      breadcrumb('print:done');
      return { error: null };
    };

    try {
      return await withDeadline(
        PRINT_DEADLINE_MS,
        'Pencetakan tidak selesai. Periksa printer, lalu coba lagi.',
        runPrint
      );
    } catch (e) {
      // runPrint reports per-printer failures itself, so reaching here means the
      // deadline fired, or something threw where nothing was expected to. Either
      // way the caller gets an answer instead of waiting forever.
      breadcrumb(`print:failed ${errorMessage(e, 'unknown')}`);
      await delay(COOLDOWN_MS);
      return { error: errorMessage(e, 'Gagal mencetak.') };
    }
  });
}
