import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import BottomSheet, { BottomSheetView, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Check, ChevronDown } from "lucide-react-native";
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
  const [selected, setSelected] = useState<StockDefinition | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
    setPickerOpen(false);
    setQuantity("");
    setPriceInput("");
    setPriceMode("total");
    setError("");
    setSaving(false);
  };

  const handleSave = async () => {
    if (!selected) { setError("Please select a stock item"); return; }
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
      <BottomSheetScrollView>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="px-5 pt-2 pb-8">
            <Text className="text-lg font-black text-center text-gray-900 mb-5">
              Add Stock
            </Text>

            {/* Stock item picker */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Stock Item
            </Text>

            {loadingDefs ? (
              <View className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-3 mb-3 items-center">
                <ActivityIndicator size="small" color="#aaa" />
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setPickerOpen((o) => !o)}
                disabled={saving}
                className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-3 mb-1 flex-row items-center justify-between"
              >
                <Text className={`text-sm font-bold ${selected ? "text-gray-900" : "text-gray-300"}`}>
                  {selected ? `${selected.name}` : "Select an item..."}
                </Text>
                <ChevronDown size={16} color="#aaa" />
              </TouchableOpacity>
            )}

            {/* Dropdown list */}
            {pickerOpen && (
              <View className="bg-white border-2 border-gray-100 rounded-xl mb-3 overflow-hidden shadow-sm">
                {definitions.map((def, index) => (
                  <TouchableOpacity
                    key={def.id}
                    onPress={() => {
                      setSelected(def);
                      setPickerOpen(false);
                      setError("");
                    }}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      index < definitions.length - 1 ? "border-b border-gray-50" : ""
                    } ${selected?.id === def.id ? "bg-green-50" : ""}`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-bold text-gray-800">{def.name}</Text>
                      <View className="bg-gray-100 rounded-lg px-2 py-0.5">
                        <Text className="text-xs font-bold text-gray-400">{def.unit}</Text>
                      </View>
                    </View>
                    {selected?.id === def.id && (
                      <Check size={16} color="#22c55e" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Unit display (locked) */}
            {selected && (
              <View className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-3 flex-row items-center gap-2">
                <Text className="text-xs font-bold text-blue-400">Unit:</Text>
                <Text className="text-xs font-extrabold text-blue-600">{selected.unit}</Text>
                <Text className="text-xs text-blue-300 ml-1">(fixed)</Text>
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

            {/* Price mode toggle */}
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
                    priceMode === mode ? "bg-white shadow" : ""
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