import { startCLI } from "./cli/cli.js";

startCLI().catch((error: Error) => {
  console.error(" Error: ", error.message);
  process.exit(1);
});
