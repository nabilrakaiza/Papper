import { BluetoothEscposPrinter, BluetoothManager } from '@vardrz/react-native-bluetooth-escpos-printer';
import { Order } from '../types/order';

function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

export async function scanAndConnectPrinter(): Promise<{ 
  devices: { name: string; address: string }[]; 
  error: string | null 
}> {
  try {
    const paired = await BluetoothManager.enableBluetooth();
    const devices = paired
      .map((d: any) => (typeof d === 'string' ? JSON.parse(d) : d))
      .filter((d: any) => d.name);
    return { devices, error: null };
  } catch (e: any) {
    return { devices: [], error: e.message };
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