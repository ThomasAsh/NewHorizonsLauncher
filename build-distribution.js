const fs = require('fs');
const https = require('https');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/';

function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

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
    const name = filename.toLowerCase();
    if (name.includes('neoforge')) return 'NeoForgeMod';
    if (name.includes('fabric')) return 'FabricMod';
    return 'NeoForgeMod'; // Default to NeoForge if none matched explicitly
}

// Custom encoding function that encodes ONLY spaces
function encodeSpaces(filename) {
    return filename.replace(/ /g, '%20');
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
            url: `${MODS_URL}${encodeSpaces(filename)}`
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
