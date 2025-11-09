import { useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface ChatMessagesProps {
  messages: Message[];
}

export default function ChatMessages({ messages }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6"
      data-testid="container-messages"
    >
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-3 max-w-lg" data-testid="text-empty-state">
            <h2 className="text-2xl font-semibold text-foreground">
              What can I help you with?
            </h2>
            <p className="text-muted-foreground">
              Ask me anything, upload documents, or explore the power of AI-driven conversations
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
            />
          ))}
        </div>
      )}
    </div>
  );
}
