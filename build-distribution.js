const fs = require('fs');
const path = require('path');
const https = require('https');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/'; // Your remote mods directory

function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Check if a filename is already percent-encoded
function isEncoded(str) {
    // Looks for at least one % followed by two hex chars (e.g., %20, %2B)
    return /%[0-9A-Fa-f]{2}/.test(str);
}

// Extract .jar links from Apache/nginx directory listing HTML
function parseModLinks(html) {
    const regex = /href="([^"]+\.jar)"/g;
    const links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        // Only include direct .jar links (ignore parent folders etc)
        const file = match[1];
        if (!file.includes('/')) {
            links.push(file);
        }
    }
    return links;
}

// Determine mod type by filename (very basic; can be improved)
function getModType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes('fabric')) return 'FabricMod';
    if (lower.includes('neoforge')) return 'NeoForgeMod';
    if (lower.includes('forge')) return 'ForgeMod';
    if (lower.includes('quilt')) return 'QuiltMod';
    return 'UnknownMod';
}

async function buildDistribution() {
    // 1. Load the template
    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

    // 2. Fetch remote mod directory HTML
    console.log('Fetching mod listing...');
    const html = await fetchHTML(MODS_URL);

    // 3. Parse all .jar mod files
    const modFiles = parseModLinks(html);

    // 4. Build modules array with correct URL encoding
    const modules = modFiles.map(filename => ({
        id: filename,
        name: filename,
        type: getModType(filename),
        artifact: {
            url: `${MODS_URL}${isEncoded(filename) ? filename : encodeURIComponent(filename)}`
        }
    }));

    // 5. Inject modules into template
    if (!template.servers || !template.servers[0]) {
        throw new Error('Template is missing servers array or servers[0].');
    }
    template.servers[0].modules = modules;

    // 6. Write updated distribution.json
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
    console.log(`Done! Wrote ${OUTPUT_PATH} with ${modules.length} mods.`);
}

// Run the builder
buildDistribution().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
