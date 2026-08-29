import { useState, useCallback, memo, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Search, X, Pencil, Plus, Trash2, RotateCcw } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAuth } from "../../../../context/AuthContext";

const ADDITIONAL_COGS_PERCENT = 10;

type Ingredient = {
  stockId: number;
  stockName: string;
  quantity: number;
  pricePerUnit: number;
};

type CogsMode = "ingredients" | "manual";

type MenuWithCogs = {
  id: number;
  name: string;
  sellingPrice: number;
  ingredients: Ingredient[];
  cogsMode: CogsMode;
  manualCogs: number | null;
  rawCogs: number | null; // the "before markup" cogs, resolved based on cogsMode. null = not set (manual mode, no value yet)
  isActive: boolean;
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function MarginBadge({ cogs, price }: { cogs: number; price: number }) {
  const margin = ((price - cogs) / price) * 100;

  const tier =
    margin >= 10
      ? { label: "Baik", bg: "bg-green-100", text: "text-green-600" }
      : margin >= 5
      ? { label: "Oke", bg: "bg-yellow-100", text: "text-yellow-600" }
      : { label: "Rendah", bg: "bg-red-100", text: "text-red-600" };

  return (
    <View className={`px-2 py-0.5 rounded-lg ${tier.bg}`}>
      <Text className={`text-xs font-extrabold ${tier.text}`}>
        {margin.toFixed(0)}% margin
      </Text>
    </View>
  );
}

const MenuCard = memo(function MenuCard({
  item,
  isExpanded,
  onToggle,
  onDelete,
  onRestore,
}: {
  item: MenuWithCogs;
  isExpanded: boolean;
  onToggle: (id: number) => void;
  onDelete?: () => void;
  onRestore?: () => void;
}) {
  const { adjustedCogs, additionalCost, grossProfit, profitColor, hasCogs } = useMemo(() => {
    const hasCogs = item.rawCogs !== null;
    const rawCogs = item.rawCogs ?? 0;
    const additionalCost = (rawCogs * ADDITIONAL_COGS_PERCENT) / 100;
    const adjustedCogs = rawCogs + additionalCost;
    const grossProfit = item.sellingPrice - adjustedCogs;
    const profitColor =
      grossProfit <= 0
        ? "text-red-600"
        : grossProfit < 5000
        ? "text-yellow-600"
        : "text-green-600";

    return { adjustedCogs, additionalCost, grossProfit, profitColor, hasCogs };
  }, [item.rawCogs, item.sellingPrice]);

  const handlePress = useCallback(() => onToggle(item.id), [onToggle, item.id]);
  const handleEditPress = useCallback(() => {
    router.push(`/(admin)/(tabs)/cogs/${item.id}`);
  }, [item.id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className={`rounded-2xl px-4 py-4 mb-3 shadow-sm ${
        item.isActive ? "bg-yellow-100 shadow-yellow-300/30" : "bg-gray-200 shadow-gray-300/20 opacity-70"
      }`}
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-black text-gray-900 flex-1 mr-2">{item.name}</Text>
        <View className="flex-row items-center gap-2">
          {!item.isActive ? (
            <View className="bg-gray-300 px-2 py-0.5 rounded-lg">
              <Text className="text-xs font-extrabold text-gray-600">Dihapus</Text>
            </View>
          ) : hasCogs ? (
            <MarginBadge cogs={adjustedCogs} price={item.sellingPrice} />
          ) : (
            <View className="bg-gray-100 px-2 py-0.5 rounded-lg">
              <Text className="text-xs font-extrabold text-gray-400">Belum diatur</Text>
            </View>
          )}
          {item.isActive && (
            <TouchableOpacity
              onPress={handleEditPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="bg-white/80 rounded-lg p-1.5"
            >
              <Pencil size={14} color="#78716c" />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="bg-white/80 rounded-lg p-1.5"
            >
              <Trash2 size={14} color="#ef4444" />
            </TouchableOpacity>
          )}
          {onRestore && (
            <TouchableOpacity
              onPress={onRestore}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="bg-white/80 rounded-lg p-1.5"
            >
              <RotateCcw size={14} color="#22c55e" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Summary */}
      <View className="bg-cyan-100 rounded-xl px-4 py-3 gap-2">
        <View className="flex-row justify-between">
          <Text className="text-xs font-bold text-gray-500">Harga Jual</Text>
          <Text className="text-sm font-extrabold text-gray-800">
            {formatRupiah(item.sellingPrice)}
          </Text>
        </View>
        <View className="h-px bg-cyan-200" />
        <View className="flex-row justify-between">
          <Text className="text-xs font-bold text-gray-500">HPP</Text>
          {hasCogs ? (
            <Text className="text-sm font-extrabold text-gray-800">
              {formatRupiah(adjustedCogs)}
            </Text>
          ) : (
            <Text className="text-sm font-bold text-gray-300">— belum diatur</Text>
          )}
        </View>
        {hasCogs && (
          <>
            <View className="h-px bg-cyan-200" />
            <View className="flex-row justify-between">
              <Text className="text-xs font-bold text-gray-500">Laba Kotor</Text>
              <Text className={`text-sm font-extrabold ${profitColor}`}>
                {formatRupiah(grossProfit)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Ingredients breakdown (only meaningful in ingredients mode) */}
      {isExpanded && item.cogsMode === "ingredients" && (
        <View className="mt-3">
          <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">
            Bahan
          </Text>
          {item.ingredients.length === 0 ? (
            <Text className="text-xs font-bold text-gray-400 py-2">
              Belum ada bahan yang ditambahkan.
            </Text>
          ) : (
            <>
              {item.ingredients.map((ing) => (
                <View
                  key={ing.stockId}
                  className="flex-row justify-between items-center py-1.5 border-b border-yellow-200"
                >
                  <Text className="text-xs font-bold text-gray-600">
                    {ing.stockName} x {ing.quantity}
                  </Text>
                  <Text className="text-xs font-bold text-gray-500">
                    {formatRupiah(ing.quantity * ing.pricePerUnit)}
                  </Text>
                </View>
              ))}
              <View className="flex-row justify-between items-center py-1.5 border-b border-yellow-200">
                <Text className="text-xs font-bold text-gray-600">
                  Tambahan {ADDITIONAL_COGS_PERCENT}%
                </Text>
                <Text className="text-xs font-bold text-gray-500">
                  {formatRupiah(additionalCost)}
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      {isExpanded && item.cogsMode === "manual" && (
        <View className="mt-3">
          <Text className="text-xs font-bold text-gray-400">
            HPP dimasukkan secara manual. Ketuk ikon pensil untuk mengedit.
          </Text>
        </View>
      )}

      <Text className="text-[10px] font-bold text-gray-400 text-center mt-2">
        {isExpanded ? "▲ sembunyikan detail" : "▼ tampilkan detail"}
      </Text>
    </TouchableOpacity>
  );
});

export default function CogsScreen() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === "superadmin";

  const [menus, setMenus] = useState<MenuWithCogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isInitial: boolean) => {
    if (isInitial) setLoading(true);

    // try/finally: the mapping below reaches into `i.stock`, which comes back
    // null when the embed fails rather than merely empty, so this block can
    // throw outright — and a throw used to skip setLoading(false) and strand
    // the spinner with no way back.
    try {
      const { data: menuData, error: menuError } = await supabase
        .from("menus")
        .select("id, name, price, cogs_mode, manual_cogs, is_active");

      const { data: ingredientData } = await supabase
        .from("menu_ingredients")
        .select("menu_id, quantity, stock:stock_id(id, name, price_per_unit)");

      // A failed load used to render as an empty list, which on this screen
      // reads as "no menus have HPP set" rather than "nothing loaded".
      if (menuError || !menuData) {
        console.error("Failed to fetch menus:", menuError?.message);
        setMenus([]);
        setError("Gagal memuat data HPP. Periksa koneksi Anda.");
        return;
      }

      const result: MenuWithCogs[] = menuData.map((menu) => {
        const ingredients: Ingredient[] = (ingredientData ?? [])
          .filter((i) => i.menu_id === menu.id)
          .map((i) => ({
            stockId: (i.stock as any).id,
            stockName: (i.stock as any).name,
            quantity: i.quantity,
            pricePerUnit: (i.stock as any).price_per_unit,
          }));

        const cogsMode = (menu.cogs_mode ?? "ingredients") as CogsMode;

        // Resolve rawCogs strictly based on mode - never mixed
        const rawCogs =
          cogsMode === "ingredients"
            ? ingredients.length > 0
              ? ingredients.reduce((sum, i) => sum + i.quantity * i.pricePerUnit, 0)
              : null
            : menu.manual_cogs;

        return {
          id: menu.id,
          name: menu.name,
          sellingPrice: menu.price,
          ingredients,
          cogsMode,
          manualCogs: menu.manual_cogs,
          rawCogs,
          isActive: menu.is_active,
        };
      });
      setMenus(result);
      setError(null);
    } catch (e) {
      console.error("Failed to fetch HPP data:", e);
      setMenus([]);
      setError("Gagal memuat data HPP. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData(menus.length === 0);
    }, [fetchData, menus.length])
  );

  const filtered = useMemo(
    () =>
      menus.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) &&
          (m.isActive || (isSuperadmin && showDeleted))
      ),
    [menus, search, isSuperadmin, showDeleted]
  );

  const handleToggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Both of these used to drop the error on the floor, so a denied or failed
  // write looked exactly like a tap that never registered — the card just
  // stayed where it was.
  const handleDeleteMenu = useCallback(async (id: number) => {
    const { error: deleteError } = await supabase.from("menus").update({ is_active: false }).eq("id", id);
    if (deleteError) {
      console.error("Failed to archive menu:", deleteError.message);
      setError("Gagal menghapus menu. Silakan coba lagi.");
      return;
    }
    setError(null);
    fetchData(false);
  }, [fetchData]);

  const handleRestoreMenu = useCallback(async (id: number) => {
    const { error: restoreError } = await supabase.from("menus").update({ is_active: true }).eq("id", id);
    if (restoreError) {
      console.error("Failed to restore menu:", restoreError.message);
      setError("Gagal memulihkan menu. Silakan coba lagi.");
      return;
    }
    setError(null);
    fetchData(false);
  }, [fetchData]);

  const renderItem = useCallback(
    ({ item }: { item: MenuWithCogs }) => (
      <MenuCard
        item={item}
        isExpanded={expandedId === item.id}
        onToggle={handleToggle}
        onDelete={isSuperadmin && item.isActive ? () => setPendingDeleteId(item.id) : undefined}
        onRestore={isSuperadmin && !item.isActive ? () => handleRestoreMenu(item.id) : undefined}
      />
    ),
    [expandedId, handleToggle, isSuperadmin, handleRestoreMenu]
  );

  const keyExtractor = useCallback((item: MenuWithCogs) => item.id.toString(), []);

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
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">HPP</Text>
        {isSuperadmin && (
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/cogs/new")}
            className="flex-row items-center gap-1 bg-blue-500 rounded-xl px-3 py-2"
          >
            <Plus size={14} color="white" />
            <Text className="text-xs font-extrabold text-white">Menu Baru</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!error && (
        <TouchableOpacity
          onPress={() => setError(null)}
          className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3"
        >
          <Text className="text-xs font-bold text-red-600">{error}</Text>
        </TouchableOpacity>
      )}

      {/* Search */}
      <View className="px-4 mb-2">
        <View className="flex-row items-center bg-white border-2 border-gray-100 rounded-2xl px-3 gap-2">
          <Search size={16} color="#aaa" />
          <TextInput
            className="flex-1 py-2.5 font-bold text-sm text-gray-900"
            placeholder="Cari menu..."
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

      {isSuperadmin && (
        <TouchableOpacity
          onPress={() => setShowDeleted((v) => !v)}
          className="flex-row items-center gap-2 px-4 mb-2"
        >
          <View className={`w-4 h-4 rounded-md ${showDeleted ? "bg-blue-500" : "bg-white border-2 border-gray-200"}`} />
          <Text className="text-xs font-bold text-gray-500">Tampilkan yang dihapus</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-xs font-bold text-blue-400 leading-5">
              HPP dihitung dari bahan yang terhubung ke item stok, atau dimasukkan secara manual.
              Ketuk ikon pensil pada kartu menu untuk mengedit.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center mt-16">
            <Text className="text-gray-300 font-bold text-sm">
              {search.length > 0 ? `Tidak ada hasil untuk "${search}"` : "Tidak ada menu ditemukan."}
            </Text>
          </View>
        }
      />

      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title="Hapus menu ini?"
        message="Menu akan disembunyikan dari daftar dan dari pemesanan, tetapi pesanan lama tetap utuh. Anda dapat memulihkannya kapan saja."
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          if (pendingDeleteId !== null) handleDeleteMenu(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </SafeAreaView>
  );
}