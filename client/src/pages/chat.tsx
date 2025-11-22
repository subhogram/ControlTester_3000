import { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useChatContext } from "@/contexts/ChatContext";
import ChatHeader from "@/components/ChatHeader";
import ChatMessages from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import type { Message } from "@/types";
import { buildKnowledgeBase, saveVectorstore, sendChatMessage, loadAllVectorstores } from "@/lib/chatHelpers";
import { VECTORSTORE_PATHS, KB_TYPES } from "@/lib/constants";

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const { 
    messages, 
    setMessages, 
    uploadedFiles, 
    setUploadedFiles, 
    hasAttachments, 
    setHasAttachments,
    clearChat 
  } = useChatContext();
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const { toast } = useToast();

  const uploadFilesMutation = useMutation({
    mutationFn: async ({ files, selected_model }: { files: File[]; selected_model: string }) => {
      const result = await buildKnowledgeBase(files, selected_model, KB_TYPES.CHAT);
      
      try {
        await saveVectorstore(KB_TYPES.CHAT, VECTORSTORE_PATHS.CHAT);
      } catch (saveError) {
        console.warn("Error saving chat vectorstore:", saveError);
      }
      
      return result;
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
      return await sendChatMessage(user_input, selected_model, has_attachments, chat_history);
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
    try {
      await loadAllVectorstores(selectedModel, currentHasAttachments);
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

  const handleClearChat = useCallback(() => {
    clearChat();
    toast({
      title: "✓ Chat Cleared",
      description: "All messages and files have been cleared",
      className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    });
  }, [clearChat, toast]);

  const handleLogout = useCallback(() => {
    console.log("Logout clicked");
  }, []);

  const handleFileSelect = useCallback((files: File[]) => {
    setUploadedFiles((prev) => [...prev, ...files]);
  }, [setUploadedFiles]);

  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    if (uploadedFiles.length === 1) {
      setHasAttachments(false);
    }
  }, [setUploadedFiles, uploadedFiles.length, setHasAttachments]);

  const handleClearAllFiles = useCallback(() => {
    setUploadedFiles([]);
    setHasAttachments(false);
  }, [setUploadedFiles, setHasAttachments]);

  const chatInputProps = useMemo(() => ({
    onSendMessage: handleSendMessage,
    onFileSelect: handleFileSelect,
    disabled: chatMutation.isPending || isProcessingFiles,
    files: uploadedFiles,
    onRemoveFile: handleRemoveFile,
    onClearAllFiles: handleClearAllFiles,
    isProcessing: isProcessingFiles,
    hasVectorstore: hasAttachments,
  }), [
    handleSendMessage,
    handleFileSelect,
    chatMutation.isPending,
    isProcessingFiles,
    uploadedFiles,
    handleRemoveFile,
    handleClearAllFiles,
    hasAttachments,
  ]);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#654ea3]/20 via-[#8b6dbb]/10 to-[#eaafc8]/20">
      <ChatHeader
        onSettingsClick={() => setLocation("/settings")}
        onLogout={handleLogout}
        onClearChat={handleClearChat}
        hasMessages={messages.length > 0}
      />

      {messages.length === 0 ? (
        // Centered layout when no messages
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-3xl space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-semibold text-foreground">
                What can I help you with?
              </h2>
              <p className="text-muted-foreground">
                Ask me anything, upload documents, or explore the power of AI-driven conversations
              </p>
            </div>

            <ChatInput {...chatInputProps} />
          </div>
        </div>
      ) : (
        // Bottom layout when messages exist
        <>
          <ChatMessages messages={messages} />

          <ChatInput {...chatInputProps} />
        </>
      )}
    </div>
  );
}
