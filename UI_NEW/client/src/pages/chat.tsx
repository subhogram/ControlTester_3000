import { useState } from "react";
import ChatHeader from "@/components/ChatHeader";
import ChatMessages from "@/components/ChatMessages";
import FileUploadBar from "@/components/FileUploadBar";
import FileActionsPanel from "@/components/FileActionsPanel";

export default function Chat() {
  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; files?: File[] }>>([
    {
      id: "welcome",
      role: "assistant",
      content: "👋 Welcome to Assess-AI! Upload files to enable the FAB (Floating Action Button) for TOD and TOE actions.",
    }
  ]);

  const handleSendMessage = (content: string, attachedFiles: File[]) => {
    const newMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content,
      files: attachedFiles.length > 0 ? attachedFiles : undefined,
    };
    setMessages(prev => [...prev, newMessage]);
    setFiles(prev => [...prev, ...attachedFiles]);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Thank you for your message. I'm here to help you analyze documents and answer questions.",
      }]);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#654ea3]/10 to-[#eaafc8]/10">
      <ChatHeader />
      
      <div className="flex-1 overflow-hidden flex flex-col">
        <ChatMessages messages={messages} />
        
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <FileUploadBar onSend={handleSendMessage} />
        </div>
      </div>

      <FileActionsPanel
        fileCount={files.length}
        onTodAction={() => console.log("TOD action on files:", files.map(f => f.name))}
        onToeAction={() => console.log("TOE action on files:", files.map(f => f.name))}
      />
    </div>
  );
}
