import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ChatHeader from "@/components/ChatHeader";
import ContextFileUpload from "@/components/ContextFileUpload";

const LLM_MODELS = [
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { value: "claude-3", label: "Claude 3" },
  { value: "llama-2", label: "Llama 2" },
];

export default function Settings() {
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("llm-model") || "gpt-4";
  });
  const [generalFiles, setGeneralFiles] = useState<File[]>([]);
  const [policyFiles, setPolicyFiles] = useState<File[]>([]);

  useEffect(() => {
    localStorage.setItem("llm-model", selectedModel);
  }, [selectedModel]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#654ea3]/10 to-[#eaafc8]/10">
      <ChatHeader />
      
      <div className="flex-1 overflow-auto">
        <div className="container max-w-4xl mx-auto p-6 space-y-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>

          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">LLM Model</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Select the language model to use for processing
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="model-select">Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger id="model-select" data-testid="select-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ContextFileUpload
              title="General Context"
              description="Upload files for general knowledge and context"
              files={generalFiles}
              onFilesChange={setGeneralFiles}
              testId="general"
            />

            <ContextFileUpload
              title="Company Policy Context"
              description="Upload company policies, guidelines, and regulatory documents"
              files={policyFiles}
              onFilesChange={setPolicyFiles}
              testId="policy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
