import { MessageCircle, Sparkles, FileIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  files?: File[];
}

interface ChatMessagesProps {
  messages: Message[];
}

export default function ChatMessages({ messages }: ChatMessagesProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-2xl space-y-4">
          <Sparkles className="h-16 w-16 text-primary mx-auto" />
          <h2 className="text-2xl font-semibold">What can I help you with?</h2>
          <p className="text-muted-foreground">
            Ask me anything, upload documents, or explore the power of AI-driven conversations
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {message.role === "assistant" && (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}
          
          <div className={`max-w-[70%] space-y-2`}>
            <div
              className={`rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
            
            {message.files && message.files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {message.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs bg-muted px-3 py-1 rounded-full"
                  >
                    <FileIcon className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {message.role === "user" && (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-secondary">
                <MessageCircle className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      ))}
    </div>
  );
}
