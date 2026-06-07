const esbuild = require('esbuild');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  // 'vscode' is provided by the VS Code runtime — never bundle it
  // '@huggingface/transformers' uses ONNX native bindings — keep external, ship in node_modules
  external: ['vscode', '@huggingface/transformers'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
  metafile: true,
  logLevel: 'info',
  // gpt-tokenizer and compromise are pure JS — bundled fine
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('PromptGuide: watching for changes...');
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.metafile) {
      const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
      console.log(analysis);
    }
    console.log('PromptGuide: build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
