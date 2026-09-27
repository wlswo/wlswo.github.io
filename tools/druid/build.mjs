/*
 * React · React Flow · htm 을 assets/druid/vendor/ 의 파일 하나로 묶는다.
 *
 *   cd tools/druid && npm install && npm run build
 *
 * 판을 올릴 때만 다시 돌리면 된다. 쪽의 코드(assets/druid/*.js)는 묶지 않고
 * 그대로 고친다 — 이 파일을 import 해서 쓴다.
 */
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../assets/druid/vendor');
await mkdir(out, { recursive: true });

await build({
  entryPoints: [path.join(here, 'vendor.js')],
  outfile: path.join(out, 'flow.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
});
await copyFile(path.join(here, 'node_modules/@xyflow/react/dist/base.css'), path.join(out, 'flow.css'));
console.log('assets/druid/vendor/flow.js · flow.css');
