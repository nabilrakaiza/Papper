import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
} from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import { SafeAreaView } from "react-native-safe-area-context";
import StockCard from "../../../components/stock/StockCard";
import AddStockSheet from "../../../components/stock/AddStockSheet";
import { StockItem } from "../../../types/stock";
import { supabase } from "@/lib/supabase";


export default function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const sheetRef = useRef<BottomSheet>(null) as React.RefObject<BottomSheet>;

  const fetchStock = async () => {
    const { data } = await supabase.from("stock").select("*");
    if (data) setItems(data.map((s) => ({
      id: s.id,
      name: s.name,
      quantity: s.quantity,
      unit: s.unit,
      pricePerUnit: s.price_per_unit,
    })));
  };

  useEffect(() => {
    fetchStock();

    const subscription = supabase
      .channel("stock-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock" },
        () => fetchStock()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const handleAdd = async (incoming: Omit<StockItem, "id">) => {
    const existing = items.find(
      (i) => i.name.toLowerCase() === incoming.name.toLowerCase() &&
            i.unit.toLowerCase() === incoming.unit.toLowerCase()
    );

    if (existing) {
      await supabase
        .from("stock")
        .update({
          quantity: existing.quantity + incoming.quantity,
          price_per_unit: incoming.pricePerUnit,
          updated_at: new Date(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("stock").insert({
        name: incoming.name,
        quantity: incoming.quantity,
        unit: incoming.unit,
        price_per_unit: incoming.pricePerUnit,
      });
    }

    // Refresh stock
    const { data } = await supabase.from("stock").select("*");
    if (data) setItems(data.map((s) => ({
      id: s.id,
      name: s.name,
      quantity: s.quantity,
      unit: s.unit,
      pricePerUnit: s.price_per_unit,
    })));
  };

  return (
    <SafeAreaView className="flex-1 bg-black-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Papper</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <StockCard item={item} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="items-center mt-24">
            <Text className="text-gray-300 font-bold text-sm text-center leading-7">
              No items in stock.{"\n"}Tap add stock to begin.
            </Text>
          </View>
        }
      />

      {/* Add Button */}
      <View className="absolute bottom-6 left-4 right-4">
        <TouchableOpacity
          onPress={() => sheetRef.current?.expand()}
          className="w-full bg-yellow-100 rounded-2xl py-4 items-center shadow-yellow-400/20"
        >
          <Text className="text-sm font-extrabold text-gray-500">
            add stock
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet */}
      <AddStockSheet sheetRef={sheetRef} onAdd={handleAdd} />
    </SafeAreaView>
  );
}