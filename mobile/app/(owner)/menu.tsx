import { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { ArrowDown, Search } from "lucide-react-native";
import { useOwnerReport } from "@/context/OwnerReportContext";
import { BarList, Card, Empty, ErrorBanner, Loading } from "@/components/owner/ui";
import { count, percent, rupiah } from "@/components/owner/format";
import { ItemSales } from "@/types/owner";

type SortKey = "qty" | "gross" | "net" | "profit" | "margin";

function categoryLabel(category: string): string {
  return category === "Custom" ? "Item kustom" : category;
}

function profitOf(item: ItemSales): number | null {
  return item.cogs === null ? null : item.net - item.cogs;
}

function marginOf(item: ItemSales): number | null {
  const profit = profitOf(item);
  return profit === null || item.net <= 0 ? null : profit / item.net;
}

const COLUMNS: { key: SortKey | null; label: string; width: number }[] = [
  { key: null, label: "Kategori", width: 130 },
  { key: "qty", label: "Terjual", width: 80 },
  { key: "gross", label: "Penjualan kotor", width: 140 },
  { key: "net", label: "Penjualan bersih", width: 140 },
  { key: null, label: "HPP", width: 120 },
  { key: "profit", label: "Laba kotor", width: 130 },
  { key: "margin", label: "Margin", width: 80 },
];

function ItemTable({ items }: { items: ItemSales[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("qty");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const value = (i: ItemSales): number => {
      switch (sort) {
        case "qty": return i.qty;
        case "gross": return i.gross;
        case "net": return i.net;
        // Items with no HPP sort last rather than as zero, which would put
        // them among the loss-makers.
        case "profit": return profitOf(i) ?? -Infinity;
        case "margin": return marginOf(i) ?? -Infinity;
      }
    };
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .sort((a, b) => value(b) - value(a));
  }, [items, query, sort]);

  const totals = rows.reduce(
    (t, i) => ({ qty: t.qty + i.qty, gross: t.gross + i.gross, net: t.net + i.net }),
    { qty: 0, gross: 0, net: 0 }
  );

  const cell = (width: number, align: "left" | "right" = "right") => ({ width, textAlign: align } as const);
  const num = { fontVariant: ["tabular-nums" as const] };

  return (
    <Card
      title="Semua item"
      subtitle="Klik judul kolom untuk mengurutkan"
      right={
        <View className="flex-row items-center gap-2 bg-gray-100 rounded-xl px-3 py-2" style={{ minWidth: 220 }}>
          <Search size={14} color="#9ca3af" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cari item atau kategori"
            placeholderTextColor="#9ca3af"
            className="flex-1 text-sm font-bold text-gray-900"
            style={{ outlineStyle: "none" } as object}
          />
        </View>
      }
    >
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ minWidth: 1060, flex: 1 }}>
          <View className="flex-row items-center py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl px-3">
            <Text className="flex-1 text-xs font-extrabold text-gray-500" style={{ minWidth: 240 }}>Item</Text>
            {COLUMNS.map((c) =>
              c.key ? (
                <TouchableOpacity
                  key={c.label}
                  onPress={() => setSort(c.key as SortKey)}
                  style={{ width: c.width }}
                  className="flex-row items-center justify-end gap-1"
                >
                  <Text className={`text-xs font-extrabold ${sort === c.key ? "text-gray-900" : "text-gray-500"}`}>
                    {c.label}
                  </Text>
                  {sort === c.key && <ArrowDown size={12} color="#111827" />}
                </TouchableOpacity>
              ) : (
                <Text
                  key={c.label}
                  className="text-xs font-extrabold text-gray-500"
                  style={cell(c.width, c.label === "Kategori" ? "left" : "right")}
                >
                  {c.label}
                </Text>
              )
            )}
          </View>

          {rows.length === 0 ? (
            <Empty text={query ? "Tidak ada item yang cocok" : undefined} />
          ) : (
            rows.map((i) => {
              const profit = profitOf(i);
              const margin = marginOf(i);
              return (
                <View key={`${i.menu_id ?? "custom"}-${i.name}`} className="flex-row items-center py-2.5 border-b border-gray-100 px-3">
                  <Text className="flex-1 text-sm font-bold text-gray-900" style={{ minWidth: 240 }} numberOfLines={1}>
                    {i.name}
                  </Text>
                  <Text className="text-sm font-bold text-gray-500" style={cell(130, "left")} numberOfLines={1}>
                    {categoryLabel(i.category)}
                  </Text>
                  <Text className="text-sm font-bold text-gray-900" style={[cell(80), num]}>{count(i.qty)}</Text>
                  <Text className="text-sm font-bold text-gray-700" style={[cell(140), num]}>{rupiah(i.gross)}</Text>
                  <Text className="text-sm font-bold text-gray-700" style={[cell(140), num]}>{rupiah(i.net)}</Text>
                  {i.cogs === null ? (
                    <Text className="text-xs font-extrabold text-amber-700" style={cell(120)}>belum diatur</Text>
                  ) : (
                    <Text className="text-sm font-bold text-gray-700" style={[cell(120), num]}>{rupiah(i.cogs)}</Text>
                  )}
                  <Text
                    className={`text-sm font-bold ${profit !== null && profit < 0 ? "text-red-600" : "text-gray-900"}`}
                    style={[cell(130), num]}
                  >
                    {profit === null ? "—" : rupiah(profit)}
                  </Text>
                  <Text className="text-sm font-bold text-gray-700" style={[cell(80), num]}>
                    {margin === null ? "—" : percent(margin)}
                  </Text>
                </View>
              );
            })
          )}

          {rows.length > 0 && (
            <View className="flex-row items-center py-2.5 px-3">
              <Text className="flex-1 text-sm font-black text-gray-900" style={{ minWidth: 240 }}>
                Total ({count(rows.length)} item)
              </Text>
              <View style={{ width: 130 }} />
              <Text className="text-sm font-black text-gray-900" style={[cell(80), num]}>{count(totals.qty)}</Text>
              <Text className="text-sm font-black text-gray-900" style={[cell(140), num]}>{rupiah(totals.gross)}</Text>
              <Text className="text-sm font-black text-gray-900" style={[cell(140), num]}>{rupiah(totals.net)}</Text>
              <View style={{ width: 330 }} />
            </View>
          )}
        </View>
      </ScrollView>
    </Card>
  );
}

