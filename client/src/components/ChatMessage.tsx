import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Bot, Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageAttachment } from "@/types";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  attachments?: MessageAttachment[];
}

export default function ChatMessage({
  role,
  content,
  timestamp,
  attachments,
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

      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start", "max-w-[80%]")}>
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
          ) : isUser ? (
            <p className="text-base whitespace-pre-wrap break-words" data-testid="text-message-content">
              {content}
            </p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="text-message-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-collapse border border-border text-sm">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-muted/50">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border px-3 py-2 text-left font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border px-3 py-2">{children}</td>
                  ),
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="ml-2">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold">{children}</strong>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                        {children}
                      </code>
                    ) : (
                      <code className={className}>{children}</code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="bg-muted p-3 rounded-md overflow-x-auto my-2 text-sm">
                      {children}
                    </pre>
                  ),
                  h1: ({ children }) => (
                    <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-bold mb-2 mt-2 first:mt-0">{children}</h3>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-4 border-border" />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1 px-1" data-testid="container-attachments">
            {attachments.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-1.5 px-2 py-1 bg-muted/70 rounded-md text-xs text-muted-foreground"
                data-testid={`attachment-${index}`}
              >
                <Paperclip className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{file.name}</span>
                <span className="text-muted-foreground/60">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ))}
          </div>
        )}
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
