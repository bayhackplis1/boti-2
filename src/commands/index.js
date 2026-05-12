import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands() {
    const map = new Map();
    const files = readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'index.js');

    for (const file of files) {
        const mod = await import(pathToFileURL(resolve(__dirname, file)).href);
        const cmds = Array.isArray(mod.default) ? mod.default : [mod.default];

        for (const cmd of cmds) {
            if (!cmd?.name) continue;
            map.set(cmd.name, cmd);
            if (cmd.aliases) {
                for (const alias of cmd.aliases) map.set(alias, cmd);
            }
        }
        console.log(chalk.gray(`  [LOAD] ${file}`));
    }

    console.log(chalk.green(`\n  ✓ ${map.size} comandos cargados: ${[...map.keys()].join(', ')}\n`));
    return map;
}
