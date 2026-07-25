import { useState, useCallback, useMemo, useRef, useEffect, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect, useNavigation } from "expo-router";
import { ChevronLeft, Plus, Trash2, Search, X } from "lucide-react-native";
import BottomSheet, {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetFlatList,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { supabase } from "@/lib/supabase";

type CogsMode = "ingredients" | "manual";

type IngredientRow = {
  rowId: number; // positive = existing DB row (menu_ingredients.id); negative = new, not yet saved
  stockId: number;
  stockName: string;
  unit: string;
  quantity: number;
  pricePerUnit: number;
};

type StockOption = {
  id: number;
  name: string;
  unit: string;
  pricePerUnit: number;
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

const StockRow = memo(function StockRow({
  item,
  isAdded,
  isSelected,
  onPress,
}: {
  item: StockOption;
  isAdded: boolean;
  isSelected: boolean;
  onPress: (item: StockOption) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  return (
    <TouchableOpacity
      disabled={isAdded}
      onPress={handlePress}
      className={`flex-row items-center justify-between rounded-xl px-4 py-3 mb-2 ${
        isAdded
          ? "bg-gray-100"
          : isSelected
          ? "bg-blue-100 border-2 border-blue-300"
          : "bg-gray-50"
      }`}
    >
      <View>
        <Text className={`text-sm font-bold ${isAdded ? "text-gray-400" : "text-gray-800"}`}>
          {item.name}
        </Text>
        <Text className="text-[10px] font-bold text-gray-400">
          {item.unit} · {formatRupiah(item.pricePerUnit)}/{item.unit}
        </Text>
      </View>
      {isAdded && (
        <Text className="text-[10px] font-extrabold text-gray-400">Sudah ditambahkan</Text>
      )}
    </TouchableOpacity>
  );
});

export default function CogsEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const menuId = Number(id);
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuName, setMenuName] = useState("");
  const [sellingPrice, setSellingPrice] = useState(0);

  const [cogsMode, setCogsMode] = useState<CogsMode>("ingredients");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [manualCogsInput, setManualCogsInput] = useState("");
  const [deletedRowIds, setDeletedRowIds] = useState<number[]>([]);

  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState("");

  // Stock picker bottom sheet
  const pickerRef = useRef<BottomSheetModal>(null);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);
  const [newQuantity, setNewQuantity] = useState("");

  const snapPoints = useMemo(() => ["55%", "92%"], []);

  const fetchMenu = useCallback(async () => {
    setLoading(true);

    const { data: menu } = await supabase
      .from("menus")
      .select("id, name, price, cogs_mode, manual_cogs")
      .eq("id", menuId)
      .single();

    const { data: ingredientData } = await supabase
      .from("menu_ingredients")
      .select("id, quantity, stock:stock_id(id, name, unit, price_per_unit)")
      .eq("menu_id", menuId);

    if (menu) {
      setMenuName(menu.name);
      setSellingPrice(menu.price);
      setCogsMode((menu.cogs_mode ?? "ingredients") as CogsMode);
      setManualCogsInput(menu.manual_cogs != null ? menu.manual_cogs.toString() : "");
    }

    setIngredients(
      (ingredientData ?? []).map((i) => ({
        rowId: i.id,
        stockId: (i.stock as any).id,
        stockName: (i.stock as any).name,
        unit: (i.stock as any).unit,
        quantity: i.quantity,
        pricePerUnit: (i.stock as any).price_per_unit,
      }))
    );

    setDeletedRowIds([]);
    setIsDirty(false);
    setLoading(false);
  }, [menuId]);

  useFocusEffect(
    useCallback(() => {
      fetchMenu();
    }, [fetchMenu])
  );

  // Warn on back navigation if there are unsaved changes
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!isDirty) return;

      e.preventDefault();

      Alert.alert(
        "Buang perubahan?",
        "Anda memiliki perubahan yang belum disimpan. Jika keluar sekarang, perubahan akan hilang.",
        [
          { text: "Lanjut edit", style: "cancel" },
          {
            text: "Buang",
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, isDirty]);

  const fetchStockOptions = useCallback(async () => {
    const { data } = await supabase
      .from("stock")
      .select("id, name, unit, price_per_unit")
      .order("name", { ascending: true });

    setStockOptions(
      (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        unit: s.unit,
        pricePerUnit: s.price_per_unit,
      }))
    );
  }, []);

  const openPicker = () => {
    setStockSearch("");
    setSelectedStock(null);
    setNewQuantity("");
    setError("");
    fetchStockOptions();
    pickerRef.current?.present();
  };

  const closePicker = () => {
    pickerRef.current?.dismiss();
  };

  const handleSelectStock = useCallback((item: StockOption) => {
    setSelectedStock(item);
    setNewQuantity("");
    setError("");
    pickerRef.current?.snapToIndex(1); // expand fully so quantity input is visible
  }, []);

  const alreadyAddedIds = useMemo(
    () => new Set(ingredients.map((i) => i.stockId)),
    [ingredients]
  );

  const filteredStockOptions = useMemo(
    () => stockOptions.filter((s) => s.name.toLowerCase().includes(stockSearch.toLowerCase())),
    [stockOptions, stockSearch]
  );

  const totalCogs = useMemo(
    () => ingredients.reduce((sum, i) => sum + i.quantity * i.pricePerUnit, 0),
    [ingredients]
  );

  // --- All handlers below are LOCAL ONLY — nothing hits Supabase until Save ---

  const handleSwitchMode = (mode: CogsMode) => {
    if (mode === cogsMode) return;
    setCogsMode(mode);
    setIsDirty(true);
  };

  const handleQuantityChange = (rowId: number, text: string) => {
    const digitsOnly = text.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(digitsOnly);

    setIngredients((prev) =>
      prev.map((i) =>
        i.rowId === rowId ? { ...i, quantity: digitsOnly === "" || isNaN(parsed) ? 0 : parsed } : i
      )
    );
    setIsDirty(true);
  };

  const handleRemove = (row: IngredientRow) => {
    if (row.rowId > 0) {
      // was an existing DB row — mark for deletion on save
      setDeletedRowIds((prev) => [...prev, row.rowId]);
    }
    setIngredients((prev) => prev.filter((i) => i.rowId !== row.rowId));
    setIsDirty(true);
  };

  const handleAddIngredient = () => {
    if (!selectedStock) return;

    const parsed = parseFloat(newQuantity);
    if (!parsed || parsed <= 0) {
      setError("Jumlah harus lebih besar dari 0.");
      return;
    }

    setIngredients((prev) => [
      ...prev,
      {
        rowId: -Date.now(), // temp negative id, replaced with real id after save+refetch
        stockId: selectedStock.id,
        stockName: selectedStock.name,
        unit: selectedStock.unit,
        quantity: parsed,
        pricePerUnit: selectedStock.pricePerUnit,
      },
    ]);
    setIsDirty(true);
    closePicker();
  };

  const handleManualCogsChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, "");
    setManualCogsInput(digitsOnly);
    setIsDirty(true);
  };

  // --- Save: commits everything in one go ---

  const handleSave = async () => {
    setSaving(true);
    setError("");

    // Validate before touching the DB
    if (cogsMode === "ingredients") {
      const invalid = ingredients.some((i) => !i.quantity || i.quantity <= 0);
      if (invalid) {
        setError("Semua jumlah bahan harus lebih besar dari 0.");
        setSaving(false);
        return;
      }
    } else {
      const value = manualCogsInput === "" ? null : parseFloat(manualCogsInput);
      if (value !== null && value < 0) {
        setError("HPP manual tidak boleh negatif.");
        setSaving(false);
        return;
      }
    }

    // 1. Delete removed ingredient rows
    if (deletedRowIds.length > 0) {
      const { error: delError } = await supabase
        .from("menu_ingredients")
        .delete()
        .in("id", deletedRowIds);
      if (delError) {
        setError("Gagal menghapus beberapa bahan.");
        setSaving(false);
        return;
      }
    }

    // 2. Insert new rows (rowId < 0), update existing rows (rowId > 0)
    const newRows = ingredients.filter((i) => i.rowId < 0);
    const existingRows = ingredients.filter((i) => i.rowId > 0);

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("menu_ingredients").insert(
        newRows.map((r) => ({
          menu_id: menuId,
          stock_id: r.stockId,
          quantity: r.quantity,
        }))
      );
      if (insertError) {
        setError("Gagal menambahkan beberapa bahan.");
        setSaving(false);
        return;
      }
    }

    for (const row of existingRows) {
      const { error: updateError } = await supabase
        .from("menu_ingredients")
        .update({ quantity: row.quantity })
        .eq("id", row.rowId);
      if (updateError) {
        setError("Gagal memperbarui beberapa jumlah bahan.");
        setSaving(false);
        return;
      }
    }

    // 3. Update menu-level fields
    const manualCogsValue = manualCogsInput === "" ? null : parseFloat(manualCogsInput);
    const { error: menuError } = await supabase
      .from("menus")
      .update({ cogs_mode: cogsMode, manual_cogs: manualCogsValue })
      .eq("id", menuId);

    if (menuError) {
      setError("Gagal menyimpan mode HPP.");
      setSaving(false);
      return;
    }

    // 4. Refetch to get real row IDs for anything that was newly inserted, and reset dirty state
    await fetchMenu();
    setSaving(false);
  };

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
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Edit HPP</Text>
        <View className="w-6" />
      </View>

      {isDirty && (
        <View className="mx-4 mb-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5">
          <Text className="text-xs font-bold text-amber-600 text-center">
            Anda memiliki perubahan yang belum disimpan.
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white rounded-2xl px-4 py-3 mb-4">
          <Text className="text-lg font-black text-gray-900">{menuName}</Text>
          <Text className="text-xs font-bold text-gray-400 mt-1">
            Harga jual: {formatRupiah(sellingPrice)}
          </Text>
        </View>

        <View className="flex-row bg-gray-200 rounded-2xl p-1 mb-4">
          <TouchableOpacity
            onPress={() => handleSwitchMode("ingredients")}
            className={`flex-1 py-2.5 rounded-xl items-center ${
              cogsMode === "ingredients" ? "bg-white" : ""
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                cogsMode === "ingredients" ? "text-gray-900" : "text-gray-400"
              }`}
            >
              Berdasarkan Bahan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSwitchMode("manual")}
            className={`flex-1 py-2.5 rounded-xl items-center ${
              cogsMode === "manual" ? "bg-white" : ""
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                cogsMode === "manual" ? "text-gray-900" : "text-gray-400"
              }`}
            >
              Manual
            </Text>
          </TouchableOpacity>
        </View>

        {error !== "" && (
          <View className="mb-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}

        {cogsMode === "ingredients" ? (
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5">
            <Text className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">
              Bahan
            </Text>

            {ingredients.length === 0 ? (
              <Text className="text-xs font-bold text-gray-400 py-4 text-center">
                Belum ada bahan yang ditambahkan.
              </Text>
            ) : (
              ingredients.map((row) => (
                <View
                  key={row.rowId}
                  className="flex-row items-center justify-between bg-white/70 rounded-xl px-3 py-2.5 mb-2"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-bold text-gray-800">{row.stockName}</Text>
                    <Text className="text-[10px] font-bold text-gray-400">
                      {formatRupiah(row.pricePerUnit)} / {row.unit}
                    </Text>
                  </View>

                  <TextInput
                    className="bg-white border-2 border-gray-100 rounded-lg px-2 py-1.5 font-bold text-sm text-gray-900 w-16 text-center mr-2"
                    keyboardType="numeric"
                    value={row.quantity === 0 ? "" : row.quantity.toString()}
                    onChangeText={(t) => handleQuantityChange(row.rowId, t)}
                  />

                  <Text className="text-xs font-bold text-gray-500 w-10">{row.unit}</Text>

                  <TouchableOpacity
                    onPress={() => handleRemove(row)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="ml-2"
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity
              onPress={openPicker}
              className="flex-row items-center justify-center gap-2 bg-white/80 rounded-xl py-3 mt-2"
            >
              <Plus size={16} color="#78716c" />
              <Text className="text-xs font-extrabold text-gray-600">Tambah Bahan</Text>
            </TouchableOpacity>

            <View className="h-px bg-yellow-200 my-4" />

            <View className="flex-row justify-between">
              <Text className="text-sm font-bold text-gray-600">Total HPP</Text>
              <Text className="text-base font-black text-gray-900">
                {formatRupiah(totalCogs)}
              </Text>
            </View>
          </View>
        ) : (
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5">
            <Text className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3">
              HPP Manual
            </Text>
            <Text className="text-xs font-bold text-gray-500 mb-3">
              Tidak ada bahan yang dilacak untuk mode ini — masukkan jumlah HPP secara langsung.
            </Text>
            <TextInput
              className="bg-white border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-base text-gray-900"
              placeholder="cth. 12000"
              placeholderTextColor="#ccc"
              keyboardType="numeric"
              value={manualCogsInput}
              onChangeText={handleManualCogsChange}
            />
          </View>
        )}
      </ScrollView>

      {/* Save button */}
      <View className="absolute bottom-0 left-0 right-0 bg-gray-100 pt-3 pb-6 px-4">
        <TouchableOpacity
          onPress={handleSave}
          disabled={!isDirty || saving}
          className={`w-full rounded-2xl py-4 items-center shadow ${
            !isDirty || saving ? "bg-gray-400 shadow-gray-400/30" : "bg-green-400 shadow-green-600/30"
          }`}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-sm font-extrabold text-white">Simpan Perubahan</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stock picker bottom sheet */}
      <BottomSheetModal
        ref={pickerRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
        )}
      >
        <View className="flex-row items-center justify-between px-5 pb-3">
          <Text className="text-lg font-black text-gray-900">Tambah Bahan</Text>
          <TouchableOpacity onPress={closePicker}>
            <X size={22} color="#333" />
          </TouchableOpacity>
        </View>

        <View className="px-4 mb-2">
          <View className="flex-row items-center bg-gray-50 border-2 border-gray-100 rounded-2xl px-3 gap-2">
            <Search size={16} color="#aaa" />
            <BottomSheetTextInput
              className="flex-1 py-2.5 font-bold text-sm text-gray-900"
              placeholder="Cari stok..."
              value={stockSearch}
              onChangeText={setStockSearch}
              placeholderTextColor="#ccc"
            />
          </View>
        </View>

        <BottomSheetFlatList<StockOption>
          data={filteredStockOptions}
          keyExtractor={(s: StockOption) => s.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          renderItem={({ item }: { item: StockOption }) => (
            <StockRow
              item={item}
              isAdded={alreadyAddedIds.has(item.id)}
              isSelected={selectedStock?.id === item.id}
              onPress={handleSelectStock}
            />
          )}
          ListEmptyComponent={
            <Text className="text-xs font-bold text-gray-400 text-center mt-8">
              Tidak ada item stok ditemukan.
            </Text>
          }
        />

        {selectedStock && (
          <View className="px-4 pb-6 pt-3 border-t border-gray-100">
            <Text className="text-xs font-bold text-gray-500 mb-2">
              Jumlah ({selectedStock.unit}) untuk {selectedStock.name}
            </Text>
            <View className="flex-row items-center gap-3">
              <BottomSheetTextInput
                className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900"
                placeholder={`cth. 2 ${selectedStock.unit}`}
                placeholderTextColor="#ccc"
                keyboardType="numeric"
                value={newQuantity}
                onChangeText={(t) => setNewQuantity(t.replace(/[^0-9.]/g, ""))}
              />
              <TouchableOpacity
                onPress={handleAddIngredient}
                className="bg-green-400 rounded-xl px-5 py-3"
              >
                <Text className="text-sm font-extrabold text-white">Tambah</Text>
              </TouchableOpacity>
            </View>
            {error !== "" && (
              <Text className="text-xs font-bold text-red-500 mt-2">{error}</Text>
            )}
          </View>
        )}
      </BottomSheetModal>
    </SafeAreaView>
  );
}