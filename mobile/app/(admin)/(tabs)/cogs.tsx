import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  // SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Search, X } from "lucide-react-native";
import { supabase } from "../../../lib/supabase";

type Ingredient = {
  stockId: number;
  stockName: string;
  quantity: number;
  pricePerUnit: number;
};

type MenuWithCogs = {
  id: number;
  name: string;
  sellingPrice: number;
  ingredients: Ingredient[];
  cogs: number | null;
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function MarginBadge({ cogs, price }: { cogs: number; price: number }) {
  const margin = ((price - cogs) / price) * 100;
  const isGood = margin >= 50;
  return (
    <View className={`px-2 py-0.5 rounded-lg ${isGood ? "bg-green-100" : "bg-yellow-100"}`}>
      <Text className={`text-xs font-extrabold ${isGood ? "text-green-600" : "text-yellow-600"}`}>
        {margin.toFixed(0)}% margin
      </Text>
    </View>
  );
}

export default function CogsScreen() {
  const [menus, setMenus] = useState<MenuWithCogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);

    const { data: menuData } = await supabase
      .from("menus")
      .select("id, name, price");

    const { data: ingredientData } = await supabase
      .from("menu_ingredients")
      .select("menu_id, quantity, stock:stock_id(id, name, price_per_unit)");

    if (!menuData) { setLoading(false); return; }

    const result: MenuWithCogs[] = menuData.map((menu) => {
      const ingredients: Ingredient[] = (ingredientData ?? [])
        .filter((i) => i.menu_id === menu.id)
        .map((i) => ({
          stockId: (i.stock as any).id,
          stockName: (i.stock as any).name,
          quantity: i.quantity,
          pricePerUnit: (i.stock as any).price_per_unit,
        }));

      const cogs =
        ingredients.length > 0
          ? ingredients.reduce((sum, i) => sum + i.quantity * i.pricePerUnit, 0)
          : null;

      return {
        id: menu.id,
        name: menu.name,
        sellingPrice: menu.price,
        ingredients,
        cogs,
      };
    });

    setMenus(result);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const filtered = menus.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <ActivityIndicator size="large" color="#3a7bd5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">COGS</Text>
      </View>

      {/* Search */}
      <View className="px-4 mb-2">
        <View className="flex-row items-center bg-white border-2 border-gray-100 rounded-2xl px-3 gap-2">
          <Search size={16} color="#aaa" />
          <TextInput
            className="flex-1 py-2.5 font-bold text-sm text-gray-900"
            placeholder="Search menu..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#ccc"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <X size={16} color="#aaa" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Info banner */}
        <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-xs font-bold text-blue-400 leading-5">
            COGS is calculated from ingredients linked to stock items.
            Update stock prices to automatically reflect new COGS.
          </Text>
        </View>

        {filtered.length === 0 && (
          <View className="items-center mt-16">
            <Text className="text-gray-300 font-bold text-sm">
              {search.length > 0 ? `No results for "${search}"` : "No menu items found."}
            </Text>
          </View>
        )}

        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
              activeOpacity={0.9}
              className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 shadow-sm shadow-yellow-300/30"
            >
              {/* Header row */}
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-base font-black text-gray-900">{item.name}</Text>
                {item.cogs !== null ? (
                  <MarginBadge cogs={item.cogs} price={item.sellingPrice} />
                ) : (
                  <View className="bg-gray-100 px-2 py-0.5 rounded-lg">
                    <Text className="text-xs font-extrabold text-gray-400">
                      No ingredients
                    </Text>
                  </View>
                )}
              </View>

              {/* Summary */}
              <View className="bg-cyan-100 rounded-xl px-4 py-3 gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-xs font-bold text-gray-500">Selling Price</Text>
                  <Text className="text-sm font-extrabold text-gray-800">
                    {formatRupiah(item.sellingPrice)}
                  </Text>
                </View>
                <View className="h-px bg-cyan-200" />
                <View className="flex-row justify-between">
                  <Text className="text-xs font-bold text-gray-500">COGS</Text>
                  {item.cogs !== null ? (
                    <Text className="text-sm font-extrabold text-gray-800">
                      {formatRupiah(item.cogs)}
                    </Text>
                  ) : (
                    <Text className="text-sm font-bold text-gray-300">— not set</Text>
                  )}
                </View>
                {item.cogs !== null && (
                  <>
                    <View className="h-px bg-cyan-200" />
                    <View className="flex-row justify-between">
                      <Text className="text-xs font-bold text-gray-500">Gross Profit</Text>
                      <Text className="text-sm font-extrabold text-green-600">
                        {formatRupiah(item.sellingPrice - item.cogs)}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* Ingredients breakdown */}
              {isExpanded && item.ingredients.length > 0 && (
                <View className="mt-3">
                  <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">
                    Ingredients
                  </Text>
                  {item.ingredients.map((ing) => (
                    <View
                      key={ing.stockId}
                      className="flex-row justify-between items-center py-1.5 border-b border-yellow-200"
                    >
                      <Text className="text-xs font-bold text-gray-600">
                        {ing.stockName} × {ing.quantity}
                      </Text>
                      <Text className="text-xs font-bold text-gray-500">
                        {formatRupiah(ing.quantity * ing.pricePerUnit)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {item.ingredients.length > 0 && (
                <Text className="text-[10px] font-bold text-gray-400 text-center mt-2">
                  {isExpanded ? "▲ hide ingredients" : "▼ show ingredients"}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}