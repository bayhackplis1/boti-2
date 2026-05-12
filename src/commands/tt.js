import axios from 'axios';

const TIKTOK_API  = 'https://downloader-pro.cgd-priv.uk/api';
const TIKWM_API   = 'https://www.tikwm.com/api/';
const COBALT_API  = 'https://api.cobalt.tools/';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const isTikTokUrl = t => /tiktok\.com\//i.test(t);

// ── Descargar buffer desde cualquier URL ──────────────────────────────────────
async function getBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 90000,
        maxContentLength: 200 * 1024 * 1024,
        headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/' }
    });
    const buf = Buffer.from(res.data);
    if (buf.length < 5000) throw new Error('Buffer demasiado pequeño');
    return buf;
}

// ── API 1: tikwm.com — metadata + video sin marca de agua ────────────────────
async function infoTikwm(url) {
    const res = await axios.post(TIKWM_API, new URLSearchParams({ url, hd: '1', web: '1' }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000
    });
    const d = res.data?.data;
    if (!d || res.data?.code !== 0) throw new Error('tikwm sin datos');
    return {
        title:    d.title   || 'Sin título',
        author:   d.author?.nickname || 'Desconocido',
        handle:   d.author?.unique_id ? `@${d.author.unique_id}` : '',
        duration: d.duration ? `${d.duration}s` : '?',
        likes:    (d.digg_count    || 0).toLocaleString(),
        comments: (d.comment_count || 0).toLocaleString(),
        views:    (d.play_count    || 0).toLocaleString(),
        shares:   (d.share_count   || 0).toLocaleString(),
        cover:    d.cover || d.origin_cover || null,
        videoUrl: d.play  || d.wmplay || null,   // sin marca de agua
        musicUrl: d.music || null
    };
}

// ── API 2: downloader-pro.cgd-priv.uk — descarga directa ─────────────────────
async function downloadProApi(url) {
    const encoded = encodeURIComponent(url);
    const dlUrl   = `${TIKTOK_API}/tiktok/download/video?url=${encoded}`;
    return getBuffer(dlUrl);
}

// ── API 3: cobalt.tools — respaldo ───────────────────────────────────────────
async function downloadCobalt(url) {
    const res = await axios.post(COBALT_API, { url, downloadMode: 'auto' }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        timeout: 20000
    });
    const dlUrl = res.data?.url;
    if (!dlUrl) throw new Error('cobalt sin URL');
    return getBuffer(dlUrl);
}

// ── Formato del caption ───────────────────────────────────────────────────────
function caption(info) {
    return (
        `🎵 *TikTok Download*\n\n` +
        `✎  *Título:* ${info.title}\n` +
        `👤 *Autor:* ${info.author} ${info.handle}\n` +
        `⏱️ *Duración:* ${info.duration}\n` +
        `❤️ *Likes:* ${info.likes}\n` +
        `💬 *Comentarios:* ${info.comments}\n` +
        `👁️ *Vistas:* ${info.views}\n` +
        `🔗 *Compartidos:* ${info.shares}`
    );
}

// ── Comando .tt ───────────────────────────────────────────────────────────────
export default [
    {
        name: 'tt',
        aliases: ['tiktok'],
        description: 'Descarga video de TikTok sin marca de agua',
        category: 'descargas',
        async run({ sock, msg, jid, args }) {
            const url = args[0];

            if (!url || !isTikTokUrl(url)) {
                return sock.sendMessage(jid, {
                    text: '❌ Envía un enlace válido de TikTok.\n*Ej:* .tt https://vm.tiktok.com/xxxxx'
                }, { quoted: msg });
            }

            await sock.sendMessage(jid, { text: '⏳ Descargando TikTok...' }, { quoted: msg });

            // ── 1. Obtener metadata ───────────────────────────────────────────
            let info;
            try {
                info = await infoTikwm(url);
                process.stdout.write(`  [tt] ✓ Info: ${info.title.slice(0,40)}\n`);
            } catch (e) {
                process.stdout.write(`  [tt] ✗ tikwm info: ${e.message}\n`);
                info = { title: 'TikTok Video', author: 'Desconocido', handle: '', duration: '?', likes: '-', comments: '-', views: '-', shares: '-', cover: null, videoUrl: null };
            }

            // Enviar portada con stats mientras descarga
            if (info.cover) {
                try {
                    const coverBuf = await getBuffer(info.cover);
                    await sock.sendMessage(jid, { image: coverBuf, caption: caption(info) }, { quoted: msg });
                } catch {
                    await sock.sendMessage(jid, { text: caption(info) }, { quoted: msg });
                }
            } else {
                await sock.sendMessage(jid, { text: caption(info) }, { quoted: msg });
            }

            // ── 2. Descargar video con fallbacks en orden ─────────────────────
            const metodos = [
                // Primero el video directo de tikwm (sin marca)
                ...(info.videoUrl ? [{ nombre: 'tikwm (sin marca)',   fn: () => getBuffer(info.videoUrl) }] : []),
                // Luego downloader-pro
                { nombre: 'downloader-pro API', fn: () => downloadProApi(url) },
                // Cobalt como último recurso
                { nombre: 'cobalt.tools',       fn: () => downloadCobalt(url) }
            ];

            let videoBuf = null;
            for (const { nombre, fn } of metodos) {
                try {
                    process.stdout.write(`  [tt] Probando ${nombre}...\n`);
                    videoBuf = await fn();
                    process.stdout.write(`  [tt] ✓ OK con ${nombre} (${(videoBuf.length / 1024 / 1024).toFixed(1)} MB)\n`);
                    break;
                } catch (e) {
                    process.stdout.write(`  [tt] ✗ ${nombre}: ${e.message}\n`);
                }
            }

            if (!videoBuf) {
                return sock.sendMessage(jid, {
                    text: '❌ No pude descargar el video con ningún método.\nVerifica que el enlace sea válido y público.'
                }, { quoted: msg });
            }

            await sock.sendMessage(jid, {
                video: videoBuf,
                caption: `🎵 ${info.title}`,
                mimetype: 'video/mp4'
            }, { quoted: msg });
        }
    }
];
