import { useEffect, useState } from "react";
import { View, Text, Modal, TextInput, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView } from "react-native";
import { supabase } from "@/lib/supabase";
import { StockItem } from "../../types/stock";

type Props = {
  item: StockItem | null;
  onSave: (params: { name: string; unit: string; quantity: number; pricePerUnit: number; note: string }) => Promise<void>;
  onCancel: () => void;
};

const formatDigits = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export default function CorrectStockDialog({ item, onSave, onCancel }: Props) {
  const [nameInput, setNameInput] = useState("");
  const [unitInput, setUnitInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Active menus whose recipe uses this item. null = not known (still loading,
  // or the lookup failed), which the unit warning words differently from "none".
  const [usedBy, setUsedBy] = useState<string[] | null>(null);

  useEffect(() => {
    if (!item) return;

    setNameInput(item.name);
    setUnitInput(item.unit);
    setQuantityInput(item.quantity.toString());
    setPriceInput(item.pricePerUnit.toString());
    setNote("");
    setError("");
    setSaving(false);
    setUsedBy(null);

    let cancelled = false;
    supabase
      .from("menu_ingredients")
      .select("menus!inner(name, is_active)")
      .eq("stock_id", item.id)
      .eq("menus.is_active", true)
      .then(({ data, error: fetchError }) => {
        if (cancelled || fetchError) return;
        setUsedBy((data ?? []).map((row: any) => row.menus.name as string));
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  const unit = unitInput.trim();
  const unitChanged = !!item && unit !== "" && unit !== item.unit;

  const handleSave = async () => {
    const name = nameInput.trim();
    const quantity = parseFloat(quantityInput);
    const pricePerUnit = parseInt(priceInput, 10);

    if (!name) {
      setError("Nama tidak boleh kosong.");
      return;
    }
    if (!unit) {
      setError("Satuan tidak boleh kosong.");
      return;
    }
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
      await onSave({ name, unit, quantity, pricePerUnit, note: note.trim() });
    } catch (e: any) {
      // 23505 is correct_stock refusing a name + unit another item already has.
      setError(
        e?.code === "23505"
          ? "Sudah ada item stok lain dengan nama dan satuan itu."
          : "Gagal menyimpan koreksi. Silakan coba lagi."
      );
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/40 items-center justify-center px-8"
      >
        <View className="w-full max-h-[90%] bg-white rounded-3xl px-6 py-6 shadow-xl">
          <Text className="text-lg font-black text-gray-900 text-center mb-1">
            Koreksi Stok
          </Text>
          <Text className="text-xs font-bold text-gray-400 text-center mb-5">
            {item?.name} — mengubah data langsung, bukan menambah stok baru
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Nama
            </Text>
            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
              value={nameInput}
              onChangeText={setNameInput}
              editable={!saving}
            />

            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Satuan
            </Text>
            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
              autoCapitalize="none"
              value={unitInput}
              onChangeText={setUnitInput}
              editable={!saving}
            />

            {unitChanged && (
              <View className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-3">
                <Text className="text-xs font-bold text-amber-700 leading-5">
                  Satuan hanya diganti labelnya, tidak dikonversi: {item?.quantity} {item?.unit} akan
                  terbaca {item?.quantity} {unit}. Sesuaikan jumlah dan harga di bawah bila perlu.
                  {usedBy === null
                    ? " Jumlah bahan di resep menu yang memakainya juga tidak berubah — periksa di HPP."
                    : usedBy.length > 0
                    ? ` Jumlah bahan di resep ${usedBy.length} menu juga tidak berubah — periksa di HPP: ${usedBy.join(", ")}.`
                    : ""}
                </Text>
              </View>
            )}

            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Jumlah yang benar ({unit || item?.unit})
            </Text>
            <TextInput
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 font-bold text-sm text-gray-900 mb-3"
              keyboardType="numeric"
              value={quantityInput}
              onChangeText={(t) => setQuantityInput(t.replace(/[^0-9.]/g, ""))}
              editable={!saving}
            />

            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Harga per {unit || item?.unit} yang benar
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
          </ScrollView>

          {error !== "" && (
            <Text className="text-xs font-bold text-red-500 text-center mt-2">{error}</Text>
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
