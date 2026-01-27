import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
config({ path: join(__dirname, "..", ".env") });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in .env file");
  process.exit(1);
}

console.log("🔍 Testing database connection...");
console.log(`📋 Connection string: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`); // Hide password

const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw<Array<{ version: string; current_database: string }>>`
      SELECT version(), current_database()
    `;
    console.log("✅ Connection successful!");
    console.log(`📊 PostgreSQL version: ${result[0].version.split(" ")[0]} ${result[0].version.split(" ")[1]}`);
    console.log(`🗄️  Current database: ${result[0].current_database}`);
    await prisma.$disconnect();
  } catch (error: any) {
    console.error("❌ Connection failed:");
    if (error.code === "P1001" || error.message?.includes("authentication")) {
      console.error("   → Password authentication failed");
      console.error("   → Check your username and password in DATABASE_URL");
    } else if (error.code === "P1003" || error.message?.includes("does not exist")) {
      console.error("   → Database does not exist");
    } else if (error.code === "ECONNREFUSED" || error.message?.includes("connect")) { 
      console.error("   → Could not connect to server");
      console.error("   → Create the database in pgAdmin first");
      console.error("   → Make sure PostgreSQL is running");
    } else {
      console.error(`   → ${error.message}`);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
}

testConnection();
