import { useCallback } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RagFile {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface RagFileUploadProps {
  files: RagFile[];
  onFileSelect: (file: File) => void;
  onRemoveFile: (id: string) => void;
}

export default function RagFileUpload({
  files,
  onFileSelect,
  onRemoveFile,
}: RagFileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          "border-2 border-dashed rounded-xl p-12",
          "flex flex-col items-center justify-center gap-4",
          "hover-elevate cursor-pointer transition-all duration-200",
          "hover:border-primary/40 hover:bg-primary/5"
        )}
        data-testid="container-dropzone"
      >
        <Upload className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-base font-medium">Drop files here to upload</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          onChange={handleFileInput}
          id="rag-file-input"
          data-testid="input-rag-file"
        />
        <Button
          variant="outline"
          onClick={() => document.getElementById("rag-file-input")?.click()}
          data-testid="button-browse"
        >
          Browse Files
        </Button>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Uploaded Files</h3>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-card hover-highlight"
                data-testid={`file-item-${file.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {file.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {file.uploadedAt}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveFile(file.id)}
                  data-testid={`button-remove-${file.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
