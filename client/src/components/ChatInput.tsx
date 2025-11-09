import { useState, useRef, KeyboardEvent } from "react";
import { Paperclip, Send } from "lucide-react";
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
    <div className="border-t bg-background p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 border rounded-2xl bg-card p-3 hover-highlight">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-file"
          />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFileClick}
            className="flex-shrink-0"
            data-testid="button-attach"
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="resize-none border-0 bg-transparent focus-visible:ring-0 shadow-none min-h-[52px] max-h-[200px]"
            disabled={disabled}
            data-testid="input-message"
          />

          <Button
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            size="icon"
            className="flex-shrink-0"
            data-testid="button-send"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
