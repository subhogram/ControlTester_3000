import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, RotateCcw, Download, Scale, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting } from "@/contexts/RegulatoryTestingContext";

export default function RegulatoryTestingPage() {
  const { toast } = useToast();
  const {
    mode,
    setMode,
    regulationFiles,
    setRegulationFiles,
    rcmFile,
    setRcmFile,
    isProcessing,
    setIsProcessing,
    comparisonResults,
    setComparisonResults,
    resetForNewComparison,
  } = useRegulatoryTesting();

  const onDropRegulations = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setRegulationFiles([...regulationFiles, ...acceptedFiles]);
        toast({
          title: "Files uploaded",
          description: `${acceptedFiles.length} regulation file(s) added`,
        });
      }
    },
    [regulationFiles, setRegulationFiles, toast]
  );

  const onDropRcm = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setRcmFile(acceptedFiles[0]);
        toast({
          title: "RCM uploaded",
          description: `${acceptedFiles[0].name} added`,
        });
      }
    },
    [setRcmFile, toast]
  );

  const {
    getRootProps: getRegulationRootProps,
    getInputProps: getRegulationInputProps,
    isDragActive: isRegulationDragActive,
  } = useDropzone({
    onDrop: onDropRegulations,
    multiple: true,
  });

  const {
    getRootProps: getRcmRootProps,
    getInputProps: getRcmInputProps,
    isDragActive: isRcmDragActive,
  } = useDropzone({
    onDrop: onDropRcm,
    multiple: false,
  });

  const removeRegulationFile = (index: number) => {
    setRegulationFiles(regulationFiles.filter((_, i) => i !== index));
  };

  const removeRcmFile = () => {
    setRcmFile(null);
  };

  const canRunRegulationComparison = regulationFiles.length >= 2;
  const canRunRcmComparison = regulationFiles.length >= 1 && rcmFile !== null;

  const handleRunComparison = async () => {
    if (mode === "regulation" && !canRunRegulationComparison) {
      toast({
        title: "Insufficient files",
        description: "Please upload at least 2 regulation files to compare",
        variant: "destructive",
      });
      return;
    }

    if (mode === "rcm" && !canRunRcmComparison) {
      toast({
        title: "Insufficient files",
        description: "Please upload regulation file(s) and an RCM document",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setComparisonResults(null);

    try {
      const actionText = mode === "regulation" ? "regulatory comparison" : "RCM assessment";
      toast({
        title: "Processing",
        description: `Running ${actionText}...`,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const resultText =
        mode === "regulation"
          ? `Regulatory Comparison Complete\n\nCompared ${regulationFiles.length} regulation files.\n\nResults will be displayed here once API integration is complete.`
          : `RCM Assessment Complete\n\nAnalyzed RCM document against ${regulationFiles.length} regulation file(s).\n\nResults will be displayed here once API integration is complete.`;

      setComparisonResults(resultText);

      toast({
        title: "Analysis Complete",
        description: `${mode === "regulation" ? "Regulatory comparison" : "RCM assessment"} finished successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to run analysis",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportResults = () => {
    if (!comparisonResults) return;

    const blob = new Blob([comparisonResults], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "regulation" ? "regulatory_comparison.txt" : "rcm_assessment.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Results downloaded successfully",
    });
  };

  const handleNewComparison = () => {
    resetForNewComparison();
    toast({
      title: "Reset",
      description: "Ready for new comparison",
    });
  };

  const handleModeSwitch = (newMode: "regulation" | "rcm") => {
    if (newMode !== mode) {
      setMode(newMode);
      resetForNewComparison();
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Regulatory Testing
          </h1>
          <p className="text-muted-foreground mt-2">
            Compare regulations or assess RCM documents against regulatory requirements
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-6">
          <Button
            variant={mode === "regulation" ? "default" : "outline"}
            onClick={() => handleModeSwitch("regulation")}
            className="gap-2"
            data-testid="button-regulation-mode"
          >
            <Scale className="h-4 w-4" />
            Regulation Comparison
          </Button>
          <Button
            variant={mode === "rcm" ? "default" : "outline"}
            onClick={() => handleModeSwitch("rcm")}
            className="gap-2"
            data-testid="button-rcm-mode"
          >
            <FileCheck className="h-4 w-4" />
            RCM Comparison
          </Button>
        </div>

        {!isProcessing && !comparisonResults && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Upload Regulation Files
                  {mode === "regulation" && (
                    <Badge variant="secondary" className="ml-2">
                      Min. 2 files required
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRegulationRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isRegulationDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                  data-testid="dropzone-regulations"
                >
                  <input {...getRegulationInputProps()} data-testid="input-regulation-files" />
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  {isRegulationDragActive ? (
                    <p className="text-primary font-medium">Drop regulation files here...</p>
                  ) : (
                    <>
                      <p className="text-foreground font-medium">
                        Drag & drop regulation files here
                      </p>
                      <p className="text-muted-foreground text-sm mt-1">
                        or click to browse (PDF, DOCX, TXT)
                      </p>
                    </>
                  )}
                </div>

                {regulationFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Regulation Files ({regulationFiles.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {regulationFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          data-testid={`regulation-file-${index}`}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-sm truncate max-w-xs">{file.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {(file.size / 1024).toFixed(1)} KB
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRegulationFile(index)}
                            data-testid={`button-remove-regulation-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {mode === "rcm" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Upload RCM Document
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    {...getRcmRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isRcmDragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    data-testid="dropzone-rcm"
                  >
                    <input {...getRcmInputProps()} data-testid="input-rcm-file" />
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    {isRcmDragActive ? (
                      <p className="text-primary font-medium">Drop RCM document here...</p>
                    ) : (
                      <>
                        <p className="text-foreground font-medium">
                          Drag & drop RCM document here
                        </p>
                        <p className="text-muted-foreground text-sm mt-1">
                          or click to browse (PDF, DOCX, XLSX)
                        </p>
                      </>
                    )}
                  </div>

                  {rcmFile && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">RCM Document</p>
                      <div
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        data-testid="rcm-file-item"
                      >
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-green-500" />
                          <span className="text-sm truncate max-w-xs">{rcmFile.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {(rcmFile.size / 1024).toFixed(1)} KB
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={removeRcmFile}
                          data-testid="button-remove-rcm"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Button
              onClick={handleRunComparison}
              disabled={mode === "regulation" ? !canRunRegulationComparison : !canRunRcmComparison}
              className="w-full"
              data-testid="button-run-comparison"
            >
              <Play className="h-4 w-4 mr-2" />
              {mode === "regulation" ? "Run Regulatory Comparison" : "Run RCM Assessment"}
            </Button>
          </>
        )}

        {isProcessing && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-lg font-medium">
                  {mode === "regulation" ? "Comparing regulations..." : "Assessing RCM document..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mode === "regulation"
                    ? `Analyzing ${regulationFiles.length} regulation files`
                    : `Comparing RCM against ${regulationFiles.length} regulation(s)`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {comparisonResults && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-500" />
                  {mode === "regulation" ? "Comparison Results" : "Assessment Results"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-muted/50 rounded-lg whitespace-pre-wrap">
                  <p className="text-sm">{comparisonResults}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={handleExportResults}
                data-testid="button-export-results"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
              <Button
                variant="outline"
                onClick={handleNewComparison}
                data-testid="button-new-comparison"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                New Comparison
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
