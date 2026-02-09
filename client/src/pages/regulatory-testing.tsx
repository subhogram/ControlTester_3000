import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, RotateCcw, Download, Scale, FileCheck, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, ComparisonResultsData } from "@/contexts/RegulatoryTestingContext";
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
      formData.append("save_artifacts", "false");
      formData.append("output_format", "json");

      let endpoint: string;

      if (mode === "rcm") {
        endpoint = `${apiUrl}/rcm_compliance`;
        regulationFiles.forEach((file) => {
          formData.append("regulation_files", file);
        });
        if (rcmFile) {
          formData.append("rcm_file", rcmFile);
        }
      } else {
        endpoint = `${apiUrl}/compare-regulations`;
        formData.append("max_workers", "4");
        regulationFiles.forEach((file) => {
          formData.append("regulation_files", file);
        });
      }

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const result: ComparisonResultsData = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to run ${mode === "regulation" ? "regulatory comparison" : "RCM compliance analysis"}`);
      }

      setComparisonResults(result);

      if (mode === "rcm") {
        toast({
          title: "Analysis Complete",
          description: `RCM compliance analysis finished. ${Object.keys(result.domain_reports || {}).length} domain reports generated.`,
        });
      } else {
        toast({
          title: "Analysis Complete",
          description: `Regulatory comparison finished successfully. Found ${result.extracted_controls || 0} controls in ${result.control_groups || 0} groups.`,
        });
      }
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(comparisonResults.stringency_analysis.overall_stringency).map(([doc, data]) => (
                              <div key={doc} className="p-3 border rounded-lg space-y-2">
                                <p className="text-sm font-medium truncate" title={doc}>{doc}</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full transition-all"
                                      style={{ width: `${Math.min(100, data.average_stringency)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-mono">{data.average_stringency.toFixed(1)}</span>
                                </div>
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  <span>Median: {data.median_stringency.toFixed(1)}</span>
                                  <span>Controls: {data.control_count}</span>
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
                  {comparisonResults.document_analyses && Object.keys(comparisonResults.document_analyses).length > 0 ? (
                    Object.entries(comparisonResults.document_analyses).map(([docName, analysis], idx) => (
                      <Card key={idx}>
                        <CardHeader>
                          <CardTitle className="text-lg">{docName}</CardTitle>
                          <CardDescription>{analysis.framework_name}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Issuing Authority</p>
                              <p className="text-sm">{analysis.issuing_authority || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Target Industry</p>
                              <p className="text-sm">{analysis.target_industry || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Regulatory Approach</p>
                              <p className="text-sm">{analysis.regulatory_approach || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Governance Model</p>
                              <p className="text-sm">{analysis.governance_model || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Enforcement Style</p>
                              <p className="text-sm">{analysis.enforcement_style || "N/A"}</p>
                            </div>
                          </div>
                          {analysis.key_focus_areas && analysis.key_focus_areas.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-2">Key Focus Areas</p>
                              <div className="flex flex-wrap gap-2">
                                {analysis.key_focus_areas.map((area, tidx) => (
                                  <Badge key={tidx} variant="outline">{area}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No framework analysis available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="controls" className="space-y-4">
                  <ScrollArea className="h-[500px]">
                    {comparisonResults.stringency_analysis?.control_groups && comparisonResults.stringency_analysis.control_groups.length > 0 ? (
                      comparisonResults.stringency_analysis.control_groups.map((group, gidx) => (
                        <Collapsible key={gidx} className="mb-4">
                          <Card>
                            <CollapsibleTrigger className="w-full">
                              <CardHeader className="flex flex-row items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                  <div className="text-left min-w-0">
                                    <CardTitle className="text-base capitalize">{group.control_domain.replace(/_/g, " ")}</CardTitle>
                                    <p className="text-xs text-muted-foreground">Risk: {group.risk_addressed}</p>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="shrink-0">Score: {group.baseline_stringency.overall.toFixed(1)}</Badge>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="space-y-3 pt-0">
                                <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <Badge variant="outline">Most Stringent</Badge>
                                    <span className="text-xs text-muted-foreground">{group.most_stringent_source}</span>
                                  </div>
                                  <p className="text-sm">{group.most_stringent_control}</p>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Prescriptive</p>
                                      <p className="font-medium">{group.baseline_stringency.prescriptiveness}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Measurability</p>
                                      <p className="font-medium">{group.baseline_stringency.measurability}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Enforcement</p>
                                      <p className="font-medium">{group.baseline_stringency.enforcement}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Scope</p>
                                      <p className="font-medium">{group.baseline_stringency.scope}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Independence</p>
                                      <p className="font-medium">{group.baseline_stringency.independence}</p>
                                    </div>
                                  </div>
                                </div>
                                {group.comparisons && group.comparisons.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium">Comparisons ({group.comparisons.length})</p>
                                    {group.comparisons.map((comp, cidx) => (
                                      <div key={cidx} className="p-2 border rounded-lg text-sm">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="font-medium truncate">{comp.source}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {comp.compliance_percentage.toFixed(0)}% compliance
                                          </Badge>
                                        </div>
                                        <p className="text-muted-foreground text-xs">{comp.control_statement}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      ))
                    ) : (
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
                        <ScrollArea className="h-[600px]">
                          <div className="prose prose-sm dark:prose-invert max-w-none pr-4
                            prose-headings:text-foreground prose-headings:font-semibold
                            prose-h1:text-2xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h1:mb-4
                            prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                            prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
                            prose-p:text-muted-foreground prose-p:leading-relaxed
                            prose-strong:text-foreground prose-strong:font-semibold
                            prose-ul:my-2 prose-li:text-muted-foreground prose-li:my-1
                            prose-table:border-collapse prose-table:w-full prose-table:my-4
                            prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-foreground
                            prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-muted-foreground
                            prose-tr:even:bg-muted/30
                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                            prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                            prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
                            prose-hr:border-border prose-hr:my-6">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {comparisonResults.final_report}
                            </ReactMarkdown>
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
