import { Link } from "wouter";
import { Sparkles, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ThemeToggle from "./ThemeToggle";

export default function ChatHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-gradient-to-r from-[#654ea3] to-[#eaafc8] backdrop-blur supports-[backdrop-filter]:bg-gradient-to-r supports-[backdrop-filter]:from-[#654ea3]/90 supports-[backdrop-filter]:to-[#eaafc8]/90">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer hover-elevate active-elevate-2 px-3 py-2 rounded-md">
            <Sparkles className="h-6 w-6 text-white" />
            <h1 className="text-xl font-bold text-white">Assess-AI</h1>
          </div>
        </Link>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-profile">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-white/20 text-white border border-white/30">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </Button>
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-settings">
              <Settings className="h-5 w-5 text-white" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
