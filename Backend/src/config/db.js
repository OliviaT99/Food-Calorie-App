import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('Missing DATABASE_URL environment variable.');
    process.exit(1);
}

const prisma = new PrismaClient({
    log: ['error', 'warn'],
});

const connectDB = async() => {
    try{
        console.log("Attempting to connect to Neon database...");
        
        // Add a 10 second timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database connection timeout after 10 seconds')), 10000)
        );
        
        await Promise.race([prisma.$connect(), timeoutPromise]);
        
        console.log("✓ Database connected successfully via Prisma");
    }
    catch(err){
        console.error("✗ Error connecting to database:");
        console.error("Message:", err.message);
        console.error("Full error:", err);
        process.exit(1);
    };
};

const disconnectDB = async() => {
    await prisma.$disconnect();
}

export { prisma, connectDB, disconnectDB };