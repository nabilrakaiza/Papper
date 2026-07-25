import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PrinterDevice = { name: string; address: string };
export type PrinterRole = "cashier" | "kitchen";

type PrinterContextType = {
  cashierPrinter: PrinterDevice | null;
  kitchenPrinter: PrinterDevice | null;
  setPrinter: (role: PrinterRole, device: PrinterDevice | null) => void;
};

const PrinterContext = createContext<PrinterContextType>({} as PrinterContextType);

const STORAGE_KEYS: Record<PrinterRole, string> = {
  cashier: "papper_cashier_printer",
  kitchen: "papper_kitchen_printer",
};

export function PrinterProvider({ children }: { children: ReactNode }) {
  const [cashierPrinter, setCashierPrinter] = useState<PrinterDevice | null>(null);
  const [kitchenPrinter, setKitchenPrinter] = useState<PrinterDevice | null>(null);

  // Rehydrate remembered printers on app start — the actual Bluetooth
  // connection is (re)established later, at print time.
  useEffect(() => {
    const restore = async () => {
      const [savedCashier, savedKitchen] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.cashier),
        AsyncStorage.getItem(STORAGE_KEYS.kitchen),
      ]);
      if (savedCashier) setCashierPrinter(JSON.parse(savedCashier));
      if (savedKitchen) setKitchenPrinter(JSON.parse(savedKitchen));
    };
    restore();
  }, []);

  const setPrinter = (role: PrinterRole, device: PrinterDevice | null) => {
    if (role === "cashier") setCashierPrinter(device);
    else setKitchenPrinter(device);

    if (device) {
      AsyncStorage.setItem(STORAGE_KEYS[role], JSON.stringify(device));
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS[role]);
    }
  };

  return (
    <PrinterContext.Provider value={{ cashierPrinter, kitchenPrinter, setPrinter }}>
      {children}
    </PrinterContext.Provider>
  );
}

export const usePrinter = () => useContext(PrinterContext);