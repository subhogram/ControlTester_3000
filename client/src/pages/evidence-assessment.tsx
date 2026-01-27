import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function EvidenceAssessmentPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentStatus, setAssessmentStatus] = useState<string>("");
  const [reportData, setReportData] = useState<Blob | null>(null);
  const [reportFilename, setReportFilename] = useState<string>("assessment-report.pdf");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
    setReportData(null);
    setAssessmentStatus("Uploading files...");

    try {
      // Step 1: Upload files and assess evidence
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      setAssessmentStatus("Assessing evidence...");
      const assessResponse = await fetch(`${API_URL}/assess-evidence`, {
        method: "POST",
        body: formData,
      });

      if (!assessResponse.ok) {
        throw new Error("Failed to assess evidence");
      }

      const assessResult = await assessResponse.json();

      // Step 2: Generate summary report
      setAssessmentStatus("Generating summary report...");
      const summaryResponse = await fetch(`${API_URL}/generate-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assessment_id: assessResult.assessment_id,
          assessment_data: assessResult,
        }),
      });

      if (!summaryResponse.ok) {
        throw new Error("Failed to generate summary");
      }

      // Get the report as a blob for download
      const contentType = summaryResponse.headers.get("content-type");
      if (contentType && contentType.includes("application/pdf")) {
        const blob = await summaryResponse.blob();
        setReportData(blob);
        setReportFilename("assessment-report.pdf");
      } else {
        const summaryResult = await summaryResponse.json();
        // If JSON response, create a text blob
        const blob = new Blob([JSON.stringify(summaryResult, null, 2)], { type: "application/json" });
        setReportData(blob);
        setReportFilename("assessment-report.json");
      }

      setAssessmentStatus("Assessment complete!");
      toast({
        title: "Assessment Complete",
        description: "Your evidence has been assessed. You can now download the report.",
      });
    } catch (error) {
      console.error("Assessment error:", error);
      setAssessmentStatus("");
      toast({
        title: "Assessment Failed",
        description: error instanceof Error ? error.message : "An error occurred during assessment",
        variant: "destructive",
      });
    } finally {
      setIsAssessing(false);
    }
  };

  const handleDownloadReport = () => {
    if (!reportData) return;
    const url = URL.createObjectURL(reportData);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6 max-w-4xl">
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

            {assessmentStatus && (
              <div className="p-3 bg-muted/50 rounded-md" data-testid="status-assessment">
                <p className="text-sm flex items-center gap-2">
                  {isAssessing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {!isAssessing && reportData && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {assessmentStatus}
                </p>
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
              {reportData && (
                <Button
                  onClick={handleDownloadReport}
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-download-report"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setFiles([]);
                  setReportData(null);
                  setAssessmentStatus("");
                }}
                disabled={files.length === 0 && !reportData}
                data-testid="button-clear-files"
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
