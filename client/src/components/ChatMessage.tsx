import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export default function ChatMessage({
  role,
  content,
  timestamp,
}: ChatMessageProps) {
  const isUser = role === "user";
  const isLoading = content === "loading";

  return (
    <div
      className={cn(
        "flex gap-4 w-full",
        isUser ? "justify-end" : "justify-start"
      )}
      data-testid={`message-${role}`}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-accent text-accent-foreground">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start", "max-w-[70%]")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 transition-all duration-200",
            isUser
              ? "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20"
              : "bg-card border border-card-border text-card-foreground hover:border-primary/30 hover:shadow-sm"
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-2" data-testid="spinner-loading">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-base text-muted-foreground">Thinking...</span>
            </div>
          ) : (
            <p className="text-base whitespace-pre-wrap break-words" data-testid="text-message-content">
              {content}
            </p>
          )}
        </div>
        {timestamp && (
          <span className="text-xs text-muted-foreground px-2" data-testid="text-timestamp">
            {timestamp}
          </span>
        )}
      </div>

      {isUser && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
