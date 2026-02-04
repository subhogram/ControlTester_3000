import ChatMessages from "../ChatMessages";

export default function ChatMessagesExample() {
  const messages = [
    {
      id: "1",
      role: "user" as const,
      content: "Hello! Can you help me with data analysis?",
      timestamp: "2:30 PM",
    },
    {
      id: "2",
      role: "assistant" as const,
      content:
        "Of course! I'd be happy to help with your data analysis. What kind of data are you working with?",
      timestamp: "2:30 PM",
    },
    {
      id: "3",
      role: "user" as const,
      content: "I have sales data from the last quarter that needs analysis.",
      timestamp: "2:31 PM",
    },
  ];

  return <ChatMessages messages={messages} />;
}
