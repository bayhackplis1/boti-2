import { spawnSync } from 'child_process';
import {
    readFileSync,
    unlinkSync,
    existsSync,
    readdirSync,
    mkdirSync,
    accessSync,
    constants
} from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../..');

const COOKIES = process.env.YT_COOKIES || resolve(ROOT_DIR, 'cookies/youtube_cookies.txt');
const TMP_DIR = process.env.YT_TMP_DIR || resolve(ROOT_DIR, 'tmp');

function canRun(file) {
    try {
        return !!file && existsSync(file) && (accessSync(file, constants.X_OK), true);
    } catch {
        return false;
    }
}

function pickBin(envName, names) {
    const envValue = process.env[envName];
    if (canRun(envValue)) return envValue;

    for (const name of names) {
        const check = spawnSync('which', [name], { encoding: 'utf8' });
        const found = check.stdout?.trim().split('\n')[0];
        if (found && canRun(found)) return found;
    }

    return names[0];
}

const YTDLP = pickBin('YT_DLP_PATH', ['yt-dlp']);
const DENO = pickBin('DENO_PATH', ['deno']);
const FFMPEG = pickBin('FFMPEG_PATH', ['ffmpeg']);

export async function downloadYTAudio(videoUrl) {
    if (!existsSync(COOKIES)) {
        throw new Error(`Archivo de cookies no encontrado: ${COOKIES}`);
    }

    mkdirSync(TMP_DIR, { recursive: true });

    const stamp = `ytbot_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const outputTemplate = join(TMP_DIR, `${stamp}.%(ext)s`);

    process.stdout.write(`  [play] yt-dlp : ${YTDLP}\n`);
    process.stdout.write(`  [play] deno   : ${DENO}\n`);
    process.stdout.write(`  [play] ffmpeg : ${FFMPEG}\n`);
    process.stdout.write(`  [play] cookies: ${COOKIES}\n`);
    process.stdout.write(`  [play] Descargando con yt-dlp + cookies + deno...\n`);

    const result = spawnSync(YTDLP, [
        '-f', 'bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '3',
        '-o', outputTemplate,
        '--no-playlist',
        '--no-check-certificates',
        '--newline',
        '--cookies', COOKIES,
        '--js-runtimes', `deno:${DENO}`,
        '--remote-components', 'ejs:github',
        '--ffmpeg-location', FFMPEG,
        videoUrl
    ], {
        timeout: 180000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 30,
        env: {
            ...process.env,
            PATH: [
                '/usr/local/bin',
                '/usr/bin',
                '/bin',
                `${process.env.HOME || ''}/.deno/bin`,
                process.env.PATH || ''
            ].filter(Boolean).join(':')
        }
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());

    if (result.error) {
        throw new Error(`No se pudo ejecutar yt-dlp: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error((stderr || stdout || `yt-dlp terminó con código ${result.status}`).slice(0, 1800));
    }

    const found = readdirSync(TMP_DIR)
        .filter(f => f.startsWith(stamp) && /\.(mp3|m4a|opus|webm|ogg)$/i.test(f))
        .sort((a, b) => b.localeCompare(a))[0];

    const finalPath = found ? join(TMP_DIR, found) : join(TMP_DIR, `${stamp}.mp3`);

    if (!existsSync(finalPath)) {
        throw new Error(`yt-dlp terminó pero no generó el audio en: ${TMP_DIR}`);
    }

    const buf = readFileSync(finalPath);

    try {
        unlinkSync(finalPath);
    } catch {}

    if (buf.length < 5000) {
        throw new Error('Archivo demasiado pequeño, puede estar corrupto');
    }

    process.stdout.write(`  [play] ✓ OK — ${(buf.length / 1024 / 1024).toFixed(1)} MB\n`);

    return buf;
}
