import { createContext, useContext, useState, ReactNode } from "react";

export type PrinterDevice = { name: string; address: string };
export type PrinterRole = "cashier" | "kitchen";

type PrinterContextType = {
  cashierPrinter: PrinterDevice | null;
  kitchenPrinter: PrinterDevice | null;
  setPrinter: (role: PrinterRole, device: PrinterDevice | null) => void;
};

const PrinterContext = createContext<PrinterContextType>({} as PrinterContextType);

export function PrinterProvider({ children }: { children: ReactNode }) {
  const [cashierPrinter, setCashierPrinter] = useState<PrinterDevice | null>(null);
  const [kitchenPrinter, setKitchenPrinter] = useState<PrinterDevice | null>(null);

  const setPrinter = (role: PrinterRole, device: PrinterDevice | null) => {
    if (role === "cashier") setCashierPrinter(device);
    else setKitchenPrinter(device);
  };

  return (
    <PrinterContext.Provider value={{ cashierPrinter, kitchenPrinter, setPrinter }}>
      {children}
    </PrinterContext.Provider>
  );
}

export const usePrinter = () => useContext(PrinterContext);