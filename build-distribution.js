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
 * Determines if a mod is a core library.
 * @param {string} filename The filename of the mod.
 * @returns {boolean} True if the mod is a core library, false otherwise.
 */
function isLibrary(filename) {
    const lowerFilename = filename.toLowerCase();
    const libraryKeywords = ['connector-', 'fabric-api-', 'forgified-fabric-api-'];
    return libraryKeywords.some(keyword => lowerFilename.includes(keyword));
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

        // THE FIX: Create a single, flat array of module objects.
        // The launcher UI will use the 'group' property to categorize them visually.
        const modules = modFiles.map(filename => {
            const isLib = isLibrary(filename);

            return {
                // Every module, regardless of type, needs a valid Maven ID.
                id: `games.newhorizons.mods:${filename.replace(/\.jar$/, '').replace(/[^a-zA-Z0-9.-]/g, '_')}:1.0.0`,
                name: filename,
                type: isLib ? 'Library' : 'NeoForgeMod',
                // Per your request, all mods are now marked as required.
                required: {
                    value: true,
                    def: true
                },
                // The 'group' property is used by the UI to create the visual categories.
                group: 'Required Mods',
                // The launcher expects a subModules array, even if empty.
                subModules: [], 
                // Every module must have an artifact to resolve its path.
                artifact: {
                    url: `${MODS_URL}${encodeURIComponent(filename)}`
                }
            };
        });

        // Assign the flat list of modules directly to the server.
        template.servers[0].modules = modules;
        
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
        
        console.log(`✅ Done! Wrote ${OUTPUT_PATH} with ${modules.length} required mods.`);

    } catch (err) {
        console.error('❌ Build failed:', err);
        process.exit(1);
    }
}

// Run the build process.
buildDistribution();
