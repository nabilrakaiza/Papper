import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Order, OrderItem } from "../types/order";

type BatchWarningProps = {
  order: Order | null;
  title: string;
  body: string;
  items: OrderItem[];
  hint: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (order: Order) => void;
};

export default function BatchWarningDialog({
  order, title, body, items, hint, confirmLabel, onCancel, onConfirm,
}: BatchWarningProps) {
  return (
    <Modal visible={order !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/40 items-center justify-center px-8">
        <View className="w-full bg-white rounded-3xl px-6 py-5">
          <Text className="text-base font-extrabold text-gray-700">{title}</Text>
          <Text className="text-xs font-bold text-gray-400 mt-2">{body}</Text>

          <View className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mt-3">
            {items.map((item, idx) => (
              <Text
                key={`${item.menuId ?? "custom"}-${item.printBatch}-${idx}`}
                className="text-xs font-extrabold text-amber-700"
              >
                {item.quantity}x {item.name}
              </Text>
            ))}
          </View>

          <Text className="text-xs font-bold text-gray-400 mt-3">{hint}</Text>

          <View className="flex-row gap-3 mt-5">
            <TouchableOpacity onPress={onCancel} className="flex-1 bg-gray-100 rounded-2xl py-3 items-center">
              <Text className="text-sm font-extrabold text-gray-500">Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (order) onConfirm(order); }}
              className="flex-1 bg-orange-400 rounded-2xl py-3 items-center"
            >
              <Text className="text-sm font-extrabold text-white">{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
