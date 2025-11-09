import { useState, useCallback } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContextFile {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface ContextFileUploadProps {
  title: string;
  description: string;
  files: ContextFile[];
  onRemoveFile: (id: string) => void;
  onUpload: (files: File[]) => void;
  testId: string;
}

export default function ContextFileUpload({
  title,
  description,
  files,
  onRemoveFile,
  onUpload,
  testId,
}: ContextFileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (inputFiles && inputFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...Array.from(inputFiles)]);
      e.target.value = "";
    }
  };

  const handleRemoveSelected = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onUpload(selectedFiles);
      setSelectedFiles([]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          "border-2 border-dashed rounded-xl p-8",
          "flex flex-col items-center justify-center gap-3",
          "hover-elevate cursor-pointer transition-all duration-200",
          "hover:border-primary/40 hover:bg-primary/5"
        )}
        data-testid={`container-dropzone-${testId}`}
      >
        <Upload className="h-10 w-10 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">Drop files here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">
            Select one or more files
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          onChange={handleFileInput}
          id={`file-input-${testId}`}
          multiple
          data-testid={`input-file-${testId}`}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => document.getElementById(`file-input-${testId}`)?.click()}
          data-testid={`button-browse-${testId}`}
        >
          Browse Files
        </Button>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              Selected Files ({selectedFiles.length})
            </h4>
            <Button
              onClick={handleUpload}
              size="sm"
              data-testid={`button-upload-${testId}`}
            >
              Upload Files
            </Button>
          </div>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 border rounded-lg bg-card hover-highlight"
                data-testid={`selected-file-${testId}-${index}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveSelected(index)}
                  data-testid={`button-remove-selected-${testId}-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Uploaded Files</h4>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-card hover-highlight"
                data-testid={`uploaded-file-${testId}-${file.id}`}
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
                  data-testid={`button-remove-uploaded-${testId}-${file.id}`}
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
