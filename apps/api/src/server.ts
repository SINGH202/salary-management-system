import { createApp } from './app.js';
import { ensureDbReady } from './db/client.js';

const port = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await ensureDbReady();
  const app = await createApp();
  app.listen(port, () => {
    console.log(`@acme/api listening on :${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
