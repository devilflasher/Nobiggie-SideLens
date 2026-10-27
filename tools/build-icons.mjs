// Rasterize SideLens vector artwork; no network dependencies.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.SIDELENS_NODE_MODULES?join(process.env.SIDELENS_NODE_MODULES,'__icons.cjs'):import.meta.url);
const sharp=require('sharp');
const symbol=await readFile(join(root,'extension/assets/superx-symbol.svg'),'utf8');
const inset=symbol.replace('<svg ','<svg x="22" y="22" width="84" height="84" ');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><path d="M0 0h106l22 22v106H0Z" fill="#f2eedf"/>${inset}</svg>`;
for(const size of [16,32,48,128])await sharp(Buffer.from(svg)).resize(size,size).png().toFile(join(root,`extension/assets/icon-${size}.png`));
console.log('SideLens: rendered 16, 32, 48 and 128px icons.');
