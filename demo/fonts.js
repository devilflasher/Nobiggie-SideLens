// Font comparison only. Does not write extension settings or call a provider.
(()=>{
  'use strict';
  const fonts=[
    {id:'A',name:'微软雅黑',family:'"Microsoft YaHei",sans-serif',check:'Microsoft YaHei',description:'熟悉的 Windows 中文界面风格'},
    {id:'B',name:'Noto Sans SC · 黑体',family:'"SL Noto Sans",sans-serif',check:'SL Noto Sans',description:'优先试读：正文常规字重，重点适度加粗',recommended:true},
    {id:'C',name:'等线',family:'"DengXian",sans-serif',check:'DengXian',description:'笔画相对轻一些，可与黑体对照'},
    {id:'D',name:'Noto Serif SC · 宋体',family:'"SL Noto Serif",serif',check:'SL Noto Serif',description:'有衬线的阅读方案，适合对照文章感'}
  ];
  const $=id=>document.getElementById(id),cards=new Map();
  let selected='';
  for(const font of fonts){
    const card=$('card').content.firstElementChild.cloneNode(true);
    card.dataset.font=font.id;
    const title=card.querySelector('.choice-title'),letter=document.createElement('span');letter.textContent=font.id;title.append(letter,font.name);
    if(font.recommended){const tag=document.createElement('span');tag.className='tag';tag.textContent='先试这款';title.append(tag);}
    card.querySelector('.description').textContent=font.description;
    card.querySelector('.sample').style.setProperty('--sample-font',font.family);
    card.querySelector('.select').addEventListener('click',()=>{selected=font.id;update();});
    $('choices').append(card);cards.set(font.id,card);
    document.fonts.load(`16px "${font.check}"`,'中文阅读').then(()=>{
      const available=card.querySelector('.available');available.textContent='使用本机字体 · 可直接比较';available.dataset.loaded='true';
    }).catch(()=>{
      const available=card.querySelector('.available');available.textContent='本机未找到该字体，当前可能使用替代字体';available.dataset.loaded='false';
    });
  }
  function description(){
    const font=fonts.find(item=>item.id===selected);
    return `${font?font.id+' · '+font.name:'尚未选择字体'}｜字号 ${$('size').value}px｜行距 ${$('leading').value}｜${$('heavy').checked?'整段加粗':'常规正文，重点加粗'}`;
  }
  function update(){
    document.body.style.setProperty('--reading-size',$('size').value+'px');
    document.body.style.setProperty('--reading-leading',$('leading').value);
    document.body.classList.toggle('heavy',$('heavy').checked);
    $('size-value').textContent=$('size').value+' px';$('leading-value').textContent=Number($('leading').value).toFixed(2);
    for(const [id,card]of cards){card.dataset.selected=String(id===selected);const button=card.querySelector('.select');button.setAttribute('aria-pressed',String(id===selected));button.textContent=id===selected?'已选 '+id:'选这款';}
    $('selection').textContent=description();$('copy-status').textContent='';
    try{localStorage.setItem('sidelens-font-study',JSON.stringify({selected,size:$('size').value,leading:$('leading').value,heavy:$('heavy').checked}));}catch{}
  }
  for(const id of ['size','leading','heavy'])$(id).addEventListener('input',update);
  $('reset').addEventListener('click',()=>{$('size').value='16';$('leading').value='1.85';$('heavy').checked=false;update();});
  $('copy').addEventListener('click',async()=>{
    if(!selected){$('copy-status').textContent='先选一款喜欢的字体。';return;}
    try{await navigator.clipboard.writeText(description());$('copy-status').textContent='已复制，可以粘贴到聊天里。';}
    catch{$('copy-status').textContent='可直接告诉我：'+description();}
  });
  try{const saved=JSON.parse(localStorage.getItem('sidelens-font-study')||'null');if(saved){selected=fonts.some(font=>font.id===saved.selected)?saved.selected:'';if(Number(saved.size)>=14&&Number(saved.size)<=18)$('size').value=saved.size;if(Number(saved.leading)>=1.6&&Number(saved.leading)<=2.1)$('leading').value=saved.leading;$('heavy').checked=saved.heavy===true;}}catch{}
  update();
})();
