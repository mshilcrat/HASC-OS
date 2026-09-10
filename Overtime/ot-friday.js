(()=>{
  'use strict';

  const state={rules:null,lastFile:null,lastResult:null};
  const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const num=v=>{const n=parseFloat(String(v??'').replace(/[$,]/g,'').trim());return Number.isFinite(n)?n:0};

  function parseCSV(text){
    const rows=[];let row=[],cell='',q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(q){
        if(c==='"'&&n==='"'){cell+='"';i++;}
        else if(c==='"') q=false;
        else cell+=c;
      }else{
        if(c==='"') q=true;
        else if(c===','){row.push(cell);cell='';}
        else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
        else cell+=c;
      }
    }
    if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
    return rows.filter(r=>r.some(x=>String(x).trim()!==''));
  }

  function findHeader(headers,aliases){
    const nh=headers.map(norm);
    for(const a of aliases||[]){const i=nh.indexOf(norm(a));if(i>=0)return i;}
    return -1;
  }

  function matchRule(dept,rules){
    const d=norm(dept);
    for(const r of rules.rules||[]){
      const m=r.match||{};
      if(m.exact && norm(m.exact)===d)return r;
      if(Array.isArray(m.exactAny)&&m.exactAny.some(x=>norm(x)===d))return r;
      if(m.contains && d.includes(norm(m.contains)))return r;
      if(Array.isArray(m.containsAny)&&m.containsAny.some(x=>d.includes(norm(x))))return r;
      if(m.regex){try{if(new RegExp(m.regex,'i').test(String(dept)))return r;}catch(_){}}
    }
    const aliases=rules.residenceAliases||{};
    for(const [res,list] of Object.entries(aliases)){
      if([res,...(Array.isArray(list)?list:[])].some(x=>norm(x)===d)) return {action:'map',residence:res,id:'alias'};
    }
    return null;
  }

  async function loadRules(){
    if(state.rules)return state.rules;
    const r=await fetch('/Overtime/ot-rules.json',{cache:'no-store'});
    if(!r.ok)throw new Error('Could not load FRIDAY OT rules');
    state.rules=await r.json();return state.rules;
  }

  function ensureUI(){
    const input=document.querySelector('input[type=file]');
    if(!input)return false;
    if(document.getElementById('fridayOtProcess'))return true;
    const wrap=document.createElement('div');
    wrap.id='fridayOtTools';
    wrap.style.cssText='margin-top:12px;padding:12px 14px;border:1px solid #d8dee8;border-radius:12px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.06);font-family:inherit';
    const btn=document.createElement('button');
    btn.id='fridayOtProcess';btn.type='button';
    btn.textContent='Process HR OT Report';
    btn.style.cssText='border:0;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;background:#0f5ea8;color:#fff';
    const note=document.createElement('div');
    note.id='fridayOtStatus';
    note.style.cssText='margin-top:8px;font-size:13px;color:#475569';
    note.textContent='FRIDAY will read the selected HR file, apply the OT rules, total each residence, and flag anything it cannot identify.';
    const out=document.createElement('div');out.id='fridayOtOutput';out.style.cssText='margin-top:10px';
    wrap.append(btn,note,out);
    const anchor=input.closest('div')||input;
    anchor.parentNode.insertBefore(wrap,anchor.nextSibling);
    btn.addEventListener('click',processSelected);
    input.addEventListener('change',()=>{state.lastFile=input.files&&input.files[0]||null;out.innerHTML='';note.textContent=state.lastFile?'File selected. Click “Process HR OT Report”.':'Select the HR OT file first.';});
    return true;
  }

  function renderResult(result){
    const out=document.getElementById('fridayOtOutput');
    const status=document.getElementById('fridayOtStatus');
    if(!out||!status)return;
    status.textContent=`Processed ${result.rowCount} payroll rows. ${result.mappedCount} mapped, ${result.ignoredCount} ignored, ${result.unmatched.length} unmatched.`;
    const mapped=Object.entries(result.residenceTotals).sort((a,b)=>b[1]-a[1]);
    const lines=mapped.map(([r,h])=>`<tr><td style="padding:6px 8px;border-bottom:1px solid #eef2f7">${escapeHtml(r)}</td><td style="padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:right;font-weight:700">${h.toFixed(2)}</td></tr>`).join('');
    const unmatched=result.unmatched.length?`<div style="margin-top:12px;padding:10px;border-radius:10px;background:#fff7ed;color:#9a3412"><b>Needs mapping (${result.unmatched.length})</b><br>${result.unmatched.slice(0,20).map(x=>`${escapeHtml(x.department)} — ${x.hours.toFixed(2)} OT`).join('<br>')}${result.unmatched.length>20?'<br>…':''}</div>`:'';
    out.innerHTML=`<div style="font-weight:800;margin-bottom:6px">FRIDAY OT Results</div><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:6px 8px">Residence</th><th style="text-align:right;padding:6px 8px">OT Hours</th></tr></thead><tbody>${lines||'<tr><td colspan="2" style="padding:8px">No mapped residence totals yet.</td></tr>'}</tbody></table>${unmatched}`;
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  async function processSelected(){
    const input=document.querySelector('input[type=file]');
    const file=input&&input.files&&input.files[0];
    if(!file){document.getElementById('fridayOtStatus').textContent='Select the HR OT file first.';return;}
    const btn=document.getElementById('fridayOtProcess');btn.disabled=true;btn.textContent='Processing…';
    try{
      const rules=await loadRules();
      const rows=parseCSV(await file.text());
      if(rows.length<2)throw new Error('The file does not contain payroll rows.');
      const headers=rows[0];
      const depIdx=findHeader(headers,rules.headerAliases?.department||[]);
      const otIdx=findHeader(headers,rules.headerAliases?.overtime||[]);
      if(depIdx<0||otIdx<0)throw new Error(`FRIDAY could not find the department or overtime column. Headers: ${headers.join(', ')}`);
      const totals={},unmatched=[],ignored=[];let mappedCount=0;
      for(const row of rows.slice(1)){
        const department=String(row[depIdx]??'').trim();
        const hours=num(row[otIdx]);
        if(!department)continue;
        if(rules.defaults?.ignoreZeroHours && hours===0)continue;
        const rule=matchRule(department,rules);
        if(rule?.action==='ignore'){ignored.push({department,hours,rule:rule.id});continue;}
        if(rule?.action==='map'&&rule.residence){totals[rule.residence]=(totals[rule.residence]||0)+hours;mappedCount++;continue;}
        unmatched.push({department,hours});
      }
      const result={file:file.name,rowCount:rows.length-1,mappedCount,ignoredCount:ignored.length,residenceTotals:totals,unmatched,ignored,generatedAt:new Date().toISOString()};
      state.lastResult=result;window.FRIDAY_OT_RESULT=result;
      window.dispatchEvent(new CustomEvent('friday-ot-processed',{detail:result}));
      renderResult(result);
    }catch(e){document.getElementById('fridayOtStatus').textContent='FRIDAY OT error: '+e.message;}
    finally{btn.disabled=false;btn.textContent='Process HR OT Report';}
  }

  const mo=new MutationObserver(()=>ensureUI());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI);else ensureUI();
  setTimeout(ensureUI,500);setTimeout(ensureUI,1500);
})();
