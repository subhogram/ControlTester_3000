import { useLocation } from "wouter";
import { MessageSquare, FileSearch, Settings, Moon, Sun, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "./ThemeProvider";
import logo from "@/assets/kpmg (1).png";

interface AppLayoutProps {
  children: React.ReactNode;
}

const tabs = [
  { path: "/", label: "Chat", icon: MessageSquare },
  { path: "/evidence-assessment", label: "Evidence Assessment", icon: FileSearch },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    console.log("Logout clicked");
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#654ea3]/20 via-[#8b6dbb]/10 to-[#eaafc8]/20">
      <header className="relative h-16 border-b bg-gradient-to-r from-[#654ea3]/30 via-[#7b68b8]/20 to-[#eaafc8]/30 backdrop-blur-sm flex items-center px-6">
        <div className="flex items-center z-10">
          <img
            src={logo}
            alt="KPMG logo"
            className="max-h-12 w-auto object-contain brightness-110"
          />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2">
          <span className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            AI Risk Assessment Agent
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                data-testid="button-user-menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <nav className="border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-1 px-6">
          {tabs.map((tab) => {
            const isActive = location === tab.path;
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => setLocation(tab.path)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
