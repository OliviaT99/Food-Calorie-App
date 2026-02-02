import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { analyzeFood, getAnalysis, getUserAnalyses } from '../controllers/analysisController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, '..', 'uploads', 'images');

// Ensure upload directory exists
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  }
});

const router = express.Router();

// POST /api/analysis - Analyze food image
router.post('/', upload.single('image'), analyzeFood);

// GET /api/analysis/:id - Get single analysis
router.get('/:id', getAnalysis);

// GET /api/analysis/user/:userId - Get all analyses for user
router.get('/user/:userId', getUserAnalyses);

export default router;