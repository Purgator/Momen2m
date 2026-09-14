// Copy to relay.config.js (gitignored) to enable background reminders through
// your own relay (see relay/ and the README). Both values are public: the URL of
// your Worker and the VAPID public key printed by `node relay/tools/vapid.js`.
// Without this file the app works exactly the same, minus background reminders.
self.MOMEN2M_RELAY = {
  url: 'https://momen2m-relay.YOUR-SUBDOMAIN.workers.dev',
  publicKey: 'BExampleExampleExampleExampleExampleExampleExampleExampleExampleExampleExampleExample',
};
