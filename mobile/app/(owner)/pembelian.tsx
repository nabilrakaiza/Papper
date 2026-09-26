import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { ArrowDownRight, ArrowUpRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { formatDate, formatDayMonth, formatJakartaDateTime } from "@/lib/jakartaDate";
import { describeError, useOwnerReport } from "@/context/OwnerReportContext";
import { ColumnChart } from "@/components/owner/charts";
import { BarList, Card, ChartCard, Empty, ErrorBanner, Loading, StatTile } from "@/components/owner/ui";
import { compactRupiah, count, percent, rupiah } from "@/components/owner/format";
import { PurchaseItem, PurchaseReport } from "@/types/owner";

function PriceChange({ item }: { item: PurchaseItem }) {
  if (item.purchases < 2 || item.first_price === item.last_price) {
    return <Text className="text-xs font-bold text-gray-400">tetap</Text>;
  }
  const change = (item.last_price - item.first_price) / item.first_price;
  const up = change > 0;
  // Up is bad for a buyer, so it is the one in red — with an arrow and the
  // word, so the direction never rests on the colour.
  return (
    <View className="flex-row items-center justify-end gap-1">
      {up ? <ArrowUpRight size={14} color="#b91c1c" /> : <ArrowDownRight size={14} color="#15803d" />}
      <Text className={`text-xs font-extrabold ${up ? "text-red-700" : "text-green-700"}`}>
        {up ? "naik" : "turun"} {percent(Math.abs(change))}
      </Text>
    </View>
  );
}

export default function Pembelian() {
  const { range, refreshKey, sales } = useOwnerReport();
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current;
    setLoading(true);
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("owner_purchase_report", {
        p_from: range.from,
        p_to: range.to,
      });
      if (request !== latest.current) return;
      if (rpcError || !data) {
        console.error("owner_purchase_report failed:", rpcError);
        setError(describeError(rpcError));
      } else {
        setReport(data as PurchaseReport);
        setError(null);
      }
      setLoading(false);
    })();
  }, [range, refreshKey, retry]);

  if (!report) return error ? <ErrorBanner message={error} onRetry={() => setRetry((r) => r + 1)} /> : <Loading />;

  const net = sales?.summary.net ?? 0;
  const num = { fontVariant: ["tabular-nums" as const] };

  const daily = report.daily.map((d) => ({
    key: d.date,
    label: formatDayMonth(d.date),
    tooltipLabel: formatDate(d.date),
    value: d.spend,
    detail: `${count(d.purchases)} pembelian`,
  }));

  return (
    <View className="gap-4" style={{ opacity: loading ? 0.5 : 1 }}>
      {error && <ErrorBanner message={error} onRetry={() => setRetry((r) => r + 1)} />}

      <View className="flex-row flex-wrap gap-4">
        <StatTile label="Total pembelian" value={rupiah(report.summary.spend)} hint="Dari setiap penambahan stok" />
        <StatTile label="Jumlah pembelian" value={count(report.summary.purchases)} hint={`${count(report.summary.items)} jenis barang`} />
        <StatTile
          label="Pembelian ÷ penjualan bersih"
          value={net > 0 ? percent(report.summary.spend / net) : "—"}
          hint={`Penjualan bersih ${rupiah(net)}`}
        />
      </View>

      <ChartCard
        title="Pembelian harian"
        chart={
          <ColumnChart
            data={daily}
            formatValue={rupiah}
            formatTick={compactRupiah}
            minLabelSpacing={56}
            ariaLabel="Total pembelian per hari"
          />
        }
        table={daily.map((d) => ({ label: d.tooltipLabel, value: rupiah(d.value) }))}
        tableHeader={["Tanggal", "Pembelian"]}
      />

      <Card title="Paling banyak dibelanjakan" subtitle="10 barang dengan total pembelian terbesar">
        <BarList
          rows={report.items.slice(0, 10).map((i) => ({
            key: `${i.stock_id ?? "name"}-${i.name}`,
            label: i.name,
            value: i.spend,
            valueLabel: rupiah(i.spend),
            detail: `${count(i.purchases)}× dibeli`,
          }))}
        />
      </Card>

      <Card title="Semua barang yang dibeli" subtitle="Harga per satuan: pembelian pertama dan terakhir dalam periode ini">
        {report.items.length === 0 ? (
          <Empty />
        ) : (
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ minWidth: 1040, flex: 1 }}>
              <View className="flex-row items-center py-2 px-3 bg-gray-50 rounded-t-xl border-b border-gray-200">
                <Text className="flex-1 text-xs font-extrabold text-gray-500" style={{ minWidth: 200 }}>Barang</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 80 }}>Dibeli</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 130 }}>Jumlah</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 140 }}>Total</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 120 }}>Rata-rata/satuan</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 160 }}>Harga awal → akhir</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 100 }}>Perubahan</Text>
                <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 160 }}>Terakhir dibeli</Text>
              </View>
              {report.items.map((i) => (
                <View key={`${i.stock_id ?? "name"}-${i.name}`} className="flex-row items-center py-2.5 px-3 border-b border-gray-100">
                  <Text className="flex-1 text-sm font-bold text-gray-900" style={{ minWidth: 200 }} numberOfLines={1}>{i.name}</Text>
                  <Text className="text-sm font-bold text-gray-700 text-right" style={[{ width: 80 }, num]}>{count(i.purchases)}×</Text>
                  <Text className="text-sm font-bold text-gray-700 text-right" style={[{ width: 130 }, num]}>
                    {count(i.quantity)} {i.unit ?? ""}
                  </Text>
                  <Text className="text-sm font-black text-gray-900 text-right" style={[{ width: 140 }, num]}>{rupiah(i.spend)}</Text>
                  <Text className="text-sm font-bold text-gray-700 text-right" style={[{ width: 120 }, num]}>
                    {rupiah(i.quantity > 0 ? i.spend / i.quantity : 0)}
                  </Text>
                  <Text className="text-sm font-bold text-gray-700 text-right" style={[{ width: 160 }, num]}>
                    {i.first_price === i.last_price ? rupiah(i.last_price) : `${rupiah(i.first_price)} → ${rupiah(i.last_price)}`}
                  </Text>
                  <View style={{ width: 100 }} className="items-end">
                    <PriceChange item={i} />
                  </View>
                  <Text className="text-xs font-bold text-gray-500 text-right" style={{ width: 160 }}>
                    {formatJakartaDateTime(i.last_bought)}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </Card>
    </View>
  );
}
