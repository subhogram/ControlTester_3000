import { X, FileText, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface FileUploadBarProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
  isProcessing?: boolean;
  hasVectorstore?: boolean;
}

export default function FileUploadBar({
  files,
  onRemoveFile,
  onClearAll,
  isProcessing = false,
  hasVectorstore = false,
}: FileUploadBarProps) {
  if (files.length === 0) return null;

  return (
    <div className="border-t bg-card px-6 py-3" data-testid="container-file-upload">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
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
          <ScrollArea className="flex-1">
            <div className="flex gap-2 pb-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg flex-shrink-0 hover-highlight"
                  data-testid={`file-chip-${index}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm max-w-[150px] truncate" data-testid={`text-filename-${index}`}>
                    {file.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => onRemoveFile(index)}
                    data-testid={`button-remove-file-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            data-testid="button-clear-all"
          >
            Clear All
          </Button>
        </div>
      </div>
    </div>
  );
}
