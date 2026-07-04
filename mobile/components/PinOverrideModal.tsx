import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
  visible: boolean;
  orderId: number;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<{ success: boolean; error?: string }>;
};

export default function PinOverrideModal({ visible, orderId, onClose, onSubmit }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);

    const result = await onSubmit(pin);

    setLoading(false);
    setPin('');

    if (!result.success) {
      setError(result.error ?? 'Terjadi kesalahan');
      return;
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/60 justify-center items-center">
        <View className="bg-zinc-900 rounded-2xl p-6 w-72">
          <Text className="text-white text-center text-lg mb-2">Diperlukan Manager PIN </Text>
          <Text className="text-zinc-400 text-center mb-4">Masukkan PIN untuk menghapus order</Text>

          <View className="flex-row justify-center mb-4">
            {[0,1,2,3,4,5].map(i => (
              <View
                key={i}
                className={`w-3 h-3 rounded-full mx-1 ${i < pin.length ? 'bg-white' : 'bg-zinc-700'}`}
              />
            ))}
          </View>

          {error && <Text className="text-red-500 text-center mb-2">Incorrect PIN</Text>}

          <View className="flex-row flex-wrap justify-center">
            {keys.map((k, idx) => (
              <TouchableOpacity
                key={idx}
                disabled={!k || loading}
                onPress={() => {
                  if (k === '⌫') setPin(p => p.slice(0, -1));
                  else if (pin.length < 6) setPin(p => p + k);
                }}
                className="w-16 h-16 justify-center items-center m-1"
              >
                <Text className="text-white text-2xl">{k}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {pin.length === 6 && !loading && (
            <TouchableOpacity onPress={submit} className="bg-blue-600 rounded-lg p-3 mt-4">
              <Text className="text-white text-center font-semibold">Confirm</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onClose} className="mt-3">
            <Text className="text-zinc-400 text-center">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}