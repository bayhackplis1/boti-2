import { BOT_CONFIG } from '../lib/config.js';
import { runtime } from '../lib/utils.js';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const startTime = Date.now();

// Busca la imagen del menú en src/image/ (menu.jpg, menu.png, menu.webp)
function getMenuImage() {
    const imgDir = resolve(__dirname, '../image');
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
        const ruta = resolve(imgDir, `menu.${ext}`);
        if (existsSync(ruta)) {
            return readFileSync(ruta);
        }
    }
    return null;
}

// ════════════════════════════════════════
//   EDITA AQUÍ EL DISEÑO DE TU MENÚ
// ════════════════════════════════════════
function buildMenu(prefix, uptime, nombre) {
    return (
        `╔══════════════════════════════╗\n` +
        `║   🤖  *${nombre}*   🤖       ║\n` +
        `╚══════════════════════════════╝\n` +
        `\n` +
        `⏱️ Activo: *${uptime}*\n` +
        `🔖 Prefijo: *${prefix}*\n` +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⬇️ *DESCARGAS*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${prefix}play [canción/url]  » Audio de YouTube\n` +
        `${prefix}tt [url]            » Video de TikTok sin marca\n` +
        `${prefix}ttsearch [link/búsqueda] » 3 videos TikTok\n` +
        `${prefix}ttaudio  [link/búsqueda] » Audio de TikTok\n` +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *DIVERSIÓN*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${prefix}dado [max]     » Lanzar un dado\n` +
        `${prefix}moneda         » Cara o cruz\n` +
        `${prefix}elige a|b|c    » Elige entre opciones\n` +
        `${prefix}8ball [preg]   » La bola mágica\n` +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛠️ *UTILIDADES*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${prefix}s       » Imagen → sticker\n` +
        `${prefix}p       » Latencia del bot\n` +
        `${prefix}menu    » Este menú\n` +
        `\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Desarrollado con Baileys_`
    );
}

export default [
    {
        name: 'menu',
        description: 'Menú de comandos',
        category: 'general',
        async run({ sock, msg, jid }) {
            const uptime = runtime(Math.floor((Date.now() - startTime) / 1000));
            const texto = buildMenu(BOT_CONFIG.prefix, uptime, BOT_CONFIG.name);
            const imagen = getMenuImage();

            if (imagen) {
                await sock.sendMessage(jid, {
                    image: imagen,
                    caption: texto
                }, { quoted: msg });
            } else {
                await sock.sendMessage(jid, { text: texto }, { quoted: msg });
            }
        }
    }
];
