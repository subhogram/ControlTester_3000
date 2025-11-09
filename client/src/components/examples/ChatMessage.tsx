import ChatMessage from "../ChatMessage";

export default function ChatMessageExample() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      <ChatMessage
        role="user"
        content="Hello! Can you help me analyze this data?"
        timestamp="2:30 PM"
      />
      <ChatMessage
        role="assistant"
        content="Of course! I'd be happy to help you analyze the data. Please share the file or data you'd like me to look at, and let me know what specific insights you're looking for."
        timestamp="2:30 PM"
      />
    </div>
  );
}
