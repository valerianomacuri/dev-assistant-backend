import { startCLI } from "./chat/cli.js";

startCLI().catch((error: Error) => {
  console.error(" Error: ", error.message);
  process.exit(1);
});
