/** "Rp 18.858.000" */
export function rupiah(amount: number): string {
  const rounded = Math.round(amount);
  return (rounded < 0 ? "−Rp " : "Rp ") + Math.abs(rounded).toLocaleString("id-ID");
}

/** Axis ticks and tight spots: "1,5 jt", "250 rb", "2 M". */
export function compactRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  if (abs >= 1e9) return `${fmt(amount / 1e9)} M`;
  if (abs >= 1e6) return `${fmt(amount / 1e6)} jt`;
  if (abs >= 1e3) return `${fmt(amount / 1e3)} rb`;
  return fmt(amount);
}

export function count(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** A ratio as "97,7%". */
export function percent(ratio: number): string {
  return `${(ratio * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

// Display labels for the stored method_of_payment values, which are English
// because they are what the CHECK constraint and the receipt logic use. The
// same table lives in the admin Penjualan and order screens.
const METHOD_LABELS: Record<string, string> = {
  Cash: "Tunai",
  "Bank Transfer": "Transfer Bank",
  QRIS: "QRIS",
  Debit: "Debit",
  Split: "Terpisah",
};

export function methodLabel(method: string | null): string {
  if (method === null) return "Tidak dicatat";
  return METHOD_LABELS[method] ?? method;
}

export const STATUS_LABELS: Record<string, string> = {
  paid: "Lunas",
  unpaid: "Belum bayar",
  cancelled: "Dibatalkan",
};
