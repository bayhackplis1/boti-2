import axios from 'axios';

const TIKTOK_API  = 'https://downloader-pro.cgd-priv.uk/api';
const TIKWM_API   = 'https://www.tikwm.com/api/';
const TIKWM_SEARCH = 'https://www.tikwm.com/api/feed/search';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const isTikTokUrl = t => /tiktok\.com\//i.test(t);

// ── Buffer desde cualquier URL ────────────────────────────────────────────────
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

// ── Metadata de un video por URL (tikwm) ──────────────────────────────────────
async function infoTikwm(url) {
    const res = await axios.post(TIKWM_API, new URLSearchParams({ url, hd: '1', web: '1' }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000
    });
    const d = res.data?.data;
    if (!d || res.data?.code !== 0) throw new Error('tikwm sin datos');
    return {
        title:    (d.title   || 'TikTok Video').slice(0, 80),
        author:   d.author?.nickname  || 'Desconocido',
        handle:   d.author?.unique_id ? `@${d.author.unique_id}` : '',
        duration: d.duration ? `${d.duration}s` : '?',
        likes:    (d.digg_count || 0).toLocaleString(),
        cover:    d.cover || d.origin_cover || null,
        videoUrl: d.play  || d.wmplay || null,
        musicUrl: d.music || null
    };
}

// ── Búsqueda por palabras clave (tikwm) ───────────────────────────────────────
async function searchTikwm(query, count = 3) {
    const res = await axios.get(TIKWM_SEARCH, {
        params: { keywords: query, count, cursor: 0, HD: 1 },
        timeout: 20000,
        headers: { 'User-Agent': UA }
    });
    const videos = res.data?.data?.videos;
    if (!videos?.length) throw new Error('Sin resultados');
    return videos.slice(0, count).map(v => ({
        title:    (v.title || 'TikTok Video').slice(0, 80),
        author:   v.author?.nickname || 'Desconocido',
        handle:   v.author?.unique_id ? `@${v.author.unique_id}` : '',
        cover:    v.cover || v.origin_cover || null,
        videoUrl: v.play  || v.wmplay || null,
        musicUrl: v.music || null,
        duration: v.duration ? `${v.duration}s` : '?',
        likes:    (v.digg_count || 0).toLocaleString()
    }));
}

// ── Descarga video con fallbacks ──────────────────────────────────────────────
async function downloadVideo(item, rawUrl) {
    const metodos = [
        ...(item.videoUrl ? [{ n: 'tikwm (sin marca)', fn: () => getBuffer(item.videoUrl) }] : []),
        ...(rawUrl        ? [{ n: 'downloader-pro',    fn: () => getBuffer(`${TIKTOK_API}/tiktok/download/video?url=${encodeURIComponent(rawUrl)}`) }] : [])
    ];
    for (const { n, fn } of metodos) {
        try {
            const buf = await fn();
            process.stdout.write(`  [ttsearch] ✓ video via ${n}\n`);
            return buf;
        } catch (e) {
            process.stdout.write(`  [ttsearch] ✗ ${n}: ${e.message}\n`);
        }
    }
    throw new Error('No se pudo descargar el video');
}

// ── Descarga audio con fallbacks ──────────────────────────────────────────────
async function downloadAudio(item, rawUrl) {
    const metodos = [
        ...(item.musicUrl ? [{ n: 'tikwm music',        fn: () => getBuffer(item.musicUrl) }] : []),
        ...(rawUrl        ? [{ n: 'downloader-pro audio', fn: () => getBuffer(`${TIKTOK_API}/tiktok/download/audio?url=${encodeURIComponent(rawUrl)}`) }] : [])
    ];
    for (const { n, fn } of metodos) {
        try {
            const buf = await fn();
            process.stdout.write(`  [ttaudio] ✓ audio via ${n}\n`);
            return buf;
        } catch (e) {
            process.stdout.write(`  [ttaudio] ✗ ${n}: ${e.message}\n`);
        }
    }
    throw new Error('No se pudo descargar el audio');
}

