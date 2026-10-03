import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { Calendar, Check, ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  DateRange,
  IsoDate,
  MONTHS_LONG,
  PRESETS,
  WEEKDAY_HEADERS,
  addMonths,
  endOfMonth,
  formatDate,
  formatRange,
  monthGrid,
  parseIso,
  presetRange,
  startOfMonth,
  todayJakarta,
} from "@/lib/jakartaDate";
import { ACCENT } from "./ui";

export function presetLabel(range: DateRange): string {
  return PRESETS.find((p) => p.key === range.preset)?.label ?? "Rentang khusus";
}

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 bg-white rounded-2xl px-4 py-2.5"
        accessibilityLabel="Ubah periode"
      >
        <Calendar size={16} color="#374151" />
        <Text className="text-sm font-extrabold text-gray-900">{presetLabel(value)}</Text>
        <Text className="text-sm font-bold text-gray-400">{formatRange(value.from, value.to)}</Text>
      </TouchableOpacity>

      {open && (
        <PickerModal
          initial={value}
          onClose={() => setOpen(false)}
          onApply={(r) => {
            onChange(r);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PickerModal({
  initial,
  onClose,
  onApply,
}: {
  initial: DateRange;
  onClose: () => void;
  onApply: (range: DateRange) => void;
}) {
  const today = todayJakarta();
  const [draft, setDraft] = useState<{ from: IsoDate; to: IsoDate | null }>({
    from: initial.from,
    to: initial.to,
  });
  const [month, setMonth] = useState<IsoDate>(startOfMonth(initial.to));

  // First click starts a new range, second click closes it — in either order,
  // so picking the end date first still works.
  const pickDay = (day: IsoDate) => {
    if (draft.to !== null || day < draft.from) {
      setDraft({ from: day, to: null });
    } else {
      setDraft({ from: draft.from, to: day });
    }
  };

  const days = monthGrid(month);
  const inMonth = (d: IsoDate) => d.slice(0, 7) === month.slice(0, 7);
  const rangeEnd = draft.to ?? draft.from;

  // The panel must fit the screen it is on. Side by side, presets and calendar
  // need about 560px; on a phone they stack, and stacked as a column of rows
  // they were ~780px tall — taller than an iPhone's visible browser area, and
  // centred with no scroll, so the top presets ("Hari ini" first) were cut off
  // and unreachable. On a narrow screen the presets become a two-column grid,
  // the calendar cells shrink to the width, and the panel scrolls if it is
  // still too tall.
  const { width: screenW, height: screenH } = useWindowDimensions();
  const narrow = screenW < 600;
  const padding = narrow ? 16 : 20;
  const panelWidth = narrow ? screenW - 32 : undefined;
  const cell = narrow ? Math.min(44, Math.floor((screenW - 32 - padding * 2) / 7)) : 44;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center" style={{ padding: 16 }}>
        {/* The backdrop is a sibling behind the panel, not its parent, so a
            touch that scrolls the panel is never also a tap on the backdrop. */}
        <Pressable
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(17,24,39,0.35)" }]}
          accessibilityLabel="Tutup"
        />
        <View
          className="bg-white rounded-3xl overflow-hidden"
          style={{ maxWidth: 720, width: panelWidth, maxHeight: screenH - 32 }}
        >
          <ScrollView contentContainerStyle={{ padding, flexDirection: "row", flexWrap: "wrap", gap: narrow ? 16 : 24 }}>
            {/* Presets as rows — nobody should have to fight a calendar for "last month". */}
            <View style={narrow ? { width: "100%", flexDirection: "row", flexWrap: "wrap" } : { width: 180 }}>
              {PRESETS.map((p) => {
                const selected = initial.preset === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => onApply(presetRange(p.key))}
                    style={narrow ? { width: "50%" } : undefined}
                    className={`flex-row items-center justify-between rounded-xl px-3 ${narrow ? "py-2" : "py-2.5"} ${
                      narrow && selected ? "bg-blue-50" : ""
                    }`}
                  >
                    <Text className={`text-sm ${selected ? "font-black text-gray-900" : "font-bold text-gray-600"}`}>
                      {p.label}
                    </Text>
                    {selected && <Check size={16} strokeWidth={3} color={ACCENT} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ width: cell * 7 }}>
              <View className="flex-row items-center justify-between mb-3">
                <TouchableOpacity
                  onPress={() => setMonth(addMonths(month, -1))}
                  className="w-9 h-9 rounded-full border border-gray-200 items-center justify-center"
                  accessibilityLabel="Bulan sebelumnya"
                >
                  <ChevronLeft size={16} color="#374151" />
                </TouchableOpacity>
                <Text className="text-base font-black text-gray-900">
                  {MONTHS_LONG[parseIso(month).getUTCMonth()]} {month.slice(0, 4)}
                </Text>
                <TouchableOpacity
                  onPress={() => setMonth(addMonths(month, 1))}
                  disabled={endOfMonth(month) >= today}
                  className={`w-9 h-9 rounded-full border border-gray-200 items-center justify-center ${
                    endOfMonth(month) >= today ? "opacity-30" : ""
                  }`}
                  accessibilityLabel="Bulan berikutnya"
                >
                  <ChevronRight size={16} color="#374151" />
                </TouchableOpacity>
              </View>

              <View className="flex-row">
                {WEEKDAY_HEADERS.map((d) => (
                  <Text key={d} style={{ width: cell }} className="text-center text-xs font-extrabold text-gray-400 py-1">
                    {d}
                  </Text>
                ))}
              </View>

              <View className="flex-row flex-wrap">
                {days.map((d) => {
                  const future = d > today;
                  const isEdge = d === draft.from || d === draft.to;
                  const within = d > draft.from && d < rangeEnd;
                  return (
                    <TouchableOpacity
                      key={d}
                      disabled={future}
                      onPress={() => pickDay(d)}
                      style={{ width: cell, height: narrow ? 36 : 40, backgroundColor: isEdge ? ACCENT : within ? "#e0ebf9" : undefined }}
                      className={`items-center justify-center ${within ? "" : "rounded-lg"}`}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          isEdge
                            ? "text-white"
                            : future
                            ? "text-gray-200"
                            : inMonth(d)
                            ? "text-gray-800"
                            : "text-gray-300"
                        }`}
                      >
                        {parseIso(d).getUTCDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className="flex-row items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <Text className="text-xs font-bold text-gray-500">
                  {formatDate(draft.from)} – {draft.to ? formatDate(draft.to) : "pilih tanggal akhir"}
                </Text>
                <TouchableOpacity
                  disabled={draft.to === null}
                  onPress={() => draft.to && onApply({ from: draft.from, to: draft.to, preset: "custom" })}
                  className={`rounded-xl px-4 py-2 ${draft.to === null ? "bg-gray-200" : ""}`}
                  style={draft.to === null ? undefined : { backgroundColor: ACCENT }}
                >
                  <Text className={`text-sm font-extrabold ${draft.to === null ? "text-gray-400" : "text-white"}`}>
                    Terapkan
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
