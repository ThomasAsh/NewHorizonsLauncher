const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const path = require('path'); // Import the path module

const TEMPLATE_PATH = 'distribution.template.json';
const OUTPUT_PATH = 'distribution.json';
const MODS_URL = 'https://newhorizons.games/launcher/mods/';
const LAUNCHER_URL = 'https://newhorizons.games/launcher/';

const NEOFORGE_INSTALLER_URL = `${LAUNCHER_URL}neoforge-21.1.192-installer.jar`;
const NEOFORGE_MANIFEST_URL = `${LAUNCHER_URL}version.json`;

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

// The sanitizeForPath function is no longer strictly needed for the 'id' field
// if helios-core is patched to handle path sanitization internally.
// However, it can still be useful if you need to generate other path-safe strings.
// For this specific fix, we are assuming helios-core will handle path sanitization
// or that the Maven ID itself is acceptable for file paths on the target OS after the patch.
/*
function sanitizeForPath(input) {
    return input.replace(/:/g, '_');
}
*/

/**
 * Main function to build the distribution file.
 */
async function buildDistribution() {
    try {
        const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
        
        console.log('Processing NeoForge Loader...');
        const neoForgeInstallerMetadata = await getArtifactMetadata(NEOFORGE_INSTALLER_URL);
        
        console.log('Processing NeoForge Version Manifest...');
        const neoForgeManifestMetadata = await getArtifactMetadata(NEOFORGE_MANIFEST_URL);

        // Keep the original Maven ID (with colons) for the 'id' field.
        // We are assuming your helios-core patch will handle the 'NeoForge' type
        // and that helios-core will internally sanitize paths derived from this ID.
        const neoForgeMavenId = 'net.neoforged:neoforge:21.1.192';
        const neoForgeManifestMavenId = 'net.neoforged:neoforge:21.1.192:version.json';


        const neoForgeModule = {
            id: neoForgeMavenId, // Use the original Maven ID (with colons)
            name: 'NeoForge', // Name remains the same
            type: 'NeoForge', // Explicitly set type to 'NeoForge' as per your patch
            required: {
                value: true,
                def: true
            },
            artifact: {
                url: NEOFORGE_INSTALLER_URL,
                size: neoForgeInstallerMetadata.size,
                MD5: neoForgeInstallerMetadata.MD5
            },
            subModules: [
                {
                    id: neoForgeManifestMavenId, // Use the original Maven ID (with colons)
                    name: 'Version Manifest',
                    type: 'VersionManifest',
                    required: {
                        value: true,
                        def: true
                    },
                    artifact: {
                        url: NEOFORGE_MANIFEST_URL,
                        size: neoForgeManifestMetadata.size,
                        MD5: neoForgeManifestMetadata.MD5
                    }
                }
            ]
        };
        console.log('NeoForge processed successfully.');

        console.log('Fetching and processing mod listing...');
        const html = await fetchHTML(MODS_URL);
        const modFiles = parseModLinks(html);
        const modules = [];

        for (const filename of modFiles) {
            console.log(`Processing ${filename}...`);
            const fileUrl = `${MODS_URL}${encodeURIComponent(filename)}`;
            const metadata = await getArtifactMetadata(fileUrl);

            // Construct the original Maven ID for the 'id' field.
            // Assuming helios-core will handle path sanitization internally or this ID is acceptable.
            const originalModId = `games.newhorizons.mods:${filename.replace(/\.jar$/, '').replace(/[^a-zA-Z0-9.-]/g, '_')}:1.0.0`;
            
            modules.push({
                id: originalModId, // Use the original Maven ID (with colons)
                name: filename,
                type: isLibrary(filename) ? 'Library' : 'NeoForgeMod', // Ensure correct type
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
        
        // Corrected the variable name from OUTPUT_FILE to OUTPUT_PATH
        console.log(`✅ Done! Wrote ${OUTPUT_PATH} with NeoForge loader and ${modFiles.length} other mods.`);

    } catch (err) {
        console.error('❌ Build failed:', err);
        process.exit(1);
    }
}

// Run the build process.
buildDistribution();
