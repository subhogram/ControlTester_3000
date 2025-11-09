import { useState, useCallback } from "react";
import { Upload, X, FileText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  maxFiles?: number;
  acceptedFileTypes?: string;
  acceptedExtensions?: string[];
}

export default function ContextFileUpload({
  title,
  description,
  files,
  onRemoveFile,
  onUpload,
  testId,
  maxFiles,
  acceptedFileTypes,
  acceptedExtensions,
}: ContextFileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const filesPerPage = 4;

  const validateFiles = (filesToValidate: File[]): File[] => {
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    for (const file of filesToValidate) {
      if (acceptedExtensions && acceptedExtensions.length > 0) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (!fileExtension || !acceptedExtensions.includes(fileExtension)) {
          invalidFiles.push(file.name);
          continue;
        }
      }
      validFiles.push(file);
    }

    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid file type",
        description: `${invalidFiles.length} file(s) rejected. Accepted: ${acceptedExtensions?.join(', ')}`,
        variant: "destructive",
      });
    }

    return validFiles;
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      const validFiles = validateFiles(droppedFiles);
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (inputFiles && inputFiles.length > 0) {
      const validFiles = validateFiles(Array.from(inputFiles));
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      e.target.value = "";
    }
  };

  const handleRemoveSelected = (index: number) => {
    setSelectedFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      const totalPages = Math.ceil(newFiles.length / filesPerPage);
      if (currentPage >= totalPages && totalPages > 0) {
        setCurrentPage(totalPages - 1);
      }
      return newFiles;
    });
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setCurrentPage(0);
  };

  const handleUpload = async () => {
    if (selectedFiles.length > 0) {
      setIsUploading(true);
      try {
        await onUpload(selectedFiles);
        setSelectedFiles([]);
        setCurrentPage(0);
        toast({
          title: "✓ Success",
          description: `Successfully uploaded ${selectedFiles.length} file(s) and built knowledge base`,
          className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
        });
      } catch (error) {
        toast({
          title: "✗ Upload failed",
          description: error instanceof Error ? error.message : "Failed to upload files",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const totalPages = Math.ceil(selectedFiles.length / filesPerPage);
  const paginatedFiles = selectedFiles.slice(
    currentPage * filesPerPage,
    (currentPage + 1) * filesPerPage
  );

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
            PDF, TXT, JPG, CSV, Excel files
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          onChange={handleFileInput}
          id={`file-input-${testId}`}
          multiple
          accept={acceptedFileTypes}
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-medium">
              Selected Files ({selectedFiles.length})
            </h4>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleClearAll}
                variant="outline"
                size="sm"
                disabled={isUploading}
                data-testid={`button-clear-all-${testId}`}
              >
                Clear All
              </Button>
              <Button
                onClick={handleUpload}
                size="sm"
                disabled={isUploading}
                data-testid={`button-upload-${testId}`}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Building Knowledge Base...
                  </>
                ) : (
                  "Upload Files"
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {paginatedFiles.map((file, index) => {
              const actualIndex = currentPage * filesPerPage + index;
              return (
                <div
                  key={`${file.name}-${actualIndex}`}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card hover-elevate"
                  data-testid={`selected-file-${testId}-${actualIndex}`}
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
                    onClick={() => handleRemoveSelected(actualIndex)}
                    data-testid={`button-remove-selected-${testId}-${actualIndex}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                  disabled={currentPage === 0}
                  data-testid={`button-prev-page-${testId}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                  disabled={currentPage === totalPages - 1}
                  data-testid={`button-next-page-${testId}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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
