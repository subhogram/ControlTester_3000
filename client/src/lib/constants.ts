export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const VECTORSTORE_PATHS = {
  CHAT: "chat_attachment_vectorstore",
  GLOBAL: "global_kb_vectorstore",
  COMPANY: "company_kb_vectorstore",
} as const;

export const KB_TYPES = {
  CHAT: "chat",
  GLOBAL: "global",
  COMPANY: "company",
} as const;

export const DEFAULT_UPLOAD_CONFIG = {
  batchSize: "15",
  delayBetweenBatches: "0.2",
  maxRetries: "3",
} as const;
