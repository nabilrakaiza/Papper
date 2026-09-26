import { View, Text } from "react-native";
import { useOwnerReport } from "@/context/OwnerReportContext";
import { BarList, Card, Empty, ErrorBanner, Loading, Notice, StatTile } from "@/components/owner/ui";
import { count, methodLabel, percent, rupiah } from "@/components/owner/format";

export default function Pembayaran() {
  const { sales, salesLoading, salesError, refresh } = useOwnerReport();

  if (!sales) return salesError ? <ErrorBanner message={salesError} onRetry={refresh} /> : <Loading />;

  // Amounts here include tax — they are what each payer handed over — so the
  // shares are of the total collected, not of net sales.
  const collected = sales.summary.collected;
  const payers = sales.payments.reduce((s, p) => s + p.count, 0);
  const top = sales.payments.find((p) => p.method !== null);
  const unrecorded = sales.payments.find((p) => p.method === null);

  const rows = sales.payments.map((p) => ({
    key: p.method ?? "none",
    label: methodLabel(p.method),
    value: p.amount,
    valueLabel: rupiah(p.amount),
    detail: `${count(p.count)} pembayaran · ${collected > 0 ? percent(p.amount / collected) : "0%"}`,
  }));

  const num = { fontVariant: ["tabular-nums" as const] };

  return (
    <View className="gap-4" style={{ opacity: salesLoading ? 0.5 : 1 }}>
      <View className="flex-row flex-wrap gap-4">
        <StatTile label="Total diterima" value={rupiah(collected)} hint="Termasuk pajak" />
        <StatTile label="Pembayaran" value={count(payers)} hint="Tagihan terpisah dihitung per pembayar" />
        <StatTile
          label="Metode terbanyak"
          value={top ? methodLabel(top.method) : "—"}
          hint={top && collected > 0 ? `${percent(top.amount / collected)} dari total diterima` : undefined}
        />
      </View>

      <Card title="Menurut metode pembayaran" subtitle="Jumlah yang diterima per metode">
        <BarList rows={rows} />
      </Card>

      <Card title="Rincian">
        {sales.payments.length === 0 ? (
          <Empty />
        ) : (
          <View>
            <View className="flex-row py-2 border-b border-gray-200">
              <Text className="flex-1 text-xs font-extrabold text-gray-500">Metode</Text>
              <Text className="w-28 text-right text-xs font-extrabold text-gray-500">Pembayaran</Text>
              <Text className="w-40 text-right text-xs font-extrabold text-gray-500">Jumlah</Text>
              <Text className="w-24 text-right text-xs font-extrabold text-gray-500">Porsi</Text>
              <Text className="w-36 text-right text-xs font-extrabold text-gray-500">Rata-rata</Text>
            </View>
            {sales.payments.map((p) => (
              <View key={p.method ?? "none"} className="flex-row py-2.5 border-b border-gray-100">
                <Text className="flex-1 text-sm font-bold text-gray-900">{methodLabel(p.method)}</Text>
                <Text className="w-28 text-right text-sm font-bold text-gray-700" style={num}>{count(p.count)}</Text>
                <Text className="w-40 text-right text-sm font-bold text-gray-900" style={num}>{rupiah(p.amount)}</Text>
                <Text className="w-24 text-right text-sm font-bold text-gray-700" style={num}>
                  {collected > 0 ? percent(p.amount / collected) : "—"}
                </Text>
                <Text className="w-36 text-right text-sm font-bold text-gray-700" style={num}>
                  {rupiah(p.count > 0 ? p.amount / p.count : 0)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {unrecorded && (
        <Notice>
          {count(unrecorded.count)} pesanan lunas ({rupiah(unrecorded.amount)}) tidak mencatat metode bayar —
          kemungkinan ditutup sebelum pencatatan metode bayar ada.
        </Notice>
      )}
    </View>
  );
}
