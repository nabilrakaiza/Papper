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
    // Parsed per printer rather than in one block: an unparseable value used to
    // throw out of the whole function, so a corrupt cashier entry also cost the
    // kitchen printer its saved pairing. A bad entry is dropped instead, which
    // puts that one printer back to "not set up" rather than losing both.
    const parseDevice = (raw: string | null, role: PrinterRole): PrinterDevice | null => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as PrinterDevice;
      } catch {
        console.warn(`Discarding unreadable saved ${role} printer`);
        AsyncStorage.removeItem(STORAGE_KEYS[role]);
        return null;
      }
    };

    const restore = async () => {
      try {
        const [savedCashier, savedKitchen] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.cashier),
          AsyncStorage.getItem(STORAGE_KEYS.kitchen),
        ]);
        const cashier = parseDevice(savedCashier, "cashier");
        const kitchen = parseDevice(savedKitchen, "kitchen");
        if (cashier) setCashierPrinter(cashier);
        if (kitchen) setKitchenPrinter(kitchen);
      } catch (e) {
        console.error("Failed to restore saved printers:", e);
      }
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