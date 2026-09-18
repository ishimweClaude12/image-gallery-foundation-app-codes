import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPhotos, insertPhoto } from './db.js';
import { uploadImage, imageUrl } from './s3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per image
});

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health check for the ALB target group. Stays independent of the database
  // so a transient DB issue does not fail the task's health check.
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/api/photos', async (req, res) => {
    try {
      const photos = await listPhotos();
      res.json(
        photos.map((p) => ({
          id: p.id,
          description: p.description,
          url: imageUrl(p.s3_key),
          createdAt: p.created_at,
        }))
      );
    } catch (err) {
      console.error('Failed to list photos:', err.message);
      res.status(500).json({ error: 'Failed to load photos' });
    }
  });

  app.post('/api/photos', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'An image file is required' });
      }
      const description = (req.body.description || '').toString().slice(0, 500);
      const rawExt = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
      const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'jpg';
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
      console.error('Upload failed:', err.message);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  return app;
}
