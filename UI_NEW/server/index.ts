import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

if (process.env.NODE_ENV === "development") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(process.cwd(), "dist/public");
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
