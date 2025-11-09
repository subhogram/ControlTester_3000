import { useRef } from "react";
import { Upload, X, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContextFileUploadProps {
  title: string;
  description: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  testId: string;
}

export default function ContextFileUpload({
  title,
  description,
  files,
  onFilesChange,
  testId,
}: ContextFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesChange([...files, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onFilesChange([]);
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {files.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            data-testid={`button-clear-${testId}`}
          >
            Clear All
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {files.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-auto">
            {files.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileIcon className="h-5 w-5 flex-shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(idx)}
                  data-testid={`button-remove-${testId}-${idx}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          data-testid={`button-upload-${testId}`}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          data-testid={`input-file-${testId}`}
        />
      </div>
    </div>
  );
}
