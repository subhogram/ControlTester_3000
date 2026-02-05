import { createContext, useContext, useState, ReactNode } from "react";

type ComparisonMode = "regulation" | "rcm";

export interface DocumentAnalysis {
  framework_name: string;
  issuing_authority: string;
  target_industry: string;
  regulatory_approach: string | null;
  key_focus_areas: string[];
  governance_model: string | null;
  enforcement_style: string | null;
  date_issued: string | null;
}

export interface StringencyScores {
  prescriptiveness: number;
  measurability: number;
  enforcement: number;
  scope: number;
  independence: number;
  overall: number;
}

export interface ControlComparison {
  source: string;
  control_statement: string;
  stringency_scores: StringencyScores;
  compliance_percentage: number;
}

export interface ControlGroupItem {
  control_domain: string;
  risk_addressed: string;
  most_stringent_source: string;
  most_stringent_control: string;
  baseline_stringency: StringencyScores;
  comparisons: ControlComparison[];
  group_size: number;
}

export interface DomainAnalysisItem {
  control_groups: number;
  source_scores: Record<string, number>;
  most_stringent: string;
  winner_score: number;
}

export interface OverallStringencyItem {
  average_stringency: number;
  median_stringency: number;
  control_count: number;
  score_distribution: Record<string, number>;
}

export interface StringencyAnalysis {
  domain_analysis: Record<string, DomainAnalysisItem>;
  control_groups: ControlGroupItem[];
  overall_stringency: Record<string, OverallStringencyItem>;
  total_controls: number;
  total_groups: number;
}

export interface ComparisonResultsData {
  success: boolean;
  request_id: string;
  analysis_timestamp?: string;
  model_used?: string;
  documents?: string[];
  document_analyses?: Record<string, DocumentAnalysis>;
  extracted_controls?: number;
  control_groups?: number;
  stringency_analysis?: StringencyAnalysis;
  final_report?: string;
  metadata?: {
    chunks_processed: number;
    pages_analyzed: number;
    similarity_threshold: number;
  };
  artifacts_location?: string;
  error?: string;
}

interface ModeState {
  regulationFiles: File[];
  rcmFile: File | null;
  isProcessing: boolean;
  comparisonResults: ComparisonResultsData | null;
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

const initialModeState: ModeState = {
  regulationFiles: [],
  rcmFile: null,
  isProcessing: false,
  comparisonResults: null,
};

export function RegulatoryTestingProvider({ children }: { children: ReactNode }) {
  const [mode, setModeInternal] = useState<ComparisonMode>("regulation");
  
  const [regulationModeState, setRegulationModeState] = useState<ModeState>({ ...initialModeState });
  const [rcmModeState, setRcmModeState] = useState<ModeState>({ ...initialModeState });

  const currentState = mode === "regulation" ? regulationModeState : rcmModeState;
  const setCurrentState = mode === "regulation" ? setRegulationModeState : setRcmModeState;

  const setMode = (newMode: ComparisonMode) => {
    setModeInternal(newMode);
  };

  const setRegulationFiles = (files: File[]) => {
    setCurrentState(prev => ({ ...prev, regulationFiles: files }));
  };

  const setRcmFile = (file: File | null) => {
    setCurrentState(prev => ({ ...prev, rcmFile: file }));
  };

  const setIsProcessing = (processing: boolean) => {
    setCurrentState(prev => ({ ...prev, isProcessing: processing }));
  };

  const setComparisonResults = (results: ComparisonResultsData | null) => {
    setCurrentState(prev => ({ ...prev, comparisonResults: results }));
  };

  const resetState = () => {
    setModeInternal("regulation");
    setRegulationModeState({ ...initialModeState });
    setRcmModeState({ ...initialModeState });
  };

  const resetForNewComparison = () => {
    setCurrentState({ ...initialModeState });
  };

  return (
    <RegulatoryTestingContext.Provider
      value={{
        mode,
        setMode,
        regulationFiles: currentState.regulationFiles,
        setRegulationFiles,
        rcmFile: currentState.rcmFile,
        setRcmFile,
        isProcessing: currentState.isProcessing,
        setIsProcessing,
        comparisonResults: currentState.comparisonResults,
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
