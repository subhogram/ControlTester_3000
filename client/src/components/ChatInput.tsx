import { useState, useRef, KeyboardEvent } from "react";
import { Paperclip, ArrowUp, Plus, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onFileSelect,
  disabled = false,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      onFileSelect(Array.from(selectedFiles));
      e.target.value = "";
    }
  };

  return (
    <div className="bg-background p-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-card/80 backdrop-blur-sm rounded-3xl p-4 border border-border/50 shadow-lg">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-file"
          />
          
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Agent-Assess to help with your cybersecurity assessment..."
            className="resize-none border-0 bg-transparent focus-visible:ring-0 shadow-none min-h-[60px] max-h-[200px] text-base placeholder:text-muted-foreground/60 mb-3"
            disabled={disabled}
            data-testid="input-message"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover-elevate"
              data-testid="button-plus"
            >
              <Plus className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleFileClick}
              className="gap-2 h-9 rounded-full hover-elevate"
              data-testid="button-attach"
            >
              <Paperclip className="h-4 w-4" />
              <span className="text-sm">Attach</span>
            </Button>

            <div className="flex-1" />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover-elevate"
              data-testid="button-mic"
            >
              <Mic className="h-5 w-5" />
            </Button>

            <Button
              onClick={handleSend}
              disabled={!message.trim() || disabled}
              size="icon"
              className="h-9 w-9 rounded-full"
              data-testid="button-send"
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
