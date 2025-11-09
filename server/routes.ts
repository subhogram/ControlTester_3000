import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";

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

  // Check if vectorstore exists
  app.get("/api/vectorstore/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const folderName = type === "global" ? "global_kb_vectorstore" : "company_kb_vectorstore";
      const vectorstorePath = path.join(process.cwd(), folderName);
      
      const exists = fs.existsSync(vectorstorePath);
      
      if (exists) {
        const stats = fs.statSync(vectorstorePath);
        return res.json({
          exists: true,
          path: folderName,
          created: stats.birthtime,
        });
      } else {
        return res.json({ exists: false });
      }
    } catch (error) {
      console.error("Error checking vectorstore:", error);
      return res.status(500).json({ error: "Failed to check vectorstore" });
    }
  });

  // Delete vectorstore
  app.delete("/api/vectorstore/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const folderName = type === "global" ? "global_kb_vectorstore" : "company_kb_vectorstore";
      const vectorstorePath = path.join(process.cwd(), folderName);
      
      if (fs.existsSync(vectorstorePath)) {
        fs.rmSync(vectorstorePath, { recursive: true, force: true });
        return res.json({ success: true, message: "Vectorstore deleted successfully" });
      } else {
        return res.status(404).json({ error: "Vectorstore not found" });
      }
    } catch (error) {
      console.error("Error deleting vectorstore:", error);
      return res.status(500).json({ error: "Failed to delete vectorstore" });
    }
  });

  // Save vectorstore to disk
  app.post("/api/vectorstore/save/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const folderName = type === "global" ? "global_kb_vectorstore" : "company_kb_vectorstore";

      // Call external API to save the vectorstore using FormData
      const formData = new URLSearchParams();
      formData.append("dir_path", folderName);
      formData.append("kb_type", type);

      const response = await fetch(`http://localhost:8000/save-vectorstore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save vectorstore: ${errorText}`);
      }

      const result = await response.json();
      return res.json({ success: true, path: folderName, ...result });
    } catch (error) {
      console.error("Error saving vectorstore:", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save vectorstore" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
