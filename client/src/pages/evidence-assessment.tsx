import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileText, CheckCircle, Loader2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/components/ThemeProvider";

export default function EvidenceAssessmentPage() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [files, setFiles] = useState<File[]>([]);
  const [isAssessing, setIsAssessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropzoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleAssess = async () => {
    if (files.length === 0) return;
    setIsAssessing(true);
    // TODO: Implement assessment logic
    setTimeout(() => {
      setIsAssessing(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="relative h-16 border-b bg-gradient-to-r from-[#654ea3]/30 via-[#7b68b8]/20 to-[#eaafc8]/30 backdrop-blur-sm flex items-center px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="absolute left-1/2 -translate-x-1/2">
          <span className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Evidence File Assessment
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Upload Evidence Files
            </CardTitle>
            <CardDescription>
              Upload your evidence files for AI-powered assessment and analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover-elevate"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={handleDropzoneClick}
              data-testid="dropzone-upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.csv"
                data-testid="input-file"
              />
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Supports PDF, Word, Excel, CSV, and text files
              </p>
            </div>

            {files.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium">Selected Files ({files.length})</h3>
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-md"
                      data-testid={`file-item-${index}`}
                    >
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="flex-1 truncate" data-testid={`text-filename-${index}`}>{file.name}</span>
                      <span className="text-sm text-muted-foreground" data-testid={`text-filesize-${index}`}>
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleAssess}
                disabled={files.length === 0 || isAssessing}
                className="flex-1"
                data-testid="button-assess"
              >
                {isAssessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assessing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Start Assessment
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setFiles([])}
                disabled={files.length === 0}
                data-testid="button-clear-files"
              >
                Clear Files
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
