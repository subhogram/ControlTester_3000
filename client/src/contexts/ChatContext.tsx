import { createContext, useContext, useState, ReactNode } from "react";
import type { Message } from "@/types";

interface ChatContextType {
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  uploadedFiles: File[];
  setUploadedFiles: (files: File[] | ((prev: File[]) => File[])) => void;
  hasAttachments: boolean;
  setHasAttachments: (value: boolean) => void;
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [hasAttachments, setHasAttachments] = useState(false);

  const clearChat = () => {
    setMessages([]);
    setUploadedFiles([]);
    setHasAttachments(false);
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        setMessages,
        uploadedFiles,
        setUploadedFiles,
        hasAttachments,
        setHasAttachments,
        clearChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return context;
}
