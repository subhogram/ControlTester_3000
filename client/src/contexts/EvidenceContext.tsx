import { createContext, useState, useContext, ReactNode } from "react";

export type AgentStatus = "idle" | "active" | "completed" | "error";

export interface AgentState {
  validator: AgentStatus;
  assessor: AgentStatus;
  reporter: AgentStatus;
}

export interface EvidenceContextType {
  files: File[];
  setFiles: (files: File[] | ((prev: File[]) => File[])) => void;
  isAssessing: boolean;
  setIsAssessing: (value: boolean) => void;
  assessmentStatus: string;
  setAssessmentStatus: (status: string) => void;
  reportData: Blob | null;
  setReportData: (data: Blob | null) => void;
  reportFilename: string;
  setReportFilename: (filename: string) => void;
  showAgents: boolean;
  setShowAgents: (value: boolean) => void;
  agentStates: AgentState;
  setAgentStates: (states: AgentState | ((prev: AgentState) => AgentState)) => void;
  clearEvidence: () => void;
}

export const EvidenceContext = createContext<EvidenceContextType | undefined>(undefined);

const initialAgentStates: AgentState = {
  validator: "idle",
  assessor: "idle",
  reporter: "idle",
};

export function EvidenceProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentStatus, setAssessmentStatus] = useState<string>("");
  const [reportData, setReportData] = useState<Blob | null>(null);
  const [reportFilename, setReportFilename] = useState<string>("assessment-report.pdf");
  const [showAgents, setShowAgents] = useState(false);
  const [agentStates, setAgentStates] = useState<AgentState>(initialAgentStates);

  const clearEvidence = () => {
    setFiles([]);
    setIsAssessing(false);
    setAssessmentStatus("");
    setReportData(null);
    setReportFilename("assessment-report.pdf");
    setShowAgents(false);
    setAgentStates(initialAgentStates);
  };

  return (
    <EvidenceContext.Provider
      value={{
        files,
        setFiles,
        isAssessing,
        setIsAssessing,
        assessmentStatus,
        setAssessmentStatus,
        reportData,
        setReportData,
        reportFilename,
        setReportFilename,
        showAgents,
        setShowAgents,
        agentStates,
        setAgentStates,
        clearEvidence,
      }}
    >
      {children}
    </EvidenceContext.Provider>
  );
}

export function useEvidenceContext() {
  const context = useContext(EvidenceContext);
  if (context === undefined) {
    throw new Error("useEvidenceContext must be used within an EvidenceProvider");
  }
  return context;
}
