#!/usr/bin/env tsx
import "dotenv/config";
import { ingestAllCurriculum } from "./curriculum.js";

async function main() {
  console.log("Starting curriculum ingestion...");
  const results = await ingestAllCurriculum();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
