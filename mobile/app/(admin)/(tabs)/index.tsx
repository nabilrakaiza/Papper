import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { RefreshCw, Search, X, BarChart2 } from "lucide-react-native";
import { supabase } from "../../../lib/supabase";
import StockCard from "@/components/stock/StockCard";
import AddStockSheet from "@/components/stock/AddStockSheet";
import CorrectStockDialog from "@/components/stock/CorrectStockDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { StockItem } from "../../../types/stock";
import { useAuth } from "../../../context/AuthContext";

export default function StockScreen() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === "superadmin";

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingRemove, setPendingRemove] = useState<{ item: StockItem; dependentMenus: string[] } | null>(null);
  const [correctingItem, setCorrectingItem] = useState<StockItem | null>(null);
  const sheetRef = useRef<BottomSheet>(null) as React.RefObject<BottomSheet>;

  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("stock")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setError("Gagal memuat stok. Periksa koneksi Anda.");
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
          isActive: s.is_active,
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

  const handleAdd = async (
    incoming: Omit<StockItem, "id" | "isActive"> & { purchaseDate?: string }
  ) => {
    setSaving(true);
    setError(null);

    // Use the admin's selected date, or default to the exact moment right now
    const expenseDate = incoming.purchaseDate || new Date().toISOString();

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
          price_per_unit: incoming.pricePerUnit, // Note: assuming your incoming object uses camelCase
          updated_at: new Date().toISOString(),
          last_purchase_date: expenseDate, // <-- Passes the date to the trigger
        })
        .eq("id", existing.id);

      if (error) {
        setError("Gagal memperbarui stok. Silakan coba lagi.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("stock").insert({
        name: incoming.name,
        quantity: incoming.quantity,
        unit: incoming.unit,
        price_per_unit: incoming.pricePerUnit,
        last_purchase_date: expenseDate, // <-- Passes the date to the trigger
      });

      if (error) {
        setError("Gagal menambahkan item stok. Silakan coba lagi.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    fetchStock();
  };

  const removeStock = async (item: StockItem) => {
    const { error } = await supabase
      .from("stock")
      .update({ is_active: false })
      .eq("id", item.id);

    if (error) {
      setError("Gagal menghapus item stok. Silakan coba lagi.");
      return;
    }

    fetchStock();
  };

  const handleRequestRemove = async (item: StockItem) => {
    const { data } = await supabase
      .from("menu_ingredients")
      .select("menus!inner(name, is_active)")
      .eq("stock_id", item.id)
      .eq("menus.is_active", true);

    const dependentMenus = (data ?? []).map((row: any) => row.menus.name as string);

    if (dependentMenus.length === 0) {
      removeStock(item);
      return;
    }

    setPendingRemove({ item, dependentMenus });
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return;
    const { item } = pendingRemove;
    setPendingRemove(null);
    await removeStock(item);
  };

  const handleCorrectStock = async (params: { quantity: number; pricePerUnit: number; note: string }) => {
    if (!correctingItem) return;

    const { error } = await supabase.rpc("correct_stock", {
      p_stock_id: correctingItem.id,
      p_quantity: params.quantity,
      p_price_per_unit: params.pricePerUnit,
      p_note: params.note || null,
    });

    if (error) throw error;

    setCorrectingItem(null);
    fetchStock();
  };

  const handleRestore = async (item: StockItem) => {
    const { error } = await supabase
      .from("stock")
      .update({ is_active: true })
      .eq("id", item.id);

    if (error) {
      setError("Gagal memulihkan item stok. Silakan coba lagi.");
      return;
    }

    fetchStock();
  };

  const matchesSearch = (i: StockItem) =>
    i.name.toLowerCase().includes(search.toLowerCase());

  const filtered = items
    .filter((i) => i.isActive && matchesSearch(i))
    .sort((a, b) => a.quantity - b.quantity);

  const inactiveFiltered = isSuperadmin
    ? items.filter((i) => !i.isActive && matchesSearch(i)).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Stok</Text>
        </View>

        {isSuperadmin && (
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/stock-usage")}
            className="flex-row items-center gap-1.5 border-2 border-blue-200 bg-blue-50 rounded-xl px-3 py-1.5"
          >
            <BarChart2 size={14} color="#3a7bd5" />
            <Text className="text-xs font-extrabold text-blue-600">Pemakaian</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View className="px-4 mb-2">
        <View className="flex-row items-center bg-white border-2 border-gray-100 rounded-2xl px-3 gap-2">
          <Search size={16} color="#aaa" />
          <TextInput
            className="flex-1 py-2.5 font-bold text-sm text-gray-900"
            placeholder="Cari stok..."
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
          <Text className="text-gray-400 font-bold text-sm mt-3">Memuat stok...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) =>
            isSuperadmin ? (
              <StockCard
                item={item}
                onDelete={() => handleRequestRemove(item)}
                onCorrect={() => setCorrectingItem(item)}
              />
            ) : (
              <StockCard item={item} />
            )
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: 100,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center mt-24">
              <Text className="text-gray-300 font-bold text-sm text-center leading-7">
                {search.length > 0
                  ? `Tidak ada hasil untuk "${search}"`
                  : `Belum ada item stok.\nKetuk "tambah stok" untuk mulai.`}
              </Text>
            </View>
          }
          ListFooterComponent={
            inactiveFiltered.length > 0 ? (
              <View className="mt-2">
                <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">
                  Nonaktif
                </Text>
                {inactiveFiltered.map((item) => (
                  <StockCard key={item.id} item={item} onRestore={() => handleRestore(item)} />
                ))}
              </View>
            ) : null
          }
        />
      )}

      {/* Add Button */}
      {!loading && (
        <View className="absolute bottom-0 left-0 right-0 bg-gray-100 pt-3 pb-3 px-4" style={{ elevation: 4 }}>
          <TouchableOpacity
            onPress={() => sheetRef.current?.expand()}
            disabled={saving}
            className="w-full bg-yellow-100 rounded-2xl py-4 items-center shadow shadow-yellow-400/20"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Text className="text-sm font-extrabold text-gray-500">tambah stok</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <AddStockSheet sheetRef={sheetRef} onAdd={handleAdd} canCreateNew={isSuperadmin} />

      <CorrectStockDialog
        item={correctingItem}
        onSave={handleCorrectStock}
        onCancel={() => setCorrectingItem(null)}
      />

      <ConfirmDialog
        visible={!!pendingRemove}
        title="Bahan ini masih digunakan"
        message={
          pendingRemove
            ? `Menu berikut masih menggunakan "${pendingRemove.item.name}": ${pendingRemove.dependentMenus.join(", ")}. Perbarui resepnya dulu, atau tetap hapus?`
            : ""
        }
        confirmLabel="Tetap Hapus"
        destructive
        onConfirm={handleConfirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </SafeAreaView>
  );
}