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
    await BluetoothManager.connect(address);
    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}
async function printCustomerReceipt(order: Order): Promise<void> {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal * (1 - order.discount / 100);

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('Nabawi Cafe\n', {
    encoding: 'GBK', codepage: 0, widthtimes: 2, heigthtimes: 2, fonttype: 1,
  });
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(`Customer: ${order.customerName}\n`, {});
  await BluetoothEscposPrinter.printText(`Seat    : ${order.seat}\n`, {});
  await BluetoothEscposPrinter.printText(`Date    : ${new Date().toLocaleDateString('id-ID')}\n`, {});
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  for (const item of order.items) {
    await BluetoothEscposPrinter.printColumn(
      [20, 12], // can change this value to make it better
      [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
      [`${item.quantity}x ${item.name}`, formatRupiah(item.price * item.quantity)],
      {}
    );
  }

  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  if (order.discount > 0) {
    await BluetoothEscposPrinter.printColumn(
      [20, 12],
      [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
      [`Discount ${order.discount}%`, `-${formatRupiah(subtotal - total)}`],
      {}
    );
  }

  await BluetoothEscposPrinter.printColumn(
    [20, 12],
    [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
    ['TOTAL', formatRupiah(total)],
    {}
  );

  if (order.note) {
    await BluetoothEscposPrinter.printText('--------------------------------\n', {});
    await BluetoothEscposPrinter.printText(`Note: ${order.note}\n`, {});
  }

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});
  await BluetoothEscposPrinter.printText('Thank you!\n', {});
  await BluetoothEscposPrinter.printText('\n\n\n', {});
}

// Simplified kitchen ticket — no prices
async function printKitchenTicket(order: Order): Promise<void> {
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('KITCHEN\n', {
    encoding: 'GBK', codepage: 0, widthtimes: 2, heigthtimes: 2, fonttype: 1,
  });
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(`Customer: ${order.customerName}\n`, {});
  await BluetoothEscposPrinter.printText(`Seat    : ${order.seat}\n`, {});
  await BluetoothEscposPrinter.printText(`Time    : ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`, {});
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  for (const item of order.items) {
    await BluetoothEscposPrinter.printText(`${item.quantity}x ${item.name}\n`, {
      fonttype: 1, widthtimes: 1, heigthtimes: 1,
    });
  }

  if (order.note) {
    await BluetoothEscposPrinter.printText('--------------------------------\n', {});
    await BluetoothEscposPrinter.printText(`NOTE: ${order.note}\n`, {
      fonttype: 1, widthtimes: 1, heigthtimes: 1,
    });
  }

  await BluetoothEscposPrinter.printText('\n\n\n', {});
}

// Print to both printers sequentially
export async function printReceipt(
  order: Order,
  cashierPrinter: { address: string } | null,
  kitchenPrinter: { address: string } | null,
): Promise<{ error: string | null }> {
  try {
    // Print customer receipt on cashier printer
    if (cashierPrinter) {
      await BluetoothManager.connect(cashierPrinter.address);
      await printCustomerReceipt(order);
    }

    // Print kitchen ticket on kitchen printer
    if (kitchenPrinter) {
      await BluetoothManager.connect(kitchenPrinter.address);
      await printKitchenTicket(order);
    }

    return { error: null };
  } catch (e: any) {
    return { error: e.message };
  }
}