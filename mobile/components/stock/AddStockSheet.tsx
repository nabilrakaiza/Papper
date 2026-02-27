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
import { Check, Search, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { StockItem } from "@/types/stock";

type StockDefinition = {
  id: number;
  name: string;
  unit: string;
};

type PriceMode = "total" | "per-unit";

type Props = {
  onAdd: (item: Omit<StockItem, "id">) => Promise<void>;
  sheetRef: React.RefObject<BottomSheet>;
};

export default function AddStockSheet({ onAdd, sheetRef }: Props) {
  const [definitions, setDefinitions] = useState<StockDefinition[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockDefinition | null>(null);
  const [quantity, setQuantity] = useState("");
  const [priceMode, setPriceMode] = useState<PriceMode>("total");
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchDefinitions = async () => {
      const { data } = await supabase
        .from("stock_definitions")
        .select("*")
        .order("name", { ascending: true });
      if (data) setDefinitions(data);
      setLoadingDefs(false);
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
    setQuantity("");
    setPriceInput("");
    setPriceMode("total");
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
  };

  const handleSave = async () => {
    if (!selected) { setError("Please select a stock item from the list"); return; }
    if (isNaN(qty) || qty <= 0) { setError("Enter a valid quantity"); return; }
    if (computedPricePerUnit === null || computedPricePerUnit < 0) {
      setError("Enter a valid price"); return;
    }

    setSaving(true);
    setError("");

    try {
      await onAdd({
        name: selected.name,
        quantity: qty,
        unit: selected.unit,
        pricePerUnit: Math.round(computedPricePerUnit),
      });
      reset();
      sheetRef.current?.close();
    } catch (e) {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    sheetRef.current?.close();
  };

  const showDropdown = !selected && search.length > 0 && filtered.length > 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["70%"]}
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
              Add Stock
            </Text>

            {/* Search / select */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Stock Item
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
                    placeholder="Search stock item..."
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
                    <Text className="text-xs font-bold text-gray-400 text-center">
                      No items found for -{search}-
                    </Text>
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
                    <Text className="text-xs text-green-300">(fixed)</Text>
                  </View>
                )}
              </View>
            )}

            {/* Quantity */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Quantity
            </Text>
            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
              placeholder={`e.g. 3 ${selected?.unit ?? ""}`}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
              editable={!saving}
            />

            {/* Price mode */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Price Input
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
                    {mode === "total" ? "Total price" : "Price / unit"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-2"
              placeholder={
                priceMode === "total"
                  ? "e.g. 25000 (total you paid)"
                  : `e.g. 8333 (per ${selected?.unit ?? "unit"})`
              }
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
              editable={!saving}
            />

            {/* Price preview */}
            {computedPricePerUnit !== null && computedPricePerUnit > 0 && (
              <View className="bg-green-50 border border-dashed border-green-200 rounded-xl py-2 px-3 mb-3 items-center">
                <Text className="text-xs font-extrabold text-green-600">
                  Stored as Rp{" "}
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
                <Text className="text-sm font-bold text-gray-400">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className="flex-[2] bg-green-500 rounded-2xl py-3 items-center shadow shadow-green-600/40"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-sm font-extrabold text-white">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}