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
      // Step 1: Build knowledge base (same as Settings page)
      const formData = new FormData();
      formData.append("selected_model", selected_model);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "chat");

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("http://localhost:8000/build-knowledge-base", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }

      const result = await response.json();
      
      // Step 2: Save vectorstore to disk (chat_attachment_vectorstore folder)
      try {
        const saveFormData = new URLSearchParams();
        saveFormData.append("kb_type", "chat");
        saveFormData.append("dir_path", "chat_attachment_vectorstore");

        const saveResponse = await fetch("http://localhost:8000/save-vectorstore", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: saveFormData.toString(),
        });
        
        if (!saveResponse.ok) {
          console.warn("Failed to save chat vectorstore to disk");
        }
      } catch (saveError) {
        console.warn("Error saving chat vectorstore:", saveError);
      }
      
      return result;
    },
  });

  const loadVectorstoreMutation = useMutation({
    mutationFn: async ({ dir_path, kb_type, model_name }: { dir_path: string; kb_type: string; model_name: string }) => {
      const formData = new URLSearchParams();
      formData.append("dir_path", dir_path);
      formData.append("kb_type", kb_type);
      formData.append("model_name", model_name);

      const response = await fetch("http://localhost:8000/load-vectorstore", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error(`Failed to load ${kb_type} vectorstore`);
      }

      return await response.json();
    },
  });

  const chatMutation = useMutation({
    mutationFn: async ({ 
      user_input, 
      selected_model, 
      has_attachments, 
      chat_history 
    }: { 
      user_input: string; 
      selected_model: string; 
      has_attachments: boolean;
      chat_history: Array<{role: string; content: string}>;
    }) => {
      // Call external API directly, exactly like file upload
      const payload: any = {
        selected_model,
        user_input,
        chat_history,  // Include full conversation history
        global_kb_path: "global_kb_vectorstore",
        company_kb_path: "company_kb_vectorstore",
      };
      
      // If there are chat attachments, include the path
      if (has_attachments) {
        payload.chat_kb_path = "chat_attachment_vectorstore";
      }

      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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

    // Track if we have attachments for this message
    let currentHasAttachments = hasAttachments;

    // Process uploaded files if any
    if (uploadedFiles.length > 0 && !hasAttachments) {
      setIsProcessingFiles(true);
      try {
        const uploadResult = await uploadFilesMutation.mutateAsync({
          files: uploadedFiles,
          selected_model: selectedModel,
        });

        setHasAttachments(true);
        currentHasAttachments = true; // Update local variable immediately
        
        const stats = uploadResult?.processing_summary;
        const statsMessage = stats 
          ? `Files: ${stats.files} | Vectors: ${stats.vectors || 'N/A'} | Time: ${stats.processing_seconds?.toFixed(2)}s | Model: ${stats.model}`
          : `Successfully uploaded files`;
        
        toast({
          title: "✓ Chat Attachments Ready",
          description: statsMessage,
          className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
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

    // Load all vectorstores into memory before chat
    const vectorstoresToLoad = [
      loadVectorstoreMutation.mutateAsync({
        dir_path: "global_kb_vectorstore",
        kb_type: "global",
        model_name: selectedModel,
      }),
      loadVectorstoreMutation.mutateAsync({
        dir_path: "company_kb_vectorstore",
        kb_type: "company",
        model_name: selectedModel,
      }),
    ];
    
    // If we have chat attachments, also load the chat vectorstore
    if (currentHasAttachments) {
      vectorstoresToLoad.push(
        loadVectorstoreMutation.mutateAsync({
          dir_path: "chat_attachment_vectorstore",
          kb_type: "chat",
          model_name: selectedModel,
        })
      );
    }

    try {
      await Promise.allSettled(vectorstoresToLoad);
    } catch (error) {
      // Silently continue - vectorstores may not exist, which is OK
      console.log("Vectorstore loading info:", error);
    }

    // Prepare chat history (exclude loading messages and error messages)
    const chatHistory = messages
      .filter(msg => msg.content !== "loading" && !msg.content.startsWith("⚠️") && !msg.content.startsWith("❌"))
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

    // Add loading message
    const loadingMessageId = (Date.now() + 1).toString();
    const loadingMessage: Message = {
      id: loadingMessageId,
      role: "assistant",
      content: "loading",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      const response = await chatMutation.mutateAsync({
        user_input: content,
        selected_model: selectedModel,
        has_attachments: currentHasAttachments,
        chat_history: chatHistory,
      });

      // Replace loading message with actual response
      const aiMessage: Message = {
        id: loadingMessageId,
        role: "assistant",
        content: response.response || "No response received",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => prev.map(msg => msg.id === loadingMessageId ? aiMessage : msg));

      // Clear uploaded files after successful response
      setUploadedFiles([]);
      setHasAttachments(false);
    } catch (error) {
      // Replace loading message with error message
      const errorMessage: Message = {
        id: loadingMessageId,
        role: "assistant",
        content: "❌ Failed to get response. Please ensure the external API is running at http://localhost:8000",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => prev.map(msg => msg.id === loadingMessageId ? errorMessage : msg));
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    toast({
      title: "✓ Chat Cleared",
      description: "All messages have been cleared",
      className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    });
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
        onClearChat={handleClearChat}
        hasMessages={messages.length > 0}
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
