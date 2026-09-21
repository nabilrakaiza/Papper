import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Order, MenuItem, OrderItem, OrderPayment } from "../types/order";
import { supabase } from "../lib/supabase";
import { isConnectionError, NO_CONNECTION } from "../lib/errors";
import { orderTotal } from "../lib/constants";

type OrderContextType = {
  orders: Order[];
  menu: MenuItem[];
  loading: boolean;
  error: string | null;
  addOrder: (order: Omit<Order, "id" | "dailyNumber" | "createdAt" | "payments">, force?: boolean) => Promise<{ error: string | null; stockWarning?: string }>;
  updateOrder: (id: number, order: Partial<Order>, force?: boolean) => Promise<{ error: string | null; stockWarning?: string }>;
  cancelOrderWithPin: (orderId: number, pin: string) => Promise<{ success: boolean; error: string | null }>;
  reopenOrderWithPin: (orderId: number, pin: string) => Promise<{ success: boolean; error: string | null }>;
  markItemsSent: (orderId: number, printBatch: number) => Promise<{ error: string | null }>;
  markPaid: (id: number, discount: number, methodOfPayment: string, paymentAmount: number) => Promise<{ error: string | null }>;
  splitBill: (orderId: number, items: OrderItem[]) => Promise<{ error: string | null }>;
  recordPayment: (
    orderId: number,
    payment: {
      customerNum: number;
      customerLabel: string | null;
      amount: number;
      amountTendered: number | null;
      methodOfPayment: string;
    }
  ) => Promise<{ error: string | null; payment?: OrderPayment }>;
  completeSplitPayment: (orderId: number, discount: number) => Promise<{ error: string | null }>;
  closeCorrectedOrder: (orderId: number, discount: number) => Promise<{ error: string | null }>;
  toggleMenuAvailability: (menuId: number) => Promise<{ error: string | null }>;
  refetch: () => Promise<void>;
};

const OrderContext = createContext<OrderContextType>({} as OrderContextType);

