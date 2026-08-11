import { useEffect, useState } from "react";
import { View, Text, Modal, TextInput, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { StockItem } from "../../types/stock";

type Props = {
  item: StockItem | null;
  onSave: (params: { quantity: number; pricePerUnit: number; note: string }) => Promise<void>;
  onCancel: () => void;
};

const formatDigits = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export default function CorrectStockDialog({ item, onSave, onCancel }: Props) {
  const [quantityInput, setQuantityInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setQuantityInput(item.quantity.toString());
      setPriceInput(item.pricePerUnit.toString());
      setNote("");
      setError("");
      setSaving(false);
    }
  }, [item]);

  const handleSave = async () => {
    const quantity = parseFloat(quantityInput);
    const pricePerUnit = parseInt(priceInput, 10);

    if (isNaN(quantity) || quantity < 0) {
      setError("Jumlah tidak valid.");
      return;
    }
    if (isNaN(pricePerUnit) || pricePerUnit < 0) {
      setError("Harga tidak valid.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave({ quantity, pricePerUnit, note: note.trim() });
    } catch (e) {
      setError("Gagal menyimpan koreksi. Silakan coba lagi.");
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/40 items-center justify-center px-8"
      >
        <View className="w-full bg-white rounded-3xl px-6 py-6 shadow-xl">
          <Text className="text-lg font-black text-gray-900 text-center mb-1">
            Koreksi Stok
          </Text>
          <Text className="text-xs font-bold text-gray-400 text-center mb-5">
            {item?.name} — mengubah angka langsung, bukan menambah stok baru
          </Text>

          <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
            Jumlah yang benar ({item?.unit})
          </Text>
          <TextInput
            className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
            keyboardType="numeric"
            value={quantityInput}
            onChangeText={(t) => setQuantityInput(t.replace(/[^0-9.]/g, ""))}
            editable={!saving}
          />

          <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
            Harga per {item?.unit} yang benar
          </Text>
          <TextInput
            className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
            keyboardType="numeric"
            value={priceInput ? `Rp ${formatDigits(priceInput)}` : ""}
            onChangeText={(t) => setPriceInput(t.replace(/[^0-9]/g, ""))}
            editable={!saving}
          />

          <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
            Catatan (opsional)
          </Text>
          <TextInput
            className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-2"
            placeholder="cth. salah ketik, harusnya 10 bukan 100"
            placeholderTextColor="#ccc"
            value={note}
            onChangeText={setNote}
            editable={!saving}
          />

          {error !== "" && (
            <Text className="text-xs font-bold text-red-500 text-center mb-2">{error}</Text>
          )}

          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              onPress={onCancel}
              disabled={saving}
              className="flex-1 border-2 border-gray-100 rounded-2xl py-3 items-center"
            >
              <Text className="text-sm font-bold text-gray-400">Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="flex-1 rounded-2xl py-3 items-center bg-blue-500"
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-sm font-extrabold text-white">Simpan Koreksi</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
