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
    // Matches <a href="filename.jar">
    const regex = /href="([^"]+\.jar)"/g;
    const links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        // Ignore subfolders and parent links
        const filename = match[1];
        if (!filename.includes('/')) {
            links.push(decodeURIComponent(filename));
        }
    }
    return links;
}

function getModType(filename) {
    filename = filename.toLowerCase();
    if (filename.includes('fabric')) return 'FabricMod';
    if (filename.includes('neoforge')) return 'NeoForgeMod';
    if (filename.includes('forge')) return 'ForgeMod';
    if (filename.includes('quilt')) return 'QuiltMod';
    return 'UnknownMod';
}

async function buildDistribution() {
    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

    console.log('Fetching mod listing...');
    const html = await fetchHTML(MODS_URL);

    const modFiles = parseModLinks(html);

    const modules = modFiles.map(filename => ({
        id: filename, // RAW filename
        name: filename, // RAW filename
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