import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Trash2, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import ContextFileUpload from "@/components/ContextFileUpload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ContextFile {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface Model {
  value: string;
  label: string;
}

interface VectorstoreInfo {
  exists: boolean;
  path?: string;
  created?: string;
}

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [generalContextFiles, setGeneralContextFiles] = useState<ContextFile[]>([]);
  const [companyPolicyFiles, setCompanyPolicyFiles] = useState<ContextFile[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("selectedModel") || "";
  });
  const { toast } = useToast();

  const { data: models, isLoading: modelsLoading, error: modelsError } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  // Check if global vectorstore exists
  const { data: globalVectorstore } = useQuery<VectorstoreInfo>({
    queryKey: ["/api/vectorstore/global"],
  });

  // Check if company vectorstore exists
  const { data: companyVectorstore } = useQuery<VectorstoreInfo>({
    queryKey: ["/api/vectorstore/company"],
  });

  // Delete vectorstore mutation
  const deleteVectorstore = useMutation({
    mutationFn: async (type: string) => {
      return await apiRequest("DELETE", `/api/vectorstore/${type}`);
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: [`/api/vectorstore/${type}`] });
      toast({
        title: "✓ Deleted Successfully",
        description: `${type === "global" ? "General Context" : "Company Policy"} vectorstore has been deleted`,
        className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
      });
    },
    onError: (error) => {
      toast({
        title: "✗ Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete vectorstore",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("selectedModel", selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].value);
    }
  }, [models, selectedModel]);

  const handleGeneralContextUpload = async (files: File[]) => {
    try {
      const selectedModel = localStorage.getItem("selectedModel") || models?.[0]?.value;
      if (!selectedModel) {
        throw new Error("Please select a model first");
      }

      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "global");

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("http://localhost:8000/build-knowledge-base", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }

      const result = await response.json();
      
      // Save the vectorstore to disk
      try {
        const saveResponse = await fetch("/api/vectorstore/save/global", {
          method: "POST",
        });
        
        if (!saveResponse.ok) {
          console.warn("Failed to save vectorstore to disk");
        }
      } catch (saveError) {
        console.warn("Error saving vectorstore:", saveError);
      }
      
      const newFiles = files.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        uploadedAt: "Just now",
      }));
      setGeneralContextFiles((prev) => [...prev, ...newFiles]);

      // Refresh vectorstore info after upload
      queryClient.invalidateQueries({ queryKey: ["/api/vectorstore/global"] });

      return result;
    } catch (error) {
      console.error("Error uploading files:", error);
      throw error;
    }
  };

  const handleGeneralContextRemove = (id: string) => {
    setGeneralContextFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleCompanyPolicyUpload = async (files: File[]) => {
    try {
      const selectedModel = localStorage.getItem("selectedModel") || models?.[0]?.value;
      if (!selectedModel) {
        throw new Error("Please select a model first");
      }

      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "company");

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("http://localhost:8000/build-knowledge-base", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }

      const result = await response.json();
      
      // Save the vectorstore to disk
      try {
        const saveResponse = await fetch("/api/vectorstore/save/company", {
          method: "POST",
        });
        
        if (!saveResponse.ok) {
          console.warn("Failed to save vectorstore to disk");
        }
      } catch (saveError) {
        console.warn("Error saving vectorstore:", saveError);
      }
      
      const newFiles = files.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        uploadedAt: "Just now",
      }));
      setCompanyPolicyFiles((prev) => [...prev, ...newFiles]);

      // Refresh vectorstore info after upload
      queryClient.invalidateQueries({ queryKey: ["/api/vectorstore/company"] });

      return result;
    } catch (error) {
      console.error("Error uploading files:", error);
      throw error;
    }
  };

  const handleCompanyPolicyRemove = (id: string) => {
    setCompanyPolicyFiles((prev) => prev.filter((file) => file.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#654ea3]/20 via-[#8b6dbb]/10 to-[#eaafc8]/20">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>LLM Model</CardTitle>
              <CardDescription>
                Select the AI model to use for your conversations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelsLoading && (
                <div className="text-sm text-muted-foreground" data-testid="text-loading-models">
                  Loading models...
                </div>
              )}
              {modelsError && (
                <div className="text-sm text-destructive" data-testid="text-error-models">
                  Failed to load models. Please check if the API is running.
                </div>
              )}
              {!modelsLoading && !modelsError && models && (
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-full max-w-sm" data-testid="select-model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle>General Context</CardTitle>
                    {globalVectorstore?.exists && (
                      <Badge 
                        variant="default" 
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="badge-global-vectorstore-ready"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Vectorstore Ready
                      </Badge>
                    )}
                  </div>
                  {globalVectorstore?.exists && (
                    <CardDescription className="mt-2">
                      <span className="text-xs">
                        📁 Path: <code className="bg-muted px-1 py-0.5 rounded">{globalVectorstore.path}</code>
                      </span>
                    </CardDescription>
                  )}
                </div>
                {globalVectorstore?.exists && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteVectorstore.mutate("global")}
                    disabled={deleteVectorstore.isPending}
                    data-testid="button-delete-global-vectorstore"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ContextFileUpload
                title="General Context"
                description="Upload general reference documents and knowledge base files (unlimited)"
                files={generalContextFiles}
                onRemoveFile={handleGeneralContextRemove}
                onUpload={handleGeneralContextUpload}
                testId="general"
                acceptedFileTypes=".pdf,.txt,.jpg,.jpeg,.csv,.xls,.xlsx"
                acceptedExtensions={['pdf', 'txt', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx']}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle>Company Policy Context</CardTitle>
                    {companyVectorstore?.exists && (
                      <Badge 
                        variant="default" 
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="badge-company-vectorstore-ready"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Vectorstore Ready
                      </Badge>
                    )}
                  </div>
                  {companyVectorstore?.exists && (
                    <CardDescription className="mt-2">
                      <span className="text-xs">
                        📁 Path: <code className="bg-muted px-1 py-0.5 rounded">{companyVectorstore.path}</code>
                      </span>
                    </CardDescription>
                  )}
                </div>
                {companyVectorstore?.exists && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteVectorstore.mutate("company")}
                    disabled={deleteVectorstore.isPending}
                    data-testid="button-delete-company-vectorstore"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ContextFileUpload
                title="Company Policy Context"
                description="Upload company policies, guidelines, and compliance documents (unlimited)"
                files={companyPolicyFiles}
                onRemoveFile={handleCompanyPolicyRemove}
                onUpload={handleCompanyPolicyUpload}
                testId="policy"
                acceptedFileTypes=".pdf,.txt,.jpg,.jpeg,.csv,.xls,.xlsx"
                acceptedExtensions={['pdf', 'txt', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx']}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
