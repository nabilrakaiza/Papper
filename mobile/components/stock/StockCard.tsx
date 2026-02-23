import { View, Text } from "react-native";
import { StockItem } from "../../types/stock";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

type Props = {
  item: StockItem;
};

export default function StockCard({ item }: Props) {
  return (
    <View className="rounded-2xl px-4 py-4 mb-3 bg-green-400 shadow-sm shadow-green-600/30">
      <View className="flex-row items-center justify-between">
        <View className="bg-white/90 rounded-xl px-3 py-1.5">
          <Text className="text-sm font-bold text-green-950">{item.name}</Text>
        </View>
        <View className="bg-white/90 rounded-xl px-3 py-1.5">
          <Text className="text-sm font-bold text-green-950"> 
            {item.quantity} {item.unit}
          </Text>
        </View>
      </View>
      <Text className="text-xs font-extrabold text-white/80 text-right mt-2">
        {formatRupiah(item.pricePerUnit)} / {item.unit}
      </Text>
    </View>
  );
}