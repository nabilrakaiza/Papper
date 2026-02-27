import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Bluetooth, Printer, X, RefreshCw, Check } from "lucide-react-native";
import { scanAndConnectPrinter, connectToPrinter } from "../lib/printer";

type Device = { name: string; address: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onConnected: (device: Device) => void;
};

export default function PrinterSelector({ visible, onClose, onConnected }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setDevices([]);

    const { devices: found, error } = await scanAndConnectPrinter();

    if (error) {
      setError("Failed to scan. Make sure Bluetooth is enabled.");
    } else if (found.length === 0) {
      setError("No paired devices found. Pair your printer in Android Bluetooth settings first.");
    } else {
      setDevices(found);
    }

    setScanning(false);
  };

  const handleConnect = async (device: Device) => {
    setConnecting(device.address);
    setError(null);

    const { error } = await connectToPrinter(device.address);

    if (error) {
      setError(`Failed to connect to ${device.name}. Make sure it's turned on.`);
      setConnecting(null);
      return;
    }

    setConnecting(null);
    onConnected(device);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-5">
            <View className="flex-row items-center gap-2">
              <Printer size={20} color="#333" />
              <Text className="text-lg font-black text-gray-900">Select Printer</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#aaa" />
            </TouchableOpacity>
          </View>

          {/* Scan button */}
          <TouchableOpacity
            onPress={handleScan}
            disabled={scanning}
            className="flex-row items-center justify-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl py-3 mb-4"
          >
            {scanning ? (
              <ActivityIndicator size="small" color="#3a7bd5" />
            ) : (
              <RefreshCw size={16} color="#3a7bd5" />
            )}
            <Text className="text-sm font-extrabold text-blue-500">
              {scanning ? "Scanning..." : "Scan for Printers"}
            </Text>
          </TouchableOpacity>

          {/* Error */}
          {error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-3">
              <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
            </View>
          )}

          {/* Device list */}
          {devices.length > 0 && (
            <View className="bg-gray-50 rounded-2xl overflow-hidden mb-2">
              {devices.map((device, index) => (
                <TouchableOpacity
                  key={device.address}
                  onPress={() => handleConnect(device)}
                  disabled={!!connecting}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    index < devices.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Bluetooth size={16} color="#3a7bd5" />
                    <View>
                      <Text className="text-sm font-bold text-gray-800">{device.name}</Text>
                      <Text className="text-xs font-bold text-gray-400">{device.address}</Text>
                    </View>
                  </View>
                  {connecting === device.address ? (
                    <ActivityIndicator size="small" color="#3a7bd5" />
                  ) : (
                    <Text className="text-xs font-extrabold text-blue-500">Connect</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Empty state */}
          {!scanning && devices.length === 0 && !error && (
            <View className="items-center py-6">
              <Printer size={32} color="#ddd" />
              <Text className="text-gray-300 font-bold text-sm mt-2">
                Tap scan to find nearby printers
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}