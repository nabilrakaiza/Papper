import { createContext, useContext, useState, ReactNode } from "react";

type PrinterDevice = { name: string; address: string };

type PrinterContextType = {
  connectedPrinter: PrinterDevice | null;
  setConnectedPrinter: (device: PrinterDevice | null) => void;
};

const PrinterContext = createContext<PrinterContextType>({} as PrinterContextType);

export function PrinterProvider({ children }: { children: ReactNode }) {
  const [connectedPrinter, setConnectedPrinter] = useState<PrinterDevice | null>(null);

  return (
    <PrinterContext.Provider value={{ connectedPrinter, setConnectedPrinter }}>
      {children}
    </PrinterContext.Provider>
  );
}

export const usePrinter = () => useContext(PrinterContext);