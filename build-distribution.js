const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/';

const NEOFORGE_INSTALLER_URL = 'https://newhorizons.games/launcher/neoforge-21.1.192-installer.jar';

/**
 * Fetches the HTML content of a given URL.
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
 */
function parseModLinks(html) {
    const regex = /href="([^"]+\.jar)"/g;
    let links = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!match[1].includes('/') && !match[1].includes('neoforge-21.1.192-installer.jar')) {
            links.push(decodeURIComponent(match[1]));
        }
    }
    return links;
}

/**
 * Determines if a mod is a core library.
 */
function isLibrary(filename) {
    const lowerFilename = filename.toLowerCase();
    const libraryKeywords = ['connector-', 'fabric-api-', 'forgified-fabric-api-'];
    return libraryKeywords.some(keyword => lowerFilename.includes(keyword));
}

/**
 * Downloads a file to calculate its size and MD5 hash.
 */
function getArtifactMetadata(fileUrl) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        let size = 0;

        const req = https.get(fileUrl, res => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download ${fileUrl}: Status Code ${res.statusCode}`));
            }
            res.on('data', chunk => {
                size += chunk.length;
                hash.update(chunk);
            });
            res.on('end', () => {
                resolve({
                    size: size,
                    MD5: hash.digest('hex')
                });
            });
        });

        req.on('error', reject);
    });
}

/**
 * Main function to build the distribution file.
 */
async function buildDistribution() {
    try {
        const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
        
        console.log('Processing NeoForge Loader...');
        const neoForgeMetadata = await getArtifactMetadata(NEOFORGE_INSTALLER_URL);
        const neoForgeModule = {
            id: 'net.neoforged:neoforge:21.1.192',
            name: 'NeoForge',
            type: 'NeoForge',
            // FIX: Added the 'required' property, which was missing.
            required: {
                value: true,
                def: true
            },
            artifact: {
                url: NEOFORGE_INSTALLER_URL,
                size: neoForgeMetadata.size,
                MD5: neoForgeMetadata.MD5
            },
            subModules: []
        };
        console.log('NeoForge Loader processed successfully.');

        console.log('Fetching and processing mod listing...');
        const html = await fetchHTML(MODS_URL);
        const modFiles = parseModLinks(html);
        const modules = [];

        for (const filename of modFiles) {
            console.log(`Processing ${filename}...`);
            const fileUrl = `${MODS_URL}${encodeURIComponent(filename)}`;
            const metadata = await getArtifactMetadata(fileUrl);

            modules.push({
                id: `games.newhorizons.mods:${filename.replace(/\.jar$/, '').replace(/[^a-zA-Z0-9.-]/g, '_')}:1.0.0`,
                name: filename,
                type: isLibrary(filename) ? 'Library' : 'NeoForgeMod',
                required: { value: true, def: true },
                group: 'Required Mods',
                subModules: [], 
                artifact: {
                    url: fileUrl,
                    size: metadata.size,
                    MD5: metadata.MD5
                }
            });
        }

        modules.unshift(neoForgeModule);
        
        template.servers[0].modules = modules;
        
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(template, null, 2));
        
        console.log(`✅ Done! Wrote ${OUTPUT_PATH} with NeoForge loader and ${modFiles.length} other mods.`);

    } catch (err) {
        console.error('❌ Build failed:', err);
        process.exit(1);
    }
}

// Run the build process.
buildDistribution();