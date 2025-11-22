import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Paperclip, ArrowUp, Plus, Mic, ChevronLeft, ChevronRight, X, FileText, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
  files?: File[];
  onRemoveFile?: (index: number) => void;
  onClearAllFiles?: () => void;
  isProcessing?: boolean;
  hasVectorstore?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onFileSelect,
  disabled = false,
  files = [],
  onRemoveFile,
  onClearAllFiles,
  isProcessing = false,
  hasVectorstore = false,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset file index when files change
  useEffect(() => {
    if (files.length === 0) {
      setCurrentFileIndex(0);
    } else if (currentFileIndex >= files.length) {
      setCurrentFileIndex(files.length - 1);
    }
  }, [files.length, currentFileIndex]);

  // Auto-resize textarea based on content (lovable.dev behavior)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

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

  const handlePrevFile = () => {
    setCurrentFileIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
  };

  const handleNextFile = () => {
    setCurrentFileIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
  };

  const handleRemoveCurrentFile = () => {
    if (onRemoveFile && files.length > 0) {
      onRemoveFile(currentFileIndex);
    }
  };

  return (
    <div className="p-4">
      <div className="bg-card/80 backdrop-blur-sm rounded-3xl p-4 border border-border/50 shadow-lg max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-file"
        />

        {/* File Slider */}
        {files.length > 0 && (
          <div className="mb-3 flex items-center gap-2" data-testid="container-file-slider">
            {/* Status Badge */}
            <div className="flex-shrink-0">
              {isProcessing && (
                <Badge variant="secondary" className="gap-1.5" data-testid="badge-processing">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing...
                </Badge>
              )}
              {!isProcessing && hasVectorstore && (
                <Badge variant="default" className="gap-1.5 bg-green-600 hover:bg-green-700" data-testid="badge-vectorstore-ready">
                  <CheckCircle className="h-3 w-3" />
                  Ready
                </Badge>
              )}
            </div>

            {/* Previous Button */}
            {files.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 hover-elevate"
                onClick={handlePrevFile}
                data-testid="button-prev-file"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}

            {/* Current File Display */}
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-muted rounded-lg min-w-0" data-testid={`file-chip-${currentFileIndex}`}>
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm truncate flex-1" data-testid={`text-filename-${currentFileIndex}`}>
                {files[currentFileIndex]?.name}
              </span>
              {files.length > 1 && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {currentFileIndex + 1}/{files.length}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={handleRemoveCurrentFile}
                data-testid={`button-remove-file-${currentFileIndex}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Next Button */}
            {files.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 hover-elevate"
                onClick={handleNextFile}
                data-testid="button-next-file"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            {/* Clear All Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onClearAllFiles}
              className="flex-shrink-0 h-8"
              data-testid="button-clear-all"
            >
              Clear All
            </Button>
          </div>
        )}
        
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Agent-Assess to help with your cybersecurity assessment..."
          rows={1}
          className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none min-h-[24px] max-h-[200px] text-base placeholder:text-muted-foreground/60 mb-3 overflow-hidden outline-none"
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
  );
}
