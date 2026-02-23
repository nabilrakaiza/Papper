import { View, Text, Modal, TouchableOpacity } from "react-native";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 bg-black/40 items-center justify-center px-8">
        <View className="w-full bg-white rounded-3xl px-6 py-6 shadow-xl">
          {/* Title */}
          <Text className="text-lg font-black text-gray-900 text-center mb-2">
            {title}
          </Text>

          {/* Message */}
          <Text className="text-sm font-bold text-gray-400 text-center mb-6 leading-5">
            {message}
          </Text>

          {/* Actions */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={onCancel}
              className="flex-1 border-2 border-gray-100 rounded-2xl py-3 items-center"
            >
              <Text className="text-sm font-bold text-gray-400">{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              className={`flex-1 rounded-2xl py-3 items-center ${
                destructive ? "bg-red-500" : "bg-green-500"
              }`}
            >
              <Text className="text-sm font-extrabold text-white">
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}