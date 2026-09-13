import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';

type Props = {
  visible: boolean;
  orderId: number;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<{ success: boolean; error?: string }>;
  /**
   * What this PIN is about to authorise. Defaults to cancelling, which is what
   * the modal did when it was the only PIN-gated action in the app — correcting
   * a settled bill now uses it too, and a prompt that says "menghapus order"
   * while the cashier is correcting one is worse than no prompt at all.
   */
  title?: string;
  message?: string;
};

export default function PinOverrideModal({
  visible,
  orderId,
  onClose,
  onSubmit,
  title = 'Diperlukan Manager PIN',
  message = 'Masukkan PIN untuk menghapus order',
}: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);

    // The spinner is cleared in `finally`, not after the await. Every button
    // here is disabled while `loading` is set, so anything thrown by onSubmit
    // used to strand the modal mid-submit: no error, a dead Konfirmasi button,
    // and no way out but force-closing the app — with the order left in
    // whatever state the failure found it.
    //
    // The callers wrap their own RPC for this reason, but they also navigate
    // once it succeeds, and that part sits outside their try/catch. Guaranteeing
    // it here covers both instead of asking every future caller to remember.
    try {
      const result = await onSubmit(pin);

      if (!result.success) {
        setError(result.error ?? 'Terjadi kesalahan');
      }
    } catch (e) {
      console.error('PIN override failed:', e);
      setError('Terjadi kesalahan. Periksa koneksi Anda.');
    } finally {
      setPin('');
      setLoading(false);
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/60 justify-center items-center">
        <View className="bg-zinc-900 rounded-2xl p-6 w-72">
          <Text className="text-white text-center text-lg mb-2">{title}</Text>
          <Text className="text-zinc-400 text-center mb-4">{message}</Text>

          <View className="flex-row justify-center mb-4">
            {[0,1,2,3,4,5].map(i => (
              <View
                key={i}
                className={`w-3 h-3 rounded-full mx-1 ${i < pin.length ? 'bg-white' : 'bg-zinc-700'}`}
              />
            ))}
          </View>

          {error && <Text className="text-red-500 text-center mb-2">{error}</Text>}

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
              <Text className="text-white text-center font-semibold">Konfirmasi</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onClose} className="mt-3">
            <Text className="text-zinc-400 text-center">Batal</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}