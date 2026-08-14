import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Minus, Plus, Trash2 } from "lucide-react-native";
import { CustomItemDraft } from "../types/order";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

const formatRupiahInput = (digits: string) => {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Custom items have no menu row to be identified by, so the cashier UI needs
// its own stable id for React keys and for editing a specific draft.
let counter = 0;
export function newCustomItemUid(): string {
  counter += 1;
  return `custom-${Date.now()}-${counter}`;
}

type SheetProps = {
  visible: boolean;
  onAdd: (item: CustomItemDraft) => void;
  onClose: () => void;
};

/** Modal for composing one off-menu line item: name, price, quantity, note. */
export function CustomItemSheet({ visible, onAdd, onClose }: SheetProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setPrice("");
    setQuantity(1);
    setNote("");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = () => {
    const trimmedName = name.trim();
    const parsedPrice = parseInt(price, 10) || 0;

    if (!trimmedName) {
      setError("Nama item wajib diisi");
      return;
    }
    // order_items has CHECK (price > 0) — a zero-priced line would be rejected
    // by the database well after the cashier has moved on.
    if (parsedPrice <= 0) {
      setError("Harga harus lebih dari 0");
      return;
    }

    onAdd({
      uid: newCustomItemUid(),
      name: trimmedName,
      price: parsedPrice,
      quantity,
      note: note.trim(),
    });
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          {/* Capped so the card scrolls rather than running off a landscape
              phone, where there is barely 350dp of height to work with. */}
          <View
            className="w-full max-w-md bg-white rounded-3xl px-6 py-6 shadow-xl"
            style={{ maxHeight: "85%" }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text className="text-lg font-black text-gray-900 mb-1">
                Item Kustom
              </Text>
              <Text className="text-xs font-bold text-gray-400 mb-5">
                Untuk pesanan di luar menu. Tidak memotong stok.
              </Text>

              <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                Nama Item
              </Text>
              <TextInput
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-4"
                placeholder="cth. Nasi Goreng Spesial"
                placeholderTextColor="#ccc"
                value={name}
                onChangeText={setName}
              />

              <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                Harga Satuan
              </Text>
              <TextInput
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-4"
                placeholder="Rp 0"
                placeholderTextColor="#ccc"
                keyboardType="numeric"
                value={price ? `Rp ${formatRupiahInput(price)}` : ""}
                onChangeText={(text) => setPrice(text.replace(/[^0-9]/g, ""))}
              />

              <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">
                Jumlah
              </Text>
              <View className="flex-row items-center gap-4 mb-4">
                <TouchableOpacity
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="border-2 border-gray-100 rounded-xl px-3 py-2"
                >
                  <Minus size={18} color="#555" />
                </TouchableOpacity>
                <Text className="text-base font-extrabold text-gray-900 w-8 text-center">
                  {quantity}
                </Text>
                <TouchableOpacity
                  onPress={() => setQuantity((q) => q + 1)}
                  className="border-2 border-gray-100 rounded-xl px-3 py-2"
                >
                  <Plus size={18} color="#555" />
                </TouchableOpacity>
              </View>

              <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                Catatan (opsional)
              </Text>
              <TextInput
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-xs text-gray-900 mb-4"
                placeholder="cth. pedas, tanpa bawang"
                placeholderTextColor="#ccc"
                value={note}
                onChangeText={setNote}
              />

              {!!error && (
                <Text className="text-xs font-bold text-red-500 mb-3">{error}</Text>
              )}

              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={handleClose}
                  className="flex-1 border-2 border-gray-100 rounded-2xl py-3 items-center"
                >
                  <Text className="text-sm font-bold text-gray-400">Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleAdd}
                  className="flex-1 bg-green-500 rounded-2xl py-3 items-center"
                >
                  <Text className="text-sm font-extrabold text-white">
                    Tambahkan
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type ListProps = {
  items: CustomItemDraft[];
  onChangeQuantity: (uid: string, quantity: number) => void;
  onRemove: (uid: string) => void;
  /** Custom items already saved on the order can't be re-priced or removed here. */
  readOnly?: boolean;
};

/** The off-menu items added so far, shown above the menu list. */
export function CustomItemList({
  items,
  onChangeQuantity,
  onRemove,
  readOnly = false,
}: ListProps) {
  if (items.length === 0) return null;

  return (
    <View className="mb-3">
      <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2 px-1">
        Item Kustom
      </Text>

      {items.map((item) => (
        <View
          key={item.uid}
          className="bg-green-50 border-2 border-green-100 rounded-2xl px-4 py-4 mb-3"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-gray-900">{item.name}</Text>
              <Text className="text-xs font-bold text-gray-400 mt-0.5">
                {formatRupiah(item.price)} × {item.quantity} ={" "}
                {formatRupiah(item.price * item.quantity)}
              </Text>
            </View>

            {!readOnly && (
              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() =>
                    onChangeQuantity(item.uid, Math.max(1, item.quantity - 1))
                  }
                >
                  <Minus size={18} color="#555" />
                </TouchableOpacity>
                <Text className="text-sm font-extrabold text-gray-900 w-5 text-center">
                  {item.quantity}
                </Text>
                <TouchableOpacity
                  onPress={() => onChangeQuantity(item.uid, item.quantity + 1)}
                >
                  <Plus size={18} color="#555" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onRemove(item.uid)} className="ml-1">
                  <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {!!item.note && (
            <Text className="text-xs font-bold text-gray-500 italic mt-2">
              └ Catatan: {item.note}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
