const fs = require('fs');
const https = require('https');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/';

/**
 * Fetches the HTML content of a given URL.
 * @param {string} url The URL to fetch.
 * @returns {Promise<string>} A promise that resolves with the HTML content.
 */
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Parses the HTML to find links to .jar files.
 * @param {string} html The HTML content to parse.
 * @returns {string[]} An array of decoded filenames.
 */
function parseModLinks(html) {
    const regex = /href="([^"]+\.jar)"/g;
    const links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!match[1].includes('/')) {
            const decodedFilename = decodeURIComponent(match[1]);
            links.push(decodedFilename);
        }
    }
    return links;
}

/**
 * Determines the module type by checking for specific keywords in the filename.
 * Critical compatibility JARs are marked as 'Library'.
 * @param {string} filename The filename of the mod.
 * @returns {string} The type of the module ('NeoForgeMod' or 'Library').
 */
function getModType(filename) {
    const lowerFilename = filename.toLowerCase();
    
    // These are critical libraries for compatibility. Assigning them the 'Library' 
    // type allows the launcher to handle them appropriately (e.g., load order).
    const libraryKeywords = ['connector-', 'fabric-api-', 'forgified-fabric-api-'];

    if (libraryKeywords.some(keyword => lowerFilename.includes(keyword))) {
        return 'Library';
    }

    // All other mods are treated as NeoForge mods.
    return 'NeoForgeMod';
}

/**
 * Main function to build the distribution file.
 */
async function buildDistribution() {
    try {
        const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
        
        console.log('Fetching mod listing...');
        const html = await fetchHTML(MODS_URL);
        const modFiles = parseModLinks(html);

        const modules = modFiles.map(filename => {
            const type = getModType(filename);

            // THE FIX: The launcher requires a valid Maven ID for ALL module types, including 'Library'.
            // This logic is now applied to every file without exception.
            const groupId = 'games.newhorizons.mods';
            const artifactId = filename
                .replace(/\.jar$/, '')
                .replace(/\s+/g, '-')
                .replace(/[()\[\]{}]/g, '')
                .replace(/\+/g, 'plus')
                .replace(/[^a-zA-Z0-9.-]/g, '_');
            const version = '1.0.0'; // A static version is sufficient and ensures stability.
            const id = `${groupId}:${artifactId}:${version}`;

            return {
                id: id,
                name: filename,
                type: type, // This will be either 'NeoForgeMod' or 'Library'
                artifact: {
                    url: `${MODS_URL}${encodeURIComponent(filename)}`
                }
            };
        });

        template.servers[0].modules = modules;
        
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
        
        console.log(`✅ Done! Wrote ${OUTPUT_PATH} with ${modules.length} mods.`);

    } catch (err) {
        console.error('❌ Build failed:', err);
        process.exit(1);
    }
}

// Run the build process.
buildDistribution();
