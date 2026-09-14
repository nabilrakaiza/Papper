/**
 * What goes on the paper.
 *
 * Split out of printer.ts so the layout is independent of the transport: these
 * functions take a ReceiptPrinter, which in the app is the Bluetooth module and
 * in scripts/previewReceipt.ts is a recorder that renders to an image. Anything
 * to do with connecting, retrying or reporting printer errors stays in
 * printer.ts — nothing here knows Bluetooth exists.
 */
import type { Order, OrderItem, OrderPayment } from '../types/order';
import { ALIGN, type ReceiptPrinter } from './escpos';
import { RECEIPT_LOGO_BASE64, RECEIPT_LOGO_WIDTH_DOTS } from './printerLogo';
import { TAX_RATE, orderTotal } from './constants';
import { groupItems, itemSection, sortByCategory, type ItemSection } from './orderItems';
import { isSplit } from './splitBill';

/** 58mm paper at 203dpi, as 12-dot font A characters. */
const LINE_WIDTH = 32;
const DIVIDER = '-'.repeat(LINE_WIDTH) + '\n';

/** Left column takes the item name, right column the money. */
const MONEY_COLS = [20, 12];
const MONEY_ALIGNS = [ALIGN.LEFT, ALIGN.RIGHT];

function formatRupiah(amount: number | null): string {
  if (amount === null) {
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
  Debit: 'Debit',
};

export type CustomerReceiptArgs = {
  order: Order;
  /** Just the name — the layout has no business with the rest of the user. */
  cashierName: string;
  /**
   * What was paid. For an ordinary order that is its single payment row; for a
   * split bill, the one payer whose share this receipt covers — the items are
   * then filtered to their lines. Omitted for a bill printed before payment,
   * which prints the order with no payment block.
   */
  payment?: OrderPayment;
  /**
   * Injected so the preview can pin it and produce a stable image; the app
   * leaves it out and gets the current time.
   */
  now?: Date;
};

export async function renderCustomerReceipt(
  p: ReceiptPrinter,
  { order, cashierName, payment, now = new Date() }: CustomerReceiptArgs
): Promise<void> {
  // A share prints only what that person is paying for. Everything below —
  // subtotal, discount, tax, total — then follows from this one line, so the
  // figures on a share are arrived at exactly the way a whole receipt's are.
  const items = payment
    ? order.items.filter((i) => (i.customerNum ?? 1) === payment.customerNum)
    : order.items;

  // How it was paid comes from the payment row and nowhere else. `orders` no
  // longer carries a method or an amount: one column could not describe a split
  // bill, and the amount meant the tender for cash and the bill for everything
  // else, so it could never simply be printed.
  const method = payment?.methodOfPayment ?? null;
  const tendered = payment?.amountTendered ?? null;

  // A settled receipt is one with a payment behind it. A share is printed the
  // moment that person pays, which is before the order as a whole is closed, so
  // this cannot wait for status to become 'paid'; equally, an unpaid bill
  // printed for the table has no payment row and prints no payment block.
  const settled = payment !== undefined;

  // 1. Synchronized calculation logic
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const safeDiscountPct = Math.min(Math.max(0, order.discount || 0), 100);
  const discountAmount = subtotal * (safeDiscountPct / 100);
  const taxAmount = (subtotal - discountAmount) * TAX_RATE;

  // Shared helper — the printed TOTAL is the figure the reports sum, so the
  // receipt in the customer's hand and the books always agree.
  const total = orderTotal(subtotal, safeDiscountPct);

  // Grouped by itemKey rather than menuId: custom items all carry a null menu
  // id, so keying on that would print every unrelated one as a single line.
  //
  // Then listed in the same order as the kitchen ticket — kitchen, bar, custom —
  // so the customer can check the bill against what arrives at the table.
  const groupedItems = sortByCategory(groupItems(items));

  // 2. Print Header
  await p.align(ALIGN.CENTER);
  await p.pic(RECEIPT_LOGO_BASE64, {
    // Tied to the artwork's own pixel width so the two cannot drift apart: a
    // mismatch makes the native side rescale and re-smooth the bitmap, undoing
    // the pre-binarisation that keeps the logo legible.
    width: RECEIPT_LOGO_WIDTH_DOTS,
    left: 0,
    // Defaults to true, which sends GS V B 1 — "feed to the cutting position
    // and cut". On a printer with no cutter that still advances the paper the
    // full head-to-cutter distance, which was the large blank band under the
    // logo. There is nothing to cut mid-receipt in any case.
    autoCut: false,
  });

  // printPic ends with ESC @, which already restores the default line spacing
  // and resets alignment, so the header has to re-assert its alignment here.
  await p.align(ALIGN.CENTER);
  await p.text('Nabawi Cafe\n');

  // Address Section (Still centered)
  await p.text('Jl. Sentul-Jonggol Karang Tengah\n');
  await p.text('Kab. Bogor, Jawa Barat, 16810\n');
  await p.text('Tel: 0897-9173-349\n');

  await p.text(DIVIDER);
  await p.align(ALIGN.LEFT);
  await p.text(`Pelanggan: ${order.customerName}\n`);
  await p.text(`Kursi    : ${order.seat}\n`);

  // Says whose share this is, and that it is a share. Without it, three
  // receipts for one table are three receipts that each look like the whole
  // bill, only wrong.
  //
  // Keyed on the order actually being divided, not on there being a payment:
  // since payment data moved out of `orders`, an ordinary order has a payment
  // row too, and this line was printing "Bagian: Pelanggan 1" on every single
  // receipt.
  if (payment && isSplit(order)) {
    await p.text(
      `Bagian   : ${payment.customerLabel || `Pelanggan ${payment.customerNum}`}\n`
    );
  }

  // Format Date and Time to Asia/Jakarta (WIB)
  const jktDateTime = now.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  await p.text(`Tanggal  : ${jktDateTime}\n`);
  await p.text(`Kasir    : ${cashierName}\n`);
  await p.text(DIVIDER);

  await p.align(ALIGN.CENTER);
  await p.text(order.isDineIn ? '* Dine In *\n' : '* Take Away *\n');

  // 3. Print Items
  for (const item of groupedItems) {
    await p.column(MONEY_COLS, MONEY_ALIGNS, [
      `${item.quantity}x ${item.name}`,
      formatRupiah(item.price * item.quantity),
    ]);
  }

  await p.text(DIVIDER);

  // 4. Print Subtotal (Helpful when there are multiple modifiers like discount and tax)
  await p.column(MONEY_COLS, MONEY_ALIGNS, ['Subtotal', formatRupiah(subtotal)]);

  // 5. Print Discount (if applicable)
  if (order.discount > 0) {
    await p.column(MONEY_COLS, MONEY_ALIGNS, [
      `Discount ${order.discount}%`,
      `-${formatRupiah(discountAmount)}`,
    ]);
  }

  // 6. Print Tax
  await p.column(MONEY_COLS, MONEY_ALIGNS, [
    `Tax ${TAX_RATE * 100}%`,
    formatRupiah(taxAmount),
  ]);

  await p.text(DIVIDER);

  // 7. Print Final Total
  await p.column(MONEY_COLS, MONEY_ALIGNS, ['TOTAL', formatRupiah(total)]);

  if (settled) {
    // A corrected bill. The customer is holding an earlier receipt for a
    // different figure, so the new one has to account for the gap rather than
    // silently disagree with the paper in their hand: what was taken before,
    // and which way the difference went.
    //
    // `payment.amount` is the difference itself, negative when money was handed
    // back — order_payments is append-only, so the row records the movement and
    // not the new total.
    if (payment && payment.reopenSeq > 0) {
      const previous = total - payment.amount;

      await p.column(MONEY_COLS, MONEY_ALIGNS, [
        'Dibayar Awal',
        formatRupiah(previous),
      ]);
      await p.column(MONEY_COLS, MONEY_ALIGNS, [
        payment.amount < 0 ? 'Dikembalikan' : 'Tambahan Bayar',
        formatRupiah(Math.abs(payment.amount)),
      ]);
    }

    await p.column(MONEY_COLS, MONEY_ALIGNS, [
      'Metode Bayar',
      PAYMENT_METHOD_PRINT_LABELS[method ?? ''] ?? `${method}`,
    ]);

    // What this payment was actually for. On an ordinary bill that is the
    // total; on a correction it is the difference that changed hands, and
    // working change out against the total instead would have the receipt
    // promise back money that was never handed over.
    const charged = payment && payment.reopenSeq > 0 ? payment.amount : total;

    if (method === 'Cash' && tendered != null) {
      await p.column(MONEY_COLS, MONEY_ALIGNS, [
        'Jumlah Bayar',
        formatRupiah(tendered),
      ]);
      // Change is what the customer gets back — cash given minus what was
      // charged. This was the other way round, so every receipt printed
      // negative change.
      await p.column(MONEY_COLS, MONEY_ALIGNS, [
        'Kembalian',
        formatRupiah(tendered - charged),
      ]);
    } else if (charged > 0) {
      // Non-cash settles for exactly what was charged, so print that. Nothing
      // else is recorded for it: order_payments only carries a tender for cash,
      // precisely because for every other method the tender IS the bill.
      //
      // Skipped entirely when the money went the other way: "Dikembalikan"
      // above has already said the figure, and printing it again under a label
      // that calls it a payment is two kinds of wrong on one receipt.
      await p.column(MONEY_COLS, MONEY_ALIGNS, ['Jumlah Bayar', formatRupiah(charged)]);
    }
  }

  // 8. Print Footer
  await p.align(ALIGN.CENTER);
  await p.text(DIVIDER);
  await p.text('Terima kasih!\n');
  await p.text('\n');
  await p.text('Instagram  : @nabawicafe\n');
  await p.text('TikTok  : @nabawicafe\n');
  await p.text('\n\n\n');
}

/**
 * The batch a kitchen ticket printed right now would cover.
 *
 * Exported so the cashier screen decides "which batch am I about to print" with
 * the same rule the ticket itself uses. If the two ever disagreed, the screen
 * would mark the wrong batch as sent.
 */
export function latestPrintBatch(order: Order): number {
  return Math.max(...(order.items.map((i) => i.printBatch) ?? [1]), 1);
}

/**
 * Items that were added to the order and will never reach the kitchen: they
 * belong to an earlier batch, and no ticket was printed while that batch was
 * the newest one.
 *
 * This is the exact shape of the mistake the strict-latest-batch rule creates —
 * adding twice before printing — so the screen can catch it instead of relying
 * on the cashier remembering. It only works while markItemsSent is scoped to
 * the batch actually printed; marking the whole order sent would erase it.
 */
export function unprintedEarlierItems(order: Order): OrderItem[] {
  const maxBatch = latestPrintBatch(order);
  return order.items.filter((i) => i.printBatch !== maxBatch && !i.isSent);
}

/**
 * Items in the newest batch that have not been printed yet.
 *
 * Checked before the cashier opens an order to add to it: adding creates a
 * batch above this one, and once it is no longer the newest batch a kitchen
 * ticket will never include it. Catching it here prevents the mistake, where
 * unprintedEarlierItems only reports it afterwards, when the items are already
 * stranded and the only remaining choice is to abandon them.
 */
export function unprintedLatestBatch(order: Order): OrderItem[] {
  const maxBatch = latestPrintBatch(order);
  return order.items.filter((i) => i.printBatch === maxBatch && !i.isSent);
}

const SECTION_TITLES: Record<ItemSection, string> = {
  kitchen: 'DAPUR',
  bar: 'BAR',
  custom: 'CUSTOM MENU',
};

// Simplified kitchen ticket — no prices
export async function renderKitchenTicket(
  p: ReceiptPrinter,
  order: Order,
  now: Date = new Date()
): Promise<void> {
  // 1. Find the maximum print batch number (fallback to 1 if no items)
  const maxBatch = latestPrintBatch(order);

  // 2. Strictly the latest batch, and nothing else.
  //
  // This used to also pick up `isSent === false` items from earlier batches,
  // which broke the way the ticket is actually used: the cashier prints the
  // same order three times, for the bar, the kitchen and one more station. The
  // first print calls markItemsSent, which flips is_sent on *every* line in the
  // order, so copies two and three came out shorter than copy one — three
  // stations working from three different lists.
  //
  // Keying only on printBatch removes the mutable input, so every copy is
  // identical no matter how many times it is printed. The trade is that a batch
  // is only ever printed while it is the newest one: adding items twice before
  // printing means the middle batch never reaches the kitchen.
  const latestBatchItems = order.items.filter((i) => i.printBatch === maxBatch);

  // 3. Optional: Exit early if there are no items to print
  if (latestBatchItems.length === 0) return;

  // widthtimes/heigthtimes are ESC/POS magnification multipliers where 0 is
  // normal size. Only the title is magnified: it is how a station calls the
  // order out. The ticket is printed for every station, so it is named by the
  // order rather than by any one of them — by the day's number, which is short
  // enough to call across a room, and by id only if it has none.
  await p.align(ALIGN.CENTER);
  await p.text(`ORDER #${order.dailyNumber ?? order.id}\n`, {
    encoding: 'GBK',
    codepage: 0,
    widthtimes: 1,
    heigthtimes: 1,
    fonttype: 1,
  });

  // Batch 1 is the order as first taken; anything above it was added to an
  // order the kitchen has already seen, so the ticket has to say so or it reads
  // as a brand new order for the same seat.
  if (maxBatch > 1) {
    await p.text('Additional order\n');
  }

  await p.text(DIVIDER);

  await p.align(ALIGN.LEFT);
  await p.text(`Pelanggan: ${order.customerName}\n`);
  await p.text(`Kursi    : ${order.seat}\n`);
  await p.text(
    `Waktu    : ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}\n`
  );
  await p.text(DIVIDER);

  // 4. Items, grouped by the station that makes them.
  //
  // Each station reads only its own section, so a section is headed only when
  // it has something in it. Items print at the same plain size as the lines
  // above: they used to be double height, which stretched the glyphs until the
  // whole list read as bold.
  let section: ItemSection | null = null;

  for (const item of sortByCategory(latestBatchItems)) {
    if (itemSection(item) !== section) {
      // A blank line between sections, so where one station's list ends and
      // the next begins is clear at a glance. None above the first: the
      // divider is already there.
      if (section !== null) {
        await p.text('\n');
      }
      section = itemSection(item);
      await p.text(`-- ${SECTION_TITLES[section]} --\n`);
    }

    await p.text(`${item.quantity}x ${item.name}\n`);

    // Font B, the smaller one, so a note reads as belonging to the line above
    // rather than as another item.
    if (item.note) {
      await p.text(`CATATAN: ${item.note}\n`, {
        fonttype: 1,
        widthtimes: 0,
        heigthtimes: 0,
      });
    }
  }
  await p.text('\n\n\n');
}
