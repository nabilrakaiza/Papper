import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Check, Search, X, Calendar } from "lucide-react-native"; // <-- Added Calendar icon
import DateTimePicker from "@react-native-community/datetimepicker"; // <-- Added library
import { supabase } from "@/lib/supabase";
import { StockItem } from "@/types/stock";

type StockDefinition = {
  id: number;
  name: string;
  unit: string;
};

type PriceMode = "total" | "per-unit";

type Props = {
  onAdd: (item: Omit<StockItem, "id" | "isActive"> & { purchaseDate?: string }) => Promise<void>;
  sheetRef: React.RefObject<BottomSheet>;
  canCreateNew?: boolean; // superadmin-only: allow defining a brand-new stock item type
};

const formatRupiah = (digits: string) => {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export default function AddStockSheet({ onAdd, sheetRef, canCreateNew = false }: Props) {
  const [definitions, setDefinitions] = useState<StockDefinition[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockDefinition | null>(null);
  const [newUnit, setNewUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priceMode, setPriceMode] = useState<PriceMode>("total");
  const [priceInput, setPriceInput] = useState("");
  
  // NEW: Store an actual Date object instead of a string
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchDefinitions = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("stock")
          .select("id, name, unit")
          .order("name", { ascending: true });

        // Without this an empty picker reads as "no stock items exist", and the
        // obvious response is to create a new definition — leaving a second
        // "Gula" beside the one already there instead of restocking it.
        if (fetchError) {
          console.error("Failed to load stock definitions:", fetchError.message);
          setError("Gagal memuat daftar stok. Periksa koneksi Anda sebelum membuat item baru.");
          return;
        }

        if (data) setDefinitions(data);
      } catch (e) {
        console.error("Failed to load stock definitions:", e);
        setError("Gagal memuat daftar stok. Periksa koneksi Anda sebelum membuat item baru.");
      } finally {
        setLoadingDefs(false);
      }
    };
    fetchDefinitions();
  }, []);

  const filtered = definitions.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const qty = parseFloat(quantity);
  const rawPrice = parseFloat(priceInput);
  const computedPricePerUnit =
    priceMode === "total"
      ? !isNaN(qty) && qty > 0 && !isNaN(rawPrice)
        ? rawPrice / qty
        : null
      : !isNaN(rawPrice)
      ? rawPrice
      : null;

  const reset = () => {
    setSelected(null);
    setSearch("");
    setNewUnit("");
    setQuantity("");
    setPriceInput("");
    setPriceMode("total");
    setPurchaseDate(new Date()); // Reset to today
    setShowDatePicker(false);
    setError("");
    setSaving(false);
  };

  const handleSelect = (def: StockDefinition) => {
    setSelected(def);
    setSearch(def.name);
    setError("");
  };

  const handleClearSelection = () => {
    setSelected(null);
    setSearch("");
    setNewUnit("");
  };

  const handleConfirmNew = () => {
    if (!search.trim() || !newUnit.trim()) return;
    setSelected({ id: -1, name: search.trim(), unit: newUnit.trim() });
    setError("");
  };

  // NEW: Handle the calendar selection
  const handleDateChange = (event: any, selectedDate?: Date) => {
    // Android requires manually hiding the picker after selection
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  const handleQuantityChange = (text: string) => {
    // Strip anything that isn't a digit (this alone blocks "-" from ever appearing)
    let digitsOnly = text.replace(/[^0-9]/g, "");

    // Strip leading zeros (so "0", "00", "01" don't linger) but allow user to still be typing
    digitsOnly = digitsOnly.replace(/^0+(?=\d)/, "");

    setQuantity(digitsOnly);
  };

  const handlePriceChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, ""); // strip dots, "Rp", anything non-numeric
    setPriceInput(digitsOnly);
  };

  const handleSave = async () => {
    if (!selected) { setError("Pilih item stok dari daftar"); return; }
    if (isNaN(qty) || qty <= 0) { setError("Masukkan jumlah yang valid"); return; }
    if (computedPricePerUnit === null || computedPricePerUnit < 0) {
      setError("Masukkan harga yang valid"); return;
    }

    setSaving(true);
    setError("");

    try {
      await onAdd({
        name: selected.name,
        quantity: qty,
        unit: selected.unit,
        pricePerUnit: Math.round(computedPricePerUnit),
        // Convert the Date object to ISO string for your backend
        purchaseDate: purchaseDate.toISOString(),
      });
      reset();
      sheetRef.current?.close();
    } catch (e) {
      setError("Gagal menyimpan. Silakan coba lagi.");
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    sheetRef.current?.close();
  };

  const showDropdown = !selected && search.length > 0 && filtered.length > 0;

  // Format the date nicely for the UI (e.g., "15 May 2026")
  const formattedDate = purchaseDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["75%"]}
      enablePanDownToClose
      onClose={reset}
      backgroundStyle={{ borderRadius: 24, backgroundColor: "white" }}
      handleIndicatorStyle={{ backgroundColor: "#ddd", width: 40 }}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="px-5 pt-2 pb-8">
            <Text className="text-lg font-black text-center text-gray-900 mb-5">
              Tambah Stok
            </Text>

            {/* Search / select */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Item Stok
            </Text>

            {loadingDefs ? (
              <View className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-3 mb-3 items-center">
                <ActivityIndicator size="small" color="#aaa" />
              </View>
            ) : (
              <View className="mb-1">
                {/* Search input */}
                <View className={`flex-row items-center bg-gray-50 border-2 rounded-xl px-3 mb-1 ${
                  selected ? "border-green-200 bg-green-50" : "border-gray-100"
                }`}>
                  <Search size={16} color="#aaa" />
                  <TextInput
                    className="flex-1 py-2.5 px-2 font-bold text-sm text-gray-900"
                    placeholder="Cari item stok..."
                    value={search}
                    onChangeText={(text) => {
                      setSearch(text);
                      if (selected && text !== selected.name) {
                        setSelected(null);
                      }
                    }}
                    placeholderTextColor="#ccc"
                    editable={!saving}
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={handleClearSelection}>
                      <X size={16} color="#aaa" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dropdown results */}
                {showDropdown && (
                  <View className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden shadow-sm mb-2">
                    {filtered.map((def, index) => (
                      <TouchableOpacity
                        key={def.id}
                        onPress={() => handleSelect(def)}
                        className={`flex-row items-center justify-between px-4 py-3 ${
                          index < filtered.length - 1 ? "border-b border-gray-50" : ""
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-bold text-gray-800">
                            {def.name}
                          </Text>
                          <View className="bg-gray-100 rounded-lg px-2 py-0.5">
                            <Text className="text-xs font-bold text-gray-400">
                              {def.unit}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* No results */}
                {!selected && search.length > 0 && filtered.length === 0 && (
                  <View className="bg-gray-50 rounded-xl px-4 py-3 mb-2">
                    <Text className="text-xs font-bold text-gray-400 text-center mb-2">
                      Tidak ditemukan item untuk -{search}-
                    </Text>
                    {canCreateNew && (
                      <View>
                        <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                          Satuan item baru
                        </Text>
                        <TextInput
                          className="w-full bg-white border-2 border-gray-100 rounded-xl px-3 py-2 font-bold text-sm text-gray-900 mb-2"
                          placeholder="cth. kg, liter, pcs"
                          value={newUnit}
                          onChangeText={setNewUnit}
                          placeholderTextColor="#ccc"
                        />
                        <TouchableOpacity
                          onPress={handleConfirmNew}
                          disabled={!newUnit.trim()}
                          className={`rounded-xl py-2.5 items-center ${
                            newUnit.trim() ? "bg-green-500" : "bg-gray-200"
                          }`}
                        >
                          <Text className="text-xs font-extrabold text-white">
                            Buat -{search}- sebagai item baru
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {/* Selected confirmation */}
                {selected && (
                  <View className="flex-row items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-2">
                    <Check size={14} color="#22c55e" />
                    <Text className="text-xs font-bold text-green-600 flex-1">
                      {selected.name}
                    </Text>
                    <View className="bg-green-100 rounded-lg px-2 py-0.5">
                      <Text className="text-xs font-extrabold text-green-500">
                        {selected.unit}
                      </Text>
                    </View>
                    <Text className="text-xs text-green-300">
                      {selected.id === -1 ? "(baru)" : "(tetap)"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Quantity */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1 mt-2">
              Jumlah
            </Text>
            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
              placeholder={`cth. 3 ${selected?.unit ?? ""}`}
              value={quantity}
              onChangeText={handleQuantityChange}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
              editable={!saving}
            />

            {/* Price mode */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Input Harga
            </Text>
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-3 gap-1">
              {(["total", "per-unit"] as PriceMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setPriceMode(mode)}
                  disabled={saving}
                  className={`flex-1 py-2 rounded-[9px] items-center ${
                    priceMode === mode ? "bg-white" : ""
                  }`}
                >
                  <Text
                    className={`text-xs font-extrabold ${
                      priceMode === mode ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    {mode === "total" ? "Harga total" : "Harga / unit"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-2"
              placeholder={
                priceMode === "total"
                  ? "cth. 25.000 (total yang dibayar)"
                  : `cth. 8.333 (per ${selected?.unit ?? "unit"})`
              }
              value={priceInput ? `Rp ${formatRupiah(priceInput)}` : ""}
              onChangeText={handlePriceChange}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
              editable={!saving}
            />

            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1 mt-2">
              Tanggal Pembelian
            </Text>
            
            {/* NEW: Clickable Date Button */}
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              disabled={saving}
              className="flex-row items-center justify-between w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-3 mb-3"
            >
              <Text className="font-bold text-sm text-gray-900">
                {formattedDate}
              </Text>
              <Calendar size={18} color="#aaa" />
            </TouchableOpacity>

            {/* NEW: The Native Date Picker Component */}
            {showDatePicker && (
              <DateTimePicker
                value={purchaseDate}
                mode="date"
                display="default" // Shows modal on Android, inline/spinner on iOS
                onChange={handleDateChange}
                maximumDate={new Date()} // Prevents admin from picking future dates
              />
            )}

            {/* Price preview */}
            {computedPricePerUnit !== null && computedPricePerUnit > 0 && (
              <View className="bg-green-50 border border-dashed border-green-200 rounded-xl py-2 px-3 mb-3 items-center">
                <Text className="text-xs font-extrabold text-green-600">
                  Tersimpan sebagai Rp{" "}
                  {Math.round(computedPricePerUnit).toLocaleString("id-ID")} /{" "}
                  {selected?.unit ?? "unit"}
                </Text>
              </View>
            )}

            {/* Error */}
            {!!error && (
              <Text className="text-xs font-bold text-red-500 text-center mb-2">
                {error}
              </Text>
            )}

            {/* Actions */}
            <View className="flex-row gap-3 mt-1">
              <TouchableOpacity
                onPress={handleClose}
                disabled={saving}
                className="flex-1 border-2 border-gray-100 rounded-2xl py-3 items-center"
              >
                <Text className="text-sm font-bold text-gray-400">Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className="flex-[2] bg-green-500 rounded-2xl py-3 items-center shadow shadow-green-600/40"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Simpan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}