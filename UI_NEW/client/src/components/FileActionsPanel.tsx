import { useState } from "react";
import { Zap, FileSearch, FileText, X, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProcessStage = "idle" | "validating" | "assessing" | "generating" | "complete";

interface FileActionsPanelProps {
  fileCount: number;
  onTodAction: () => void;
  onToeAction: () => void;
}

export default function FileActionsPanel({
  fileCount,
  onTodAction,
  onToeAction,
}: FileActionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [todStage, setTodStage] = useState<ProcessStage>("idle");
  const [toeStage, setToeStage] = useState<ProcessStage>("idle");

  const handleTodAction = async () => {
    setIsExpanded(true);
    
    setTodStage("validating");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setTodStage("assessing");
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    setTodStage("generating");
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    setTodStage("complete");
    onTodAction();
    
    const blob = new Blob(["TOD Report Generated\n\nThis is a sample TOD report."], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TOD_Report_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    setTimeout(() => {
      setTodStage("idle");
    }, 2000);
  };

  const handleToeAction = async () => {
    setIsExpanded(true);
    
    setToeStage("validating");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setToeStage("assessing");
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    setToeStage("generating");
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    setToeStage("complete");
    onToeAction();
    
    const blob = new Blob(["TOE Report Generated\n\nThis is a sample TOE report."], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TOE_Report_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    setTimeout(() => {
      setToeStage("idle");
    }, 2000);
  };

  const getStageText = (stage: ProcessStage, type: "TOD" | "TOE") => {
    switch (stage) {
      case "validating":
        return "Validating files...";
      case "assessing":
        return "Assessing data...";
      case "generating":
        return `Generating ${type} report...`;
      case "complete":
        return "Report generated!";
      default:
        return "";
    }
  };

  const isProcessing = todStage !== "idle" || toeStage !== "idle";
  const activeStage = todStage !== "idle" ? todStage : toeStage;
  const activeType = todStage !== "idle" ? "TOD" : "TOE";

  if (fileCount === 0) return null;

  return (
    <div className="fixed bottom-24 right-8 z-50">
      <div
        className={cn(
          "absolute bottom-20 right-0 w-80 bg-card border rounded-2xl shadow-2xl",
          "transition-all duration-300 ease-out origin-bottom-right",
          "overflow-hidden",
          isExpanded
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-75 translate-y-4 pointer-events-none"
        )}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">File Actions</h3>
              <p className="text-xs text-muted-foreground">
                {fileCount} file{fileCount > 1 ? "s" : ""} uploaded
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              data-testid="button-close-fab"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {isProcessing && (
            <div className="p-4 rounded-xl border bg-primary/5">
              <div className="flex items-center gap-3">
                {activeStage !== "complete" ? (
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                ) : (
                  <Download className="h-6 w-6 text-green-500" />
                )}
                <div>
                  <h4 className="font-semibold">{getStageText(activeStage, activeType)}</h4>
                  {activeStage === "complete" && (
                    <p className="text-xs text-muted-foreground">
                      Download started
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isProcessing && (
            <button
              onClick={handleTodAction}
              className="w-full text-left p-4 rounded-xl border bg-background/50 hover-elevate transition-all"
              data-testid="button-tod-action"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileSearch className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold mb-1">TOD Action</h4>
                  <p className="text-xs text-muted-foreground">
                    Table of Data extraction - Analyzes and structures data
                  </p>
                </div>
              </div>
            </button>
          )}

          {!isProcessing && (
            <button
              onClick={handleToeAction}
              className="w-full text-left p-4 rounded-xl border bg-background/50 hover-elevate transition-all"
              data-testid="button-toe-action"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold mb-1">TOE Action</h4>
                  <p className="text-xs text-muted-foreground">
                    Table of Evidence extraction - Extracts key evidence
                  </p>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          if (isExpanded) {
            setIsExpanded(false);
          } else if (!isProcessing) {
            setIsExpanded(true);
          }
        }}
        className={cn(
          "h-16 w-16 rounded-full shadow-2xl",
          "flex items-center justify-center",
          "bg-gradient-to-br from-primary to-primary/80",
          "border-2 border-primary/20",
          "relative overflow-hidden",
          !isProcessing && "hover:scale-110 active:scale-95 transition-transform duration-200"
        )}
        data-testid="button-fab-toggle"
      >
        <div className="relative w-7 h-7 flex items-center justify-center">
          <Zap 
            className={cn(
              "absolute text-primary-foreground transition-all duration-300",
              !isProcessing && activeStage !== "complete" ? "opacity-100 scale-100" : "opacity-0 scale-50"
            )} 
          />
          
          <Loader2 
            className={cn(
              "absolute text-primary-foreground transition-opacity duration-300",
              isProcessing && activeStage !== "complete" ? "opacity-100 animate-spin" : "opacity-0"
            )} 
          />
          
          <Download 
            className={cn(
              "absolute text-primary-foreground transition-all duration-300",
              activeStage === "complete" ? "opacity-100 scale-100" : "opacity-0 scale-50"
            )} 
          />
        </div>
      </button>

      {fileCount > 0 && !isProcessing && (
        <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center shadow-lg">
          {fileCount}
        </div>
      )}
    </div>
  );
}
