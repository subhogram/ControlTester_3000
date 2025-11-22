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
    <header className="h-16 border-b bg-gradient-to-r from-[#654ea3]/30 via-[#7b68b8]/20 to-[#eaafc8]/30 backdrop-blur-sm flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Agent-Assess
        </span>
      </div>

      <div className="flex items-center gap-2">
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
