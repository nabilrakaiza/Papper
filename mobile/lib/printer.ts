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
  // 1. Synchronized calculation logic
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  
  const safeDiscountPct = Math.min(Math.max(0, order.discount || 0), 100);
  const discountAmount = subtotal * (safeDiscountPct / 100);
  
  const taxableAmount = subtotal - discountAmount;
  const taxRate = 0.1; // 10%
  const taxAmount = taxableAmount * taxRate;
  
  const total = Math.round(taxableAmount + taxAmount);

  const groupedItems = Object.values(
    order.items.reduce<Record<string, typeof order.items[0]>>((acc, item) => {
      if (acc[item.menuId]) {
        acc[item.menuId] = { ...acc[item.menuId], quantity: acc[item.menuId].quantity + item.quantity };
      } else {
        acc[item.menuId] = { ...item };
      }
      return acc;
    }, {})
  );

  // 2. Print Header
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  
  // Increased widthtimes and heigthtimes to 4 for bigger text. 
  // fonttype: 1 often acts as a bolder/alternate font on most thermal printers.
  await BluetoothEscposPrinter.printText('Nabawi Cafe\n\n', {});

  // Address Section (Still centered)
  await BluetoothEscposPrinter.printText('Jl. Sentul-Jonggol Karang Tengah\n', {});
  await BluetoothEscposPrinter.printText('Kab. Bogor, Jawa Barat, 16810\n', {});
  await BluetoothEscposPrinter.printText('Tel: 0897-9173-349\n', {});
  
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(`Customer: ${order.customerName}\n`, {});
  await BluetoothEscposPrinter.printText(`Seat    : ${order.seat}\n`, {});
  
  // Format Date and Time to Asia/Jakarta (WIB)
  const jktDateTime = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  await BluetoothEscposPrinter.printText(`Date    : ${jktDateTime}\n`, {});
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  // 3. Print Items
  for (const item of groupedItems) {
    await BluetoothEscposPrinter.printColumn(
      [20, 12], // 32 characters total width for 58mm printer
      [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
      [`${item.quantity}x ${item.name}`, formatRupiah(item.price * item.quantity)],
      {}
    );
  }

  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  // 4. Print Subtotal (Helpful when there are multiple modifiers like discount and tax)
  await BluetoothEscposPrinter.printColumn(
    [20, 12],
    [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
    ['Subtotal', formatRupiah(subtotal)],
    {}
  );

  // 5. Print Discount (if applicable)
  if (order.discount > 0) {
    await BluetoothEscposPrinter.printColumn(
      [20, 12],
      [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
      [`Discount ${order.discount}%`, `-${formatRupiah(discountAmount)}`],
      {}
    );
  }

  // 6. Print Tax
  await BluetoothEscposPrinter.printColumn(
    [20, 12],
    [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
    ['Tax 10%', formatRupiah(taxAmount)],
    {}
  );

  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  // 7. Print Final Total
  await BluetoothEscposPrinter.printColumn(
    [20, 12],
    [BluetoothEscposPrinter.ALIGN.LEFT, BluetoothEscposPrinter.ALIGN.RIGHT],
    ['TOTAL', formatRupiah(total)],
    {}
  );

  // 8. Print Footer
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});
  await BluetoothEscposPrinter.printText('Thank you!\n', {});
  await BluetoothEscposPrinter.printText('\n\n\n', {});
}

// Simplified kitchen ticket — no prices
async function printKitchenTicket(order: Order): Promise<void> {
  // 1. Find the maximum print batch number (fallback to 1 if no items)
  const maxBatch = Math.max(...(order.items.map(i => i.printBatch) ?? [1]), 1);

  // 2. Filter items to only include the latest batch and order that hasn't been sent
  const latestBatchItems = order.items.filter(
    (i) => i.printBatch === maxBatch || i.isSent === false
  );

  // 3. Optional: Exit early if there are no items to print
  if (latestBatchItems.length === 0) return;

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

  // 4. Loop through the filtered array instead of all items
  for (const item of latestBatchItems) {
    await BluetoothEscposPrinter.printText(`${item.quantity}x ${item.name}\n`, {
      fonttype: 1, widthtimes: 1, heigthtimes: 1,
    });

    if (item.note) {
      await BluetoothEscposPrinter.printText(`NOTE: ${item.note}\n`, {
        fonttype: 1, widthtimes: 1, heigthtimes: 1,
      })
    }
  }
  await BluetoothEscposPrinter.printText('\n\n\n', {});
}

// Print to both printers sequentially
// Print to selected printers safely
export async function printReceipt(
  order: Order,
  cashierPrinter: { address: string } | null,
  kitchenPrinter: { address: string } | null,
): Promise<{ error: string | null }> {
  let errors: string[] = [];

  // 1. Print customer receipt on cashier printer
  if (cashierPrinter) {
    try {
      await BluetoothManager.connect(cashierPrinter.address);
      await printCustomerReceipt(order);
    } catch (e: any) {
      errors.push(`Cashier Printer Error: ${e.message}`);
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
      await printKitchenTicket(order);
    } catch (e: any) {
      errors.push(`Kitchen Printer Error: ${e.message}`);
    }
  }

  // 3. Return combined errors if any failed
  if (errors.length > 0) {
    return { error: errors.join(' | ') };
  }

  return { error: null };
}