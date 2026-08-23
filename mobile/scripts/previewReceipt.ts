/**
 * Renders the receipts to PNGs without a printer, a phone, or a build.
 *
 *   npm run preview:receipt
 *
 * It runs the real layout code from lib/receiptLayout.ts against a recorder
 * (scripts/escposRecorder.ts) that models the native module byte for byte, then
 * hands the resulting ESC/POS stream to scripts/render_escpos.py to draw.
 *
 * What this does and does not prove
 * ---------------------------------
 * Everything downstream of the byte stream is exact: the logo's binarisation,
 * the 32-column layout, wrapping, and how much paper each feed command burns.
 * What it cannot tell you is how your particular printer's firmware reacts to
 * those commands — GS V B on a printer with no cutter especially. For that you
 * still need the hardware.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { Order } from '../types/order';
import { renderCustomerReceipt, renderKitchenTicket } from '../lib/receiptLayout';
import { createRecorder } from './escposRecorder';

/**
 * Resolved by walking up to package.json rather than from __dirname, which
 * points into scripts/.build once this file has been compiled.
 */
function projectRoot(): string {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('could not locate the project root');
    dir = parent;
  }
  return dir;
}

const root = projectRoot();
const outDir = path.join(root, '.preview');

/** Pinned so re-running produces an identical image and diffs stay readable. */
const NOW = new Date('2026-08-23T12:34:00+07:00');

/**
 * Deliberately awkward: a name long enough to wrap the 19-character item
 * column, a custom off-menu item, a discount, and cash tendered above the
 * total so the change line has something to show.
 */
const order: Order = {
  id: 1042,
  customerName: 'Budi Santoso',
  seat: 'A4',
  discount: 10,
  status: 'paid',
  createdAt: NOW,
  methodOfPayment: 'Cash',
  isDineIn: true,
  paymentAmount: 200000,
  items: [
    { menuId: 12, name: 'Es Kopi Susu Gula Aren', price: 25000, quantity: 2, isSent: true, isCancelled: false, printBatch: 1 },
    { menuId: 3, name: 'Nasi Goreng', price: 35000, quantity: 1, isSent: true, isCancelled: false, printBatch: 1, note: 'pedas' },
    { menuId: null, name: 'Sambal Extra', price: 5000, quantity: 3, isSent: false, isCancelled: false, printBatch: 2 },
    { menuId: 21, name: 'Croissant', price: 28000, quantity: 1, isSent: false, isCancelled: false, printBatch: 2 },
  ],
};

async function capture(
  name: string,
  render: (printer: ReturnType<typeof createRecorder>['printer']) => Promise<void>
): Promise<void> {
  const recorder = createRecorder();
  await render(recorder.printer);

  const bin = path.join(outDir, `${name}.escpos`);
  const png = path.join(outDir, `${name}.png`);
  fs.writeFileSync(bin, recorder.bytes());
  execFileSync('python3', [path.join(root, 'scripts', 'render_escpos.py'), bin, png], {
    stdio: 'inherit',
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });

  await capture('customer-receipt', (printer) =>
    renderCustomerReceipt(printer, {
      order,
      cashierName: 'Nabil',
      moneyGiven: order.paymentAmount,
      now: NOW,
    })
  );

  // Both kitchen variants: the ticket differs only by the "Additional order"
  // line, and that line is the whole point of the batch logic, so the preview
  // covers each side of it.
  await capture('kitchen-ticket-added', (printer) =>
    renderKitchenTicket(printer, order, NOW)
  );

  const firstOrder: Order = {
    ...order,
    items: order.items
      .filter((i) => i.printBatch === 1)
      .map((i) => ({ ...i, isSent: false })),
  };
  await capture('kitchen-ticket-first', (printer) =>
    renderKitchenTicket(printer, firstOrder, NOW)
  );

  console.log(`\nWrote previews to ${path.relative(process.cwd(), outDir)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
