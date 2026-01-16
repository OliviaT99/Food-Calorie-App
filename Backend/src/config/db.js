import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('Missing DATABASE_URL environment variable. Set it in a .env file or export it in your shell.');
    process.exit(1);
}

const pgAdapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
    adapter: pgAdapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
});

const connectDB = async() => {
    try{
        await prisma.$connect();
        console.log("Database connected via Prisma");
    }
    catch(err){
        console.error("Error connecting to database:", err);
        process.exit(1);
    };
};

const disconnectDB = async() => {
    await prisma.$disconnect();
}

export { prisma, connectDB, disconnectDB };

