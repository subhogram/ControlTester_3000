import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/models", async (req, res) => {
    try {
      const response = await fetch("http://localhost:8000/models");
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      
      const transformedModels = data.models.map((model: string) => ({
        value: model,
        label: model
      }));
      
      res.json(transformedModels);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });



  const httpServer = createServer(app);

  return httpServer;
}
