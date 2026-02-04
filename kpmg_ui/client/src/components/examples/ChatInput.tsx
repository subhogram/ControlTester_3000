import ChatInput from "../ChatInput";

export default function ChatInputExample() {
  return (
    <ChatInput
      onSendMessage={(message) => console.log("Message sent:", message)}
      onFileSelect={(files) => console.log("Files selected:", files.map(f => f.name))}
    />
  );
}
