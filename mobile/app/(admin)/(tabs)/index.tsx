import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  // SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomSheet from "@gorhom/bottom-sheet";
import { RefreshCw } from "lucide-react-native";
import { supabase } from "../../../lib/supabase";
import StockCard from "@/components/stock/StockCard";
import AddStockSheet from "@/components/stock/AddStockSheet";
import { StockItem } from "../../../types/stock";

export default function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheet>(null) as React.RefObject<BottomSheet>;

  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("stock")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setError("Failed to load stock. Please check your connection.");
      setLoading(false);
      return;
    }

    if (data) {
      setItems(
        data.map((s) => ({
          id: s.id,
          name: s.name,
          quantity: s.quantity,
          unit: s.unit,
          pricePerUnit: s.price_per_unit,
        }))
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStock();

    const subscription = supabase
      .channel("stock-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock" }, () => {
        fetchStock();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchStock]);

  const handleAdd = async (incoming: Omit<StockItem, "id">) => {
    setSaving(true);
    setError(null);

    const existing = items.find(
      (i) =>
        i.name.toLowerCase() === incoming.name.toLowerCase() &&
        i.unit.toLowerCase() === incoming.unit.toLowerCase()
    );

    if (existing) {
      const { error } = await supabase
        .from("stock")
        .update({
          quantity: existing.quantity + incoming.quantity,
          price_per_unit: incoming.pricePerUnit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        setError("Failed to update stock. Please try again.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("stock").insert({
        name: incoming.name,
        quantity: incoming.quantity,
        unit: incoming.unit,
        price_per_unit: incoming.pricePerUnit,
      });

      if (error) {
        setError("Failed to add stock item. Please try again.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Stock</Text>
        </View>
        {/* <TouchableOpacity
          onPress={signOut}
          className="w-10 h-10 rounded-full bg-gray-900 items-center justify-center"
        >
          <User size={18} color="white" />
        </TouchableOpacity> */}
      </View>

      {/* Error banner */}
      {error && (
        <View className="mx-4 mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-xs font-bold text-red-500 flex-1">{error}</Text>
          <TouchableOpacity onPress={fetchStock}>
            <RefreshCw size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Loading */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3a7bd5" />
          <Text className="text-gray-400 font-bold text-sm mt-3">Loading stock...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <StockCard item={item} />}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: 16,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center mt-24">
              <Text className="text-gray-300 font-bold text-sm text-center leading-7">
                No items in stock.{"\n"}Tap add stock to begin.
              </Text>
            </View>
          }
        />
      )}

      {/* Add Button */}
      {!loading && (
        <View className="absolute bottom-6 left-4 right-4">
          <TouchableOpacity
            onPress={() => sheetRef.current?.expand()}
            disabled={saving}
            className="w-full bg-yellow-100 rounded-2xl py-4 items-center shadow shadow-yellow-400/20"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Text className="text-sm font-extrabold text-gray-500">add stock</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <AddStockSheet sheetRef={sheetRef} onAdd={handleAdd} />
    </SafeAreaView>
  );
}