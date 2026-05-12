import { pickRandom } from '../lib/utils.js';

const respuestas8ball = [
    '✅ Sí, definitivamente.',
    '✅ Sin duda alguna.',
    '✅ Puedes contar con ello.',
    '✅ Todo indica que sí.',
    '✅ Lo más probable es que sí.',
    '🤔 No está claro ahora mismo.',
    '🤔 Vuelve a preguntar más tarde.',
    '🤔 Prefiero no responder eso.',
    '🤔 Concéntrate y pregunta de nuevo.',
    '❌ No cuentes con ello.',
    '❌ Mi respuesta es no.',
    '❌ Las perspectivas no son buenas.',
    '❌ Muy dudoso.',
    '❌ Definitivamente no.',
];

export default [
    {
        name: 'dado',
        aliases: ['dice', 'roll'],
        description: 'Lanza un dado (default 1-6)',
        category: 'diversion',
        async run({ sock, msg, jid, args }) {
            const max = Math.min(parseInt(args[0]) || 6, 1000);
            const result = Math.floor(Math.random() * max) + 1;
            const emojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            const emoji = max === 6 ? emojis[result] : '🎲';
            await sock.sendMessage(jid, {
                text: `${emoji} Dado de *${max}* caras → *${result}*`
            }, { quoted: msg });
        }
    },
    {
        name: 'moneda',
        aliases: ['coin', 'flip'],
        description: 'Cara o cruz',
        category: 'diversion',
        async run({ sock, msg, jid }) {
            const r = Math.random() < 0.5;
            await sock.sendMessage(jid, {
                text: `🪙 ${r ? '*CARA* (águila)' : '*CRUZ* (sol)'}`
            }, { quoted: msg });
        }
    },
    {
        name: 'elige',
        aliases: ['choose', 'escoge'],
        description: 'Elige entre opciones separadas por |',
        category: 'diversion',
        async run({ sock, msg, jid, args }) {
            const opciones = args.join(' ').split('|').map(o => o.trim()).filter(Boolean);
            if (opciones.length < 2) {
                return sock.sendMessage(jid, {
                    text: '❌ Necesito al menos 2 opciones separadas por *|*\n*Ej:* .elige pizza | tacos | sushi'
                }, { quoted: msg });
            }
            const elegida = pickRandom(opciones);
            await sock.sendMessage(jid, {
                text: `🤔 Entre: ${opciones.map(o => `*${o}*`).join(', ')}\n\n✅ Elijo: *${elegida}*`
            }, { quoted: msg });
        }
    },
    {
        name: '8ball',
        aliases: ['bola', 'bola8'],
        description: 'La bola mágica responde tu pregunta',
        category: 'diversion',
        async run({ sock, msg, jid, args }) {
            if (!args.length) {
                return sock.sendMessage(jid, {
                    text: '❌ Escribe una pregunta.\n*Ej:* .8ball ¿Me irá bien hoy?'
                }, { quoted: msg });
            }
            const pregunta = args.join(' ');
            const respuesta = pickRandom(respuestas8ball);
            await sock.sendMessage(jid, {
                text: `🎱 *8-Ball*\n\n❓ ${pregunta}\n\n${respuesta}`
            }, { quoted: msg });
        }
    },
    {
        name: 'perfil',
        aliases: ['profile', 'yo'],
        description: 'Muestra tu foto y perfil de WA',
        category: 'utilidades',
        async run({ sock, msg, jid, sender, pushName, numero }) {
            try {
                const senderJid = sender || msg.key.participant || msg.key.remoteJid;
                const pp = await sock.profilePictureUrl(senderJid, 'image').catch(() => null);
                const status = await sock.fetchStatus(senderJid).catch(() => null);
                const text =
                    `👤 *Perfil de WhatsApp*\n\n` +
                    `📛 Nombre: *${pushName}*\n` +
                    (numero ? `📱 Número: *+${numero}*\n` : '') +
                    `💬 Estado: _${status?.status || 'Sin estado'}_`;

                if (pp) {
                    await sock.sendMessage(jid, { image: { url: pp }, caption: text }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { text }, { quoted: msg });
                }
            } catch {
                await sock.sendMessage(jid, { text: '❌ No pude obtener tu perfil.' }, { quoted: msg });
            }
        }
    },
    {
        name: 'clima',
        aliases: ['weather', 'tiempo'],
        description: 'Clima de una ciudad',
        category: 'utilidades',
        async run({ sock, msg, jid, args }) {
            if (!args.length) {
                return sock.sendMessage(jid, { text: '❌ Escribe una ciudad.\n*Ej:* .clima Asunción' }, { quoted: msg });
            }
            const ciudad = args.join(' ');
            try {
                const { default: axios } = await import('axios');
                const res = await axios.get(`https://wttr.in/${encodeURIComponent(ciudad)}?format=j1`);
                const cur = res.data.current_condition[0];
                const area = res.data.nearest_area[0];
                const text =
                    `🌤️ *Clima — ${area.areaName[0].value}, ${area.country[0].value}*\n\n` +
                    `🌡️ Temperatura: *${cur.temp_C}°C* (sensación ${cur.FeelsLikeC}°C)\n` +
                    `🌥️ Condición: *${cur.weatherDesc[0].value}*\n` +
                    `💧 Humedad: *${cur.humidity}%*\n` +
                    `💨 Viento: *${cur.windspeedKmph} km/h*`;
                await sock.sendMessage(jid, { text }, { quoted: msg });
            } catch {
                await sock.sendMessage(jid, { text: '❌ No encontré esa ciudad. Verifica el nombre.' }, { quoted: msg });
            }
        }
    }
];
