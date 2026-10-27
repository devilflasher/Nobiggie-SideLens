(function(root){
  'use strict';
  function create({send,canSend,render,language,wake,cancelWake}){
    const requests=new Map();
    const text=(zh,en)=>language().startsWith('zh')?zh:en;
    const node=(tag,cls,value='')=>{const el=document.createElement(tag);el.className=cls;el.textContent=value;return el;};
    function attach(entry){
      const section=node('section','followup');section.hidden=true;
      const heading=node('h2','followup-heading'),history=node('div','followup-history');
      const form=node('form','followup-form'),input=node('textarea','followup-input'),submit=node('button','followup-submit');
      input.rows=2;input.maxLength=2000;submit.type='submit';
      const status=node('p','followup-status'),suggestions=node('div','followup-suggestions'),retry=node('button','followup-suggestions-retry');
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');retry.type='button';retry.hidden=true;
      const usage=node('p','followup-usage');usage.hidden=true;
      form.append(input,submit);section.append(heading,history,form,status,suggestions,retry,usage);
      const replySection=node('section','reply-draft');replySection.hidden=true;
      const replyHeading=node('h2','reply-heading'),replyHint=node('p','reply-hint'),controls=node('div','reply-controls');
      const tones={natural:['自然','Natural'],professional:['专业','Professional'],friendly:['友好','Friendly'],sharp:['犀利','Direct'],humorous:['幽默','Humorous']};
      const directions={discuss:['理性讨论','Discussion'],support:['认同延伸','Support & extend'],question:['提出问题','Ask a question'],challenge:['审慎质疑','Question evidence'],add_context:['补充信息','Add context']};
      function field(name,values,labels){
        const label=node('label','reply-field'),title=node('span'),select=node('select','reply-'+name);
        for(const value of values){const option=node('option','',labels?text(...labels[value]):String(value));option.value=String(value);select.append(option);}
        label.append(title,select);controls.append(label);return {title,select,labels};
      }
      const tone=field('tone',root.XGrokCore.REPLY_OPTIONS.tones,tones),direction=field('direction',root.XGrokCore.REPLY_OPTIONS.directions,directions),length=field('length',root.XGrokCore.REPLY_OPTIONS.lengths);
      length.select.value='100';
      const generate=node('button','reply-generate'),replyStatus=node('p','reply-status'),draft=node('textarea','reply-output'),count=node('span','reply-count'),copy=node('button','reply-copy'),replyActions=node('div','reply-actions');
      generate.type=copy.type='button';draft.rows=8;draft.maxLength=10000;draft.hidden=true;copy.hidden=true;count.hidden=true;replyStatus.setAttribute('role','status');replyStatus.setAttribute('aria-live','polite');
      replyActions.append(count,copy);replySection.append(replyHeading,replyHint,controls,generate,replyStatus,draft,replyActions);
      const reply={section:replySection,tone,direction,length,generate,status:replyStatus,draft,count,copy,hasDraft:false};
      const state={entry,section,input,submit,status,suggestions,retry,usage,reply,turns:[],busy:false,suggesting:false,key:'',analysis:null,total:0};
      function updateCount(){count.textContent=text('实际字数：','Characters: ')+Array.from(draft.value||'').length;}
      function refresh(){
        heading.textContent=text('继续追问','Ask a follow-up');input.placeholder=text('针对这篇帖子和分析继续提问…','Ask about this post and its analysis…');
        input.setAttribute('aria-label',text('追问内容','Follow-up question'));submit.textContent=state.busy&&state.busyMode==='answer'?text('回答中…','Answering…'):text('提交追问','Ask');
        submit.disabled=state.busy||!canSend();input.disabled=state.busy;
        retry.textContent=text('重试生成问题建议','Retry question suggestions');retry.disabled=state.suggesting||!canSend();
        replyHeading.textContent=text('生成回复草稿','Draft a reply');replyHint.textContent=text('参考原帖、分析和最近三轮讨论；目标字数为近似值。','Uses the post, analysis and three recent exchanges. Length is approximate.');
        tone.title.textContent=text('语气','Tone');direction.title.textContent=text('方向','Direction');length.title.textContent=text('目标字数','Target length');
        for(const field of [tone,direction,length]){field.select.disabled=state.busy;field.select.setAttribute('aria-label',field.title.textContent);if(field.labels)for(const option of field.select.children)option.textContent=text(...field.labels[option.value]);}
        generate.textContent=state.busy&&state.busyMode==='reply'?text('生成中…','Drafting…'):text('生成回复','Generate reply');generate.disabled=state.busy||!canSend();
        copy.textContent=text('复制回复','Copy reply');copy.disabled=state.busy||!draft.value.trim();draft.readOnly=state.busy;draft.setAttribute('aria-label',text('可编辑的回复草稿','Editable reply draft'));updateCount();
      }
      function start(mode,question=''){
        if(!state.analysis||!canSend()||state.busy||state.suggesting&&mode==='suggestions')return;
        if(mode==='answer'&&(!question.trim()||question.length>2000))return;
        if(wake?.(entry,()=>start(mode,question))){retry.hidden=false;return;}
        const requestId=crypto.randomUUID(),record={state,mode};
        if(mode==='reply'){
          state.busy=true;state.busyMode='reply';record.previousReply=draft.value;draft.hidden=false;count.hidden=false;
          replyStatus.textContent=text('正在结合原文、分析与讨论生成回复…','Drafting from the post, analysis and discussion…');
        }else if(mode==='answer'){
          state.busy=true;state.busyMode='answer';state.turns.push({role:'user',content:question.trim()});input.value='';
          const bubble=node('div','followup-turn followup-user',question.trim());record.bubble=bubble;history.append(bubble);
          record.answer=node('div','answer followup-assistant');record.answer.setAttribute('dir','auto');history.append(record.answer);
          record.question=question.trim();state.status.textContent=text('正在检索并回答…','Researching your question…');
        }else{state.suggesting=true;status.textContent=text('正在生成 3 个追问建议…','Generating 3 follow-up suggestions…');retry.hidden=true;}
        requests.set(requestId,record);refresh();
        const turns=state.turns.slice(mode==='answer'?-7:-6,mode==='answer'?-1:undefined);
        if(!send({type:'FOLLOW_UP',requestId,post:entry.post,analysis:state.analysis,mode,question,turns,...(mode==='reply'?{preferences:{tone:tone.select.value,direction:direction.select.value,length:Number(length.select.value)}}:{})})){requests.delete(requestId);fail(record,text('连接已断开，请重试。','Disconnected. Please retry.'));}
      }
      function fail(record,message){
        if(record.mode==='reply'){
          state.busy=false;draft.value=record.previousReply||'';draft.hidden=!draft.value;copy.hidden=!draft.value;replyStatus.textContent=message;refresh();return;
        }else if(record.mode==='answer'){
          state.busy=false;
          // Failed turns are not sent back as completed conversation context.
          if(state.turns.at(-1)?.role==='user')state.turns.pop();
          if(!input.value)input.value=record.question;
          record.answer?.remove();record.bubble?.remove();
        }else{state.suggesting=false;retry.hidden=false;}
        state.status.textContent=message;refresh();
      }
      state.refresh=refresh;state.fail=fail;state.start=start;
      state.reset=()=>{cancelWake?.(entry);for(const [id,r]of requests)if(r.state===state){send({type:'CANCEL',requestId:id});requests.delete(id);}state.turns=[];state.busy=state.suggesting=false;state.key='';state.analysis=null;state.total=0;section.hidden=replySection.hidden=true;replyStatus.textContent='';reply.hasDraft=false;draft.value='';draft.hidden=copy.hidden=count.hidden=true;history.replaceChildren();suggestions.replaceChildren();status.textContent='';usage.hidden=true;input.value='';};
      state.setAnalysis=result=>{
        if(!result?.text||['incomplete','failed'].includes(result.verificationStatus))return;
        section.hidden=replySection.hidden=false;const key=String(result.completedAt)+'\n'+result.text;
        if(state.key===key){refresh();return;}
        state.reset();section.hidden=replySection.hidden=false;state.key=key;state.analysis={text:result.text,sources:result.sources||[]};refresh();start('suggestions');
      };
      form.addEventListener('submit',event=>event.preventDefault());
      submit.addEventListener('click',event=>{event.preventDefault();if(event.isTrusted===false||submit.disabled)return;start('answer',input.value);});
      retry.addEventListener('click',event=>{if(event.isTrusted===false)return;start('suggestions');});
      generate.addEventListener('click',event=>{if(event.isTrusted===false||generate.disabled)return;start('reply');});
      copy.addEventListener('click',async event=>{if(event.isTrusted===false||copy.disabled)return;try{await navigator.clipboard.writeText(draft.value);replyStatus.textContent=text('已复制，可粘贴到 X 后自行发布。','Copied. Review and publish on X yourself.');}catch{replyStatus.textContent=text('复制失败，请选中文字复制。','Select the text to copy manually.');}});
      draft.addEventListener('input',()=>{updateCount();copy.disabled=state.busy||!draft.value.trim();});
      for(const field of [tone,direction,length])field.select.addEventListener('change',()=>{if(reply.hasDraft)replyStatus.textContent=text('偏好已改变，点击生成回复以重新生成。','Preferences changed. Generate a new reply to apply them.');});
      refresh();return state;
    }
    function handle(message){
      const record=requests.get(message.requestId);if(!record)return false;
      const {state,mode}=record;
      if(message.type==='UPDATE'&&mode==='answer'&&typeof message.text==='string')render(record.answer,message.text,message.sources);
      if(message.type==='UPDATE'&&mode==='reply'&&typeof message.text==='string'){state.reply.draft.value=message.text;state.refresh();}
      if(message.type==='RESULT'){
        const result=message.result||{};
        if(['incomplete','failed'].includes(result.verificationStatus)||!result.text){state.fail(record,text('回答未完成，请重试。','The answer was incomplete. Please retry.'));}
        else if(mode==='suggestions'){
          const values=result.suggestions;
          if(!Array.isArray(values)||values.length!==3||values.some(value=>typeof value!=='string'||!value.trim()||Array.from(value).length>280)||new Set(values).size!==3){state.fail(record,text('问题建议生成失败，可重试。','Could not generate suggestions. You can retry.'));}
          else{state.suggesting=false;if(!state.busy)state.status.textContent='';state.suggestions.replaceChildren();
            for(const value of values){const button=node('button','followup-suggestion',value);button.type='button';button.addEventListener('click',event=>{if(event.isTrusted===false)return;state.start('answer',value);});state.suggestions.append(button);}
          }
        }else if(mode==='reply'){state.busy=false;state.reply.hasDraft=true;state.reply.draft.value=result.text;state.reply.draft.hidden=state.reply.copy.hidden=state.reply.count.hidden=false;state.reply.status.textContent=text('草稿已生成，可编辑后复制。','Draft ready. Edit and copy when ready.');}
        else{record.completed=true;state.busy=false;render(record.answer,result.text,result.sources);state.turns.push({role:'assistant',content:result.text.slice(0,5000)});state.turns=state.turns.slice(-6);state.status.textContent='';}
        const count=result.usage?.total_tokens;if(!message.cached&&Number.isFinite(count)){state.total+=count;state.usage.hidden=false;state.usage.textContent=text('追问、建议与回复用量：','Follow-ups, suggestions and replies: ')+state.total.toLocaleString()+' tokens';}
        requests.delete(message.requestId);state.refresh();
        if(record.completed){
          for(const [id,r]of requests)if(r.state===state&&r.mode==='suggestions'){send({type:'CANCEL',requestId:id});requests.delete(id);}state.suggesting=false;state.start('suggestions');
        }
      }
      if(message.type==='ERROR'){state.fail(record,message.error||text('请求失败，请重试。','Request failed. Please retry.'));requests.delete(message.requestId);}
      return true;
    }
    function disconnect(){for(const record of requests.values())record.state.fail(record,text('连接中断，请重新打开面板后重试。','Connection interrupted. Reopen the panel and retry.'));requests.clear();}
    return {attach,handle,disconnect,get activeCount(){return requests.size;}};
  }
  root.SideLensFollowup={create};
})(globalThis);
