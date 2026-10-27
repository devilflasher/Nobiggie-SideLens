// Local simulated-provider QA. Never opens an existing profile or calls Grok.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dependencies=process.env.SIDELENS_NODE_MODULES||join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules');
const require=createRequire(join(dependencies,'__qa.cjs'));
const {chromium}=require('playwright');
const sharp=require('sharp');
const base=process.argv[2];
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw new Error('Pass the loopback URL printed by tools/preview-server.mjs');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const report={environment:'Isolated Edge, local fixtures, simulated provider only',checks:[],errors:[],externalRequests:[]};
const output=join(root,'docs/assets');await mkdir(output,{recursive:true});await mkdir(join(root,'artifacts'),{recursive:true});
function check(name,value){assert.ok(value,name);report.checks.push(name);}
try{
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    document.addEventListener('DOMContentLoaded',()=>document.body.classList.add('theme-light'));
    let core;window.sidelensPostReads=0;
    Object.defineProperty(window,'XGrokCore',{configurable:true,get:()=>core,set:value=>{
      core={...value};
      for(const method of ['extractPost','extractPostContext'])if(value[method])core[method]=(...args)=>{window.sidelensPostReads++;return value[method](...args);};
    }});
  });
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==base){report.externalRequests.push(route.request().url());return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(base+'/demo/index.html?provider=api');
  await page.locator('sidelens-trigger').first().waitFor();
  await page.mouse.wheel(0,500);await page.waitForTimeout(1100);
  check('scrolling makes zero analysis requests',!(await page.locator('#log').innerText()).includes('模拟分析 1'));
  check('scrolling performs no post extraction, including the draft module',await page.evaluate(()=>sidelensPostReads===0));
  await page.evaluate(()=>scrollTo(0,0));
  const placement=await page.evaluate(()=>{
    const article=document.querySelector('article'),trigger=article.querySelector('sidelens-trigger').getBoundingClientRect(),grok=article.querySelector('[aria-label="Grok actions"]').getBoundingClientRect();
    return trigger.width===22&&trigger.height===22&&trigger.right<=grok.left+1&&Math.abs(trigger.top+trigger.height/2-grok.top-grok.height/2)<1;
  });check('22px trigger aligns with Grok in the post header',placement);
  await page.locator('sidelens-trigger').first().locator('button').click();
  const drawer=page.locator('grok-first-card').first();
  await drawer.locator('.retry').waitFor({state:'visible'});
  check('one click makes one analysis request',(await page.locator('#log').innerText()).includes('模拟分析 1 次'));
  check('drawer shows original generation time',await drawer.locator('.cache-meta').isVisible());
  await page.screenshot({path:join(output,'sidelens-drawer.png'),animations:'disabled'});
  check('configurable reply drafting replaces the legacy comment action',await drawer.locator('.reply-generate').isVisible()&&await drawer.locator('.generate-comments').count()===0);
  await drawer.locator('.post-context').click();check('clicking inside preserves the drawer',await drawer.isVisible());
  await page.mouse.click(30,120);await drawer.waitFor({state:'hidden'});check('clicking the page outside closes the drawer',!(await drawer.isVisible()));
  await page.locator('sidelens-trigger').first().locator('button').click();
  check('close/reopen retains the completed result without billing',(await page.locator('#log').innerText()).includes('模拟分析 1 次'));
  await page.reload();await page.locator('sidelens-trigger').first().locator('button').click();
  await page.locator('.cache-meta').filter({hasText:'缓存'}).waitFor();
  check('reload reuses persistent cached results',(await page.locator('#log').innerText()).includes('尚未发起模拟请求'));
  await page.locator('grok-first-card').first().getByRole('button',{name:'重新分析',exact:true}).click();
  await page.locator('grok-first-card').first().locator('.retry').waitFor({state:'visible'});
  check('force refresh calls the simulated provider',(await page.locator('#log').innerText()).includes('模拟分析 1 次'));
  await page.setViewportSize({width:390,height:844});
  const geometry=await page.locator('grok-first-card').first().boundingBox();
  check('narrow drawer stays within viewport',geometry.x>=0&&geometry.x+geometry.width<=390.5);
  await page.screenshot({path:join(output,'sidelens-drawer-narrow.png'),animations:'disabled'});
  await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});check('Escape closes the drawer',!(await drawer.isVisible()));
  await page.setViewportSize({width:1440,height:960});
  await page.goto(base+'/demo/index.html?provider=api&formatting=1');
  await page.locator('sidelens-trigger').first().locator('button').click();
  const rich=page.locator('grok-first-card').first();await rich.locator('.answer table').waitFor();
  const typography=await rich.locator('.answer').evaluate(element=>{
    const css=getComputedStyle(element);return {font:css.fontFamily,size:css.fontSize,leading:css.lineHeight,weight:css.fontWeight};
  });
  check('selected reading typography is Noto Sans SC / 14px / 1.85',typography.font.includes('Noto Sans SC')&&typography.size==='14px'&&Math.abs(parseFloat(typography.leading)-25.9)<.1&&typography.weight==='400');
  check('wordmark retains its Arial font',await page.locator('.rail-brand-name').evaluate(element=>getComputedStyle(element).fontFamily.includes('Arial')));
  check('small headings use ink background and light text',await rich.locator('.answer h3').first().evaluate(element=>{const css=getComputedStyle(element);return css.backgroundColor==='rgb(24, 24, 17)'&&css.color==='rgb(255, 249, 237)';}));
  check('tables have a light-on-ink header',await rich.locator('.answer th').first().evaluate(element=>{const css=getComputedStyle(element);return css.backgroundColor==='rgb(24, 24, 17)'&&css.color==='rgb(255, 249, 237)';}));
  check('quotes retain a clear left rule',await rich.locator('.answer blockquote').evaluate(element=>getComputedStyle(element).borderLeftWidth==='3px'));
  check('long fully-bold paragraphs render at regular weight',await rich.locator('.md-body-emphasis > strong').evaluate(element=>getComputedStyle(element).fontWeight==='400'));
  check('short important phrases retain semibold weight',await rich.locator('.answer p > strong').first().evaluate(element=>getComputedStyle(element).fontWeight==='600'));
  const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  const {result:fontTarget}=await cdp.send('Runtime.evaluate',{expression:'document.querySelector("grok-first-overlay").shadowRoot.querySelector("grok-first-card").shadowRoot.querySelector(".answer p")'});
  const {nodeId}=await cdp.send('DOM.requestNode',{objectId:fontTarget.objectId});
  const {fonts:actualFonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
  check('Chinese text actually uses the selected font, without fallback',actualFonts.some(font=>font.familyName==='Noto Sans SC'&&font.glyphCount>0));
  await page.screenshot({path:join(output,'sidelens-formatting.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  check('formatted table fits the narrow drawer',await rich.locator('.answer table').evaluate(element=>element.getBoundingClientRect().width<=element.parentElement.getBoundingClientRect().width+1));
  await page.screenshot({path:join(output,'sidelens-formatting-narrow.png'),animations:'disabled'});
  for(const surface of ['options','popup','history','setup']){
    await page.setViewportSize({width:1440,height:960});await page.goto(base+`/demo/${surface}.html?lang=zh-CN`);
    const style=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundColor}));
    check(`${surface}: paper/ink/red theme and no horizontal overflow`,style.bg==='rgb(242, 238, 223)'&&style.scroll<=style.width);
    if(surface==='options'){
      const footer=page.locator('.settings-footer');
      check('settings footer contains only the SideLens privacy link',await footer.locator('a').count()===1&&!(await footer.innerText()).match(/PaulWei|Grok 可能出错|作者/));
      const credits=page.locator('.settings-credits');
      check('Settings explicitly thanks original author coolish with safe author, project and license links',await credits.innerText().then(value=>value.includes('感谢原作者 @coolish 的贡献'))&&await credits.locator('a').count()===3&&await credits.locator('a[href="https://x.com/coolish"]').getAttribute('rel')==='noopener noreferrer');
      check('comment customization is not exposed',!(await page.locator('#comments-customization').isVisible()));
      await footer.scrollIntoViewIfNeeded();await page.screenshot({path:join(output,'sidelens-options-footer.png'),animations:'disabled'});await page.evaluate(()=>scrollTo(0,0));
    }
    await page.screenshot({path:join(output,`sidelens-${surface}.png`),animations:'disabled'});
    if(surface==='options'){
      await page.evaluate(()=>SideLensAppearance.apply(document.documentElement,'dark'));
      check('settings dark theme uses a dark canvas and readable form fields',await page.evaluate(()=>getComputedStyle(document.body).backgroundColor==='rgb(16, 17, 19)'&&getComputedStyle(document.querySelector('select')).backgroundColor==='rgb(25, 27, 30)'));
      await page.screenshot({path:join(output,'sidelens-options-dark.png'),animations:'disabled'});
      await page.evaluate(()=>SideLensAppearance.apply(document.documentElement,'light'));
    }

    await page.setViewportSize({width:390,height:844});
    check(`${surface}: narrow layout has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  }
  await page.setViewportSize({width:1440,height:960});
  await page.goto(base+'/demo/index.html?provider=api&formatting=1');
  await page.locator('sidelens-trigger').first().locator('button').click();
  await page.locator('.followup-suggestion').nth(2).waitFor();
  check('analysis automatically gets exactly three follow-up suggestions',await page.locator('.followup-suggestion').count()===3);
  check('suggestions are generated once per mounted analysis',await page.evaluate(()=>sidelensFollowupCalls.filter(call=>call.mode==='suggestions').length===1));
  const beforeForged=await page.evaluate(()=>sidelensFollowupCalls.length);
  await page.locator('.followup-input').fill('Forged script question');
  await page.locator('.followup-form').evaluate(form=>{form.querySelector('button').click();form.requestSubmit();});
  check('scripted button clicks and form submissions cannot start paid follow-ups',await page.evaluate(()=>sidelensFollowupCalls.length)===beforeForged);
  const suggested=await page.locator('.followup-suggestion').first().textContent();
  await page.locator('.followup-suggestion').first().click();
  await page.locator('.followup-assistant').first().getByText('先核对来源和适用条件。',{exact:false}).waitFor();
  await page.waitForTimeout(400);
  check('clicking a suggestion sends that exact question',await page.evaluate(question=>sidelensFollowupCalls.find(call=>call.mode==='answer').question===question,suggested));
  check('follow-up is appended without replacing initial findings',await page.locator('.post-context').isVisible()&&await page.locator('.followup-user').count()===1);
  await page.locator('.followup-input').fill('请根据上一个回答继续解释比较口径。');
  await page.locator('.followup-submit').click();
  await page.locator('.followup-assistant').nth(1).getByText('先核对来源和适用条件。',{exact:false}).waitFor();
  await page.waitForTimeout(400);
  check('second follow-up carries the preceding question and answer',await page.evaluate(()=>{const calls=sidelensFollowupCalls.filter(call=>call.mode==='answer');return calls.length===2&&calls[1].turns.length===2&&calls[1].turns[0].content===calls[0].question&&calls[1].turns[1].role==='assistant';}));
  check('each follow-up answer refreshes three suggestions',await page.evaluate(()=>sidelensFollowupCalls.filter(call=>call.mode==='suggestions').length===3)&&await page.locator('.followup-suggestion').count()===3);
  check('community button uses the supplied local logo and canonical destination',await page.locator('.community-link').evaluate(el=>el.href==='https://nobiggie.xyz/chat'&&el.rel.includes('noopener')&&el.querySelector('img').complete&&el.querySelector('img').naturalWidth>0));
  check('community motion respects reduced-motion preference',await page.locator('.community-logo').evaluate(el=>getComputedStyle(el).animationName==='none'));
  await page.emulateMedia({reducedMotion:'no-preference'});
  check('community logo has a subtle enabled animation',await page.locator('.community-logo').evaluate(el=>getComputedStyle(el).animationName==='community-wave'));
  for(const [theme,bodyClass,color]of [['dim','theme-dim','rgb(21, 32, 43)'],['dark','','rgb(16, 17, 19)'],['light','theme-light','rgb(242, 238, 223)']]){
    await page.evaluate(value=>{document.body.className=value;},bodyClass);
    await page.waitForFunction(value=>document.querySelector('grok-first-overlay').dataset.sidelensTheme===value,theme);
    check(theme+': drawer follows the actual X background',await page.locator('grok-first-card .card').evaluate((el,value)=>getComputedStyle(el).backgroundColor===value,color));
    check(theme+': text and muted text remain readable',await page.locator('grok-first-card .card').evaluate(el=>{
      const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      const bg=luminance(getComputedStyle(el).backgroundColor);return [getComputedStyle(el).color,getComputedStyle(el.querySelector('.cache-meta')).color].every(value=>{const fg=luminance(value);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5;});
    }));
    const triggerButton=page.locator('sidelens-trigger').first().locator('button');
    await page.mouse.move(30,30);
    const pixels=await sharp(await triggerButton.screenshot({path:join(output,'sidelens-trigger-'+theme+'.png')})).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const ink=theme==='light'?[188,23,35]:[255,120,130];let glyphPixels=0;
    for(let y=3;y<19;y++)for(let x=3;x<19;x++){const at=(y*pixels.info.width+x)*4;if(ink.every((value,channel)=>Math.abs(value-pixels.data[at+channel])<45))glyphPixels++;}
    check(theme+': trigger has a colored glyph with open space, not a solid pale square',glyphPixels>=10&&glyphPixels<150);
    if(theme!=='light')await page.screenshot({path:join(output,'sidelens-'+theme+'.png'),animations:'disabled'});
  }
  const reply=page.locator('.reply-draft');
  check('reply controls sit immediately below reanalysis',await reply.evaluate(el=>el.previousElementSibling.classList.contains('actions')));
  check('reply target lengths include all five requested choices',await page.locator('.reply-length').evaluate(el=>Array.from(el.options,option=>Number(option.value)).join(',')==='50,100,300,500,1000'));
  await page.locator('.reply-tone').selectOption('professional');await page.locator('.reply-direction').selectOption('challenge');await page.locator('.reply-length').selectOption('1000');
  const beforeReply=await page.evaluate(()=>sidelensFollowupCalls.length);
  await page.locator('.reply-generate').evaluate(el=>el.click());
  check('scripted clicks cannot generate reply drafts',await page.evaluate(()=>sidelensFollowupCalls.length)===beforeReply);
  const analysisBeforeReply=await page.locator('grok-first-card .answer').first().textContent();
  await page.locator('.reply-generate').click();
  await page.waitForFunction(()=>{const card=document.querySelector('grok-first-overlay').shadowRoot.querySelector('grok-first-card').shadowRoot;return card.querySelector('.reply-copy').hidden===false;});
  check('reply generation carries preferences, original analysis and completed discussion',await page.evaluate(()=>{const call=sidelensFollowupCalls.findLast(call=>call.mode==='reply');return call.preferences.tone==='professional'&&call.preferences.direction==='challenge'&&call.preferences.length===1000&&call.post.text&&call.analysis.text&&call.turns.length===4;}));
  check('drafting preserves the initial analysis and does not add a chat turn',await page.locator('grok-first-card .answer').first().textContent()===analysisBeforeReply&&await page.locator('.followup-user').count()===2);
  check('draft text is editable and actual character count updates',await page.locator('.reply-output').evaluate(el=>!el.readOnly));
  await page.locator('.reply-output').fill('我修改后的回复草稿。');
  check('edited draft count reflects the actual text',await page.locator('.reply-count').textContent()==='实际字数：10');
  await page.evaluate(()=>{window.sidelensCopiedText='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.sidelensCopiedText=value;}}});});
  await page.locator('.reply-copy').click();
  check('copy uses edited draft text without publishing',await page.evaluate(()=>sidelensCopiedText==='我修改后的回复草稿。'));
  const beforePreferenceChange=await page.evaluate(()=>sidelensFollowupCalls.length);
  await page.locator('.reply-length').selectOption('100');await page.locator('.reply-tone').selectOption('friendly');await page.locator('.reply-direction').selectOption('add_context');
  check('changing reply preferences does not automatically spend tokens',await page.evaluate(()=>sidelensFollowupCalls.length)===beforePreferenceChange);
  await page.locator('.reply-generate').click();
  await page.locator('.reply-status').filter({hasText:'草稿已生成'}).waitFor();
  check('explicit regeneration applies the updated reply preferences',await page.evaluate(()=>{const call=sidelensFollowupCalls.findLast(call=>call.mode==='reply');return call.preferences.length===100&&call.preferences.tone==='friendly'&&call.preferences.direction==='add_context';}));

  await page.setViewportSize({width:390,height:844});
  await page.locator('.reply-output').scrollIntoViewIfNeeded();
  check('reply controls and editable draft fit 390px width',await reply.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.querySelector('textarea').getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:join(output,'sidelens-reply-narrow.png'),animations:'disabled'});
  await page.evaluate(()=>{document.body.className='';});
  await page.waitForFunction(()=>document.querySelector('grok-first-overlay').dataset.sidelensTheme==='dark');
  await page.screenshot({path:join(output,'sidelens-reply-dark.png'),animations:'disabled'});
  await page.evaluate(()=>{document.body.className='theme-light';});
  await page.locator('.followup-input').scrollIntoViewIfNeeded();
  check('follow-up form and footer fit a 390px drawer',await page.evaluate(()=>{const card=document.querySelector('grok-first-overlay').shadowRoot.querySelector('grok-first-card').shadowRoot.querySelector('.card'),footer=document.querySelector('grok-first-overlay').shadowRoot.querySelector('.community-link').getBoundingClientRect();return card.scrollWidth<=card.clientWidth&&footer.right<=innerWidth&&footer.left>=0;}));
  await page.screenshot({path:join(output,'sidelens-followup-narrow.png'),animations:'disabled'});
  check('no page errors',report.errors.length===0);check('no external provider or asset requests',report.externalRequests.length===0);
  await writeFile(join(root,'artifacts/sidelens-browser-qa.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`SideLens browser QA: ${report.checks.length} checks passed.`);
}finally{await browser.close();}
