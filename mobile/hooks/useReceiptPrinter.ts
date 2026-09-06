// Printing a customer receipt from a screen that is not the order list.
//
// Deliberately narrow: the cashier printer and the customer receipt, nothing
// else. The order list's print path also drives kitchen tickets, the
// latest-batch warnings and markItemsSent, and holds a single `printing` guard
// across both kinds of print — that guard is what stops a second print opening
// a connection on top of a native thread still blocked on the first, which is
// the failure that used to leave the print buttons dead for the rest of the
// session. Splitting it into two independent guards would let a bill print and
// a kitchen ticket overlap again, so that screen keeps its own flow and this
// hook does not try to absorb it.
import { useRef, useState } from "react";
import { Order, OrderPayment } from "../types/order";
import { printReceipt } from "../lib/printer";
import { usePrinter, PrinterRole } from "../context/PrinterContext";
import { useUser } from "./useUser";

type Device = { name: string; address: string };

export function useReceiptPrinter() {
  const { cashierPrinter, setPrinter } = usePrinter();
  const { user, loading: userLoading } = useUser();

  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [selectorVisible, setSelectorVisible] = useState(false);

  // What to print once a printer has been picked. A ref rather than state: it
  // is read inside the connection callback and never rendered.
  const pending = useRef<{ order: Order; payment?: OrderPayment } | null>(null);

  const doPrint = async (
    order: Order,
    payment: OrderPayment | undefined,
    printer: Device
  ) => {
    // A receipt carries the cashier's name, so there is nothing to print
    // without one.
    if (!user) {
      setPrintError(
        userLoading
          ? "Memuat data pengguna, coba lagi sebentar lagi."
          : "Tidak bisa mencetak: data pengguna tidak tersedia. Coba masuk ulang."
      );
      return;
    }

    setPrinting(true);
    setPrintError(null);

    // Every exit has to clear `printing`, including the ones nobody planned
    // for: a single throw on the way out would leave the button dead with no
    // spinner and no error, and the only way back is force-closing the app.
    try {
      // null kitchen printer — this never prints a kitchen ticket.
      const { error } = await printReceipt(order, printer, null, user, payment);
      if (error) setPrintError(error);
    } catch (e) {
      setPrintError(
        `Gagal mencetak: ${
          e instanceof Error && e.message ? e.message : "kesalahan tidak diketahui"
        }.`
      );
    } finally {
      setPrinting(false);
    }
  };

  /**
   * Print a receipt, asking for a printer first if none is paired.
   *
   * `payment` prints one payer's share of a split bill; omitted, it prints the
   * whole order.
   */
  const printCustomerReceipt = async (order: Order, payment?: OrderPayment) => {
    if (printing) return;

    setPrintError(null);

    if (!cashierPrinter) {
      pending.current = { order, payment };
      setSelectorVisible(true);
      return;
    }

    await doPrint(order, payment, cashierPrinter);
  };

  /** Wire to PrinterSelector's onConnected. */
  const handlePrinterConnected = async (role: PrinterRole, device: Device) => {
    setPrinter(role, device);

    const queued = pending.current;
    pending.current = null;

    // Only resume if the printer they picked is the one being waited on —
    // pairing a kitchen printer here should not fire off a receipt.
    if (queued && role === "cashier") {
      await doPrint(queued.order, queued.payment, device);
    }
  };

  return {
    printing,
    printError,
    setPrintError,
    selectorVisible,
    setSelectorVisible,
    printCustomerReceipt,
    handlePrinterConnected,
  };
}
