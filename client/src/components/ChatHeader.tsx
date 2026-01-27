import { Settings, LogOut, User, Moon, Sun, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "./ThemeProvider";
import logo from "@/assets/kpmg (1).png"

interface ChatHeaderProps {
  onSettingsClick: () => void;
  onLogout: () => void;
  onClearChat: () => void;
  hasMessages: boolean;
}

export default function ChatHeader({
  onSettingsClick,
  onLogout,
  onClearChat,
  hasMessages,
}: ChatHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="relative h-16 border-b bg-gradient-to-r from-[#654ea3]/30 via-[#7b68b8]/20 to-[#eaafc8]/30 backdrop-blur-sm flex items-center px-6">
  
        {/* Left: Logo */}
         <div className="flex items-center z-10">
            <img
              src={logo}
              alt="KPMG logo"
              className="max-h-12 w-auto object-contain brightness-110"
            />
          </div>

        {/* Center: Title */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <span className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            AI Risk Assessment Agent
          </span>
        </div>
      
      <div className="flex items-center gap-2 ml-auto z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearChat}
          disabled={!hasMessages}
          data-testid="button-clear-chat"
          className="hover-elevate"
        >
          <Trash2 className="h-5 w-5" />
        </Button>

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

        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          data-testid="button-settings"
        >
          <Settings className="h-5 w-5" />
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
            <DropdownMenuItem onClick={onLogout} data-testid="button-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
