import "dotenv/config";
import { PrismaClient } from "@prisma/client";

console.log("1. Starting test...");
console.log("2. DATABASE_URL exists:", !!process.env.DATABASE_URL);

const prisma = new PrismaClient({ log: ['error'] });

console.log("3. PrismaClient created");

const test = async () => {
  console.log("4. Attempting connection...");
  
  try {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout!')), 5000)
    );
    
    await Promise.race([prisma.$connect(), timeout]);
    console.log("5. ✓ Connected!");
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.log("5. ✗ Failed:", err.message);
    process.exit(1);
  }
};

test();
