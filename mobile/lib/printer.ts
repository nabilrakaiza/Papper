import { BluetoothEscposPrinter, BluetoothManager } from '@vardrz/react-native-bluetooth-escpos-printer';
import { PermissionsAndroid, Platform, Linking } from 'react-native';
import { Order } from '../types/order';

function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
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
        error: 'Bluetooth permission permanently denied. Please enable it in Settings.',
      };
    }

    return {
      devices: [],
      error: 'Bluetooth permission denied.',
    };
  }

  try {
    const paired = await BluetoothManager.enableBluetooth();

    const devices = paired
      .map((d: any) => (typeof d === 'string' ? JSON.parse(d) : d))
      .filter((d: any) => d.name);

    return { devices, error: null };
  } catch (e: any) {
    return { devices: [], error: e?.message || 'Bluetooth error' };
  }
}

export async function connectToPrinter(address: string): Promise<{ error: string | null }> {
  try {
    console.log("connecting to:", address);
    await BluetoothManager.connect(address);
    console.log("connected!");
    return { error: null };
  } catch (e: any) {
    console.log("connection error:", e);
    return { error: e.message };
  }
}

export async function printReceipt(order: Order): Promise<{ error: string | null }> {
  try {
    const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const total = subtotal * (1 - order.discount / 100);

    // Header
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printText('PAPPER\n', {
      encoding: 'GBK',
      codepage: 0,
      widthtimes: 2,
      heigthtimes: 2,
      fonttype: 1,
    });
    await BluetoothEscposPrinter.printText('--------------------------------\n', {});

    // Customer info
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
    await BluetoothEscposPrinter.printText(`Customer: ${order.customerName}\n`, {});
    await BluetoothEscposPrinter.printText(`Seat    : ${order.seat}\n`, {});
    await BluetoothEscposPrinter.printText(`Date    : ${new Date().toLocaleDateString('id-ID')}\n`, {});
    await BluetoothEscposPrinter.printText('--------------------------------\n', {});

    // Items
    for (const item of order.items) {
      const itemTotal = item.price * item.quantity;
      await BluetoothEscposPrinter.printColumn(
        [24, 8],
        [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
        [`${item.quantity}x ${item.name}`, formatRupiah(itemTotal)],
        {}
      );
    }

    await BluetoothEscposPrinter.printText('--------------------------------\n', {});

    // Discount if any
    if (order.discount > 0) {
      await BluetoothEscposPrinter.printColumn(
        [24, 8],
        [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
        [`Discount ${order.discount}%`, `-${formatRupiah(subtotal - total)}`],
        {}
      );
    }

    // Total
    await BluetoothEscposPrinter.printColumn(
      [24, 8],
      [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
      ['TOTAL', formatRupiah(total)],
      { fonttype: 1, widthtimes: 1, heigthtimes: 1 }
    );

    // Note
    if (order.note) {
      await BluetoothEscposPrinter.printText('--------------------------------\n', {});
      await BluetoothEscposPrinter.printText(`Note: ${order.note}\n`, {});
    }

    // Footer
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printText('--------------------------------\n', {});
    await BluetoothEscposPrinter.printText('Thank you!\n', {});
    await BluetoothEscposPrinter.printText('\n\n\n', {});

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}