export default [
    // ── .ttsearch ─────────────────────────────────────────────────────────────
    {
        name: 'ttsearch',
        aliases: ['tts'],
        description: 'Descarga video(s) de TikTok — por link o búsqueda',
        category: 'descargas',
        async run({ sock, msg, jid, args }) {
            if (!args.length) {
                return sock.sendMessage(jid, {
                    text:
                        '❌ Falta el link o la búsqueda.\n' +
                        '*Por link:*    .ttsearch https://vm.tiktok.com/xxx\n' +
                        '*Por búsqueda:* .ttsearch gatos graciosos'
                }, { quoted: msg });
            }

            const input = args.join(' ');
            const esUrl = isTikTokUrl(input);

            // ── MODO URL: 1 video específico ───────────────────────────────────
            if (esUrl) {
                await sock.sendMessage(jid, { text: '⏳ Obteniendo video...' }, { quoted: msg });

                let info;
                try {
                    info = await infoTikwm(input);
                } catch {
                    info = { title: 'TikTok Video', author: 'Desconocido', handle: '', duration: '?', likes: '-', cover: null, videoUrl: null, musicUrl: null };
                }

                if (info.cover) {
                    try {
                        const coverBuf = await getBuffer(info.cover);
                        await sock.sendMessage(jid, {
                            image: coverBuf,
                            caption:
                                `🎬 *${info.title}*\n` +
                                `👤 ${info.author} ${info.handle}\n` +
                                `⏱️ ${info.duration}  ❤️ ${info.likes}\n\n_Descargando..._`
                        }, { quoted: msg });
                    } catch { }
                }

                try {
                    const buf = await downloadVideo(info, input);
                    await sock.sendMessage(jid, {
                        video: buf,
                        caption: `🎬 ${info.title}`,
                        mimetype: 'video/mp4'
                    }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(jid, { text: `❌ No pude descargar el video: _${e.message}_` }, { quoted: msg });
                }
                return;
            }

            // ── MODO BÚSQUEDA: 3 videos ────────────────────────────────────────
            await sock.sendMessage(jid, { text: `🔍 Buscando *"${input}"* en TikTok...` }, { quoted: msg });

            let videos;
            try {
                videos = await searchTikwm(input, 3);
                process.stdout.write(`  [ttsearch] ✓ ${videos.length} resultados\n`);
            } catch (e) {
                process.stdout.write(`  [ttsearch] ✗ búsqueda: ${e.message}\n`);
                return sock.sendMessage(jid, {
                    text: '❌ No encontré resultados. Intenta con otras palabras.'
                }, { quoted: msg });
            }

            await sock.sendMessage(jid, { text: `✅ ${videos.length} videos encontrados. Descargando... ⏳` }, { quoted: msg });

            let enviados = 0;
            for (let i = 0; i < videos.length; i++) {
                const v = videos[i];
                try {
                    const buf = await downloadVideo(v, null);
                    await sock.sendMessage(jid, {
                        video: buf,
                        caption:
                            `🎬 *${i + 1}/3 — ${v.title}*\n` +
                            `👤 ${v.author} ${v.handle}\n` +
                            `⏱️ ${v.duration}  ❤️ ${v.likes}`,
                        mimetype: 'video/mp4'
                    }, { quoted: msg });
                    enviados++;
                    process.stdout.write(`  [ttsearch] ✓ video ${i + 1} enviado\n`);
                } catch (e) {
                    process.stdout.write(`  [ttsearch] ✗ video ${i + 1}: ${e.message}\n`);
                    await sock.sendMessage(jid, { text: `⚠️ Video ${i + 1} no disponible.` }, { quoted: msg });
                }
            }

            if (enviados === 0) {
                await sock.sendMessage(jid, { text: '❌ No se pudo descargar ningún video.' }, { quoted: msg });
            } else {
                await sock.sendMessage(jid, { text: `✅ Listo — *${enviados}/3* videos enviados.` }, { quoted: msg });
            }
        }
    },

    // ── .ttaudio ──────────────────────────────────────────────────────────────
    {
        name: 'ttaudio',
        aliases: ['tta'],
        description: 'Extrae audio de TikTok — por link o búsqueda',
        category: 'descargas',
        async run({ sock, msg, jid, args }) {
            if (!args.length) {
                return sock.sendMessage(jid, {
                    text:
                        '❌ Falta el link o la búsqueda.\n' +
                        '*Por link:*    .ttaudio https://vm.tiktok.com/xxx\n' +
                        '*Por búsqueda:* .ttaudio canción viral tiktok'
                }, { quoted: msg });
            }

            const input = args.join(' ');
            const esUrl = isTikTokUrl(input);

            await sock.sendMessage(jid, {
                text: esUrl
                    ? '⏳ Obteniendo audio del video...'
                    : `🔍 Buscando audio de *"${input}"* en TikTok...`
            }, { quoted: msg });

            // ── Obtener info del video (por URL o búsqueda) ────────────────────
            let info;
            try {
                if (esUrl) {
                    info = await infoTikwm(input);
                } else {
                    const results = await searchTikwm(input, 1);
                    info = results[0];
                }
            } catch (e) {
                process.stdout.write(`  [ttaudio] ✗ info: ${e.message}\n`);
                return sock.sendMessage(jid, {
                    text: esUrl
                        ? '❌ No pude obtener info del video. Verifica el link.'
                        : '❌ No encontré resultados. Intenta con otras palabras.'
                }, { quoted: msg });
            }

            // Portada mientras descarga
            if (info.cover) {
                try {
                    const coverBuf = await getBuffer(info.cover);
                    await sock.sendMessage(jid, {
                        image: coverBuf,
                        caption:
                            `🎵 *${info.title}*\n` +
                            `👤 ${info.author} ${info.handle}\n` +
                            `⏱️ ${info.duration}  ❤️ ${info.likes}\n\n_Extrayendo audio..._`
                    }, { quoted: msg });
                } catch { }
            }

            // ── Descargar y enviar audio ───────────────────────────────────────
            try {
                const rawUrl = esUrl ? input : null;
                const buf = await downloadAudio(info, rawUrl);

                await sock.sendMessage(jid, {
                    audio: buf,
                    fileName: `${info.title.replace(/[^\w\s-]/gi, '').trim().slice(0, 60)}.mp3`,
                    mimetype: 'audio/mpeg'
                }, { quoted: msg });

                process.stdout.write(`  [ttaudio] ✓ audio enviado\n`);
            } catch (e) {
                process.stdout.write(`  [ttaudio] ✗ ${e.message}\n`);
                await sock.sendMessage(jid, {
                    text: `❌ No pude extraer el audio: _${e.message}_`
                }, { quoted: msg });
            }
        }
    }
];
