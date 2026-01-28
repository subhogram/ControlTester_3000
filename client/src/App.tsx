import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChatProvider } from "@/contexts/ChatContext";
import { EvidenceProvider } from "@/contexts/EvidenceContext";
import AppLayout from "@/components/AppLayout";
import ChatPage from "@/pages/chat";
import SettingsPage from "@/pages/settings";
import EvidenceAssessmentPage from "@/pages/evidence-assessment";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/evidence-assessment" component={EvidenceAssessmentPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <ChatProvider>
            <EvidenceProvider>
              <Toaster />
              <Router />
            </EvidenceProvider>
          </ChatProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
