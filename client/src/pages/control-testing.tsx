import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useControlTesting } from "@/contexts/ControlTestingContext";

export default function ControlTestingPage() {
  const { toast } = useToast();
  const {
    uploadedFiles,
    setUploadedFiles,
    isProcessing,
    setIsProcessing,
    testResults,
    setTestResults,
    resetState,
  } = useControlTesting();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const yamlFiles = acceptedFiles.filter(
        (file) =>
          file.name.endsWith(".yaml") ||
          file.name.endsWith(".yml") ||
          file.type === "application/x-yaml" ||
          file.type === "text/yaml"
      );

      if (yamlFiles.length !== acceptedFiles.length) {
        toast({
          title: "Invalid file type",
          description: "Only YAML files (.yaml, .yml) are accepted",
          variant: "destructive",
        });
      }

      if (yamlFiles.length > 0) {
        setUploadedFiles([...uploadedFiles, ...yamlFiles]);
        toast({
          title: "Files uploaded",
          description: `${yamlFiles.length} YAML file(s) added`,
        });
      }
    },
    [uploadedFiles, setUploadedFiles, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/x-yaml": [".yaml", ".yml"],
      "text/yaml": [".yaml", ".yml"],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const handleRunTests = async () => {
    if (uploadedFiles.length === 0) {
      toast({
        title: "No files",
        description: "Please upload YAML files to run tests",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setTestResults(null);

    try {
      toast({
        title: "Processing",
        description: "Running AI control tests...",
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      setTestResults(
        "Control testing completed successfully. Results will be displayed here once the API integration is complete."
      );

      toast({
        title: "Tests Complete",
        description: "AI control testing finished successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to run control tests",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewTest = () => {
    resetState();
    toast({
      title: "Reset",
      description: "Ready for new control testing",
    });
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            AI Control Testing
          </h1>
          <p className="text-muted-foreground mt-2">
            Upload YAML configuration files to test AI controls
          </p>
        </div>

        {!isProcessing && !testResults && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload YAML Files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                data-testid="dropzone-yaml"
              >
                <input {...getInputProps()} data-testid="input-yaml-files" />
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                {isDragActive ? (
                  <p className="text-primary font-medium">Drop YAML files here...</p>
                ) : (
                  <>
                    <p className="text-foreground font-medium">
                      Drag & drop YAML files here
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">
                      or click to browse (.yaml, .yml)
                    </p>
                  </>
                )}
              </div>

              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Uploaded Files ({uploadedFiles.length})
                  </p>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        data-testid={`file-item-${index}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm truncate max-w-xs">
                            {file.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {(file.size / 1024).toFixed(1)} KB
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(index)}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleRunTests}
                disabled={uploadedFiles.length === 0}
                className="w-full"
                data-testid="button-run-tests"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Control Tests
              </Button>
            </CardContent>
          </Card>
        )}

        {isProcessing && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-lg font-medium">Processing YAML files...</p>
                <p className="text-sm text-muted-foreground">
                  Running AI control tests
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {testResults && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-500" />
                  Test Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm">{testResults}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                onClick={handleNewTest}
                data-testid="button-new-test"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                New Test
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
