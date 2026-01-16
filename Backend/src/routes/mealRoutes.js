import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createMeal } from '../controllers/mealController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, '..', 'uploads', 'images');
const audioDir = path.join(__dirname, '..', 'uploads', 'audio');

// ensure upload directories exist
for (const dir of [imagesDir, audioDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'image') cb(null, imagesDir);
    else if (file.fieldname === 'audio') cb(null, audioDir);
    else cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

const router = express.Router();

// Expect multipart form-data with optional files 'image' and 'audio'
router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), createMeal);

export default router;
