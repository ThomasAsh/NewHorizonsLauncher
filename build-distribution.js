const fs = require('fs');
const https = require('https');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/';

// Utility: Check if filename is already encoded (contains any %XX sequence)
function isEncoded(filename) {
    return /%[0-9A-Fa-f]{2}/.test(filename);
}

function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Extract .jar links from a simple directory listing HTML
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

// Determine mod type by filename (expand as needed)
function getModType(filename) {
    const fn = filename.toLowerCase();
    if (fn.includes('fabric')) return 'FabricMod';
    if (fn.includes('neoforge')) return 'NeoForgeMod';
    if (fn.includes('forge')) return 'ForgeMod';
    if (fn.includes('quilt')) return 'QuiltMod';
    return 'UnknownMod';
}

async function buildDistribution() {
    // 1. Load the template
    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

    // 2. Fetch directory listing from your mods URL
    console.log('Fetching mod listing...');
    const html = await fetchHTML(MODS_URL);

    // 3. Parse all mod .jar files
    const modFiles = parseModLinks(html);

    // 4. Build the modules array, avoiding double encoding
    const modules = modFiles.map(filename => ({
        id: filename,
        name: filename,
        type: getModType(filename),
        artifact: {
            url: `${MODS_URL}${isEncoded(filename) ? filename : encodeURIComponent(filename)}`
        }
    }));

    // 5. Merge into template
    template.servers[0].modules = modules;

    // 6. Output final distribution.json
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
    console.log(`Done! Wrote ${OUTPUT_PATH} with ${modules.length} mods.`);
}

// Run the builder
buildDistribution().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
