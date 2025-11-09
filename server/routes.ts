import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

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
          const formData = new URLSearchParams();
          formData.append("dir_path", folderName);
          formData.append("kb_type", type);
          formData.append("model_name", model_name as string);

          const response = await fetch(`http://localhost:8000/load-vectorstore`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
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


  // Save vectorstore to disk
  app.post("/api/vectorstore/save/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const folderName = type === "global" ? "global_kb_vectorstore" : "company_kb_vectorstore";

      // Call external API to save the vectorstore using URLSearchParams
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

      // Call external API to load the vectorstore using URLSearchParams
      const formData = new URLSearchParams();
      formData.append("dir_path", folderName);
      formData.append("kb_type", type);
      formData.append("model_name", model_name);

      const response = await fetch(`http://localhost:8000/load-vectorstore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
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

  // Upload files for chat and build chat-attachment vectorstore
  app.post("/api/chat/upload", upload.array("files"), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { selected_model, kb_type = "chat" } = req.body;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      if (!selected_model) {
        return res.status(400).json({ error: "selected_model is required" });
      }

      // Create chat-attachment directory
      const chatAttachmentDir = path.join(process.cwd(), "chat_attachments");
      if (!fs.existsSync(chatAttachmentDir)) {
        fs.mkdirSync(chatAttachmentDir, { recursive: true });
      }

      // Save uploaded files
      const savedFiles = files.map(file => {
        const filePath = path.join(chatAttachmentDir, file.originalname);
        fs.writeFileSync(filePath, file.buffer);
        return file.originalname;
      });

      // Call external API to build knowledge base using FormData (multipart)
      const formData = new FormData();
      
      // Re-attach files from memory
      files.forEach(file => {
        const blob = new Blob([file.buffer], { type: file.mimetype });
        formData.append("files", blob, file.originalname);
      });
      
      formData.append("selected_model", selected_model);
      formData.append("kb_type", kb_type);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");

      const response = await fetch(`http://localhost:8000/build-knowledge-base`, {
        method: "POST",
        body: formData as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to build knowledge base: ${errorText}`);
      }

      const result = await response.json();
      
      return res.json({
        success: true,
        files: savedFiles,
        vectorstore_path: "chat_attachment_vectorstore",
        ...result,
      });
    } catch (error) {
      console.error("Error uploading chat files:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload files",
      });
    }
  });

  // Chat endpoint - proxy to external API
  app.post("/api/chat", async (req, res) => {
    try {
      const { user_input, selected_model, has_attachments } = req.body;
      
      if (!user_input) {
        return res.status(400).json({ error: "user_input is required" });
      }
      
      if (!selected_model) {
        return res.status(400).json({ error: "selected_model is required" });
      }

      // Build request payload matching Python backend ChatRequest
      const payload: any = {
        selected_model,
        user_input,
        global_kb_path: "saved_global_vectorstore",
        company_kb_path: "saved_company_vectorstore",
      };
      
      // If there are chat attachments, include the path
      if (has_attachments) {
        payload.chat_kb_path = "chat_attachment_vectorstore";
      }

      const response = await fetch(`http://localhost:8000/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat API error: ${errorText}`);
      }

      const result = await response.json();
      return res.json(result);
    } catch (error) {
      console.error("Error in chat:", error);
      return res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get chat response",
        fallback: true 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
