import { useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
} from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { User } from "lucide-react-native";
import StockCard from "../../../components/stock/StockCard";
import AddStockSheet from "../../../components/stock/AddStockSheet";
import { StockItem } from "../../../types/stock";

import { useAuth } from "../../../context/AuthContext";

const INITIAL_ITEMS: StockItem[] = [
  { id: 1, name: "Sirup", quantity: 3, unit: "Botol", pricePerUnit: 8000 },
  { id: 2, name: "Marjan", quantity: 2, unit: "Liter", pricePerUnit: 8000 },
];

export default function StockScreen() {
  const [items, setItems] = useState<StockItem[]>(INITIAL_ITEMS);
  const sheetRef = useRef<BottomSheet>(null) as React.RefObject<BottomSheet>;
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    console.log("signing out...");
    await signOut();
    console.log("signed out");
  };

  const handleAdd = (incoming: Omit<StockItem, "id">) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          i.name.toLowerCase() === incoming.name.toLowerCase() &&
          i.unit.toLowerCase() === incoming.unit.toLowerCase()
      );

      if (existingIndex !== -1) {
        // Same item exists: add quantity, update price per unit
        return prev.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                quantity: item.quantity + incoming.quantity,
                pricePerUnit: incoming.pricePerUnit,
              }
            : item
        );
      }

      return [...prev, { ...incoming, id: Date.now() }];
    });
  };

  return (
    // <GestureHandlerRootView className="flex-1">
      <SafeAreaView className="flex-1 bg-gray-100">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-blue-500 text-xl font-black">✛</Text>
            <Text className="text-2xl font-black text-gray-900">Papper</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} className="w-10 h-10 rounded-full bg-gray-900 items-center justify-center">
            <User size={18} color="white" />
          </TouchableOpacity>
        </View>

        {/* List */}
        <FlatList
          data={items}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <StockCard item={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}
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
        <View className="px-4 pb-4">
          <TouchableOpacity
            onPress={() => sheetRef.current?.expand()}
            className="w-full bg-yellow-100 rounded-2xl py-4 items-center shadow shadow-yellow-400/20"
          >
            <Text className="text-sm font-extrabold text-gray-500">
              add stock
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Sheet */}
        <AddStockSheet sheetRef={sheetRef} onAdd={handleAdd} />
      </SafeAreaView>
    // </GestureHandlerRootView>
  );
}