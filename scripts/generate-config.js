// Generates public/config.js from the SPOTIFY_CLIENT_ID environment variable,
// for local (non-Docker) development. Runs automatically before `npm start`.
const fs = require('fs');
const path = require('path');

const clientId = process.env.SPOTIFY_CLIENT_ID;
if (!clientId) {
    console.error(
        'SPOTIFY_CLIENT_ID environment variable is not set.\n' +
        'Set it before running npm start, e.g.: SPOTIFY_CLIENT_ID=your_client_id npm start\n' +
        'See README.md for details.'
    );
    process.exit(1);
}

const outPath = path.join(__dirname, '..', 'public', 'config.js');
fs.writeFileSync(outPath, `window.SPOTIFY_CLIENT_ID = ${JSON.stringify(clientId)};\n`);
console.log(`Wrote ${outPath}`);
