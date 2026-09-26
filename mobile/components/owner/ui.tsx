import { ReactNode, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { AlertTriangle } from "lucide-react-native";

export const ACCENT = "#3a7bd5";

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`bg-white rounded-3xl p-5 ${className}`}>
      {(title || right) && (
        <View className="flex-row items-start justify-between mb-4 gap-3">
          <View className="flex-1">
            {title && <Text className="text-base font-black text-gray-900">{title}</Text>}
            {subtitle && (
              <Text className="text-xs font-bold text-gray-400 mt-0.5">{subtitle}</Text>
            )}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <View className={`bg-white rounded-3xl px-5 py-4 flex-1 min-w-[200px] ${className}`}>
      <Text className="text-xs font-extrabold text-gray-500">{label}</Text>
      <Text className="text-2xl font-black text-gray-900 mt-1">{value}</Text>
      {hint && <Text className="text-xs font-bold text-gray-400 mt-1">{hint}</Text>}
    </View>
  );
}

/** A caution about the numbers themselves, not a failure. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-2 bg-amber-50 rounded-2xl px-4 py-3">
      <AlertTriangle size={16} color="#b45309" style={{ marginTop: 1 }} />
      <Text className="flex-1 text-xs font-bold text-amber-800 leading-5">{children}</Text>
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-3 bg-red-50 rounded-2xl px-4 py-3">
      <Text className="flex-1 text-sm font-bold text-red-700">{message}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} className="bg-white rounded-xl px-3 py-1.5">
          <Text className="text-xs font-extrabold text-red-700">Coba lagi</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Loading() {
  return (
    <View className="py-24 items-center">
      <ActivityIndicator size="large" color={ACCENT} />
    </View>
  );
}

export function Empty({ text = "Tidak ada data untuk periode ini" }: { text?: string }) {
  return (
    <View className="py-10 items-center">
      <Text className="text-sm font-bold text-gray-400">{text}</Text>
    </View>
  );
}

export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** The figure printed at the bar's end. */
  valueLabel: string;
  /** Secondary detail under the label. */
  detail?: string;
};

/**
 * Ranked horizontal bars: the label and its value on one line, the bar under
 * them. Every bar carries its value, so nothing depends on hovering.
 */
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <Empty />;

  return (
    <View className="gap-3">
      {rows.map((row) => {
        const share = top > 0 ? row.value / top : 0;
        return (
          <View key={row.key}>
            <View className="flex-row items-baseline justify-between gap-3 mb-1">
              <Text className="flex-1 text-sm font-bold text-gray-800" numberOfLines={1}>
                {row.label}
                {row.detail && (
                  <Text className="text-xs font-bold text-gray-400">{"  "}{row.detail}</Text>
                )}
              </Text>
              <Text className="text-sm font-extrabold text-gray-900">{row.valueLabel}</Text>
            </View>
            <View
              style={{
                height: 10,
                width: `${Math.max(share * 100, row.value > 0 ? 1 : 0)}%`,
                backgroundColor: ACCENT,
                borderTopRightRadius: 4,
                borderBottomRightRadius: 4,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onPage = false,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Sitting on the grey page rather than inside a white card. */
  onPage?: boolean;
}) {
  return (
    <View className={`flex-row rounded-xl p-1 gap-1 self-start ${onPage ? "bg-white" : "bg-gray-100"}`}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.key}
          onPress={() => onChange(o.key)}
          className={`px-3 py-1 rounded-lg ${value === o.key ? (onPage ? "bg-blue-50" : "bg-white") : ""}`}
        >
          <Text
            className={`text-xs font-extrabold ${
              value === o.key ? "text-gray-900" : "text-gray-400"
            }`}
          >
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * A chart with a table view of the same rows behind a toggle, so every value
 * can be read without hovering.
 */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
  tableHeader,
  className = "",
}: {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  table: { label: string; value: string }[];
  tableHeader: [string, string];
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={className}
      right={
        <Segmented
          options={[
            { key: "chart", label: "Grafik" },
            { key: "table", label: "Tabel" },
          ]}
          value={view}
          onChange={setView}
        />
      }
    >
      {view === "chart" ? (
        chart
      ) : (
        <View>
          <View className="flex-row justify-between pb-2 border-b border-gray-200">
            <Text className="text-xs font-extrabold text-gray-500">{tableHeader[0]}</Text>
            <Text className="text-xs font-extrabold text-gray-500">{tableHeader[1]}</Text>
          </View>
          {table.map((row) => (
            <View key={row.label} className="flex-row justify-between py-1.5 border-b border-gray-100">
              <Text className="text-sm font-bold text-gray-700">{row.label}</Text>
              <Text className="text-sm font-bold text-gray-900" style={{ fontVariant: ["tabular-nums"] }}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