export default function MenuPage() {
  const { sales, salesLoading, salesError, refresh } = useOwnerReport();

  const categories = useMemo(() => {
    const map = new Map<string, { qty: number; gross: number; items: ItemSales[] }>();
    for (const item of sales?.items ?? []) {
      const entry = map.get(item.category) ?? { qty: 0, gross: 0, items: [] };
      entry.qty += item.qty;
      entry.gross += item.gross;
      entry.items.push(item);
      map.set(item.category, entry);
    }
    return [...map.entries()].map(([category, v]) => ({ category, ...v }));
  }, [sales]);

  if (!sales) return salesError ? <ErrorBanner message={salesError} onRetry={refresh} /> : <Loading />;

  const totalQty = categories.reduce((s, c) => s + c.qty, 0);
  const totalGross = categories.reduce((s, c) => s + c.gross, 0);

  const byVolume = [...categories]
    .sort((a, b) => b.qty - a.qty)
    .map((c) => ({
      key: c.category,
      label: categoryLabel(c.category),
      value: c.qty,
      valueLabel: count(c.qty),
      detail: totalQty > 0 ? percent(c.qty / totalQty) : undefined,
    }));

  const bySales = [...categories]
    .sort((a, b) => b.gross - a.gross)
    .map((c) => ({
      key: c.category,
      label: categoryLabel(c.category),
      value: c.gross,
      valueLabel: rupiah(c.gross),
      detail: totalGross > 0 ? percent(c.gross / totalGross) : undefined,
    }));

  const byCategory = [...categories].sort((a, b) => b.gross - a.gross);

  return (
    <View className="gap-4" style={{ opacity: salesLoading ? 0.5 : 1 }}>
      <ItemTable items={sales.items} />

      <View className="flex-row flex-wrap gap-4">
        <Card className="flex-1 min-w-[320px]" title="Kategori menurut jumlah terjual" subtitle="Porsi dari semua item terjual">
          <BarList rows={byVolume} />
        </Card>
        <Card className="flex-1 min-w-[320px]" title="Kategori menurut penjualan" subtitle="Penjualan kotor dan porsinya">
          <BarList rows={bySales} />
        </Card>
      </View>

      {byCategory.length > 0 && (
        <>
          <Text className="text-lg font-black text-gray-900 mt-2">Item terlaris per kategori</Text>
          <View className="flex-row flex-wrap gap-4">
            {byCategory.map((c) => {
              const top = [...c.items].sort((a, b) => b.qty - a.qty).slice(0, 5);
              return (
                <Card key={c.category} className="flex-1 min-w-[260px]" title={categoryLabel(c.category)} subtitle={`${count(c.qty)} terjual`}>
                  <BarList
                    rows={top.map((i) => ({
                      key: `${i.menu_id ?? "custom"}-${i.name}`,
                      label: i.name,
                      value: i.qty,
                      valueLabel: count(i.qty),
                    }))}
                  />
                </Card>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
