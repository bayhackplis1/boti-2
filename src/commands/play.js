import playdl from 'play-dl';
import axios from 'axios';
import { downloadYTAudio } from '../lib/ytdownload.js';

export default [
    {
        name: 'play',
        aliases: ['mp3', 'yt'],
        description: 'Descarga audio de YouTube',
        category: 'musica',
        async run({ sock, msg, jid, args }) {
            if (!args.length) {
                return sock.sendMessage(jid, {
                    text: '❌ Escribe el nombre o URL de la canción.\n*Ej:* .play bohemian rhapsody'
                }, { quoted: msg });
            }

            const query = args.join(' ');
            const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(query);

            await sock.sendMessage(jid, { text: '🔍 Buscando...' }, { quoted: msg });

            let videoUrl, title, duration, views, channel, thumbnail;

            try {
                if (isUrl) {
                    const info = await playdl.video_info(query);
                    const det = info.video_details;
                    videoUrl  = det.url;
                    title     = det.title || 'Audio';
                    duration  = det.durationRaw || '?';
                    views     = (det.views || 0).toLocaleString();
                    channel   = det.channel?.name || 'Desconocido';
                    thumbnail = det.thumbnails?.[0]?.url;
                } else {
                    const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
                    if (!results.length) {
                        return sock.sendMessage(jid, { text: '❌ No encontré resultados.' }, { quoted: msg });
                    }
                    const video = results[0];
                    videoUrl  = video.url;
                    title     = video.title || 'Audio';
                    duration  = video.durationRaw || '?';
                    views     = (video.views || 0).toLocaleString();
                    channel   = video.channel?.name || 'Desconocido';
                    thumbnail = video.thumbnails?.[0]?.url;
                }
            } catch {
                return sock.sendMessage(jid, { text: '❌ No pude obtener la información del video.' }, { quoted: msg });
            }

            // Enviar info + thumbnail
            const caption =
                `🎵 *${title}*\n\n` +
                `👤 Canal: *${channel}*\n` +
                `⏱️ Duración: *${duration}*\n` +
                `👁️ Vistas: *${views}*\n\n` +
                `⏬ _Descargando audio..._`;

            try {
                if (thumbnail) {
                    const thumbBuf = await axios.get(thumbnail, { responseType: 'arraybuffer' }).then(r => Buffer.from(r.data));
                    await sock.sendMessage(jid, { image: thumbBuf, caption }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { text: caption }, { quoted: msg });
                }
            } catch { }

            // Descargar audio con fallbacks
            try {
                const audioBuffer = await downloadYTAudio(videoUrl);
                const fileName = `${title.replace(/[^\w\s-]/gi, '').trim().slice(0, 60)}.mp3`;

                await sock.sendMessage(jid, {
                    audio: audioBuffer,
                    fileName,
                    mimetype: 'audio/mpeg'
                }, { quoted: msg });

            } catch (err) {
                await sock.sendMessage(jid, {
                    text: `❌ ${err.message}`
                }, { quoted: msg });
            }
        }
    }
];
