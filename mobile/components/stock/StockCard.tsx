import { View, Text, TouchableOpacity } from "react-native";
import { Trash2, RotateCcw } from "lucide-react-native";
import { StockItem } from "../../types/stock";
import { memo } from "react";

interface Props {
  item: StockItem;
  lowStockThreshold?: number; // optional, defaults to 5
  onDelete?: () => void; // superadmin-only, shown for active items
  onRestore?: () => void; // superadmin-only, shown for inactive items
}

const formatRupiah = (value: number) => {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

function StockCard({ item, lowStockThreshold = 5, onDelete, onRestore }: Props) {
  const isOutOfStock = item.quantity <= 0;
  const isLowStock = !isOutOfStock && item.quantity <= lowStockThreshold;

  const theme = !item.isActive
    ? {
        bg: "bg-gray-300",
        shadow: "shadow-gray-400/20",
        textDark: "text-gray-600",
        textLight: "text-gray-500",
      }
    : isOutOfStock
    ? {
        bg: "bg-red-500",
        shadow: "shadow-red-600/30",
        textDark: "text-red-950",
        textLight: "text-white/80",
      }
    : isLowStock
    ? {
        bg: "bg-yellow-400",
        shadow: "shadow-yellow-600/30",
        textDark: "text-yellow-950",
        textLight: "text-yellow-950/70",
      }
    : {
        bg: "bg-green-400",
        shadow: "shadow-green-600/30",
        textDark: "text-green-950",
        textLight: "text-white/80",
      };

  return (
    <View className={`rounded-2xl px-4 py-4 mb-3 ${theme.bg} shadow-sm ${theme.shadow} ${!item.isActive ? "opacity-70" : ""}`}>
      <View className="flex-row items-center justify-between">
        <View className="bg-white/90 rounded-xl px-3 py-1.5">
          <Text className={`text-sm font-bold ${theme.textDark}`}>{item.name}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="bg-white/90 rounded-xl px-3 py-1.5">
            <Text className={`text-sm font-bold ${theme.textDark}`}>
              {item.quantity} {item.unit}
            </Text>
          </View>
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              className="bg-white/90 rounded-xl p-2"
            >
              <Trash2 size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
          {onRestore && (
            <TouchableOpacity
              onPress={onRestore}
              className="bg-white/90 rounded-xl p-2"
            >
              <RotateCcw size={16} color="#22c55e" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-2">
        {!item.isActive ? (
          <Text className="text-xs font-extrabold text-gray-500">Nonaktif</Text>
        ) : isOutOfStock ? (
          <Text className="text-xs font-extrabold text-white">⚠ Stok habis</Text>
        ) : isLowStock ? (
          <Text className="text-xs font-extrabold text-yellow-950">⚠ Stok menipis</Text>
        ) : (
          <View />
        )}
        <Text className={`text-xs font-extrabold ${theme.textLight} text-right`}>
          {formatRupiah(item.pricePerUnit)} / {item.unit}
        </Text>
      </View>
    </View>
  );
}

export default memo(StockCard);