// Payload for check_stock_for_order — the items whose ingredients are about to
// be consumed, which is exactly what deduct_stock_for_order will process.
//
// Two exclusions:
//   * Custom off-menu items carry a null menu_id and have no recipe behind
//     them, so they are dropped rather than sent as nulls the RPC would
//     iterate over for nothing.
//   * Quantity that stock has already funded has had its ingredients taken out
//     on a previous save. Including it made an edit ask "do we have enough for
//     the whole order again?" instead of "enough for what was just added",
//     producing shortage warnings for stock that was never needed.
//
// The second exclusion is a subtraction rather than a filter, because funding
// is a quantity and not a yes/no: a line of 5 that stock has funded 2 of needs
// checking for 3. A line already funded to or past its quantity — which is what
// a reduced line looks like — contributes nothing and is dropped.
const stockCheckedItems = (items: OrderItem[]) =>
  items
    .filter((i) => i.menuId != null)
    .map((i) => ({
      menu_id: i.menuId,
      quantity: i.quantity - (i.stockDeductedQty ?? 0),
    }))
    .filter((i) => i.quantity > 0);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenu = async () => {
    try {
      const { data, error } = await supabase.from("menus").select("*").eq("is_active", true);
      if (error) {
        console.error("Failed to fetch menu:", error.message);
        return;
      }
      if (data) setMenu(data);
    } catch (e) {
      console.error("Failed to fetch menu:", e);
    }
  };

  const fetchOrders = async () => {
    // Everything below runs inside try/finally: a thrown error (a network
    // failure, or a malformed row hitting the mapping) used to skip
    // setLoading(false) entirely and leave the order list spinning forever
    // with no way back except restarting the app.
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch all unpaid orders
      //
      // The category comes through the menu, because order_items has no column
      // for it: tickets and receipts sort by it, and the in-memory menu only
      // holds active dishes, so a dish retired mid-shift would lose its place.
      const { data: unpaidData, error: unpaidError } = await supabase
        .from("orders")
        .select("*, order_items(*, menus(category)), order_payments(*)")
        .eq("status", "unpaid")
        .order("created_at", { ascending: false });

      // Fetch today's paid orders only
      const { data: paidData, error: paidError } = await supabase
        .from("orders")
        .select("*, order_items(*, menus(category)), order_payments(*)")
        .eq("status", "paid")
        .gte("created_at", today.toISOString())
        .lt("created_at", tomorrow.toISOString())
        .order("created_at", { ascending: false });

      if (unpaidError || paidError) {
        setError("Gagal memuat pesanan. Periksa koneksi Anda.");
        return;
      }

      const combined = [...(unpaidData ?? []), ...(paidData ?? [])];

      setOrders(
        combined.map((o) => ({
          id: o.id,
          dailyNumber: o.daily_number ?? null,
          customerName: o.customer_name,
          seat: o.seat,
          discount: o.discount,
          status: o.status,
          createdAt: new Date(o.created_at),
          isDineIn: o.is_dine_in,
          // 0 for every order that has never been corrected, which is also the
          // column's default — so a row written before the column existed, or
          // by anything that does not know about it, reads as "never".
          reopenSeq: o.reopen_seq ?? 0,
          // The whole payment record: one row for an ordinary order, one per
          // payer for a split bill, one more per payer for each correction, and
          // none at all while it is still open. Sorted so the payer cards on the
          // payment screen keep a stable order, then by round so a payer's
          // history reads oldest first.
          payments: (o.order_payments ?? [])
            .map((p: any) => ({
              id: p.id,
              customerNum: p.customer_num,
              customerLabel: p.customer_label ?? null,
              amount: p.amount,
              amountTendered: p.amount_tendered ?? null,
              methodOfPayment: p.method_of_payment,
              reopenSeq: p.reopen_seq ?? 0,
              approvedBy: p.approved_by ?? null,
              createdAt: new Date(p.created_at),
            }))
            .sort(
              (a: OrderPayment, b: OrderPayment) =>
                a.customerNum - b.customerNum || a.reopenSeq - b.reopenSeq
            ),
          // An order with no rows in order_items comes back as [], but a failed
          // embed comes back as null — don't map straight off it.
          items: (o.order_items ?? []).map((i: any) => ({
            // Carried so an edit can name the row it is changing rather than
            // replacing the whole set, and so a line can be assigned to a payer.
            id: i.id,
            // null for a custom off-menu item
            menuId: i.menu_id ?? null,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            // Undefined for a custom item, which has no menu row behind it.
            category: i.menus?.category ?? undefined,
            // Updated to map from DB snake_case to app camelCase
            isSent: i.is_sent ?? false,
            isCancelled: i.is_cancelled ?? false,
            printBatch: i.print_batch ?? 1,
            note: i.notes ?? undefined,
            // How much of this line stock has already funded. Falls back to the
            // old boolean so a row written by a build that predates the column
            // still reads as fully funded rather than as never deducted, which
            // would take its ingredients out a second time.
            stockDeductedQty:
              i.stock_deducted_qty ?? (i.is_stock_deducted ? i.quantity : 0),
            customerNum: i.customer_num ?? 1,
          })),
        }))
      );

      setError(null);
    } catch (e) {
      console.error("Failed to fetch orders:", e);
      setError("Gagal memuat pesanan. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchOrders();

    const subscription = supabase
      .channel("orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        fetchOrders();
      })
      // A payer settling their share changes what the other tablets must show —
      // who still owes, and which lines are now frozen. Without this a second
      // device would go on offering to take a payment that has already been
      // taken, and only find out from the unique-constraint error.
      .on("postgres_changes", { event: "*", schema: "public", table: "order_payments" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const addOrder = async (
    order: Omit<Order, "id" | "dailyNumber" | "createdAt" | "payments">,
    force = false
  ): Promise<{ error: string | null; stockWarning?: string }> => {

    // 1. Pre-check stock BEFORE inserting anything (only if not forcing)
    if (!force) {
      const { data: checkData, error: checkError } = await supabase.rpc(
        "check_stock_for_order",
        {
          // Custom items have no menu row and therefore no recipe — nothing to
          // check, so don't send them.
          p_items: stockCheckedItems(order.items),
        }
      );

      // A check that failed to run is not a check that passed. This used to
      // read `!checkError && shortages.length > 0`, so an RPC error fell
      // straight through as "plenty in stock" — and the order then hit the real
      // shortage inside deduct_stock_for_order, on a path that cannot clean up
      // after itself. Surfaced as a warning rather than a hard block so a
      // flaky connection cannot stop the cafe taking orders.
      //
      // Unless there is no connection at all, in which case every write below
      // is going to fail too. Offering "Lanjutkan saja" there produced a
      // guaranteed failure one tap later, described as a stock problem — the
      // cashier was told stock might be out when the phone simply had no
      // network. Name the actual problem and stop.
      if (checkError) {
        if (isConnectionError(checkError)) {
          return { error: `${NO_CONNECTION} Pesanan belum tersimpan.` };
        }

        return {
          error: null,
          stockWarning:
            "Stok tidak bisa diperiksa saat ini. Lanjutkan tanpa pengecekan stok?",
        };
      }

      if (checkData?.shortages?.length > 0) {
        const names = checkData.shortages.map((s: any) => s.stock_name).join(", ");
        return {
          error: null,
          stockWarning: `Stok menipis: ${names}. Tetap lanjutkan?`,
        };
      }
    }

    // 2. Insert order (same as before)
    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_name: order.customerName,
        seat: order.seat,
        discount: order.discount,
        status: order.status,
        is_dine_in: order.isDineIn,
      })
      .select()
      .single();

    if (orderError || !newOrder) {
      // Covers a connection dropping between the check and the write, and the
      // force path, which skips the check entirely.
      if (isConnectionError(orderError)) {
        return { error: `${NO_CONNECTION} Pesanan belum tersimpan.` };
      }
      return { error: "Gagal membuat pesanan. Silakan coba lagi." };
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      order.items.map((item) => ({
        order_id: newOrder.id,
        menu_id: item.menuId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        is_sent: item.isSent ?? false,
        is_cancelled: item.isCancelled ?? false,
        print_batch: item.printBatch ?? 1,
        notes: item.note ?? null,
        // Nothing on a brand-new order has been funded yet, so the deduction
        // below picks up every line in full.
        stock_deducted_qty: 0,
      }))
    );

    if (itemsError) {
      // Only an admin can actually delete an order — for a cashier this is
      // denied, and the result used to be discarded, so a failure here left a
      // real empty order sitting in the list while the cashier was told the
      // save had failed. Tell them what actually happened instead, or they
      // create a second one.
      const { error: rollbackError } = await supabase
        .from("orders")
        .delete()
        .eq("id", newOrder.id);

      if (rollbackError) {
        await fetchOrders();
        return {
          error:
            "Gagal menyimpan item pesanan. Pesanan kosong terlanjur dibuat — hapus lewat daftar pesanan, jangan buat ulang.",
        };
      }

      return { error: "Gagal menyimpan item pesanan. Silakan coba lagi." };
    }

    // 3. Deduct stock — pass p_force if user confirmed
    const { error: stockError } = await supabase.rpc("deduct_stock_for_order", {
      p_order_id: newOrder.id,
      p_force: force,
    });

    if (stockError) {
      const { error: rollbackError } = await supabase
        .from("orders")
        .delete()
        .eq("id", newOrder.id);

      const reason = stockError.message.includes("Insufficient stock")
        ? "Satu atau lebih bahan habis."
        : "Gagal memperbarui stok.";

      // Same as above: the rollback only succeeds for an admin. Saying
      // "blocked" when the order is in fact on screen is how duplicates happen.
      if (rollbackError) {
        await fetchOrders();
        return {
          error: `${reason} Pesanan terlanjur dibuat dan stok belum dikurangi — cek daftar pesanan, jangan buat ulang.`,
        };
      }

      return { error: `${reason} Pesanan dibatalkan, silakan coba lagi.` };
    }

    await fetchOrders();
    return { error: null };
  };

  const updateOrder = async (
    id: number,
    updated: Partial<Order>,
    force = false
  ): Promise<{ error: string | null; stockWarning?: string }> => {
    // 1. Pre-check stock before writing ANYTHING. This used to sit further down,
    // after the order-level update had already been committed, so a cashier who
    // answered "Batal" to the shortage warning still had the name/seat/discount
    // change stuck on the order — half an edit they never agreed to.
    if (updated.items && !force) {
      const { data: checkData, error: checkError } = await supabase.rpc(
        "check_stock_for_order",
        {
          p_items: stockCheckedItems(updated.items),
        }
      );

      // Same reasoning as addOrder, including the connection case: with no
      // network the writes below cannot succeed, so an override offer is a
      // guaranteed failure wearing a stock warning's label.
      if (checkError) {
        if (isConnectionError(checkError)) {
          return { error: `${NO_CONNECTION} Perubahan belum tersimpan.` };
        }

        return {
          error: null,
          stockWarning:
            "Stok tidak bisa diperiksa saat ini. Lanjutkan tanpa pengecekan stok?",
        };
      }

      if (checkData?.shortages?.length > 0) {
        const names = checkData.shortages
          .map((s: any) => s.stock_name)
          .join(", ");
        return {
          error: null,
          stockWarning: `Stok menipis: ${names}. Tetap lanjutkan?`,
        };
      }
    }

    // 2. Update order-level fields. Built up first so an edit that only touches
    // line items doesn't fire a PATCH with an empty body — there is nothing to
    // write, and whether PostgREST tolerates that is not worth depending on.
    const orderPatch = {
      ...(updated.customerName && { customer_name: updated.customerName }),
      ...(updated.seat && { seat: updated.seat }),
      ...(updated.discount !== undefined && { discount: updated.discount }),
      ...(updated.status && { status: updated.status }),
    };

    if (Object.keys(orderPatch).length > 0) {
      const { error: updateError } = await supabase
        .from("orders")
        .update(orderPatch)
        .eq("id", id);

      if (updateError) {
        if (isConnectionError(updateError)) {
          return { error: `${NO_CONNECTION} Perubahan belum tersimpan.` };
        }
        return { error: "Gagal memperbarui pesanan. Silakan coba lagi." };
      }
    }

    // 3. Handle cancellation
    if (updated.status === "cancelled") {
      const { error: cancelItemsError } = await supabase
        .from("order_items")
        .update({ is_cancelled: true })
        .eq("order_id", id);

      if (cancelItemsError) {
        return { error: "Gagal membatalkan item pesanan. Silakan coba lagi." };
      }
    }

    // 4. Handle item updates
    if (updated.items) {
      // save_order_items names the rows it changes: a line carrying an id is
      // updated in place, one without is inserted, and anything absent from the
      // payload is deleted. Columns the payload does not mention are left
      // alone — which is what retires the class of bug this used to be.
      //
      // It replaced a delete-everything-and-reinsert that had to restate every
      // column, so any column it forgot was destroyed. That cost us
      // is_stock_deducted twice over (each re-save deducted the whole order's
      // ingredients again) and broke the revert path with a `category` key that
      // order_items has no column for.
      //
      // The RPC deducts stock as its last act, inside the same transaction, so
      // a shortage aborts the edit outright and there is no revert to hand-roll
      // any more — the old one issued its own writes to undo the previous ones,
      // and could itself fail, which is a repair path that needs a repair path.
      const { error: itemsError } = await supabase.rpc("save_order_items", {
        p_order_id: id,
        p_force: force,
        p_items: updated.items.map((item) => ({
          // Absent for a line the cashier has just added; present for one being
          // carried over, which is how the RPC tells an insert from an update.
          id: item.id ?? null,
          menu_id: item.menuId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          is_sent: item.isSent ?? false,
          is_cancelled: item.isCancelled ?? false,
          print_batch: item.printBatch ?? 1,
          notes: item.note ?? null,
          // Still sent explicitly rather than left to the RPC's default: the
          // screens carry it on lines they keep and leave it at 0 on lines they
          // add, so only genuinely unfunded quantity is deducted.
          stock_deducted_qty: item.stockDeductedQty ?? 0,
          customer_num: item.customerNum ?? 1,
        })),
      });

      if (itemsError) {
        if (isConnectionError(itemsError)) {
          return { error: `${NO_CONNECTION} Perubahan belum tersimpan.` };
        }
        if (itemsError.message.includes("Insufficient stock")) {
          return { error: "Pembaruan diblokir — satu atau lebih bahan habis." };
        }
        // The per-payer lock, raised as 42501 by prevent_locked_order_item_change.
        if (itemsError.message.includes("has already paid")) {
          return {
            error:
              "Item milik pelanggan yang sudah membayar tidak bisa diubah. Batalkan pembagian tagihan dulu jika perlu.",
          };
        }
        return { error: "Gagal memperbarui item pesanan. Silakan coba lagi." };
      }
    }

    await fetchOrders();
    return { error: null };
  };

  const cancelOrderWithPin = async (orderId: number, pin: string) => {
    // Wrapped because PinOverrideModal turns its spinner off from this result:
    // a thrown request propagated straight through submit() and left the modal
    // stuck mid-submit, with the order neither cancelled nor released.
    try {
      // v2 returns { ok, reason, ... } so a lockout can be told apart from a wrong
      // PIN. The v1 boolean RPC still exists for installs on the older build.
      const { data, error } = await supabase.rpc("cancel_order_with_pin_v2", {
        p_order_id: orderId,
        p_pin: pin,
      });

      if (error) return { success: false, error: "Terjadi kesalahan" };

      if (!data?.ok) {
        if (data?.reason === "locked_out") {
          const minutes = Math.ceil((data.retry_after_seconds ?? 0) / 60);
          return {
            success: false,
            error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`,
          };
        }

        const left = data?.attempts_left ?? 0;
        return {
          success: false,
          error: left > 0 ? `PIN salah. Sisa ${left} percobaan.` : "PIN salah.",
        };
      }

      // sync local state the same way updateOrder does. The RPC cancels the line
      // items alongside the order, so mirror both.
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "cancelled",
                items: o.items.map((i) => ({ ...i, isCancelled: true })),
              }
            : o
        )
      );

      return { success: true, error: null };
    } catch (e) {
      console.error("Failed to cancel order:", e);
      return { success: false, error: "Terjadi kesalahan. Periksa koneksi Anda." };
    }
  };

  /**
   * Reopen a settled order so its lines can be corrected.
   *
   * Same shape as cancelOrderWithPin because it is the same gate: a superadmin
   * PIN, checked in the database, rate-limited against the same counter. A
   * correction rewrites a recorded sale just as a cancellation does.
   *
   * The order returns to 'unpaid' and its round advances. Nothing that was paid
   * is deleted — order_payments is append-only, and what releases the line items
   * is the new round, not the removal of the old rows.
   */
  const reopenOrderWithPin = async (orderId: number, pin: string) => {
    // Wrapped for the same reason cancelOrderWithPin is: PinOverrideModal turns
    // its spinner off from this result, so a thrown request would leave the
    // modal stuck mid-submit with the order neither reopened nor released.
    try {
      const { data, error } = await supabase.rpc("reopen_order_with_pin", {
        p_order_id: orderId,
        p_pin: pin,
      });

      if (error) {
        if (isConnectionError(error)) {
          return { success: false, error: `${NO_CONNECTION} Pesanan belum dibuka.` };
        }
        return { success: false, error: "Terjadi kesalahan" };
      }

      if (!data?.ok) {
        if (data?.reason === "locked_out") {
          const minutes = Math.ceil((data.retry_after_seconds ?? 0) / 60);
          return {
            success: false,
            error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`,
          };
        }

        // Someone else got there first — another tablet corrected or cancelled
        // this order while the PIN was being typed. Saying "PIN salah" here
        // would send the cashier hunting for a manager over nothing.
        if (data?.reason === "not_paid") {
          return {
            success: false,
            error: "Pesanan ini sudah tidak berstatus lunas. Muat ulang daftar pesanan.",
          };
        }

        if (data?.reason === "not_found") {
          return { success: false, error: "Pesanan tidak ditemukan." };
        }

        const left = data?.attempts_left ?? 0;
        return {
          success: false,
          error: left > 0 ? `PIN salah. Sisa ${left} percobaan.` : "PIN salah.",
        };
      }

      await fetchOrders();
      return { success: true, error: null };
    } catch (e) {
      console.error("Failed to reopen order:", e);
      return { success: false, error: "Terjadi kesalahan. Periksa koneksi Anda." };
    }
  };

  // Targeted update rather than going through updateOrder, which replaces the
  // whole item set with a delete + reinsert. That is blocked on paid orders, and
  // would also reset is_stock_deducted and discard the existing row ids just to
  // flip a boolean.
  //
  // Scoped to the batch that was actually printed. Marking every line in the
  // order sent would also clear the flag on a batch that was added and then
  // skipped — which is precisely the state the cashier screen checks for before
  // printing, so a blanket update would destroy the only evidence of the
  // mistake it is meant to catch.
  const markItemsSent = async (orderId: number, printBatch: number): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("order_items")
      .update({ is_sent: true })
      .eq("order_id", orderId)
      .eq("print_batch", printBatch);

    if (error) {
      if (isConnectionError(error)) {
        return { error: `${NO_CONNECTION} Status terkirim belum tersimpan.` };
      }
      return { error: "Gagal memperbarui status terkirim." };
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              items: o.items.map((i) =>
                i.printBatch === printBatch ? { ...i, isSent: true } : i
              ),
            }
          : o
      )
    );

    return { error: null };
  };

  /**
   * Settle an order paid by one person.
   *
   * Two writes, in this order: the payment row first, then the order closes.
   * The payment row cannot be written afterwards —
   * prevent_locked_order_payment_change refuses any write against an order that
   * is already 'paid', which is the same rule that stops a settled bill's
   * takings being rewritten later. Closing first would lock the order against
   * the very row that records how it was paid.
   *
   * `amount` is the bill and `amountTendered` is the cash handed over. They used
   * to share one column on `orders`, which is why that column could not be
   * summed into a revenue figure.
   */
  const markPaid = async (
    id: number,
    discount: number,
    methodOfPayment: string,
    paymentAmount: number
  ): Promise<{ error: string | null }> => {
    try {
      // The discount has to land before the share is computed against it, and
      // it is an order-level fact rather than a payment one.
      const { error: discountError } = await supabase
        .from("orders")
        .update({ discount })
        .eq("id", id);

      if (discountError) {
        if (isConnectionError(discountError)) {
          return { error: `${NO_CONNECTION} Pembayaran belum tercatat.` };
        }
        return { error: "Gagal mengonfirmasi pembayaran. Silakan coba lagi." };
      }

      // Refuse rather than guess. The bill is computed from the order's items,
      // and an order missing from local state would silently produce a subtotal
      // of 0 and record a payment of nothing against a real transaction.
      const order = orders.find((o) => o.id === id);
      if (!order) {
        return { error: "Pesanan tidak ditemukan. Muat ulang daftar pesanan." };
      }

      const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const bill = orderTotal(subtotal, discount);

      // On a corrected order the bill has already been part-settled, so what
      // moves now is the difference — positive if the customer owes more,
      // negative if money goes back to them. Rows from earlier rounds are left
      // exactly as they are: they record money that genuinely changed hands.
      //
      // Every row on an order that has never been corrected is round 0, so this
      // sums to nothing and `delta` is simply the bill.
      const collected = order.payments
        .filter((p) => p.reopenSeq < order.reopenSeq)
        .reduce((sum, p) => sum + p.amount, 0);

      const delta = bill - collected;

      // A correction that leaves the total untouched moves no money, and
      // order_payments refuses a row that records nothing happening. Closing the
      // order is still the right outcome — the lines were what changed.
      if (!(order.reopenSeq > 0 && delta === 0)) {
        const { error: paymentError } = await supabase.from("order_payments").insert({
          order_id: id,
          customer_num: 1,
          customer_label: null,
          amount: delta,
          // Only cash is handed over in a different amount than the bill; every
          // other method settles for exactly the bill, and claiming a tender for
          // them would invent a cash-handling detail. Money going back out has
          // no tender either — the cashier hands over the difference exactly.
          amount_tendered:
            methodOfPayment === "Cash" && delta > 0
              ? Math.round(paymentAmount)
              : null,
          method_of_payment: methodOfPayment,
          reopen_seq: order.reopenSeq,
        });

        if (paymentError) {
          if (isConnectionError(paymentError)) {
            return { error: `${NO_CONNECTION} Pembayaran belum tercatat.` };
          }
          // The unique constraint on (order_id, customer_num, reopen_seq): this
          // order already has a payment for this round, from a double tap or a
          // second tablet.
          if (paymentError.code === "23505") {
            return { error: "Pembayaran untuk pesanan ini sudah tercatat." };
          }
          return { error: "Gagal mencatat pembayaran. Silakan coba lagi." };
        }
      }

      const { error } = await supabase
        .from("orders")
        .update({ status: "paid" })
        .eq("id", id);

      if (error) {
        // The money is recorded; only the order is still showing as open. Say
        // exactly that, because "payment failed" here would have the cashier
        // take it a second time.
        await fetchOrders();
        if (isConnectionError(error)) {
          return {
            error: `${NO_CONNECTION} Pembayaran sudah tercatat, tetapi pesanan belum ditutup.`,
          };
        }
        return {
          error:
            "Pembayaran tercatat, tetapi pesanan gagal ditutup. Coba tutup lagi — jangan menagih ulang.",
        };
      }

      await fetchOrders();

      return { error: null };
    } catch (e) {
      console.error("Failed to mark order paid:", e);
      return {
        error:
          "Tidak yakin pembayaran tercatat — periksa koneksi, lalu muat ulang daftar pesanan sebelum menagih lagi.",
      };
    }
  };

  /**
   * Divide an order's lines between payers.
   *
   * Takes the whole item set rather than a list of assignments, because
   * dividing 2× Kopi one each has to become two rows — a row carries a single
   * customer_num. The screen builds that set: it keeps the original row id for
   * the first payer to take a share of it and adds fresh rows for the rest,
   * carrying is_stock_deducted across so nothing is deducted a second time.
   *
   * Forced, because a split cannot change what was sold — every ingredient is
   * already out of the store and there is nothing new to check stock for.
   * Putting a bill back together is the same call with every line on payer 1,
   * which is why this needs no undo of its own.
   */
  const splitBill = async (
    orderId: number,
    items: OrderItem[]
  ): Promise<{ error: string | null }> => {
    // Wrapped for the same reason cancelOrderWithPin is: the split screen turns
    // its spinner off from this result, so a thrown request would propagate
    // straight through and leave the button dead with the bill neither split
    // nor released.
    try {
      return await updateOrder(orderId, { items }, true);
    } catch (e) {
      console.error("Failed to split bill:", e);
      return { error: "Terjadi kesalahan. Periksa koneksi Anda." };
    }
  };

  /**
   * Record what one payer handed over. Writing this row freezes their line
   * items — see prevent_locked_order_item_change — so it is deliberately the
   * last step for that person, after their receipt has been worked out.
   *
   * The order itself stays `unpaid`: it is closed separately, once the cashier
   * says everyone is done.
   */
  const recordPayment = async (
    orderId: number,
    payment: {
      customerNum: number;
      customerLabel: string | null;
      amount: number;
      amountTendered: number | null;
      methodOfPayment: string;
    }
  ): Promise<{ error: string | null; payment?: OrderPayment }> => {
    // Wrapped like cancelOrderWithPin: the payment screen turns its spinner off
    // from this result. A thrown request here is the worst version of that bug —
    // the cashier is left with a dead button, no error, and no way to tell
    // whether the money was recorded.
    try {
      // The inserted row comes back so the caller can print it immediately. It
      // cannot wait for the refetch below: `orders` in a component closure is
      // still the pre-refetch array until React re-renders, so looking the new
      // payment up there finds nothing and the receipt silently never prints.
      // Refuse rather than guess: the round this row belongs to decides both
      // whether the payer's lines lock and whether the unique key lets the row
      // in at all, and defaulting it to 0 on a corrected order would collide
      // with the original payment instead.
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        return { error: "Pesanan tidak ditemukan. Muat ulang daftar pesanan." };
      }

      const { data, error } = await supabase
        .from("order_payments")
        .insert({
          order_id: orderId,
          customer_num: payment.customerNum,
          customer_label: payment.customerLabel,
          amount: Math.round(payment.amount),
          amount_tendered:
            payment.amountTendered == null ? null : Math.round(payment.amountTendered),
          method_of_payment: payment.methodOfPayment,
          reopen_seq: order.reopenSeq,
        })
        .select()
        .single();

      if (error) {
        if (isConnectionError(error)) {
          return { error: `${NO_CONNECTION} Pembayaran belum tercatat.` };
        }
        // The unique constraint on (order_id, customer_num) — a double tap, or two
        // tablets on the same order. Saying "already recorded" is the truth and
        // stops the cashier taking the money twice.
        if (error.code === "23505") {
          return { error: "Pembayaran pelanggan ini sudah tercatat." };
        }
        return { error: "Gagal mencatat pembayaran. Silakan coba lagi." };
      }

      await fetchOrders();

      return {
        error: null,
        payment: {
          id: data.id,
          customerNum: data.customer_num,
          customerLabel: data.customer_label ?? null,
          amount: data.amount,
          amountTendered: data.amount_tendered ?? null,
          methodOfPayment: data.method_of_payment,
          reopenSeq: data.reopen_seq ?? 0,
          approvedBy: data.approved_by ?? null,
          createdAt: new Date(data.created_at),
        },
      };
    } catch (e) {
      console.error("Failed to record payment:", e);
      // Deliberately does not say the payment failed: the insert may well have
      // reached the database before the throw. Telling the cashier it failed is
      // how the same person gets charged twice.
      return {
        error:
          "Tidak yakin pembayaran tercatat — periksa koneksi, lalu muat ulang daftar pesanan sebelum menagih lagi.",
      };
    }
  };

  /**
   * Close a split order once every payer has settled.
   *
   * `payment_amount` is the sum of what was actually charged — the shares as
   * they were rounded and printed — rather than a recomputed order total, which
   * can differ by a rupiah or two because each share rounds on its own.
   */
  const completeSplitPayment = async (
    orderId: number,
    discount: number
  ): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "paid", discount })
        .eq("id", orderId);

      if (error) {
        if (isConnectionError(error)) {
          return { error: `${NO_CONNECTION} Pesanan belum ditutup.` };
        }
        return { error: "Gagal menutup pesanan. Silakan coba lagi." };
      }

      await fetchOrders();
      return { error: null };
    } catch (e) {
      console.error("Failed to close split order:", e);
      return { error: "Terjadi kesalahan. Periksa koneksi Anda." };
    }
  };

  /**
   * Close a corrected order once the difference has been settled.
   *
   * Identical to completeSplitPayment in what it writes — the order row goes to
   * 'paid' and the discount lands with it — and kept apart because the two mean
   * different things at the call site and would otherwise read as the same
   * thing happening for the same reason. A split closes when the last payer
   * settles; a correction closes when the difference has moved.
   */
  const closeCorrectedOrder = async (
    orderId: number,
    discount: number
  ): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "paid", discount })
        .eq("id", orderId);

      if (error) {
        if (isConnectionError(error)) {
          return { error: `${NO_CONNECTION} Pesanan belum ditutup.` };
        }
        // The money is already recorded; only the order is still showing as
        // open. Saying the correction failed here is how it gets done twice.
        return {
          error:
            "Selisih sudah tercatat, tetapi pesanan gagal ditutup. Coba tutup lagi — jangan ulangi koreksinya.",
        };
      }

      await fetchOrders();
      return { error: null };
    } catch (e) {
      console.error("Failed to close corrected order:", e);
      return { error: "Terjadi kesalahan. Periksa koneksi Anda." };
    }
  };

  // Returns the failure rather than swallowing it. The switch reverting on its
  // own with no explanation reads as the toggle being ignored, and the cashier
  // just taps it again.
  const toggleMenuAvailability = async (menuId: number): Promise<{ error: string | null }> => {
    const item = menu.find((m) => m.id === menuId);
    if (!item) return { error: null };

    // Optimistic update
    setMenu((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, available: !m.available } : m))
    );

    const { error } = await supabase.rpc("toggle_menu_availability", { p_menu_id: menuId });

    if (error) {
      // Revert on failure
      setMenu((prev) =>
        prev.map((m) => (m.id === menuId ? { ...m, available: item.available } : m))
      );
      return { error: `Gagal mengubah ketersediaan ${item.name}. Periksa koneksi Anda.` };
    }

    return { error: null };
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        menu,
        loading,
        error,
        addOrder,
        updateOrder,
        cancelOrderWithPin,
        reopenOrderWithPin,
        markItemsSent,
        markPaid,
        splitBill,
        recordPayment,
        completeSplitPayment,
        closeCorrectedOrder,
        toggleMenuAvailability,
        refetch: fetchOrders,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export const useOrders = () => useContext(OrderContext);