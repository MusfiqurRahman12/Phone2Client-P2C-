// scripts/import-number.js
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from apps/api/.env
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const prisma = new PrismaClient();

async function main() {
  const number = "+12136190050";
  console.log('Connecting to database...');

  // 1. Get first workspace
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    console.error("❌ No workspaces found in the database. Please sign up on the web app (http://localhost:5173/register) first to create your account and workspace!");
    process.exit(1);
  }
  console.log(`Found active workspace: "${workspace.name}" (${workspace.id})`);

  // 2. Check if number already registered
  const existing = await prisma.phoneNumber.findFirst({
    where: { number }
  });
  if (existing) {
    console.log(`⚠️ Number ${number} is already registered in workspace: ${existing.workspaceId}`);
    return;
  }

  // 3. Create PhoneNumber record in Prisma
  const record = await prisma.phoneNumber.create({
    data: {
      workspaceId: workspace.id,
      number: number,
      friendlyName: "Telnyx Line (LA)",
      type: "LOCAL",
      status: "ACTIVE",
      countryCode: "US",
      areaCode: "213",
      capabilities: { sms: true, voice: true },
      provider: "TELNYX",
    }
  });

  console.log(`\n✅ Successfully imported your number to the database!`);
  console.log(`- Number: ${record.number}`);
  console.log(`- Workspace Name: ${workspace.name}`);
  console.log(`- Friendly Name: ${record.friendlyName}`);
}

main()
  .catch((e) => {
    console.error("Error importing number:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
