import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import chalk from 'chalk';
import NodeCache from 'node-cache';
import readline from 'readline';
import { handleMessage } from './handler.js';
import { BOT_CONFIG } from './lib/config.js';

const msgRetryCounterCache = new NodeCache();
const logger = pino({ level: BOT_CONFIG.logLevel }).child({ class: 'baileys' });

// Guardamos la elección del usuario para no preguntar en reconexiones
let metodoElegido = null;
let numeroGuardado = '';

function pregunta(prompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); }));
}

function limpiarNumero(num) {
    return num.replace(/[^0-9]/g, '');
}

export async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(chalk.cyan(`\n  WA v${version.join('.')} ${isLatest ? chalk.green('✓') : chalk.yellow('⚠ actualiza baileys')}`));

    const necesitaVincular = !state.creds.registered;

    // Solo pregunta el método la primera vez, nunca en reconexiones
    if (necesitaVincular && metodoElegido === null) {
        const resp = await pregunta(
            chalk.yellowBright('\n  ¿Cómo quieres conectarte?\n') +
            chalk.white('  [1] ') + chalk.green('Código QR') + chalk.gray(' (escanear con cámara)\n') +
            chalk.white('  [2] ') + chalk.cyan('Código de 8 dígitos') + chalk.gray(' (sin cámara)\n') +
            chalk.gray('\n  Elige [1/2]: ')
        );

        metodoElegido = resp === '2' ? 'codigo' : 'qr';

        if (metodoElegido === 'codigo') {
            numeroGuardado = await pregunta(
                chalk.yellowBright('\n  Número con código de país (sin + ni espacios)\n') +
                chalk.gray('  Ej: 521XXXXXXXXXX (México), 591XXXXXXXX (Bolivia)\n') +
                chalk.gray('\n  Número: ')
            );
            numeroGuardado = limpiarNumero(numeroGuardado);
            if (!numeroGuardado) {
                console.log(chalk.red('  Número inválido. Reinicia e intenta de nuevo.'));
                process.exit(1);
            }
        }
        console.log('');
    }

    const usarCodigo = metodoElegido === 'codigo';

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: usarCodigo ? Browsers.ubuntu('Chrome') : Browsers.macOS('Chrome'),
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        shouldIgnoreJid: jid => isJidBroadcast(jid),
        getMessage: async () => undefined
    });

    if (usarCodigo && necesitaVincular) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(numeroGuardado);
                const fmt = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(chalk.yellowBright('\n  ╔════════════════════════════════════╗'));
                console.log(chalk.yellowBright('  ║    TU CÓDIGO DE 8 DÍGITOS ES:      ║'));
                console.log(chalk.yellowBright('  ║                                    ║'));
                console.log(chalk.yellowBright('  ║        ') + chalk.whiteBright.bold(fmt) + chalk.yellowBright('        ║'));
                console.log(chalk.yellowBright('  ║                                    ║'));
                console.log(chalk.yellowBright('  ╚════════════════════════════════════╝'));
                console.log(chalk.gray('\n  WhatsApp → Dispositivos vinculados → Vincular con número de teléfono'));
                console.log(chalk.gray('  Ingresa el código de arriba.\n'));
            } catch (err) {
                console.log(chalk.red('\n  ✗ Error al obtener el código: ' + err.message));
                console.log(chalk.yellow('  Verifica que el número sea correcto y vuelve a intentar.\n'));
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr && !usarCodigo) {
            console.log(chalk.yellowBright('\n  ╔══════════════════════════════════╗'));
            console.log(chalk.yellowBright('  ║     ESCANEA EL QR CON TU WA     ║'));
            console.log(chalk.yellowBright('  ╚══════════════════════════════════╝\n'));
            qrcode.generate(qr, { small: true });
            console.log(chalk.gray('\n  WhatsApp → Dispositivos vinculados → Vincular dispositivo\n'));
        }

        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(chalk.red(`\n  ✗ Conexión cerrada. Código: ${statusCode}`));

            switch (statusCode) {
                case DisconnectReason.badSession:
                    console.log(chalk.red('  Sesión inválida. Borra la carpeta "session" y reinicia.'));
                    process.exit(1);
                    break;
                case DisconnectReason.connectionReplaced:
                    console.log(chalk.red('  Sesión reemplazada. Solo puede haber una instancia activa.'));
                    process.exit(1);
                    break;
                case DisconnectReason.loggedOut:
                    console.log(chalk.red('  Sesión cerrada remotamente. Borra "session" y vuelve a vincular.'));
                    process.exit(1);
                    break;
                case DisconnectReason.restartRequired:
                    console.log(chalk.yellow('  Reinicio requerido. Reconectando...'));
                    startBot();
                    break;
                case DisconnectReason.timedOut:
                    console.log(chalk.yellow('  Tiempo agotado. Reconectando...'));
                    startBot();
                    break;
                default:
                    console.log(chalk.yellow('  Reconectando en 5 segundos...'));
                    setTimeout(startBot, 5000);
            }
        }

        if (connection === 'open') {
            const user = sock.user;
            console.log(chalk.greenBright('\n  ╔══════════════════════════════════╗'));
            console.log(chalk.greenBright('  ║       ✓ CONECTADO CON ÉXITO      ║'));
            console.log(chalk.greenBright('  ╚══════════════════════════════════╝'));
            console.log(chalk.green(`\n  Número : ${chalk.white(user?.id?.split(':')[0] ?? 'desconocido')}`));
            console.log(chalk.green(`  Nombre : ${chalk.white(user?.name ?? 'desconocido')}`));
            console.log(chalk.green(`  Prefijo : ${chalk.white(BOT_CONFIG.prefix)}`));
            console.log(chalk.green(`  Bot listo. Escuchando mensajes...\n`));
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.fromMe && !BOT_CONFIG.selfReply) continue;
            await handleMessage(sock, msg);
        }
    });

    return sock;
}
