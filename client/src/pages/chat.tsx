import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  const [hasAttachments, setHasAttachments] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const { toast } = useToast();

  const uploadFilesMutation = useMutation({
    mutationFn: async ({ files, selected_model }: { files: File[]; selected_model: string }) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });
      formData.append("selected_model", selected_model);
      formData.append("kb_type", "chat");

      const response = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to upload files");
      }

      return await response.json();
    },
  });

  const chatMutation = useMutation({
    mutationFn: async ({ user_input, selected_model, has_attachments }: { user_input: string; selected_model: string; has_attachments: boolean }) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_input, selected_model, has_attachments }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get chat response");
      }

      return await response.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Chat Error",
        description: error.message || "Failed to get response from AI",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = async (content: string) => {
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

    // Get selected model from localStorage
    const selectedModel = localStorage.getItem("selectedModel");
    
    if (!selectedModel) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "⚠️ Please select a model in Settings first.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast({
        title: "No Model Selected",
        description: "Please go to Settings and select a model first.",
        variant: "destructive",
      });
      return;
    }

    // Process uploaded files if any
    if (uploadedFiles.length > 0 && !hasAttachments) {
      setIsProcessingFiles(true);
      try {
        const uploadResult = await uploadFilesMutation.mutateAsync({
          files: uploadedFiles,
          selected_model: selectedModel,
        });

        setHasAttachments(true);
        toast({
          title: "Files Processed",
          description: `${uploadResult.files.length} file(s) processed and vectorstore created.`,
        });
      } catch (error) {
        toast({
          title: "File Upload Failed",
          description: error instanceof Error ? error.message : "Failed to process files",
          variant: "destructive",
        });
        setIsProcessingFiles(false);
        return;
      } finally {
        setIsProcessingFiles(false);
      }
    }

    try {
      const response = await chatMutation.mutateAsync({
        user_input: content,
        selected_model: selectedModel,
        has_attachments: hasAttachments,
      });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.response || "No response received",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "❌ Failed to get response. Please ensure the external API is running at http://localhost:8000",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
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
        onRemoveFile={(index) => {
          setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
          if (uploadedFiles.length === 1) {
            setHasAttachments(false);
          }
        }}
        onClearAll={() => {
          setUploadedFiles([]);
          setHasAttachments(false);
        }}
        isProcessing={isProcessingFiles}
        hasVectorstore={hasAttachments}
      />

      <ChatInput
        onSendMessage={handleSendMessage}
        onFileSelect={(files) =>
          setUploadedFiles((prev) => [...prev, ...files])
        }
        disabled={chatMutation.isPending || isProcessingFiles}
      />

      <FileActionsPanel
        fileCount={uploadedFiles.length}
        onTodAction={handleTodAction}
        onToeAction={handleToeAction}
      />
    </div>
  );
}
