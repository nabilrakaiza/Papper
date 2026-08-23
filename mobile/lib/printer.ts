import { BluetoothEscposPrinter, BluetoothManager } from '@vardrz/react-native-bluetooth-escpos-printer';
import { PermissionsAndroid, Platform, Linking } from 'react-native';
import { Order } from '../types/order';
import { CurrentUser } from '@/hooks/useUser';
import type { PicOptions, ReceiptPrinter, TextOptions } from './escpos';
import { renderCustomerReceipt, renderKitchenTicket } from './receiptLayout';

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

export async function scanAndConnectPrinter(): Promise<{
  devices: { name: string; address: string }[];
  error: string | null;
}> {
  const permission = await requestBluetoothPermissions();

  if (!permission.granted) {
    if (permission.permanentlyDenied) {
      Linking.openSettings();
      return {
        devices: [],
        error: 'Izin Bluetooth ditolak secara permanen. Aktifkan di Pengaturan.',
      };
    }

    return {
      devices: [],
      error: 'Izin Bluetooth ditolak.',
    };
  }

  try {
    const paired = await BluetoothManager.enableBluetooth();

    const devices = paired
      .map((d: any) => (typeof d === 'string' ? JSON.parse(d) : d))
      .filter((d: any) => d.name);

    return { devices, error: null };
  } catch (e: any) {
    return { devices: [], error: e?.message || 'Kesalahan Bluetooth' };
  }
}

export async function connectToPrinter(address: string): Promise<{ error: string | null }> {
  try {
    await BluetoothManager.connect(address);
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
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
  let errors: string[] = [];

  // 1. Print customer receipt on cashier printer
  if (cashierPrinter) {
    try {
      await BluetoothManager.connect(cashierPrinter.address);
      // The receipt recomputes the total itself, off the same rounded formula
      // the payment screen uses, so passing orderTotal() separately only risked
      // the printed TOTAL and the change disagreeing by a rupiah.
      await renderCustomerReceipt(bluetoothPrinter, {
        order,
        cashierName: user.name,
        moneyGiven: order.paymentAmount,
      });
    } catch (e: any) {
      errors.push(`Error Printer Kasir: ${e.message}`);
    }
  }

  // 2. Print kitchen ticket on kitchen printer
  if (kitchenPrinter) {
    try {
      // Adding a tiny delay when switching between bluetooth devices
      // can sometimes prevent connection drops in react-native-bluetooth-escpos-printer
      if (cashierPrinter) {
        await new Promise(resolve => setTimeout(resolve, 500)); 
      }
      
      await BluetoothManager.connect(kitchenPrinter.address);
      await renderKitchenTicket(bluetoothPrinter, order);
    } catch (e: any) {
      errors.push(`Error Printer Dapur: ${e.message}`);
    }
  }

  // 3. Return combined errors if any failed
  if (errors.length > 0) {
    return { error: errors.join(' | ') };
  }

  return { error: null };
}