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
        // Only include direct .jar links (ignore parent folders etc)
        if (!match[1].includes('/')) {
            links.push(match[1]);
        }
    }
    return links;
}

// Simple function to determine mod type by filename (very basic, can be improved!)
function getModType(filename) {
    filename = filename.toLowerCase();
    if (filename.includes('fabric')) return 'FabricMod';
    if (filename.includes('neoforge')) return 'NeoForgeMod';
    if (filename.includes('forge')) return 'ForgeMod';
    if (filename.includes('quilt')) return 'QuiltMod';
    return 'UnknownMod';
}

// Main build function
async function buildDistribution() {
    // 1. Load the template
    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

    // 2. Fetch directory listing from your mods URL
    console.log('Fetching mod listing...');
    const html = await fetchHTML(MODS_URL);

    // 3. Parse all mod .jar files
    const modFiles = parseModLinks(html);

    // 4. Build the modules array
    const modules = modFiles.map(filename => ({
        id: filename,
        name: filename,
        type: getModType(filename),
        artifact: {
            url: `${MODS_URL}${encodeURIComponent(filename)}`
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
