// prisma/seed.js
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL environment variable. Set it in .env or export it before running this script.');
  process.exit(1);
}

const pgAdapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter: pgAdapter });

async function main() {
  console.log("Seeding database...");

  // 1. Create users
  await prisma.user.createMany({
    data: [
      { name: "Alice", email: "alice@example.com", password: "password123" },
      { name: "Bob", email: "bob@example.com", password: "password123" },
      { name: "Charlie", email: "charlie@example.com", password: "password123" },
      { name: "Diana", email: "diana@example.com", password: "password123" },
    ],
    skipDuplicates: true,
  });

  const users = await prisma.user.findMany();

  // 2. Create meals and meal items for each user
  for (const user of users) {
    // Meal 1
    await prisma.meal.create({
      data: {
        userId: user.id,
        eatenAt: new Date(),
        totalCalories: 650,
        imageUrl: "https://example.com/images/meal1.jpg",
        audioUrl: "https://example.com/audio/meal1.mp3",
        transcript: "Chicken salad with apple and yogurt.",
        items: {
          create: [
            { name: "Chicken Salad", calories: 300, protein: 30, carbs: 10, fat: 20 },
            { name: "Apple", calories: 80, protein: 0, carbs: 20, fat: 0 },
            { name: "Yogurt", calories: 70, protein: 5, carbs: 10, fat: 2 },
          ],
        },
      },
    });

    // Meal 2
    await prisma.meal.create({
      data: {
        userId: user.id,
        eatenAt: new Date(),
        totalCalories: 500,
        imageUrl: "https://example.com/images/meal2.jpg",
        audioUrl: "https://example.com/audio/meal2.mp3",
        transcript: "Oatmeal with banana and peanut butter.",
        items: {
          create: [
            { name: "Oatmeal", calories: 200, protein: 5, carbs: 35, fat: 5 },
            { name: "Banana", calories: 100, protein: 1, carbs: 27, fat: 0 },
            { name: "Peanut Butter", calories: 200, protein: 8, carbs: 6, fat: 16 },
          ],
        },
      },
    });

    // Meal 3 (evening snack)
    await prisma.meal.create({
      data: {
        userId: user.id,
        eatenAt: new Date(),
        totalCalories: 350,
        imageUrl: "https://example.com/images/meal3.jpg",
        audioUrl: "https://example.com/audio/meal3.mp3",
        transcript: "Protein shake with a granola bar.",
        items: {
          create: [
            { name: "Protein Shake", calories: 150, protein: 25, carbs: 5, fat: 3 },
            { name: "Granola Bar", calories: 200, protein: 4, carbs: 30, fat: 8 },
          ],
        },
      },
    });
  }

  console.log("Seeding finished!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

