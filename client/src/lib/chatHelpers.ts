import { API_BASE_URL, VECTORSTORE_PATHS, KB_TYPES, DEFAULT_UPLOAD_CONFIG } from "./constants";
import type { VectorstoreResult, ChatResponse } from "@/types";

export async function buildKnowledgeBase(
  files: File[],
  selectedModel: string,
  kbType: string = KB_TYPES.CHAT
): Promise<VectorstoreResult> {
  const formData = new FormData();
  formData.append("selected_model", selectedModel);
  formData.append("batch_size", DEFAULT_UPLOAD_CONFIG.batchSize);
  formData.append("delay_between_batches", DEFAULT_UPLOAD_CONFIG.delayBetweenBatches);
  formData.append("max_retries", DEFAULT_UPLOAD_CONFIG.maxRetries);
  formData.append("kb_type", kbType);

  files.forEach((file) => formData.append("files", file));

  const response = await fetch(`${API_BASE_URL}/build-knowledge-base`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to build knowledge base");
  }

  return await response.json();
}

export async function saveVectorstore(
  kbType: string,
  dirPath: string
): Promise<void> {
  const formData = new URLSearchParams();
  formData.append("kb_type", kbType);
  formData.append("dir_path", dirPath);

  const response = await fetch(`${API_BASE_URL}/save-vectorstore`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error("Failed to save vectorstore");
  }
}

export async function loadVectorstore(
  dirPath: string,
  kbType: string,
  modelName: string
): Promise<any> {
  const formData = new URLSearchParams();
  formData.append("dir_path", dirPath);
  formData.append("kb_type", kbType);
  formData.append("model_name", modelName);

  const response = await fetch(`${API_BASE_URL}/load-vectorstore`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${kbType} vectorstore`);
  }

  return await response.json();
}

export async function sendChatMessage(
  userInput: string,
  selectedModel: string,
  hasAttachments: boolean,
  chatHistory: Array<{ role: string; content: string }>
): Promise<ChatResponse> {
  const payload: any = {
    selected_model: selectedModel,
    user_input: userInput,
    chat_history: chatHistory,
    global_kb_path: VECTORSTORE_PATHS.GLOBAL,
    company_kb_path: VECTORSTORE_PATHS.COMPANY,
  };

  if (hasAttachments) {
    payload.chat_kb_path = VECTORSTORE_PATHS.CHAT;
  }

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to get chat response");
  }

  return await response.json();
}

export async function loadAllVectorstores(
  selectedModel: string,
  hasAttachments: boolean
): Promise<void> {
  const vectorstoresToLoad = [
    loadVectorstore(VECTORSTORE_PATHS.GLOBAL, KB_TYPES.GLOBAL, selectedModel),
    loadVectorstore(VECTORSTORE_PATHS.COMPANY, KB_TYPES.COMPANY, selectedModel),
  ];

  if (hasAttachments) {
    vectorstoresToLoad.push(
      loadVectorstore(VECTORSTORE_PATHS.CHAT, KB_TYPES.CHAT, selectedModel)
    );
  }

  await Promise.allSettled(vectorstoresToLoad);
}
