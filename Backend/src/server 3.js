import express from "express";
import { config } from "dotenv";
import { connectDB, disconnectDB } from "./config/db.js";
import analysisRoutes from './routes/analysisRoutes.js';

config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/analysis', analysisRoutes);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const port = 5001;

const startServer = async () => {
  try {
    await connectDB();
    console.log("✓ Database connected");
    
    app.listen(port, () => {
      console.log(`✓ Server running on http://localhost:${port}`);
    });

  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
};

startServer();
