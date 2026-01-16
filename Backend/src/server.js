import express from "express";
import {config} from "dotenv";
import { connectDB, disconnectDB } from "./config/db.js"; 

// Importing routes
import mealRoutes from "./routes/mealRoutes.js";
import authRoutes from "./routes/authRoutes.js"; 


config();
connectDB();

const app = express();

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use(express.json());
app.use('/meals', mealRoutes);
app.use('/auth', authRoutes);


const port = 5001;
const server = app.listen(port, () => {
    console.log(`Server is running on PORT ${port}`);
});

// Handle unhandled promise rejections (e.g. lost db connection)
process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Rejection: ${err?.message || err}`);
    server.close(async () => {
        await disconnectDB();
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', async(err) => {
    console.error(`Uncaught Exception: ${err.message}`);
    await disconnectDB();
    process.exit(1);
}); 

// Graceful shutdown on SIGTERM and SIGINT
process.on('SIGTERM', async() => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close( async() => {  
        await disconnectDB();   
        process.exit(0);
    }); 
});

process.on('SIGINT', async() => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close( async() => {  
        await disconnectDB();   
        process.exit(0);
    }); 
});





// HTTP methods: GET(request data), POST(create data), PUT(update data), DELETE(remove data)
// http://localhost:5001/

// Routing:
// Auth - singnup, login, logout
// Upload images 
// Upload audio
// User profile 