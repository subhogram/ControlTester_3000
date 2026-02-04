import { createContext, useContext, useState, ReactNode } from "react";

interface ControlTestingState {
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  testResults: string | null;
  setTestResults: (results: string | null) => void;
  resetState: () => void;
}

const ControlTestingContext = createContext<ControlTestingState | undefined>(undefined);

export function ControlTestingProvider({ children }: { children: ReactNode }) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testResults, setTestResults] = useState<string | null>(null);

  const resetState = () => {
    setUploadedFiles([]);
    setIsProcessing(false);
    setTestResults(null);
  };

  return (
    <ControlTestingContext.Provider
      value={{
        uploadedFiles,
        setUploadedFiles,
        isProcessing,
        setIsProcessing,
        testResults,
        setTestResults,
        resetState,
      }}
    >
      {children}
    </ControlTestingContext.Provider>
  );
}

export function useControlTesting() {
  const context = useContext(ControlTestingContext);
  if (!context) {
    throw new Error("useControlTesting must be used within a ControlTestingProvider");
  }
  return context;
}
