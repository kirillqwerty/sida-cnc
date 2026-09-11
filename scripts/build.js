// Optional deployment copy. HTML is authored directly in public/.
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../public/', import.meta.url));
const destination = fileURLToPath(new URL('../dist/', import.meta.url));
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log('Copied public/ to dist/ without generating or changing HTML.');
