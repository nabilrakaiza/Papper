import { View } from "react-native";
import { useOwnerReport } from "@/context/OwnerReportContext";
import { AreaChart, ColumnChart } from "@/components/owner/charts";
import { ChartCard, ErrorBanner, Loading, Notice, StatTile } from "@/components/owner/ui";
import { compactRupiah, count, percent, rupiah } from "@/components/owner/format";
import { formatDate, formatDayMonth, parseIso } from "@/lib/jakartaDate";

const WEEKDAYS_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
// Monday first, matching the calendar in the date picker.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Ringkasan() {
  const { sales, salesLoading, salesError, refresh } = useOwnerReport();

  if (!sales) return salesError ? <ErrorBanner message={salesError} onRetry={refresh} /> : <Loading />;

  const { summary, costing } = sales;
  const grossProfit = summary.net - costing.cogs;
  const margin = summary.net > 0 ? grossProfit / summary.net : 0;
  const average = summary.transactions > 0 ? summary.net / summary.transactions : 0;
  const uncostedShare = summary.net > 0 ? costing.uncosted_net / summary.net : 0;

  const daily = sales.daily.map((d) => {
    const weekday = WEEKDAYS_LONG[parseIso(d.date).getUTCDay()];
    return {
      key: d.date,
      label: formatDayMonth(d.date),
      tooltipLabel: `${weekday}, ${formatDate(d.date)}`,
      value: d.gross,
      detail: `${count(d.orders)} transaksi`,
    };
  });

  const weekday = WEEK_ORDER.map((dow) => {
    const d = sales.weekday.find((w) => w.dow === dow) ?? { dow, gross: 0, orders: 0 };
    return {
      key: String(dow),
      label: WEEKDAYS_LONG[dow].slice(0, 3),
      tooltipLabel: WEEKDAYS_LONG[dow],
      value: d.gross,
      detail: `${count(d.orders)} transaksi`,
    };
  });

  const hourly = sales.hourly.map((h) => ({
    key: String(h.hour),
    label: String(h.hour),
    tooltipLabel: `${String(h.hour).padStart(2, "0")}.00 – ${String(h.hour).padStart(2, "0")}.59`,
    value: h.gross,
    detail: `${count(h.orders)} transaksi`,
  }));

  const table = (rows: typeof daily) => rows.map((r) => ({ label: r.tooltipLabel, value: rupiah(r.value) }));

  return (
    <View className="gap-4" style={{ opacity: salesLoading ? 0.5 : 1 }}>
      <View className="flex-row flex-wrap gap-4">
        <StatTile label="Penjualan kotor" value={rupiah(summary.gross)} hint="Sebelum diskon dan pajak" />
        <StatTile label="Penjualan bersih" value={rupiah(summary.net)} hint={`Setelah diskon ${rupiah(summary.discount)}`} />
        <StatTile label="Laba kotor" value={rupiah(grossProfit)} hint={`Penjualan bersih − HPP ${rupiah(costing.cogs)}`} />
      </View>
      <View className="flex-row flex-wrap gap-4">
        <StatTile label="Transaksi" value={count(summary.transactions)} hint="Pesanan lunas" />
        <StatTile label="Rata-rata per transaksi" value={rupiah(average)} hint="Penjualan bersih ÷ transaksi" />
        <StatTile label="Margin kotor" value={percent(margin)} hint="Laba kotor ÷ penjualan bersih" />
      </View>
      <View className="flex-row flex-wrap gap-4">
        <StatTile label="Pajak" value={rupiah(summary.tax)} hint="Dicatat terpisah, bukan penjualan" />
        <StatTile label="Total diterima" value={rupiah(summary.collected)} hint="Penjualan bersih + pajak" />
      </View>

      {costing.uncosted_net > 0 && (
        <Notice>
          {rupiah(costing.uncosted_net)} ({percent(uncostedShare)} dari penjualan bersih) berasal dari item
          tanpa HPP — menu yang HPP-nya belum diatur dan item kustom. Item ini dihitung tanpa biaya, jadi laba
          dan margin kotor di atas lebih tinggi dari yang sebenarnya. HPP memakai harga stok saat ini.
        </Notice>
      )}

      <ChartCard
        title="Penjualan kotor harian"
        chart={
          <AreaChart
            data={daily}
            formatValue={rupiah}
            formatTick={compactRupiah}
            ariaLabel="Penjualan kotor per hari"
          />
        }
        table={table(daily)}
        tableHeader={["Tanggal", "Penjualan kotor"]}
      />

      <View className="flex-row flex-wrap gap-4">
        <ChartCard
          className="flex-1 min-w-[320px]"
          title="Per hari dalam seminggu"
          subtitle="Penjualan kotor, dijumlah selama periode"
          chart={
            <ColumnChart
              data={weekday}
              formatValue={rupiah}
              formatTick={compactRupiah}
              ariaLabel="Penjualan kotor per hari dalam seminggu"
            />
          }
          table={table(weekday)}
          tableHeader={["Hari", "Penjualan kotor"]}
        />
        <ChartCard
          className="flex-[2] min-w-[320px]"
          title="Per jam"
          subtitle="Penjualan kotor menurut jam pesanan dibuat (WIB)"
          chart={
            <ColumnChart
              data={hourly}
              formatValue={rupiah}
              formatTick={compactRupiah}
              minLabelSpacing={24}
              ariaLabel="Penjualan kotor per jam"
            />
          }
          table={table(hourly)}
          tableHeader={["Jam", "Penjualan kotor"]}
        />
      </View>
    </View>
  );
}
