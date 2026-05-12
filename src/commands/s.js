import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';

export default [
    {
        name: 's',
        description: 'Convierte imagen a sticker (responde una imagen)',
        category: 'general',
        async run({ sock, msg, jid }) {
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quotedContent = ctx?.quotedMessage;

            // Detectar tipo de media en el mensaje citado
            const type = quotedContent?.imageMessage
                ? 'imageMessage'
                : quotedContent?.stickerMessage
                    ? 'stickerMessage'
                    : null;

            if (!type) {
                return sock.sendMessage(jid, {
                    text: '❌ Responde a una *imagen* con *.s* para convertirla en sticker.'
                }, { quoted: msg });
            }

            // Si ya es sticker, no hacer nada
            if (type === 'stickerMessage') {
                return sock.sendMessage(jid, {
                    text: '⚠️ Eso ya es un sticker.'
                }, { quoted: msg });
            }

            try {
                // Reconstruir el WAMessage para downloadMediaMessage
                const quotedMsg = {
                    key: {
                        remoteJid: jid,
                        fromMe: ctx.quotedMessage ? false : msg.key.fromMe,
                        id: ctx.stanzaId,
                        participant: ctx.participant || undefined
                    },
                    message: quotedContent
                };

                // Descargar la imagen como buffer
                const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {});

                if (!buffer || buffer.length === 0) {
                    return sock.sendMessage(jid, {
                        text: '❌ No pude descargar la imagen. Intenta reenviándola.'
                    }, { quoted: msg });
                }

                // Convertir a WebP 512x512 (formato requerido por WhatsApp para stickers)
                const webp = await sharp(buffer)
                    .resize(512, 512, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .webp({ quality: 80 })
                    .toBuffer();

                await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });

            } catch (err) {
                await sock.sendMessage(jid, {
                    text: `❌ Error al crear el sticker: _${err.message}_`
                }, { quoted: msg });
            }
        }
    }
];
