import { useState } from "react";
import { useLocation } from "wouter";
import ChatHeader from "@/components/ChatHeader";
import ChatMessages from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import FileUploadBar from "@/components/FileUploadBar";
import FileActionsPanel from "@/components/FileActionsPanel";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMessage]);

    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I'm a demo AI assistant. In the full version, I'll process your message and provide intelligent responses based on the selected model.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 500);
  };

  const handleLogout = () => {
    console.log("Logout clicked");
  };

  const handleTodAction = () => {
    console.log("TOD action on files:", uploadedFiles.map((f) => f.name));
  };

  const handleToeAction = () => {
    console.log("TOE action on files:", uploadedFiles.map((f) => f.name));
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#654ea3]/20 via-[#8b6dbb]/10 to-[#eaafc8]/20">
      <ChatHeader
        onSettingsClick={() => setLocation("/settings")}
        onLogout={handleLogout}
      />

      <ChatMessages messages={messages} />

      <FileUploadBar
        files={uploadedFiles}
        onRemoveFile={(index) =>
          setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
        }
        onClearAll={() => setUploadedFiles([])}
      />

      <ChatInput
        onSendMessage={handleSendMessage}
        onFileSelect={(files) =>
          setUploadedFiles((prev) => [...prev, ...files])
        }
      />

      <FileActionsPanel
        fileCount={uploadedFiles.length}
        onTodAction={handleTodAction}
        onToeAction={handleToeAction}
      />
    </div>
  );
}
