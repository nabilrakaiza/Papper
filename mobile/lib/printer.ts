import { BluetoothEscposPrinter, BluetoothManager } from '@vardrz/react-native-bluetooth-escpos-printer';
import { PermissionsAndroid, Platform, Linking } from 'react-native';
import { Order } from '../types/order';
import { RECEIPT_LOGO_BASE64 } from './printerLogo';
import { CurrentUser } from '@/hooks/useUser';
import { TAX_RATE } from './constants';

function formatRupiah(amount: number | null): string {
  if (amount === null){
    return '';
  }
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

// Display-only labels (Indonesian) for the receipt — the underlying
// order.methodOfPayment value is left untouched since it's stored as-is.
const PAYMENT_METHOD_PRINT_LABELS: Record<string, string> = {
  QRIS: 'QRIS',
  'Bank Transfer': 'Transfer Bank',
  Cash: 'Tunai',
};

function orderTotal(order: Order): number {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return subtotal * (1 - order.discount / 100) * (1 + TAX_RATE);
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
async function printCustomerReceipt(order: Order, user: CurrentUser, totalPrice: number, moneyGiven: number | null): Promise<void> {
  // 1. Synchronized calculation logic
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  
  const safeDiscountPct = Math.min(Math.max(0, order.discount || 0), 100);
  const discountAmount = subtotal * (safeDiscountPct / 100);
  
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * TAX_RATE;
  
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

  const base64Image = RECEIPT_LOGO_BASE64;

  // 2. Print Header
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printPic(base64Image, {
    width: 200,
    left: 0,
  });

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
  await BluetoothEscposPrinter.printText(`Pelanggan: ${order.customerName}\n`, {});
  await BluetoothEscposPrinter.printText(`Kursi    : ${order.seat}\n`, {});

  // Format Date and Time to Asia/Jakarta (WIB)
  const jktDateTime = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  await BluetoothEscposPrinter.printText(`Tanggal  : ${jktDateTime}\n`, {});
  await BluetoothEscposPrinter.printText(`Kasir    : ${user.name}\n`, {});
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  if (order.isDineIn){
    await BluetoothEscposPrinter.printText(`* Dine In *\n`, {});
  }
  else{
    await BluetoothEscposPrinter.printText(`* Take Away *\n`, {});
  }

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
    [`Tax ${TAX_RATE * 100}%`, formatRupiah(taxAmount)],
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

  const colWidths = [20, 12];
  const colAligns = [
    BluetoothEscposPrinter.ALIGN.LEFT,
    BluetoothEscposPrinter.ALIGN.RIGHT
  ];

  if (order.status === 'paid') {
    await BluetoothEscposPrinter.printColumn(colWidths, colAligns, ['Metode Bayar', PAYMENT_METHOD_PRINT_LABELS[order.methodOfPayment ?? ''] ?? `${order.methodOfPayment}`], {});

    if (order.methodOfPayment === 'Cash' && moneyGiven != null){
      await BluetoothEscposPrinter.printColumn(colWidths, colAligns, ['Jumlah Bayar', formatRupiah(moneyGiven)], {});
      await BluetoothEscposPrinter.printColumn(colWidths, colAligns, ['Kembalian', formatRupiah(totalPrice - moneyGiven)], {});
    }
    else {
      await BluetoothEscposPrinter.printColumn(colWidths, colAligns, ['Jumlah Bayar', formatRupiah(moneyGiven)], {});
    }
  }

  // 8. Print Footer
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});
  await BluetoothEscposPrinter.printText('Terima kasih!\n', {});
  await BluetoothEscposPrinter.printText('\n', {});
  await BluetoothEscposPrinter.printText('Instagram  : @nabawicafe\n', {});
  await BluetoothEscposPrinter.printText('TikTok  : @nabawicafe\n', {});
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
  await BluetoothEscposPrinter.printText('DAPUR\n', {
    encoding: 'GBK', codepage: 0, widthtimes: 2, heigthtimes: 2, fonttype: 1,
  });
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(`Pelanggan: ${order.customerName}\n`, {});
  await BluetoothEscposPrinter.printText(`Kursi    : ${order.seat}\n`, {});
  await BluetoothEscposPrinter.printText(`Waktu    : ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`, {});
  await BluetoothEscposPrinter.printText('--------------------------------\n', {});

  // 4. Loop through the filtered array instead of all items
  for (const item of latestBatchItems) {
    await BluetoothEscposPrinter.printText(`${item.quantity}x ${item.name}\n`, {
      fonttype: 1, widthtimes: 1, heigthtimes: 1,
    });

    if (item.note) {
      await BluetoothEscposPrinter.printText(`CATATAN: ${item.note}\n`, {
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
  user: CurrentUser,
): Promise<{ error: string | null }> {
  let errors: string[] = [];

  // 1. Print customer receipt on cashier printer
  if (cashierPrinter) {
    try {
      await BluetoothManager.connect(cashierPrinter.address);
      await printCustomerReceipt(order, user, orderTotal(order), order.paymentAmount);
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
      await printKitchenTicket(order);
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