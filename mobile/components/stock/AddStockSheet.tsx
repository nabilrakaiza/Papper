import {useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { StockItem } from "../../types/stock";

type PriceMode = "total" | "per-unit";

type Props = {
  onAdd: (item: Omit<StockItem, "id">) => void;
  sheetRef: React.RefObject<BottomSheet>;
};

export default function AddStockSheet({ onAdd, sheetRef }: Props) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [priceMode, setPriceMode] = useState<PriceMode>("total");
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState("");

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
    setName("");
    setQuantity("");
    setUnit("");
    setPriceInput("");
    setPriceMode("total");
    setError("");
  };

  const handleSave = () => {
    if (!name.trim()) { setError("Item name is required"); return; }
    if (isNaN(qty) || qty <= 0) { setError("Enter a valid quantity"); return; }
    if (!unit.trim()) { setError("Unit is required"); return; }
    if (computedPricePerUnit === null || computedPricePerUnit < 0) {
      setError("Enter a valid price"); return;
    }

    onAdd({
      name: name.trim(),
      quantity: qty,
      unit: unit.trim(),
      pricePerUnit: Math.round(computedPricePerUnit),
    });

    reset();
    sheetRef.current?.close();
  };

  const handleClose = () => {
    reset();
    sheetRef.current?.close();
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["65%"]}
      enablePanDownToClose
      onClose={reset}
      backgroundStyle={{ borderRadius: 24, backgroundColor: "white" }}
      handleIndicatorStyle={{ backgroundColor: "#ddd", width: 40 }}
    >
      <BottomSheetView>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="px-5 pt-2 pb-8">
            <Text className="text-lg font-black text-center text-gray-900 mb-5">
              Add Stock
            </Text>

            {/* Name */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Item Name
            </Text>
            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
              placeholder="e.g. Marjan"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#ccc"
            />

            {/* Quantity + Unit */}
            <View className="flex-row gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                  Quantity
                </Text>
                <TextInput
                  className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900"
                  placeholder="e.g. 3"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  placeholderTextColor="#ccc"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                  Unit
                </Text>
                <TextInput
                  className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900"
                  placeholder="e.g. Liter"
                  value={unit}
                  onChangeText={setUnit}
                  placeholderTextColor="#ccc"
                />
              </View>
            </View>

            {/* Price mode toggle */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Price Input
            </Text>
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-3 gap-1">
              {(["total", "per-unit"] as PriceMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setPriceMode(mode)}
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
                  : "e.g. 8333 (per unit)"
              }
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
            />

            {/* Preview */}
            {computedPricePerUnit !== null && computedPricePerUnit > 0 && (
              <View className="bg-green-50 border border-dashed border-green-200 rounded-xl py-2 px-3 mb-3 items-center">
                <Text className="text-xs font-extrabold text-green-600">
                  Stored as Rp{" "}
                  {Math.round(computedPricePerUnit).toLocaleString("id-ID")} /{" "}
                  {unit || "unit"}
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
                className="flex-1 border-2 border-gray-100 rounded-2xl py-3 items-center"
              >
                <Text className="text-sm font-bold text-gray-400">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                className="flex-[2] bg-green-500 rounded-2xl py-3 items-center shadow shadow-green-600/40"
              >
                <Text className="text-sm font-extrabold text-white">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BottomSheetView>
    </BottomSheet>
  );
}