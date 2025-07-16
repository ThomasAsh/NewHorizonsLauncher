const fs = require('fs');
const path = require('path');
const https = require('https');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/';

// Fetches HTML from the remote mods directory
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Parses .jar links from directory listing HTML
function parseModLinks(html) {
    const regex = /href="([^"]+\.jar)"/g;
    const links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        // Only include direct .jar links (ignore parent folders etc)
        if (!match[1].includes('/')) {
            links.push(match[1]);
        }
    }
    return links;
}

// Detects mod type by filename
function getModType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('fabric')) return 'FabricMod';
    if (lower.includes('neoforge')) return 'NeoForgeMod';
    if (lower.includes('forge')) return 'ForgeMod';
    if (lower.includes('quilt')) return 'QuiltMod';
    return 'UnknownMod';
}

// Main builder
async function buildDistribution() {
    // 1. Load the template
    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

    // 2. Fetch remote directory listing
    console.log('Fetching mod listing...');
    const html = await fetchHTML(MODS_URL);

    // 3. Parse mod .jar files
    const modFiles = parseModLinks(html);

    // 4. Build modules, encoding names ONCE ONLY
    const modules = modFiles.map(filename => {
        // Always decode and then encode to guarantee single-encoding
        let decoded = filename;
        try {
            decoded = decodeURIComponent(filename);
        } catch { /* ignore */ }

        return {
            id: decoded,
            name: decoded,
            type: getModType(decoded),
            artifact: {
                url: `${MODS_URL}${encodeURIComponent(decoded)}`
            }
        };
    });

    // 5. Merge into template
    template.servers[0].modules = modules;

    // 6. Write output
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
    console.log(`Done! Wrote ${OUTPUT_PATH} with ${modules.length} mods.`);
}

// Run builder
buildDistribution().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
