import { useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage";
import type { Message } from "@/types";

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
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            timestamp={message.timestamp}
            attachments={message.attachments}
          />
        ))}
      </div>
    </div>
  );
}
