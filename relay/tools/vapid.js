// Prints a fresh VAPID key pair. Run once:  node relay/tools/vapid.js
//  - publicKey  -> relay/wrangler.toml [vars] VAPID_PUBLIC_KEY, and relay.config.js in the app
//  - privateKey -> `npx wrangler secret put VAPID_PRIVATE_KEY` (paste when prompted)
import { generateVapidKeys } from '../src/webpush.js';

const keys = await generateVapidKeys();
console.log('VAPID public key  (wrangler.toml + relay.config.js):\n  ' + keys.publicKey);
console.log('\nVAPID private key (wrangler secret put VAPID_PRIVATE_KEY — keep it secret):\n  ' + keys.privateKey);
