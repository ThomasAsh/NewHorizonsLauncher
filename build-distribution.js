const fs = require('fs');
const path = require('path');
const https = require('https');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/'; // Adjust if your mod listing URL is different

function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Extract .jar links from a simple Apache/nginx directory listing HTML
function parseModLinks(html) {
    const regex = /href="([^"]+\.jar)"/g;
    const links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!match[1].includes('/')) {
            links.push(match[1]);
        }
    }
    return links;
}

function getModType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('neoforge')) return 'NeoForgeMod';
    if (lower.includes('fabric')) return 'FabricMod';
    // Failsafe: default to NeoForgeMod but warn user
    console.warn(`WARNING: Could not detect mod type for ${filename}, defaulting to NeoForgeMod.`);
    return 'NeoForgeMod';
}

async function buildDistribution() {
    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

    console.log('Fetching mod listing...');
    const html = await fetchHTML(MODS_URL);

    const modFiles = parseModLinks(html);

    const modules = modFiles.map(filename => ({
        id: filename,
        name: filename,
        type: getModType(filename),
        artifact: {
            url: `${MODS_URL}${encodeURIComponent(filename)}`
        }
    }));

    template.servers[0].modules = modules;

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
    console.log(`Done! Wrote ${OUTPUT_PATH} with ${modules.length} mods.`);
}

buildDistribution().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
