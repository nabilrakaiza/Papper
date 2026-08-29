import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrders } from "../../../context/OrderContext";
import { CATEGORIES } from "../../../data/menu";
import { MenuCategory } from "../../../types/order";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

type ToggleStatus =
  | { kind: "pending" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const STATUS_STYLE: Record<ToggleStatus["kind"], { box: string; text: string }> = {
  pending: { box: "bg-gray-100 border-gray-200", text: "text-gray-500" },
  success: { box: "bg-green-50 border-green-200", text: "text-green-700" },
  error: { box: "bg-red-50 border-red-200", text: "text-red-600" },
};

export default function AvailabilityScreen() {
  const { menu, toggleMenuAvailability } = useOrders();
  const [expandedCategory, setExpandedCategory] = useState<MenuCategory | null>();
  const [status, setStatus] = useState<ToggleStatus | null>(null);

  // The switch flips optimistically, so the only thing the screen ever showed
  // was the state the cashier had just asked for — identical whether the write
  // landed, was still in flight, or had failed and been rolled back. Report all
  // three: pending while the write is out, the item and its new state on
  // success, and the failure otherwise.
  const pending = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const handleToggle = async (menuId: number) => {
    // Captured before the call: toggleMenuAvailability flips `menu` optimistically,
    // so reading it afterwards would report the state we were already showing.
    const item = menu.find((m) => m.id === menuId);
    const becomingAvailable = !item?.available;

    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }

    pending.current += 1;
    setStatus({ kind: "pending" });

    const { error } = await toggleMenuAvailability(menuId);

    pending.current -= 1;

    if (error) {
      setStatus({ kind: "error", message: error });
      return;
    }

    // Another toggle is still out — leave the banner pending and let the last
    // one to finish report, rather than flashing "saved" while a write is open.
    if (pending.current > 0) return;

    setStatus({
      kind: "success",
      message: `${item?.name ?? "Menu"} ditandai ${becomingAvailable ? "tersedia" : "habis"}.`,
    });

    clearTimer.current = setTimeout(() => setStatus(null), 2500);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">Ketersediaan</Text>
      </View>

      {!!status && (
        <TouchableOpacity
          // A failure stays until it is read; pending and success clear on their
          // own, so dismissing those is a convenience rather than the point.
          onPress={() => setStatus(null)}
          activeOpacity={status.kind === "error" ? 0.7 : 1}
          className={`mx-4 mb-2 border rounded-2xl px-4 py-3 ${STATUS_STYLE[status.kind].box}`}
        >
          <Text className={`text-xs font-bold ${STATUS_STYLE[status.kind].text}`}>
            {status.kind === "pending" ? "Menyimpan..." : status.message}
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {CATEGORIES.map((category) => {
          const categoryItems = menu.filter((m) => m.category === category);
          const isExpanded = expandedCategory === category;

          return (
            <View key={category} className="mb-3">
              {/* Category header */}
              <TouchableOpacity
                onPress={() =>
                  setExpandedCategory(isExpanded ? null : category)
                }
                className="bg-yellow-100 rounded-2xl px-4 py-4 shadow-sm"
              >
                <View className="flex-row items-center justify-between">
                  <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
                    <Text className="text-sm font-bold text-gray-700">
                      Pilihan {category}
                    </Text>
                  </View>
                  <Text className="text-gray-400 font-bold text-sm">
                    {isExpanded ? "▲" : "▼"}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Expanded items */}
              {isExpanded && (
                <View className="bg-yellow-50 rounded-2xl mt-1 overflow-hidden border border-yellow-200">
                  {categoryItems.map((item, index) => (
                    <View key={item.id}>
                      <View className="flex-row items-center justify-between px-4 py-3">
                        <View>
                          <Text className="text-sm font-bold text-gray-800">
                            {item.name}
                          </Text>
                          <Text className="text-xs font-bold text-gray-400">
                            {formatRupiah(item.price)}
                          </Text>
                        </View>
                        <Switch
                          value={item.available}
                          onValueChange={() => handleToggle(item.id)}
                          trackColor={{ false: "#e5e7eb", true: "#a78bfa" }}
                          thumbColor={item.available ? "white" : "#f4f3f4"}
                        />
                      </View>
                      {index < categoryItems.length - 1 && (
                        <View className="h-px bg-yellow-200 mx-4" />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Confirm button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6">
        <TouchableOpacity className="w-full bg-green-400 rounded-2xl py-4 items-center shadow shadow-green-600/30">
          <Text className="text-sm font-extrabold text-white">
            Simpan Ketersediaan
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}