import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, RotateCcw, Download, Scale, FileCheck, ChevronDown, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, ComparisonResultsData, DocumentFramework, ControlGroup, StringencyAnalysis } from "@/contexts/RegulatoryTestingContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

      const selectedModel = localStorage.getItem("selectedModel") || "llama3";
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("max_workers", "4");
      formData.append("save_artifacts", "false");
      formData.append("output_format", "json");

      const allFiles = mode === "rcm" && rcmFile 
        ? [...regulationFiles, rcmFile] 
        : regulationFiles;
      
      allFiles.forEach((file) => {
        formData.append("regulation_files", file);
      });

      const response = await fetch(`${apiUrl}/compare-regulations`, {
        method: "POST",
        body: formData,
      });

      const result: ComparisonResultsData = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to compare regulations");
      }

      setComparisonResults(result);

      toast({
        title: "Analysis Complete",
        description: `${mode === "regulation" ? "Regulatory comparison" : "RCM assessment"} finished successfully. Found ${result.extracted_controls || 0} controls in ${result.control_groups || 0} groups.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to run analysis";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      setComparisonResults({
        success: false,
        request_id: "error",
        error: errorMessage,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportResults = () => {
    if (!comparisonResults) return;

    const jsonString = JSON.stringify(comparisonResults, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "regulation" ? "regulatory_comparison.json" : "rcm_assessment.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Results downloaded as JSON",
    });
  };

  const handleExportMarkdown = () => {
    if (!comparisonResults?.final_report) return;

    const blob = new Blob([comparisonResults.final_report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "regulation" ? "regulatory_comparison.md" : "rcm_assessment.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Report downloaded as Markdown",
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
            {!comparisonResults.success ? (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    Analysis Failed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-destructive">{comparisonResults.error || "Unknown error occurred"}</p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
                  <TabsTrigger value="frameworks" data-testid="tab-frameworks">Frameworks</TabsTrigger>
                  <TabsTrigger value="controls" data-testid="tab-controls">Controls</TabsTrigger>
                  <TabsTrigger value="report" data-testid="tab-report">Report</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        Analysis Summary
                      </CardTitle>
                      <CardDescription>
                        Request ID: {comparisonResults.request_id} | Model: {comparisonResults.model_used}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.documents?.length || 0}</p>
                          <p className="text-sm text-muted-foreground">Documents</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.extracted_controls || 0}</p>
                          <p className="text-sm text-muted-foreground">Controls Extracted</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.control_groups || 0}</p>
                          <p className="text-sm text-muted-foreground">Control Groups</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-green-500">
                            {comparisonResults.success ? "Complete" : "Failed"}
                          </p>
                          <p className="text-sm text-muted-foreground">Status</p>
                        </div>
                      </div>

                      {comparisonResults.stringency_analysis?.overall_stringency && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Overall Stringency Scores</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(comparisonResults.stringency_analysis.overall_stringency).map(([doc, score]) => (
                              <div key={doc} className="p-3 border rounded-lg">
                                <p className="text-sm font-medium truncate" title={doc}>{doc}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full transition-all"
                                      style={{ width: `${Math.min(100, (score as number) * 10)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-mono">{(score as number).toFixed(1)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {comparisonResults.documents && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Documents Analyzed</h4>
                          <div className="flex flex-wrap gap-2">
                            {comparisonResults.documents.map((doc, idx) => (
                              <Badge key={idx} variant="secondary">{doc}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="frameworks" className="space-y-4">
                  {comparisonResults.document_frameworks?.map((framework, idx) => (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="text-lg">{framework.document_name}</CardTitle>
                        <CardDescription>{framework.framework_type}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Primary Focus</p>
                          <p className="text-sm">{framework.primary_focus}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Regulatory Approach</p>
                          <p className="text-sm">{framework.regulatory_approach}</p>
                        </div>
                        {framework.key_themes && framework.key_themes.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Key Themes</p>
                            <div className="flex flex-wrap gap-2">
                              {framework.key_themes.map((theme, tidx) => (
                                <Badge key={tidx} variant="outline">{theme}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )) || (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No framework analysis available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="controls" className="space-y-4">
                  <ScrollArea className="h-[500px]">
                    {comparisonResults.grouped_controls?.map((group, gidx) => (
                      <Collapsible key={gidx} className="mb-4">
                        <Card>
                          <CollapsibleTrigger className="w-full">
                            <CardHeader className="flex flex-row items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                <CardTitle className="text-base">{group.common_theme}</CardTitle>
                              </div>
                              <Badge variant="secondary">{group.controls?.length || 0} controls</Badge>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="space-y-3 pt-0">
                              {group.controls?.map((control, cidx) => (
                                <div key={cidx} className="p-3 bg-muted/30 rounded-lg space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Badge variant="outline">{control.control_id}</Badge>
                                    <span className="text-xs text-muted-foreground">{control.source_document}</span>
                                  </div>
                                  <p className="text-sm">{control.control_text}</p>
                                  {control.control_domain && (
                                    <Badge variant="secondary" className="text-xs">{control.control_domain}</Badge>
                                  )}
                                </div>
                              ))}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    )) || (
                      <Card>
                        <CardContent className="py-8 text-center text-muted-foreground">
                          No control groups available
                        </CardContent>
                      </Card>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="report" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Final Report</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comparisonResults.final_report ? (
                        <ScrollArea className="h-[500px]">
                          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                            {comparisonResults.final_report}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">No report generated</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Button
                onClick={handleExportResults}
                data-testid="button-export-results"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              {comparisonResults.final_report && (
                <Button
                  variant="secondary"
                  onClick={handleExportMarkdown}
                  data-testid="button-export-markdown"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              )}
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
