import { createContext, useContext, useState, ReactNode } from "react";

type ComparisonMode = "regulation" | "rcm";

export interface StringencyScore {
  scope: number;
  specificity: number;
  enforcement: number;
  overall: number;
}

export interface DocumentFramework {
  document_name: string;
  framework_type: string;
  primary_focus: string;
  regulatory_approach: string;
  key_themes: string[];
}

export interface ExtractedControl {
  control_id: string;
  control_text: string;
  source_document: string;
  control_domain: string;
  stringency_indicators: string[];
}

export interface ControlGroup {
  group_id: string;
  common_theme: string;
  controls: ExtractedControl[];
  stringency_comparison: Record<string, StringencyScore>;
}

export interface StringencyAnalysis {
  by_document: Record<string, StringencyScore>;
  by_domain: Record<string, Record<string, StringencyScore>>;
  overall_stringency: Record<string, number>;
}

export interface ComparisonResultsData {
  success: boolean;
  request_id: string;
  model_used?: string;
  documents?: string[];
  document_frameworks?: DocumentFramework[];
  extracted_controls?: number;
  control_groups?: number;
  controls_by_document?: Record<string, ExtractedControl[]>;
  grouped_controls?: ControlGroup[];
  stringency_analysis?: StringencyAnalysis;
  final_report?: string;
  error?: string;
}

interface RegulatoryTestingState {
  mode: ComparisonMode;
  setMode: (mode: ComparisonMode) => void;
  regulationFiles: File[];
  setRegulationFiles: (files: File[]) => void;
  rcmFile: File | null;
  setRcmFile: (file: File | null) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  comparisonResults: ComparisonResultsData | null;
  setComparisonResults: (results: ComparisonResultsData | null) => void;
  resetState: () => void;
  resetForNewComparison: () => void;
}

const RegulatoryTestingContext = createContext<RegulatoryTestingState | undefined>(undefined);

export function RegulatoryTestingProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ComparisonMode>("regulation");
  const [regulationFiles, setRegulationFiles] = useState<File[]>([]);
  const [rcmFile, setRcmFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResultsData | null>(null);

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
