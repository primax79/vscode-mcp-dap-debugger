import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const common = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: true,
    logLevel: 'info',
}

const targets = [
    {
        entryPoints: ['src/extension.ts'],
        outfile: 'out/extension.js',
        external: ['vscode'],
    },
    {
        entryPoints: ['src/cli/cli.ts'],
        outfile: 'out/cli.js',
        external: [],
        banner: { js: '#!/usr/bin/env node' },
    },
]

async function run() {
    for (const target of targets) {
        const options = { ...common, ...target }
        if (watch) {
            const ctx = await esbuild.context(options)
            await ctx.watch()
        } else {
            await esbuild.build(options)
        }
    }

    if (watch) {
        console.log('esbuild watching for changes...')
    }
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
