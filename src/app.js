import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPhotos, insertPhoto, deletePhoto } from './db.js';
import { uploadImage, deleteImage, imageUrl } from './s3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per image
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Health check for the ALB target group. Stays independent of the database
  // so a transient DB issue does not fail the task's health check.
  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

  app.get("/api/photos", async (req, res) => {
    try {
      const photos = await listPhotos();
      res.json(
        photos.map((p) => ({
          id: p.id,
          description: p.description,
          url: imageUrl(p.s3_key),
          createdAt: p.created_at,
        })),
      );
    } catch (err) {
      console.error("Failed to list photos:", err.message);
      res.status(500).json({ error: "Failed to load photos" });
    }
  });

  app.post("/api/photos", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "An image file is required" });
      }
      const description = (req.body.description || "").toString().slice(0, 500);
      const rawExt = (
        req.file.originalname.split(".").pop() || "jpg"
      ).toLowerCase();
      const ext = rawExt.replace(/[^a-z0-9]/g, "") || "jpg";
      const id = randomUUID();
      const key = `photos/${id}.${ext}`;

      await uploadImage(key, req.file.buffer, req.file.mimetype);
      await insertPhoto({
        id,
        description,
        s3Key: key,
        contentType: req.file.mimetype,
      });

      res.status(201).json({ id, description, url: imageUrl(key) });
    } catch (err) {
      console.error("Upload failed:", err.message);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.delete("/api/photos/:id", async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "Invalid photo id" });
    }
    try {
      const key = await deletePhoto(id);
      if (!key) {
        return res.status(404).json({ error: "Photo not found" });
      }
      // The row is already gone, so a failed S3 delete only leaves an orphaned
      // object behind; the photo still disappears from the gallery.
      try {
        await deleteImage(key);
      } catch (err) {
        console.error(`Failed to delete S3 object ${key}:`, err.message);
      }
      res.status(204).end();
    } catch (err) {
      console.error("Delete failed:", err.message);
      res.status(500).json({ error: "Delete failed" });
    }
  });

  // Catch-all route to serve the frontend for any other requests (SPA behavior)
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}
