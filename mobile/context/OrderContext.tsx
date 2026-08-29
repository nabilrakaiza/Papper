import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Order, MenuItem, OrderItem } from "../types/order";
import { supabase } from "../lib/supabase";
import { isConnectionError, NO_CONNECTION } from "../lib/errors";

type OrderContextType = {
  orders: Order[];
  menu: MenuItem[];
  loading: boolean;
  error: string | null;
  addOrder: (order: Omit<Order, "id" | "createdAt">, force?: boolean) => Promise<{ error: string | null; stockWarning?: string }>;
  updateOrder: (id: number, order: Partial<Order>, force?: boolean) => Promise<{ error: string | null; stockWarning?: string }>;
  cancelOrderWithPin: (orderId: number, pin: string) => Promise<{ success: boolean; error: string | null }>;
  markItemsSent: (orderId: number, printBatch: number) => Promise<{ error: string | null }>;
  markPaid: (id: number, discount: number, methodOfPayment: string, paymentAmount: number) => Promise<{ error: string | null }>;
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
//   * Items already flagged is_stock_deducted have had their ingredients taken
//     out on a previous save. Including them made an edit ask "do we have
//     enough for the whole order again?" instead of "enough for what was just
//     added", producing shortage warnings for stock that was never needed.
const stockCheckedItems = (items: OrderItem[]) =>
  items
    .filter((i) => i.menuId != null && !i.isStockDeducted)
    .map((i) => ({ menu_id: i.menuId, quantity: i.quantity }));

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
      const { data: unpaidData, error: unpaidError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("status", "unpaid")
        .order("created_at", { ascending: false });

      // Fetch today's paid orders only
      const { data: paidData, error: paidError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
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
          customerName: o.customer_name,
          seat: o.seat,
          discount: o.discount,
          status: o.status,
          createdAt: new Date(o.created_at),
          methodOfPayment: o.method_of_payment,
          isDineIn: o.is_dine_in,
          paymentAmount: o.payment_amount,
          // An order with no rows in order_items comes back as [], but a failed
          // embed comes back as null — don't map straight off it.
          items: (o.order_items ?? []).map((i: any) => ({
            // null for a custom off-menu item
            menuId: i.menu_id ?? null,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            // Updated to map from DB snake_case to app camelCase
            isSent: i.is_sent ?? false,
            isCancelled: i.is_cancelled ?? false,
            printBatch: i.print_batch ?? 1,
            note: i.notes ?? undefined,
            isStockDeducted: i.is_stock_deducted,
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
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const addOrder = async (
    order: Omit<Order, "id" | "createdAt">,
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
        method_of_payment: order.methodOfPayment,
        is_dine_in: order.isDineIn,
        payment_amount: order.paymentAmount
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
        is_stock_deducted: false,
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
      // Fetch original items first so we can revert if something goes wrong
      const { data: originalData, error: fetchError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);

      if (fetchError || !originalData) {
        return { error: "Gagal mengambil item pesanan yang ada. Silakan coba lagi." };
      }

      // No `category` here — order_items has no such column, so including it
      // made the revert insert below fail with an unknown-column error, in the
      // exact situation where the revert is the only thing saving the order.
      const originalItems = originalData.map((i: any) => ({
        order_id: id,
        menu_id: i.menu_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        is_sent: i.is_sent ?? false,
        is_cancelled: i.is_cancelled ?? false,
        print_batch: i.print_batch ?? 1,
        notes: i.notes ?? null,
        is_stock_deducted: i.is_stock_deducted ?? false,
      }));

      // Replace items
      const { error: deleteError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", id);

      if (deleteError) {
        return { error: "Gagal memperbarui item pesanan. Silakan coba lagi." };
      }

      // is_stock_deducted is carried over, not reset. Editing an order replaces
      // its rows wholesale, so hardcoding false here re-presented every existing
      // line to deduct_stock_for_order as if it were new — a second save took
      // the whole order's ingredients out of stock a second time, a third took
      // them a third time, and the shortfall was indistinguishable from
      // ordinary consumption.
      //
      // The screens preserve the flag on lines they keep and leave it unset on
      // lines they add, so only genuinely new quantity deducts. (A client could
      // always have sent this column freely on an open order; the database
      // guards it from payment onwards, via prevent_locked_order_item_change.)
      const { error: itemsError } = await supabase.from("order_items").insert(
        updated.items.map((item) => ({
          order_id: id,
          menu_id: item.menuId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          is_sent: item.isSent ?? false,
          is_cancelled: item.isCancelled ?? false,
          print_batch: item.printBatch ?? 1,
          notes: item.note ?? null,
          is_stock_deducted: item.isStockDeducted ?? false,
        }))
      );

      if (itemsError) {
        // Revert to original items
        await supabase.from("order_items").insert(originalItems);
        return { error: "Gagal memperbarui item pesanan. Silakan coba lagi." };
      }

      // Deduct stock
      const { error: stockError } = await supabase.rpc("deduct_stock_for_order", {
        p_order_id: id,
        p_force: force,
      });

      if (stockError) {
        // Revert to original items
        await supabase.from("order_items").delete().eq("order_id", id);
        const { error: revertError } = await supabase
          .from("order_items")
          .insert(originalItems);

        if (revertError) {
          console.error("CRITICAL: Failed to revert order items after stock error:", revertError);
        }

        if (stockError.message.includes("Insufficient stock")) {
          return { error: "Pembaruan diblokir — satu atau lebih bahan habis." };
        }
        return { error: "Gagal memperbarui stok. Silakan coba lagi." };
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

  const markPaid = async (id: number, discount: number, methodOfPayment: string, paymentAmount: number): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "paid", discount: discount, method_of_payment: methodOfPayment, payment_amount: Math.round(paymentAmount)})
      .eq("id", id);

    if (error) {
      if (isConnectionError(error)) {
        return { error: `${NO_CONNECTION} Pembayaran belum tercatat.` };
      }
      return { error: "Gagal mengonfirmasi pembayaran. Silakan coba lagi." };
    }

    await fetchOrders();

    return { error: null };
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
        markItemsSent,
        markPaid,
        toggleMenuAvailability,
        refetch: fetchOrders,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export const useOrders = () => useContext(OrderContext);