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
  isDineIn: true,
  reopenSeq: 0,
  // Settled by one person: exactly one payment row, which is where the method
  // and the cash tendered now live.
  payments: [
    {
      id: 1,
      customerNum: 1,
      customerLabel: null,
      // 128.000 less 10%, plus tax.
      amount: 126720,
      amountTendered: 200000,
      methodOfPayment: 'Cash',
      reopenSeq: 0,
      approvedBy: null,
      createdAt: NOW,
    },
  ],
  items: [
    { menuId: 12, name: 'Es Kopi Susu Gula Aren', price: 25000, quantity: 2, isSent: true, isCancelled: false, printBatch: 1 },
    { menuId: 3, name: 'Nasi Goreng', price: 35000, quantity: 1, isSent: true, isCancelled: false, printBatch: 1, note: 'pedas' },
    { menuId: null, name: 'Sambal Extra', price: 5000, quantity: 3, isSent: false, isCancelled: false, printBatch: 2 },
    { menuId: 21, name: 'Croissant', price: 28000, quantity: 1, isSent: false, isCancelled: false, printBatch: 2 },
  ],
};

/**
 * The same order, split two ways: the drinks, sambal and pastry on one side,
 * the food on the other.
 *
 * Both payers have settled, deliberately by different means — payer 1 by QRIS,
 * which settles for exactly the bill, and payer 2 in cash with change due.
 * Between them they cover both branches of the payment block, which is the part
 * of the layout a split bill actually changes.
 *
 * Status stays 'unpaid' because a share prints the moment that person pays,
 * which is before the order as a whole is closed.
 */
const splitOrder: Order = {
  ...order,
  status: 'unpaid',
  items: order.items.map((item, idx) => ({ ...item, customerNum: idx === 1 ? 2 : 1 })),
  payments: [
    {
      id: 1,
      customerNum: 1,
      customerLabel: 'Alex',
      // 2x Es Kopi Susu + 3x Sambal + Croissant = 93.000, less 10%, plus tax.
      amount: 92070,
      amountTendered: null,
      methodOfPayment: 'QRIS',
      reopenSeq: 0,
      approvedBy: null,
      createdAt: NOW,
    },
    {
      id: 2,
      customerNum: 2,
      customerLabel: 'Hina',
      // 1x Nasi Goreng = 35.000, less 10%, plus tax.
      amount: 34650,
      amountTendered: 50000,
      methodOfPayment: 'Cash',
      reopenSeq: 0,
      approvedBy: null,
      createdAt: NOW,
    },
  ],
};

/**
 * The same order after a correction, with one line taken off.
 *
 * The customer is holding a receipt for the original 126.720 and has had the
 * difference handed back in cash, so the reprint has to account for the gap
 * rather than just print a smaller total and leave the two pieces of paper
 * silently disagreeing.
 *
 * The payment row carries the movement, not the new total — order_payments is
 * append-only, and a negative amount is money going back out.
 */
const correctedOrder: Order = (() => {
  // Drop the Nasi Goreng: 128.000 - 35.000 = 93.000, less 10%, plus tax.
  const items = order.items.filter((i) => i.name !== 'Nasi Goreng');
  const newTotal = 92070;
  const originalTotal = 126720;

  return {
    ...order,
    items,
    reopenSeq: 1,
    payments: [
      { ...order.payments[0], amount: originalTotal },
      {
        id: 2,
        customerNum: 1,
        customerLabel: null,
        amount: newTotal - originalTotal,
        // Nothing is tendered when money goes the other way — the cashier hands
        // over exactly the difference.
        amountTendered: null,
        methodOfPayment: 'Cash',
        reopenSeq: 1,
        approvedBy: null,
        createdAt: NOW,
      },
    ],
  };
})();

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
      payment: order.payments[0],
      now: NOW,
    })
  );

  // Both shares of the same split bill: each covers only that payer's lines and
  // settles with their own method. Rendered as a pair because the useful check
  // is that the two together account for the whole order and nothing is on both.
  for (const payment of splitOrder.payments) {
    await capture(`customer-receipt-split-payer${payment.customerNum}`, (printer) =>
      renderCustomerReceipt(printer, {
        order: splitOrder,
        cashierName: 'Nabil',
        payment,
        now: NOW,
      })
    );
  }

  // The corrected bill. The check worth looking at is the payment block: what
  // was taken originally, what went back, and a change line that is worked out
  // against the difference rather than the new total.
  await capture('customer-receipt-corrected', (printer) =>
    renderCustomerReceipt(printer, {
      order: correctedOrder,
      cashierName: 'Nabil',
      payment: correctedOrder.payments[1],
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
