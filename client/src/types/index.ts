export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ChatResponse {
  response: string;
}

export interface VectorstoreResult {
  status: string;
  message?: string;
  processing_summary?: {
    files: number;
    vectors?: number;
    processing_seconds?: number;
    model: string;
  };
}
