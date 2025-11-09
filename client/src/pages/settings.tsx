import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
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

interface ContextFile {
  id: string;
  filename: string;
  uploadedAt: string;
}

const models = [
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { value: "claude-3-opus", label: "Claude 3 Opus" },
  { value: "claude-3-sonnet", label: "Claude 3 Sonnet" },
];

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const [generalContextFiles, setGeneralContextFiles] = useState<ContextFile[]>([]);
  const [companyPolicyFiles, setCompanyPolicyFiles] = useState<ContextFile[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("selectedModel") || "gpt-4";
  });

  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  const handleGeneralContextUpload = (files: File[]) => {
    const newFiles = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      filename: file.name,
      uploadedAt: "Just now",
    }));
    setGeneralContextFiles((prev) => [...prev, ...newFiles]);
  };

  const handleGeneralContextRemove = (id: string) => {
    setGeneralContextFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleCompanyPolicyUpload = (files: File[]) => {
    const newFiles = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      filename: file.name,
      uploadedAt: "Just now",
    }));
    setCompanyPolicyFiles((prev) => [...prev, ...newFiles]);
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
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full max-w-sm" data-testid="select-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ContextFileUpload
                title="General Context"
                description="Upload general reference documents and knowledge base files"
                files={generalContextFiles}
                onRemoveFile={handleGeneralContextRemove}
                onUpload={handleGeneralContextUpload}
                testId="general"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ContextFileUpload
                title="Company Policy Context"
                description="Upload company policies, guidelines, and compliance documents"
                files={companyPolicyFiles}
                onRemoveFile={handleCompanyPolicyRemove}
                onUpload={handleCompanyPolicyUpload}
                testId="policy"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
