import { View, Text } from "react-native";
import { StockItem } from "../../types/stock";
import { memo } from "react";

interface Props {
  item: StockItem;
  lowStockThreshold?: number; // optional, defaults to 5
}

const formatRupiah = (value: number) => {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

function StockCard({ item, lowStockThreshold = 5 }: Props) {
  const isOutOfStock = item.quantity <= 0;
  const isLowStock = !isOutOfStock && item.quantity <= lowStockThreshold;

  const theme = isOutOfStock
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
    <View className={`rounded-2xl px-4 py-4 mb-3 ${theme.bg} shadow-sm ${theme.shadow}`}>
      <View className="flex-row items-center justify-between">
        <View className="bg-white/90 rounded-xl px-3 py-1.5">
          <Text className={`text-sm font-bold ${theme.textDark}`}>{item.name}</Text>
        </View>
        <View className="bg-white/90 rounded-xl px-3 py-1.5">
          <Text className={`text-sm font-bold ${theme.textDark}`}>
            {item.quantity} {item.unit}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-2">
        {isOutOfStock ? (
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