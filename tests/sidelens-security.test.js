'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('SideLens has no external message ingress, remote scripts, cookies or broad host permissions',()=>{
  const root=path.join(__dirname,'../extension');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  assert.equal(manifest.externally_connectable,undefined);
  assert.deepEqual(manifest.permissions,['storage','alarms']);
  assert.equal(manifest.host_permissions.includes('<all_urls>'),false);
  for(const file of fs.readdirSync(root).filter(name=>/\.html$/.test(name))) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(html,/<script\b[^>]+src=["']https?:/i);
  }
});
