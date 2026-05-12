export default [
    {
        name: 'p',
        description: 'Latencia del bot',
        category: 'general',
        async run({ sock, msg, jid }) {
            const start = Date.now();
            const sent = await sock.sendMessage(jid, { text: '⏳ Calculando...' }, { quoted: msg });
            const latency = Date.now() - start;
            await sock.sendMessage(jid, {
                text: `🏓 *Pong!*\n⚡ Latencia: *${latency}ms*`
            }, { edit: sent.key });
        }
    }
];
