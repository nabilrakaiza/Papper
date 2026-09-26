import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { isConnectionError, NO_CONNECTION } from "@/lib/errors";
import { DateRange, presetRange } from "@/lib/jakartaDate";
import { SalesReport } from "@/types/owner";

/**
 * The owner dashboard's one date range, and the sales report for it.
 *
 * The range lives here rather than on each page because it scopes everything:
 * moving from Ringkasan to Menu should show the same period, not reset to
 * today. The sales report feeds three pages (Ringkasan, Menu, Pembayaran) and
 * the comparison on Pembelian, so it is fetched once per range and kept, which
 * also makes switching back to a range already seen instant.
 *
 * While a new range loads, `sales` keeps the previous report and `salesLoading`
 * is set, so pages dim what they show rather than blanking to a spinner.
 */

type OwnerReportContextType = {
  range: DateRange;
  setRange: (range: DateRange) => void;
  sales: SalesReport | null;
  salesLoading: boolean;
  salesError: string | null;
  /** Bumped by the refresh button; pages with their own fetch depend on it. */
  refreshKey: number;
  refresh: () => void;
};

const OwnerReportContext = createContext<OwnerReportContextType | null>(null);

export function describeError(error: { message?: string; code?: string } | null): string {
  if (error && isConnectionError(error)) return NO_CONNECTION;
  // PostgREST's "no such function": the owner_* migrations are not on this
  // database. Retrying cannot fix that, so say what will.
  if (error?.code === "PGRST202") {
    return "Laporan owner belum tersedia di database. Jalankan migrasi 20260926100000 dan 20260926100100 terlebih dahulu.";
  }
  return "Gagal memuat laporan. Silakan coba lagi.";
}

export function OwnerReportProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(() => presetRange("thisMonth"));
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const cache = useRef(new Map<string, SalesReport>());
  // Only the newest request may land. Clicking through presets quickly fires
  // several, and they can come back in any order.
  const latest = useRef(0);

  const load = useCallback(async (r: DateRange, force: boolean) => {
    const key = `${r.from}|${r.to}`;
    const cached = cache.current.get(key);
    if (cached && !force) {
      setSales(cached);
      setSalesError(null);
      setSalesLoading(false);
      return;
    }

    const request = ++latest.current;
    setSalesLoading(true);

    const { data, error } = await supabase.rpc("owner_sales_report", {
      p_from: r.from,
      p_to: r.to,
    });

    if (request !== latest.current) return;

    if (error || !data) {
      console.error("owner_sales_report failed:", error);
      setSalesError(describeError(error));
    } else {
      cache.current.set(key, data as SalesReport);
      setSales(data as SalesReport);
      setSalesError(null);
    }
    setSalesLoading(false);
  }, []);

  useEffect(() => {
    load(range, false);
  }, [range, load]);

  const refresh = useCallback(() => {
    // Today's figures move all day; a refresh has to reach the database, and
    // any other range cached earlier may be just as stale.
    cache.current.clear();
    setRefreshKey((k) => k + 1);
    load(range, true);
  }, [range, load]);

  return (
    <OwnerReportContext.Provider
      value={{ range, setRange, sales, salesLoading, salesError, refreshKey, refresh }}
    >
      {children}
    </OwnerReportContext.Provider>
  );
}

export function useOwnerReport(): OwnerReportContextType {
  const ctx = useContext(OwnerReportContext);
  if (!ctx) throw new Error("useOwnerReport must be used inside OwnerReportProvider");
  return ctx;
}
