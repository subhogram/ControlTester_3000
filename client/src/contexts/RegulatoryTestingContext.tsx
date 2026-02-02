import { createContext, useContext, useState, ReactNode } from "react";

type ComparisonMode = "regulation" | "rcm";

interface RegulatoryTestingState {
  mode: ComparisonMode;
  setMode: (mode: ComparisonMode) => void;
  regulationFiles: File[];
  setRegulationFiles: (files: File[]) => void;
  rcmFile: File | null;
  setRcmFile: (file: File | null) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  comparisonResults: string | null;
  setComparisonResults: (results: string | null) => void;
  resetState: () => void;
  resetForNewComparison: () => void;
}

const RegulatoryTestingContext = createContext<RegulatoryTestingState | undefined>(undefined);

export function RegulatoryTestingProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ComparisonMode>("regulation");
  const [regulationFiles, setRegulationFiles] = useState<File[]>([]);
  const [rcmFile, setRcmFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<string | null>(null);

  const resetState = () => {
    setMode("regulation");
    setRegulationFiles([]);
    setRcmFile(null);
    setIsProcessing(false);
    setComparisonResults(null);
  };

  const resetForNewComparison = () => {
    setRegulationFiles([]);
    setRcmFile(null);
    setIsProcessing(false);
    setComparisonResults(null);
  };

  return (
    <RegulatoryTestingContext.Provider
      value={{
        mode,
        setMode,
        regulationFiles,
        setRegulationFiles,
        rcmFile,
        setRcmFile,
        isProcessing,
        setIsProcessing,
        comparisonResults,
        setComparisonResults,
        resetState,
        resetForNewComparison,
      }}
    >
      {children}
    </RegulatoryTestingContext.Provider>
  );
}

export function useRegulatoryTesting() {
  const context = useContext(RegulatoryTestingContext);
  if (!context) {
    throw new Error("useRegulatoryTesting must be used within a RegulatoryTestingProvider");
  }
  return context;
}
