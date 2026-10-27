'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const appearance=require('../extension/sidelens-appearance.js');
test('appearance follows X light, dim and black backgrounds, including a transparent body',()=>{
  const doc=(body,html='rgb(255, 255, 255)')=>({body:{backgroundColor:body},documentElement:{backgroundColor:html},defaultView:{getComputedStyle:node=>node}});
  assert.equal(appearance.detect(doc('rgb(255, 255, 255)')),'light');
  assert.equal(appearance.detect(doc('rgb(21, 32, 43)')),'dim');
  assert.equal(appearance.detect(doc('rgb(0, 0, 0)')),'dark');
  assert.equal(appearance.detect(doc('rgba(0, 0, 0, 0)','rgb(21, 32, 43)')),'dim');
});
test('theme application is idempotent so the document observer cannot loop on its own styles',()=>{
  const values=new Map();let writes=0;
  const node={dataset:{},style:{getPropertyValue:key=>values.get(key),setProperty:(key,value)=>{writes++;values.set(key,value);}}};
  appearance.apply(node,'dark');const first=writes;appearance.apply(node,'dark');assert.equal(writes,first);
  appearance.apply(node,'light');assert.equal(node.dataset.sidelensTheme,'light');assert.equal(values.get('--gf-bg'),'#f2eedf');
});
test('all themes preserve readable body, muted and accent text and contrast on primary buttons',()=>{
  function luminance(hex){const c=hex.slice(1).match(/../g).map(part=>parseInt(part,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  for(const palette of Object.values(appearance.palettes)){
    for(const key of ['fg','muted','accent'])assert.ok(ratio(palette[key],palette.bg)>=4.5,key);
    assert.ok(ratio(palette.button,palette.accent)>=4.5);
    assert.ok(ratio(palette['trigger-fg'],palette['trigger-bg'])>=4.5,'trigger glyph');
    assert.ok(ratio(palette['trigger-border'],palette['trigger-bg'])>=3,'trigger edge');
  }
});
