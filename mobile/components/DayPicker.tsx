// One Jakarta day, for the cashier's Penjualan screen.
//
// Arrows for the day before and after, which is how the till is usually read
// ("what happened yesterday"), and the date itself opens a month calendar for
// anything further back. The owner's DateRangePicker picks ranges and has
// presets; a cashier looks at one day at a time and needs neither.
import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, useWindowDimensions } from "react-native";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  IsoDate,
  MONTHS_LONG,
  WEEKDAY_HEADERS,
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  endOfMonth,
  formatDate,
  monthGrid,
  parseIso,
  startOfMonth,
  todayJakarta,
} from "../lib/jakartaDate";

const ACCENT = "#3a7bd5";

/** "Sen, 20 Sep 2026", or "Hari ini" for today. */
export function dayLabel(day: IsoDate): string {
  if (day === todayJakarta()) return "Hari ini";
  return `${WEEKDAYS_SHORT[parseIso(day).getUTCDay()]}, ${formatDate(day)}`;
}

export default function DayPicker({
  value,
  onChange,
}: {
  value: IsoDate;
  onChange: (day: IsoDate) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = todayJakarta();
  // Nothing has been sold tomorrow yet.
  const atToday = value >= today;

  return (
    <>
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => onChange(addDays(value, -1))}
          className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm"
          accessibilityLabel="Hari sebelumnya"
        >
          <ChevronLeft size={18} color="#374151" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setOpen(true)}
          className="flex-1 flex-row items-center justify-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-sm"
          accessibilityLabel="Pilih tanggal"
        >
          <Calendar size={16} color="#374151" />
          <Text className="text-sm font-extrabold text-gray-900">{dayLabel(value)}</Text>
          {value === today && (
            <Text className="text-sm font-bold text-gray-400">{formatDate(value)}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onChange(addDays(value, 1))}
          disabled={atToday}
          className={`w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm ${
            atToday ? "opacity-30" : ""
          }`}
          accessibilityLabel="Hari berikutnya"
        >
          <ChevronRight size={18} color="#374151" />
        </TouchableOpacity>
      </View>

      {!atToday && (
        <TouchableOpacity onPress={() => onChange(today)} className="self-center mt-2">
          <Text className="text-xs font-extrabold" style={{ color: ACCENT }}>
            Kembali ke hari ini
          </Text>
        </TouchableOpacity>
      )}

      {open && (
        <CalendarModal
          initial={value}
          onClose={() => setOpen(false)}
          onPick={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function CalendarModal({
  initial,
  onClose,
  onPick,
}: {
  initial: IsoDate;
  onClose: () => void;
  onPick: (day: IsoDate) => void;
}) {
  const today = todayJakarta();
  const [month, setMonth] = useState<IsoDate>(startOfMonth(initial));

  // Seven columns inside a panel with a 16px screen gutter and 20px padding,
  // so the calendar fits a phone held upright as well as a tablet.
  const { width } = useWindowDimensions();
  const cell = Math.min(44, Math.floor((width - 32 - 40) / 7));

  const days = monthGrid(month);
  const inMonth = (d: IsoDate) => d.slice(0, 7) === month.slice(0, 7);
  const lastMonth = endOfMonth(month) >= today;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center px-4"
        style={{ backgroundColor: "rgba(17,24,39,0.35)" }}
      >
        {/* Stops a tap inside the panel from reaching the backdrop. */}
        <Pressable onPress={() => {}} className="bg-white rounded-3xl p-5">
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
              disabled={lastMonth}
              className={`w-9 h-9 rounded-full border border-gray-200 items-center justify-center ${
                lastMonth ? "opacity-30" : ""
              }`}
              accessibilityLabel="Bulan berikutnya"
            >
              <ChevronRight size={16} color="#374151" />
            </TouchableOpacity>
          </View>

          <View className="flex-row">
            {WEEKDAY_HEADERS.map((d) => (
              <Text
                key={d}
                style={{ width: cell }}
                className="text-center text-xs font-extrabold text-gray-400 py-1"
              >
                {d}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap" style={{ width: cell * 7 }}>
            {days.map((d) => {
              const future = d > today;
              const selected = d === initial;
              return (
                <TouchableOpacity
                  key={d}
                  disabled={future}
                  onPress={() => onPick(d)}
                  style={{ width: cell, height: 40, backgroundColor: selected ? ACCENT : undefined }}
                  className="items-center justify-center rounded-lg"
                >
                  <Text
                    className={`text-sm font-bold ${
                      selected
                        ? "text-white"
                        : future
                        ? "text-gray-200"
                        : d === today
                        ? "text-blue-600"
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
