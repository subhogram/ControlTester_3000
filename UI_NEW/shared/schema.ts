import { z } from "zod";

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  files: z.array(z.any()).optional(),
});

export type Message = z.infer<typeof messageSchema>;
