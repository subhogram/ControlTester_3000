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

  // Check if vectorstore exists by attempting to load it
  app.get("/api/vectorstore/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const { model_name } = req.query;
      
      const folderName = type === "global" ? "global_kb_vectorstore" : "company_kb_vectorstore";
      const vectorstorePath = path.join(process.cwd(), folderName);
      
      // Check if folder exists on disk
      if (!fs.existsSync(vectorstorePath)) {
        return res.json({ exists: false, path: folderName, vector_count: 0 });
      }

      // If model_name is provided, try to load the vectorstore
      if (model_name) {
        try {
          const FormData = (await import("form-data")).default;
          const formData = new FormData();
          formData.append("dir_path", folderName);
          formData.append("kb_type", type);
          formData.append("model_name", model_name as string);

          const response = await fetch(`http://localhost:8000/load-vectorstore`, {
            method: "POST",
            body: formData as any,
          });

          if (response.ok) {
            const data = await response.json();
            if (data?.success) {
              const stats = fs.statSync(vectorstorePath);
              return res.json({
                exists: true,
                path: folderName,
                vector_count: data.ntotal ?? data.vector_count ?? 0,
                last_modified: stats.mtime.toISOString(),
              });
            }
          }
        } catch (loadError) {
          console.warn("Failed to load vectorstore, but it exists on disk:", loadError);
        }
      }

      // Fallback: just return that it exists
      const stats = fs.statSync(vectorstorePath);
      return res.json({
        exists: true,
        path: folderName,
        vector_count: 0,
        last_modified: stats.mtime.toISOString(),
      });
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
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("dir_path", folderName);
      formData.append("kb_type", type);

      const response = await fetch(`http://localhost:8000/save-vectorstore`, {
        method: "POST",
        body: formData as any,
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

  // Load vectorstore from disk into memory
  app.post("/api/vectorstore/load/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const { model_name } = req.body;
      
      if (!model_name) {
        return res.status(400).json({ error: "model_name is required" });
      }

      const folderName = type === "global" ? "global_kb_vectorstore" : "company_kb_vectorstore";
      const vectorstorePath = path.join(process.cwd(), folderName);

      // Check if vectorstore exists on disk
      if (!fs.existsSync(vectorstorePath)) {
        return res.status(404).json({ error: "Vectorstore not found on disk" });
      }

      // Call external API to load the vectorstore using FormData
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("dir_path", folderName);
      formData.append("kb_type", type);
      formData.append("model_name", model_name);

      const response = await fetch(`http://localhost:8000/load-vectorstore`, {
        method: "POST",
        body: formData as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load vectorstore: ${errorText}`);
      }

      const result = await response.json();
      return res.json({ success: true, path: folderName, ...result });
    } catch (error) {
      console.error("Error loading vectorstore:", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load vectorstore" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
