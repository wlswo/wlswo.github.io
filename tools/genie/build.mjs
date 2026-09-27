/*
 * html-to-image 를 assets/js/vendor/html-to-image.js 한 파일로 묶는다.
 *
 *   cd tools/genie && npm install && npm run build
 *
 * 묶으면서 한 군데를 고친다: html-to-image 는 스크롤한 자리를 모르고 늘 맨 위를
 * 그린다. 글을 읽다 내린 창을 최소화하면 그림이 맨 위로 튀므로, 본뜬 칸이
 * 스크롤돼 있으면 그 안의 것들을 스크롤한 만큼 옮겨 둔다(keepScroll).
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../assets/js/vendor/html-to-image.js');

const keepScroll = {
  name: 'keep-scroll',
  setup(b) {
    b.onLoad({ filter: /html-to-image[\\/]es[\\/]clone-node\.js$/ }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      const hook = '        cloneSelectValue(nativeNode, clonedNode);\n';
      if (!src.includes(hook)) throw new Error('clone-node.js 가 바뀌었다: keepScroll 을 붙일 자리가 없다');
      src = src.replace(hook, `${hook}        keepScroll(nativeNode, clonedNode);\n`);
      src += `
function keepScroll(nativeNode, clonedNode) {
    const x = nativeNode.scrollLeft || 0;
    const y = nativeNode.scrollTop || 0;
    if (!x && !y) return;
    clonedNode.style.overflow = 'hidden';
    for (const child of clonedNode.children) if (child.style) child.style.translate = \`\${-x}px \${-y}px\`;
}
`;
      return { contents: src, loader: 'js' };
    });
  },
};

await build({
  stdin: { contents: "export { toCanvas } from 'html-to-image';", resolveDir: here },
  outfile: out,
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  plugins: [keepScroll],
});
console.log('assets/js/vendor/html-to-image.js');
