import ChatHeader from "../ChatHeader";

export default function ChatHeaderExample() {
  return (
    <ChatHeader
      selectedModel="gpt-4"
      onModelChange={(model) => console.log("Model changed to:", model)}
      onSettingsClick={() => console.log("Settings clicked")}
      onLogout={() => console.log("Logout clicked")}
    />
  );
}
