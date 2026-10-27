(function(root){
  'use strict';
  const palettes={
    light:{bg:'#f2eedf',fg:'#181811',muted:'#6a655a',border:'#27251e',accent:'#cf1f2b',surface:'#f8f5e9',soft:'#eae4d4',secondary:'#565044',ink:'#181811',paper:'#fff9ed',button:'#fff9ed','trigger-bg':'#f8f5e9','trigger-fg':'#bc1723','trigger-border':'#575044',scheme:'light'},
    dim:{bg:'#15202b',fg:'#edf0ec',muted:'#aab7c3',border:'#637482',accent:'#ff7882',surface:'#1c2a38',soft:'#263646',secondary:'#c6cfd5',ink:'#0c141d',paper:'#fff9ed',button:'#181811','trigger-bg':'#191b1e','trigger-fg':'#ff7882','trigger-border':'#8a929a',scheme:'dark'},
    dark:{bg:'#101113',fg:'#efeee8',muted:'#a9aaa6',border:'#656660',accent:'#ff7882',surface:'#191b1e',soft:'#24272b',secondary:'#c9cbc7',ink:'#070809',paper:'#fff9ed',button:'#181811','trigger-bg':'#191b1e','trigger-fg':'#ff7882','trigger-border':'#8a929a',scheme:'dark'}
  };
  function detect(doc){
    for(const node of [doc.body,doc.documentElement]){
      const value=(doc.defaultView||root).getComputedStyle(node).backgroundColor;
      if(!value||value==='transparent'||/rgba\([^)]*,\s*0\s*\)/.test(value))continue;
      const rgb=value.match(/[\d.]+/g)?.slice(0,3).map(Number);
      if(rgb?.length!==3)continue;
      if(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>140)return 'light';
      return rgb[2]>rgb[0]+6?'dim':'dark';
    }
    return 'light';
  }
  function apply(node,theme){
    const selected=Object.hasOwn(palettes,theme)?theme:'light',p=palettes[selected];if(node.dataset.sidelensTheme!==selected)node.dataset.sidelensTheme=selected;
    for(const name of ['bg','fg','muted','border','accent','scheme'])if(node.style.getPropertyValue('--gf-'+name)!==p[name])node.style.setProperty('--gf-'+name,p[name]);
    for(const name of ['surface','soft','secondary','ink','paper','button','trigger-bg','trigger-fg','trigger-border'])if(node.style.getPropertyValue('--sl-'+name)!==p[name])node.style.setProperty('--sl-'+name,p[name]);
  }
  function sync(host){
    const theme=detect(document);apply(document.documentElement,theme);if(host)apply(host,theme);
    return theme;
  }
  root.SideLensAppearance={palettes,detect,apply,sync};
  if(typeof module!=='undefined')module.exports=root.SideLensAppearance;
  if(typeof document!=='undefined'&&/(?:options|popup|history|setup|privacy)\.html$/.test(root.location?.pathname||'')){
    const update=value=>apply(document.documentElement,value);
    try{
      root.chrome?.storage?.local?.get('sidelensAppearance').then(value=>update(value.sidelensAppearance)).catch(()=>update('light'));
      root.chrome?.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.sidelensAppearance)update(changes.sidelensAppearance.newValue);});
    }catch{update('light');}
  }
})(globalThis);
