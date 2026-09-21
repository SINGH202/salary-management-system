import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

// Placeholder listen — Express wiring arrives in the plumbing commit.
console.log(`@acme/api scaffold ready (port ${port}, app.ready=${app.ready})`);
