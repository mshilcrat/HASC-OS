// wb-config.js
// Shared connection for the HASC RM Compliance Workbook.
// This is the PUBLIC (anon) key — safe to be here. Real protection is
// handled by Supabase Row Level Security + each user's login.
window.HASC_CONFIG = {
  SUPABASE_URL: "https://xqcykvgsesavtuautivq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY3lrdmdzZXNhdnR1YXV0aXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzc1ODUsImV4cCI6MjA5MTkxMzU4NX0.A6FkxttGZMGaPxqr1orOWlpoO_zZSeqbp5W3L7s6U5w"
};

/* HASC live updates: re-fetch + re-render whenever watched tables change */
(function(){
    var WATCH = ['resi_individuals','resi_ledger_accounts','resi_ledger_entries','cl_submissions','cl_tasks','cl_done','certificates','training_sessions','profiles','cl_homes'];
    function reload(){
          try{ if(typeof window.sbLoadLedgers==='function'){ Promise.resolve(window.sbLoadLedgers()).then(function(){ if(typeof window.renderLedgers==='function') window.renderLedgers(); }); } }catch(e){}
          var fns = ['loadIndividuals','renderLedgers','renderChecklists','loadChecklistSummary','renderTraining','renderDashboard','renderDayHabCounts','renderIndividuals'];
          fns.forEach(function(n){ try{ if(typeof window[n]==='function') window[n](); }catch(e){} });
    }
    var t = setInterval(function(){
          var sb = window.__hascClient;
          if(!sb || typeof sb.channel!=='function') return;
          clearInterval(t);
          window.__hascLive = WATCH.map(function(tbl){
                  return sb.channel('hasc-live-'+tbl).on('postgres_changes', { event:'*', schema:'public', table:tbl }, function(){ reload(); }).subscribe();
          });
    }, 300);
})();

/* HASC save fix: main app Individuals drawer "Save & Send Live Update" now writes to Supabase */
(function(){
    var wrapT = setInterval(function(){
          if (typeof window.openIndividual === 'function' && !window.__hascOpenWrapped) {
                  window.__hascOpenWrapped = true;
                  var orig = window.openIndividual;
                  window.openIndividual = function(r){ try{ window.__hascOpenId = r && r.id; }catch(e){} return orig.apply(this, arguments); };
                  clearInterval(wrapT);
          }
    }, 300);
    document.addEventListener('click', function(ev){
          var btn = ev.target.closest ? ev.target.closest('button') : null;
          if (!btn || !/Save & Send Live Update/.test(btn.textContent)) return;
          var sb = window.__hascClient; if (!sb) return;
          var id = window.__hascOpenId; if (!id) return;
          function selByLabel(lbl){
                  var s = [].slice.call(document.querySelectorAll('select')).find(function(x){
                            return (x.previousElementSibling && x.previousElementSibling.textContent || '').trim().toLowerCase().indexOf(lbl) > -1;
                  });
                  return s ? s.value : undefined;
          }
          var statusSel = [].slice.call(document.querySelectorAll('select')).find(function(x){
                  return [].slice.call(x.options).some(function(o){ return /Staying Home Sick|At Residence|Early Return/.test(o.value); });
          });
          var status = statusSel ? statusSel.value : undefined;
          var home = selByLabel('residence');
          var dh = selByLabel('day hab participant');
          var svc = selByLabel('day hab service');
          var nameInput = [].slice.call(document.querySelectorAll('input')).find(function(i){
                  return i.previousElementSibling && /name/i.test(i.previousElementSibling.textContent || '');
          });
          var patch = {};
          if (status !== undefined) patch.status = status;
          if (home !== undefined) patch.home_name = home;
          if (dh !== undefined) patch.day_hab_participant = (dh === 'yes' || dh === true);
          if (svc !== undefined) patch.day_hab_service = svc;
          if (nameInput) patch.name = nameInput.value;
          patch.last_shared = new Date().toISOString();
          Promise.resolve(sb.from('resi_individuals').update(patch).eq('id', id)).catch(function(e){ console.warn('HASC save failed', e); });
    }, true);
})();


/* HASC Recent Activity feed: pull trainings + checklists, render live */
(function(){
  var ICON_TRAINING = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 10L12 5 2 10l10 5 10-5z\"/><path d=\"M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5\"/></svg>";
  var ICON_CHECKLIST = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 11l3 3L22 4\"/><path d=\"M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11\"/></svg>";
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function rel(ts){
    if(!ts) return '';
    var d=new Date(ts), s=Math.floor((Date.now()-d.getTime())/1000);
    if(s<60) return 'just now';
    var m=Math.floor(s/60); if(m<60) return m+'m ago';
    var h=Math.floor(m/60); if(h<24) return h+'h ago';
    var dy=Math.floor(h/24); return dy+'d ago';
  }
  async function loadActivityAll(limit){
    var sb=window.__hascClient; if(!sb) return [];
    var out=[];
    try{
      var c=await sb.from('certificates').select('id,individual_name,dsp_name,residence,completed_at,is_archived').order('completed_at',{ascending:false}).limit(limit);
      (c.data||[]).filter(function(x){return !x.is_archived;}).forEach(function(x){
        out.push({ type:'training', ts:x.completed_at, title:(x.individual_name||'Individual')+' — training certified', by:x.dsp_name||'', where:x.residence||'' });
      });
    }catch(e){}
    try{
      var s=await sb.from('cl_submissions').select('id,home_name,submitted_by,submitted_at,frequency,tasks_done,tasks_total').order('submitted_at',{ascending:false}).limit(limit);
      (s.data||[]).forEach(function(x){
        var freq=x.frequency||'daily';
        var prog=(x.tasks_done!=null&&x.tasks_total!=null)?(' ('+x.tasks_done+'/'+x.tasks_total+')'):'';
        out.push({ type:'checklist', ts:x.submitted_at, title:freq.charAt(0).toUpperCase()+freq.slice(1)+' checklist submitted'+prog, by:x.submitted_by||'', where:x.home_name||'' });
      });
    }catch(e){}
    out.sort(function(a,b){ return new Date(b.ts||0)-new Date(a.ts||0); });
    return out.slice(0,limit);
  }
  function iconFor(type){ return type==='checklist' ? ICON_CHECKLIST : ICON_TRAINING; }
  function colorFor(type){ return type==='checklist' ? 'var(--green)' : 'var(--gold)'; }
  function rowHtml(a){
    var by=a.by?(' \u00b7 '+esc(a.by)):'';
    var where=a.where?(' \u00b7 '+esc(a.where)):'';
    var col=colorFor(a.type);
    var icoStyle=' style="background:'+col+';box-shadow:0 8px 18px -9px '+col+'"';
    return '<div class="act"><div class="actico"'+icoStyle+'>'+iconFor(a.type)+'</div><div style="flex:1"><div><b>'+esc(a.title)+'</b></div><div class="when" style="color:var(--muted);font-size:12px">'+rel(a.ts)+where+by+'</div></div></div>';
  }
  async function renderRA(){
    var el=document.getElementById('recentActivity'); if(!el) return;
    try{
      var items=await loadActivityAll(8);
      el.innerHTML=items.length?items.map(rowHtml).join(''):'<div class="lst-empty">No recent activity yet.</div>';
    }catch(e){}
  }
  window.renderRA=renderRA;
  window.loadActivityAll=loadActivityAll;
  function wireViewAll(){
    var b=document.getElementById('activityViewAll'); if(!b) return;
    b.onclick=async function(){
      var items=await loadActivityAll(50);
      var body=items.length?items.map(rowHtml).join(''):'<div class="lst-empty">No recent activity yet.</div>';
      if(window.openDrawer) window.openDrawer('Recent Activity', items.length+' recent events', body);
    };
  }
  var t=setInterval(function(){
    var sb=window.__hascClient;
    if(!sb||typeof sb.channel!=='function') return;
    clearInterval(t);
    renderRA(); wireViewAll();
    ['certificates','cl_submissions','cl_done'].forEach(function(tbl){
      sb.channel('hasc-ra-'+tbl).on('postgres_changes',{event:'*',schema:'public',table:tbl},function(){ renderRA(); }).subscribe();
    });
  },300);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ renderRA(); wireViewAll(); });
  else { renderRA(); wireViewAll(); }
  /* win the load-order race vs index.html's one-time re-render */
  setTimeout(function(){ renderRA(); wireViewAll(); }, 1200);
  setTimeout(function(){ renderRA(); wireViewAll(); }, 2600);
  setInterval(function(){ renderRA(); wireViewAll(); }, 60000);
})();


/* === HASC Widget Dashboard (widgets-dashboard) — additive, self-contained === */
(function(){
  var GCOLS=4, ROWPX=40, GAP=16;
  function boot(){
    var nav=document.querySelector('nav.nav');
    var board=document.querySelector('.board');
    if(!nav||!board||!board.querySelector('.panel')){ return setTimeout(boot,400); }
    if(document.querySelector('.pw-grid')) return;
    function css(t){var s=document.createElement('style');s.textContent=t;document.head.appendChild(s);}
    css(':root{--formsc:#0EA5C4;--maintc:#8A6D3B;--widgetsc:#E07A5F;}');
    var formsSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h8"></path><path d="M8 9h3"></path></svg>';
    var maintSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18l3 3 6.4-6.3a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-.6-.6-2.3z"></path></svg>';
    var gridSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>';
    function navBtn(view,color,svg,label){var b=document.createElement('button');b.className='navbtn';b.setAttribute('data-view',view);b.innerHTML='<span class="navico" style="--acc:var('+color+')">'+svg+'</span>'+label;return b;}
    var BADGE={};
    if(!nav.querySelector('[data-view="forms"]')){
      var forms=navBtn('forms','--formsc',formsSVG,'Forms');
      var maint=navBtn('maintenance','--maintc',maintSVG,'Maintenance');
      var org=null;[].slice.call(nav.children).forEach(function(c){if((c.textContent||'').trim().indexOf('Org Training')>=0)org=c;});
      if(org){nav.insertBefore(forms,org.nextSibling);nav.insertBefore(maint,forms.nextSibling);}else{nav.appendChild(forms);nav.appendChild(maint);}
      BADGE['Forms']=forms.querySelector('.navico').outerHTML;BADGE['Maintenance']=maint.querySelector('.navico').outerHTML;
    }
    nav.querySelectorAll('.navbtn').forEach(function(el){var t=(el.textContent||'').trim().replace(/NEW$/,'').trim();var ic=el.querySelector('.navico');if(t&&ic&&!BADGE[t])BADGE[t]=ic.outerHTML;});
    var HIDE=['focus board','departures & returns',"today's checklist progress"];
    var allPanels=[].slice.call(document.querySelectorAll('.panel'));
    allPanels.forEach(function(p){var h=(p.querySelector('.ph,h1,h2,h3')||{}).textContent||'';if(HIDE.some(function(k){return h.toLowerCase().indexOf(k)>=0;}))p.dataset.pwHidden='1';});
    var visible=allPanels.filter(function(p){return !p.dataset.pwHidden && getComputedStyle(p).display!=='none';});
    var grid=document.createElement('div');grid.className='pw-grid';board.parentNode.insertBefore(grid,board);board.style.display='none';
    document.querySelectorAll('.panel[data-pw-hidden="1"]').forEach(function(p){p.style.display='none';});
    css('.pw-grid{display:grid;grid-template-columns:repeat('+GCOLS+',minmax(0,1fr));grid-auto-rows:'+ROWPX+'px;gap:'+GAP+'px;padding:16px;align-items:start;}'
      +'.pw-grid>*{margin:0!important;overflow:hidden!important;}'
      +'body.pw-edit .pw-grid>*{outline:2px dashed #14b8a6;outline-offset:2px;border-radius:14px;}'
      +'.pw-chips{position:absolute;top:14px;right:14px;display:none;gap:4px;z-index:5;}body.pw-edit .pw-chips{display:flex;}'
      +'.pw-chip{width:26px;height:24px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;font:600 12px system-ui;cursor:pointer;color:#334155;}.pw-chip.on{background:#14b8a6;color:#fff;border-color:#14b8a6;}'
      +'.pw-x{position:absolute;top:-9px;left:-9px;width:22px;height:22px;border-radius:50%;background:#ef4444;color:#fff;border:none;font:700 13px system-ui;cursor:pointer;display:none;z-index:6;}body.pw-edit .pw-x{display:block;}'
      +'.pw-appwidget{background:#fff;border-radius:14px;box-shadow:var(--shadow);padding:16px;position:relative;}.pw-appwidget--embed{padding:0;display:flex;flex-direction:column;overflow:hidden;height:100%;}.pw-appwidget--embed .pw-aw-head{padding:14px 16px;border-bottom:1px solid #eef2f7;}'
      +'.pw-appwidget .pw-aw-head{display:flex;align-items:center;gap:10px;font:700 15px system-ui;color:var(--ink);}'
      +'.pw-appwidget .pw-open{margin-top:12px;display:inline-block;color:var(--teal-ink);font:600 13px system-ui;cursor:pointer;}'
      +'.pw-hot{outline:3px solid #14b8a6!important;background:rgba(20,184,166,.08);border-radius:14px;}'
      +'.pw-toolbar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;gap:8px;background:#0f172a;padding:8px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.3);}'
      +'.pw-toolbar button{border:none;border-radius:8px;padding:8px 14px;font:600 13px system-ui;cursor:pointer;background:#334155;color:#fff;}.pw-toolbar button.pri{background:#14b8a6;}'
      +'.pw-gback{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:none;align-items:center;justify-content:center;}'
      +'.pw-gal{background:#fff;border-radius:16px;padding:22px;width:min(680px,92vw);max-height:80vh;overflow:auto;}'
      +'.pw-gal h3{margin:0 0 14px;font:700 18px system-ui;color:var(--ink);}'
      +'.pw-gtiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}'
      +'.pw-gtile{border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;cursor:pointer;font:600 14px system-ui;color:var(--ink);}'
      +'.pw-gtile:hover{border-color:#14b8a6;background:#f0fdfa;}');
    var W=[];var drag=null;var HIDDEN=[];function pwPanelName(el){try{if(el.classList.contains('pw-appwidget')){var hh=el.querySelector('.pw-aw-head');return hh?hh.textContent.replace(/[\u00d7].*$/,'').trim():'Panel';}var h2=el.querySelector('h2,h3');return h2?h2.textContent.trim():'Panel';}catch(e){return 'Panel';}}
    function rowsFor(p,w){var colW=(grid.clientWidth-32-(GCOLS-1)*GAP)/GCOLS;var target=colW*w+(w-1)*GAP;var pw=p.style.width,pgc=p.style.gridColumn,pgr=p.style.gridRow;p.style.gridColumn='';p.style.gridRow='';p.style.width=target+'px';var h=p.scrollHeight;p.style.width=pw;p.style.gridColumn=pgc;p.style.gridRow=pgr;return Math.max(2,Math.ceil((h+GAP)/(ROWPX+GAP)));}
    function autoPack(){var occ={};function fits(cs,rs,w,h){for(var c=cs;c<cs+w;c++)for(var r=rs;r<rs+h;r++)if(occ[c+','+r])return false;return true;}function mark(cs,rs,w,h){for(var c=cs;c<cs+w;c++)for(var r=rs;r<rs+h;r++)occ[c+','+r]=1;}W.forEach(function(it){it.h=rowsFor(it.p,it.w);var pl=false;for(var r=1;r<400&&!pl;r++)for(var c=1;c<=GCOLS-it.w+1&&!pl;c++){if(fits(c,r,it.w,it.h)){it.cs=c;it.rs=r;mark(c,r,it.w,it.h);pl=true;}}});}
    function applyLayout(){W.forEach(function(it){it.p.style.gridColumn=it.cs+' / span '+it.w;it.p.style.gridRow=it.rs+' / span '+it.h;});}
    function s2s(s){return s==='S'?1:s==='M'?2:4;}function sp2s(w){return w===1?'S':w===2?'M':'L';}
    function addWidget(p,w){grid.appendChild(p);p.style.position='relative';var it={p:p,w:w||2,cs:1,rs:1,h:2};W.push(it);
      var chips=document.createElement('div');chips.className='pw-chips';['S','M','L'].forEach(function(s){var b=document.createElement('button');b.className='pw-chip';b.textContent=s;if(sp2s(it.w)===s)b.classList.add('on');b.onclick=function(e){e.stopPropagation();it.w=s2s(s);autoPack();applyLayout();chips.querySelectorAll('.pw-chip').forEach(function(x){x.classList.remove('on');});b.classList.add('on');saveLayout();};chips.appendChild(b);});p.appendChild(chips);
      var x=document.createElement('button');x.className='pw-x';x.textContent='\u00d7';x.onclick=function(e){e.stopPropagation();it._widx=W.indexOf(it);W=W.filter(function(z){return z!==it;});it._name=pwPanelName(p);HIDDEN.push(it);p.style.display='none';autoPack();applyLayout();saveLayout();};p.appendChild(x);
      p.draggable=true;p.addEventListener('dragstart',function(e){if(!document.body.classList.contains('pw-edit')){e.preventDefault();return;}drag=it;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text','x');});return it;}
    visible.forEach(function(p){addWidget(p,2);});
    function cellFromPointer(x,y){var r=grid.getBoundingClientRect();var colW=(r.width-32-(GCOLS-1)*GAP)/GCOLS;var c=Math.floor((x-r.left-16)/(colW+GAP))+1;c=Math.max(1,Math.min(GCOLS,c));var rr=Math.floor((y-r.top-16)/(ROWPX+GAP))+1;return{c:c,r:Math.max(1,rr)};}
    grid.addEventListener('dragover',function(e){if(!drag)return;e.preventDefault();var cell=cellFromPointer(e.clientX,e.clientY);drag.p.classList.add('pw-hot');drag.__pc=Math.min(cell.c,GCOLS-drag.w+1);drag.__pr=cell.r;});
    grid.addEventListener('drop',function(e){if(!drag)return;e.preventDefault();drag.p.classList.remove('pw-hot');drag.cs=drag.__pc||drag.cs;drag.rs=drag.__pr||drag.rs;var fixed=drag,occ={};function mk(it){for(var c=it.cs;c<it.cs+it.w;c++)for(var r=it.rs;r<it.rs+it.h;r++)occ[c+','+r]=1;}function ft(cs,rs,w,h){for(var c=cs;c<cs+w;c++)for(var r=rs;r<rs+h;r++)if(occ[c+','+r])return false;return true;}mk(fixed);W.filter(function(z){return z!==fixed;}).forEach(function(it){for(var r=1;r<400;r++){var d=false;for(var c=1;c<=GCOLS-it.w+1;c++){if(ft(c,r,it.w,it.h)){it.cs=c;it.rs=r;mk(it);d=true;break;}}if(d)break;}});applyLayout();saveLayout();drag=null;});
    autoPack();applyLayout();
    var PW_LAYOUT_KEY='hascos.widgets.layout.v1';
    function pwItemKey(it,seen){var nm=pwPanelName(it.p);seen[nm]=(seen[nm]||0)+1;return nm+'#'+seen[nm];}
    function saveLayout(){try{var seen={};var vis=W.map(function(it){return {k:pwItemKey(it,seen),w:it.w,h:it.h,cs:it.cs,rs:it.rs};});var hseen={};var hid=HIDDEN.map(function(it){return pwItemKey(it,hseen);});localStorage.setItem(PW_LAYOUT_KEY,JSON.stringify({v:vis,hidden:hid}));}catch(e){}}
    window.__pwSaveLayout=saveLayout;
    function restoreLayout(){try{var raw=localStorage.getItem(PW_LAYOUT_KEY);if(!raw)return;var data=JSON.parse(raw);if(!data)return;
      var hset={};(data.hidden||[]).forEach(function(k){hset[k]=true;});
      var seen={};W.slice().forEach(function(it){var k=pwItemKey(it,seen);if(hset[k]){W=W.filter(function(z){return z!==it;});it._name=pwPanelName(it.p);HIDDEN.push(it);it.p.style.display='none';}});
      var vmap={};(data.v||[]).forEach(function(e){vmap[e.k]=e;});
      var seen2={};W.forEach(function(it){var k=pwItemKey(it,seen2);var e=vmap[k];if(e){if(e.w)it.w=e.w;if(e.h)it.h=e.h;if(e.cs)it.cs=e.cs;if(e.rs)it.rs=e.rs;}});
      autoPack();applyLayout();
    }catch(e){}}
    restoreLayout();
    window.addEventListener('resize',function(){autoPack();applyLayout();});
    var tb=document.createElement('div');tb.className='pw-toolbar';var addBtn=document.createElement('button');addBtn.className='pri';addBtn.textContent='+ Add widget';var editBtn=document.createElement('button');editBtn.textContent='Edit widgets';tb.appendChild(addBtn);tb.appendChild(editBtn);document.body.appendChild(tb);
    editBtn.onclick=function(){var on=document.body.classList.toggle('pw-edit');editBtn.textContent=on?'Done':'Edit widgets';};
    var APPS=['Individuals','Checklists','Ledgers','Residential Day Planner','Training','OT Dashboard','Life Plan Tracker','Staff','Org Training','Forms','Maintenance'];
    var gb=document.createElement('div');gb.className='pw-gback';var gal=document.createElement('div');gal.className='pw-gal';gal.innerHTML='<h3>Add a widget</h3>';var tiles=document.createElement('div');tiles.className='pw-gtiles';gal.appendChild(tiles);gb.appendChild(gal);document.body.appendChild(gb);
    gb.onclick=function(e){if(e.target===gb)gb.style.display='none';};
    function badgeNode(name){var h=BADGE[name];if(!h)return null;var t=document.createElement('div');t.innerHTML=h.trim();return t.firstChild;}
    APPS.forEach(function(name){var t=document.createElement('div');t.className='pw-gtile';var b=badgeNode(name);if(b)t.appendChild(b);var lbl=document.createElement('span');lbl.textContent=name;t.appendChild(lbl);
      var APP_EMBEDS={'Checklists':'checklists/wb-hub-mark2.html','Ledgers':'ledgers.html','Residential Day Planner':'residential-day-planner.html','Training':'training/wb-index.html','OT Dashboard':'HASC_OT_Dashboard_v3_CEO_7_2_26.html'};t.onclick=function(){gb.style.display='none';var p=document.createElement('div');p.className='pw-appwidget';var head=document.createElement('div');head.className='pw-aw-head';var hb=badgeNode(name);if(hb)head.appendChild(hb);head.appendChild(document.createTextNode(name));p.appendChild(head);var eurl=APP_EMBEDS[name];if(eurl){p.classList.add('pw-appwidget--embed');var fr=document.createElement('iframe');fr.className='pw-aw-frame';fr.setAttribute('title',name);fr.setAttribute('loading','lazy');fr.src=eurl;fr.style.cssText='width:100%;height:100%;flex:1 1 auto;border:0;border-radius:0 0 14px 14px;background:#fff;';p.appendChild(fr);}else{var open=document.createElement('div');open.className='pw-open';open.textContent='Open '+name+' \u2192';p.appendChild(open);}var it=addWidget(p,eurl?4:2);if(!document.body.classList.contains('pw-edit'))editBtn.click();autoPack();applyLayout();if(window.__pwSaveLayout)window.__pwSaveLayout();p.classList.add('pw-hot');setTimeout(function(){p.classList.remove('pw-hot');},900);};
      tiles.appendChild(t);});
    function pwRenderHidden(){var ex=tiles.querySelectorAll('.pw-ghidden');for(var i=0;i<ex.length;i++)ex[i].remove();HIDDEN.forEach(function(it){var tile=document.createElement('div');tile.className='pw-gtile pw-ghidden';var lbl=document.createElement('span');lbl.textContent=it._name||'Panel';tile.appendChild(lbl);tile.onclick=function(){gb.style.display='none';var p=it.p;p.style.display='';var wi=(it._widx==null?W.length:Math.min(it._widx,W.length));W.splice(wi,0,it);HIDDEN=HIDDEN.filter(function(z){return z!==it;});if(!document.body.classList.contains('pw-edit'))editBtn.click();autoPack();applyLayout();p.classList.add('pw-hot');setTimeout(function(){p.classList.remove('pw-hot');},900);if(window.__pwSaveLayout)window.__pwSaveLayout();};tiles.insertBefore(tile,tiles.firstChild);});}addBtn.onclick=function(){pwRenderHidden();gb.style.display='flex';};
    if(!nav.querySelector('[data-view="widgets"]')){var wb=navBtn('widgets','--widgetsc',gridSVG,'Widgets');var mm=nav.querySelector('[data-view="maintenance"]');if(mm&&mm.nextSibling)nav.insertBefore(wb,mm.nextSibling);else nav.appendChild(wb);wb.addEventListener('click',function(e){e.preventDefault();if(!document.body.classList.contains('pw-edit'))editBtn.click();gb.style.display='flex';});}
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,600);});}else{setTimeout(boot,600);}
})();


/* ============================================================
   HASC Residential OS — Compliance & Naming add-on
   Additive module (appended to wb-config.js). Browser-only prototype layer.
   Adds:
   1) Ledgers: rename "Client Clothing" account label -> "Individual Clothing"
   2) Individuals: "$2,000 Limit Watch" toggle column (persisted in localStorage)
   3) Ledgers: combined-account $2,000 compliance flag + Add-entry warning modal
   4) Apps launcher: register Forms + Maintenance pin rows
   ============================================================ */
(function(){
  "use strict";
  var LIMIT = 2000;
  var WATCH_KEY = "hascos.limitWatch.v1";

  function loadWatch(){ try{ return JSON.parse(localStorage.getItem(WATCH_KEY) || "{}"); }catch(e){ return {}; } }
  function saveWatch(o){ try{ localStorage.setItem(WATCH_KEY, JSON.stringify(o)); }catch(e){} }
  function watchedNames(){ return Object.keys(loadWatch()); }
  function money(t){ var m=(t||"").match(/\$?\s*(-?[0-9][0-9.,]*)/); return m?parseFloat(m[1].replace(/,/g,"")):0; }

  /* ---------- 1) Ledgers "Client Clothing" -> "Individual Clothing" ---------- */
  function renameClothing(doc){
    if(!doc) return;
    var w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null), n;
    while((n=w.nextNode())){
      if(/client clothing/i.test(n.nodeValue||"")) n.nodeValue = n.nodeValue.replace(/client clothing/ig,"Individual Clothing");
    }
  }

  /* ---------- 2) Individuals limit-watch toggle column ---------- */
  function injectWatchCss(){
    if(document.getElementById("lwCss")) return;
    var s=document.createElement("style"); s.id="lwCss";
    s.textContent=".lw-sw{position:relative;display:inline-block;width:42px;height:24px;cursor:pointer;vertical-align:middle}.lw-sw input{opacity:0;width:0;height:0;position:absolute}.lw-tr{position:absolute;inset:0;background:#cbd5e1;border-radius:999px;transition:.15s}.lw-tr:before{content:'';position:absolute;height:18px;width:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.25)}.lw-sw input:checked + .lw-tr{background:#B42318}.lw-sw input:checked + .lw-tr:before{transform:translateX(18px)}th.lw-col{white-space:nowrap}";
    document.head.appendChild(s);
  }
  function buildWatchColumn(){
    var table=document.querySelector('[data-view-panel="individuals"] table, table');
    if(!table || table.__lwDone) return;
    var headTxt=(table.querySelector("thead")||{}).textContent||"";
    if(!/individual/i.test(headTxt)) return;
    injectWatchCss();
    var store=loadWatch();
    var heads=table.querySelectorAll("thead tr");
    if(heads[0]){ var th=document.createElement("th"); th.className="lw-col"; th.textContent="COMPLIANCE"; th.style.cssText="color:#B42318;font:700 11px/1 system-ui;letter-spacing:.05em"; heads[0].appendChild(th); }
    var labelRow=heads[1]||heads[0];
    var lth=document.createElement("th"); lth.className="lw-col"; lth.textContent="$2,000 LIMIT WATCH"; labelRow.appendChild(lth);
    table.querySelectorAll("tbody tr").forEach(function(tr){
      var fc=tr.querySelector("td"), name="";
      if(fc){ var st=fc.querySelector("b,strong,div,span"); name=((st?st.textContent:fc.textContent)||"").trim().split("\n")[0].trim(); }
      var td=document.createElement("td"); td.className="lw-col";
      var on=!!store[name];
      td.innerHTML='<label class="lw-sw"><input type="checkbox" '+(on?"checked":"")+' data-lw-name="'+name.replace(/"/g,"&quot;")+'"><span class="lw-tr"></span></label>';
      var inp=td.querySelector("input");
      inp.addEventListener("click",function(e){ e.stopPropagation(); });
      inp.addEventListener("change",function(){ var s2=loadWatch(); if(this.checked) s2[this.dataset.lwName]=true; else delete s2[this.dataset.lwName]; saveWatch(s2); });
      tr.appendChild(td);
    });
    if(table.querySelectorAll("tbody tr").length) table.__lwDone=true;
  }

  /* ---------- 3) Ledgers compliance flag + warning ---------- */
  function ledgerDoc(){ var f=document.getElementById("ledgersFrame"); return f&&f.contentDocument?f.contentDocument:null; }
  function ledgerWin(){ var f=document.getElementById("ledgersFrame"); return f?f.contentWindow:null; }

  function injectFlagCss(doc){
    if(doc.getElementById("limitFlagCss")) return;
    var s=doc.createElement("style"); s.id="limitFlagCss";
    s.textContent=".limit-banner{display:flex;align-items:center;gap:10px;margin:14px 0;padding:12px 16px;border-radius:12px;font:600 14px/1.3 system-ui,sans-serif}.limit-banner.over{background:#FDECEC;color:#B42318;border:1px solid #F3B4B0}.limit-banner.near{background:#FFF6E5;color:#8A5A00;border:1px solid #F3D89B}.limit-badge{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;font:700 10px/1.4 system-ui,sans-serif;letter-spacing:.03em}.limit-badge.over{background:#B42318;color:#fff}.limit-badge.near{background:#8A5A00;color:#fff}.ledchip.limit-over{outline:2px solid #B42318;outline-offset:1px}.lc-back{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:99999}.lc-box{background:#fff;max-width:440px;width:90%;border-radius:14px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.3);font:14px/1.5 system-ui}.lc-box h3{margin:0 0 8px;color:#B42318;font-size:17px}.lc-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9}.lc-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}.lc-btn{padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-weight:600}.lc-cancel{background:#e2e8f0;color:#0f172a}.lc-go{background:#B42318;color:#fff}";
    doc.head.appendChild(s);
  }

  function renderFlag(){
    var doc=ledgerDoc(), w=ledgerWin(); if(!doc||!w) return;
    injectFlagCss(doc);
    var chips=[].slice.call(doc.querySelectorAll(".ledchip"));
    var total=0; chips.forEach(function(c){ total+=money(c.textContent); });
    var rp=doc.getElementById("ledPick");
    var resident = rp && rp.options[rp.selectedIndex] ? rp.options[rp.selectedIndex].text : "";
    var onList = watchedNames().indexOf(resident) !== -1;
    var old=doc.getElementById("limitBanner"); if(old) old.remove();
    doc.querySelectorAll(".limit-badge").forEach(function(b){ b.remove(); });
    chips.forEach(function(c){ c.classList.remove("limit-over"); });
    if(!onList) return;
    var level = total>=LIMIT ? "over" : (total>=LIMIT*0.9 ? "near" : null);
    if(!level) return;
    var chipRow = chips[0] ? chips[0].parentElement : null;
    var b=doc.createElement("div"); b.id="limitBanner"; b.className="limit-banner "+level;
    var m="$"+total.toFixed(2);
    b.innerHTML='<span>'+(level==="over"
      ? '<b>'+resident+'</b> is <b>OVER</b> the $'+LIMIT.toLocaleString()+' combined resource limit \u2014 total across all accounts is <b>'+m+'</b>. Reduce balance to stay in compliance.'
      : '<b>'+resident+'</b> is <b>approaching</b> the $'+LIMIT.toLocaleString()+' limit \u2014 combined total is <b>'+m+'</b>.')+'</span>';
    if(chipRow&&chipRow.parentElement) chipRow.parentElement.insertBefore(b, chipRow);
    var biggest=null,max=-1; chips.forEach(function(c){ var v=money(c.textContent); if(v>max){max=v;biggest=c;} });
    if(biggest){ biggest.classList.add("limit-"+level); var bd=doc.createElement("span"); bd.className="limit-badge "+level; bd.textContent=level==="over"?"OVER LIMIT":"NEAR LIMIT"; biggest.appendChild(bd); }
  }

  function combinedBalance(doc){ var t=0; doc.querySelectorAll(".ledchip").forEach(function(c){ t+=money(c.textContent); }); return t; }

  function warnModal(doc, info, onGo){
    var back=doc.createElement("div"); back.className="lc-back";
    back.innerHTML='<div class="lc-box"><h3>Compliance limit warning</h3>'+
      '<p><b>'+info.resident+'</b> is on the $2,000 limit watch list. This entry would put the combined balance at or above the federal resource limit.</p>'+
      '<div class="lc-row"><span>Current combined balance</span><b>$'+info.current.toFixed(2)+'</b></div>'+
      '<div class="lc-row"><span>This entry</span><b>'+(info.delta>=0?"+":"")+"$"+info.delta.toFixed(2)+'</b></div>'+
      '<div class="lc-row"><span>Projected combined balance</span><b style="color:#B42318">$'+info.projected.toFixed(2)+'</b></div>'+
      '<div class="lc-actions"><button class="lc-btn lc-cancel">Cancel</button><button class="lc-btn lc-go">Add anyway</button></div></div>';
    doc.body.appendChild(back);
    back.querySelector(".lc-cancel").addEventListener("click",function(){ back.remove(); });
    back.querySelector(".lc-go").addEventListener("click",function(){ back.remove(); onGo(); });
  }

  function wireWarning(){
    var doc=ledgerDoc(), w=ledgerWin(); if(!doc||!w) return;
    if(w.__ledComplyBound) return;
    doc.addEventListener("click", function(ev){
      var btn = ev.target.closest ? ev.target.closest(".ledaddbtn") : null;
      if(!btn) return;
      if(btn.__lcBypass){ btn.__lcBypass=false; return; }
      var rp=doc.getElementById("ledPick");
      var resident = rp && rp.options[rp.selectedIndex] ? rp.options[rp.selectedIndex].text : "";
      if(watchedNames().indexOf(resident) === -1) return;
      var amts=doc.querySelectorAll(".amtin");
      var dep = amts[0]?parseFloat((amts[0].value||"0").replace(/,/g,"")||"0"):0;
      var deb = amts[1]?parseFloat((amts[1].value||"0").replace(/,/g,"")||"0"):0;
      var cur = combinedBalance(doc);
      var proj = cur + (isNaN(dep)?0:dep) - (isNaN(deb)?0:deb);
      if(proj < LIMIT) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      warnModal(doc, {resident:resident, current:cur, delta:(isNaN(dep)?0:dep)-(isNaN(deb)?0:deb), projected:proj}, function(){
        btn.__lcBypass=true; btn.click();
      });
    }, true);
    w.__ledComplyBound=true;
  }

  function initLedger(){
    var doc=ledgerDoc(); if(!doc) return;
    renameClothing(doc);
    renderFlag();
    wireWarning();
    var w=ledgerWin();
    if(w && !w.__ledLimitObs){
      var obs=new MutationObserver(function(){ clearTimeout(w.__ledLimitT); w.__ledLimitT=setTimeout(function(){ renameClothing(doc); renderFlag(); },150); });
      obs.observe(doc.body,{subtree:true,childList:true,characterData:true});
      w.__ledLimitObs=obs;
      var rp=doc.getElementById("ledPick");
      if(rp) rp.addEventListener("change",function(){ setTimeout(renderFlag,120); });
    }
  }

  /* ---------- 4) Apps launcher: Forms + Maintenance pin rows ---------- */
  var RAIL_KEY="hascos.rail.v2";
  function railGet(){ try{ return JSON.parse(localStorage.getItem(RAIL_KEY)||"[]"); }catch(e){ return []; } }
  function railSet(a){ try{ localStorage.setItem(RAIL_KEY, JSON.stringify(a)); }catch(e){} }
  function registerApps(){
    var pin=document.getElementById("appsPin"); if(!pin) return;
    [{k:"forms",label:"Forms",color:"#0EA5C4"},{k:"maintenance",label:"Maintenance",color:"#8A6D3B"}].forEach(function(app){
      if(pin.querySelector('input[data-app="'+app.k+'"]')) return;
      var navBtn=document.querySelector('nav .navbtn[data-view="'+app.k+'"]');
      var ico=navBtn?navBtn.querySelector(".navico"):null;
      var row=document.createElement("label"); row.className="approw"; row.setAttribute("data-pw-newapp","1");
      row.innerHTML='<span class="approw-l"><span class="cfgp" style="--acc:'+app.color+'">'+(ico?ico.innerHTML:"")+'</span>'+app.label+'</span><input type="checkbox" data-app="'+app.k+'">';
      var cb=row.querySelector("input");
      cb.checked = railGet().indexOf(app.k) !== -1;
      cb.addEventListener("change",function(){
        var r=railGet(); var i=r.indexOf(app.k);
        if(this.checked){ if(i===-1) r.push(app.k); } else { if(i!==-1) r.splice(i,1); }
        railSet(r);
        if(navBtn) navBtn.style.display = this.checked ? "" : "none";
      });
      pin.appendChild(row);
    });
  }

  /* ---------- boot ---------- */
  function boot(){ buildWatchColumn(); initLedger(); registerApps(); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
  document.addEventListener("click", function(e){
    var nb=e.target.closest ? e.target.closest("nav .navbtn") : null;
    if(nb) setTimeout(boot, 400);
  }, true);
  var tries=0; var iv=setInterval(function(){ boot(); if(++tries>20) clearInterval(iv); }, 800);
})();


/* ============================================================
   HASC Residential OS — Page-header polish add-on
   Additive module (appended to wb-config.js). Browser-only prototype layer.
   Adds (all re-run on SPA view switches):
   1) Clone each view's matching left-rail .navico badge into its page header
   2) Hide the page-header subtitle/description line
   3) Hide developer iframe placeholder notes ("blank in this local preview")
   ============================================================ */
(function(){
  "use strict";

  function injectCss(){
    if(document.getElementById("hdrIcoCss")) return;
    var s=document.createElement("style"); s.id="hdrIcoCss";
    s.textContent=".hdr-ico-row{display:flex;align-items:center;gap:14px}.hdr-ico-row .navico{width:44px;height:44px;flex:0 0 44px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center}.hdr-ico-row .navico svg{width:24px;height:24px}.hdr-ico-txt h2{margin:0}.hdr-ico-txt p{margin:2px 0 0}";
    document.head.appendChild(s);
  }

  function navMap(){
    var map={};
    document.querySelectorAll("nav .navbtn").forEach(function(b){
      var ico=b.querySelector(".navico");
      var label=(b.textContent||"").trim().replace(/NEW$/,"").trim().toLowerCase();
      if(ico) map[label]=ico.outerHTML;
    });
    return map;
  }

  function currentHeader(){
    var header=null;
    document.querySelectorAll("h2").forEach(function(h){
      if(header||h.closest("nav")||h.closest(".hdr-ico-row")) return;
      var r=h.getBoundingClientRect();
      if(r.width>0 && r.top<340) header=h;
    });
    return header;
  }

  function addIcon(){
    injectCss();
    var header=currentHeader();
    if(!header) return;
    var wrap=header.parentElement;
    if(!wrap || wrap.classList.contains("hdr-ico-row") || wrap.querySelector(".hdr-ico-row")) return;
    var title=(header.textContent||"").trim().toLowerCase();
    var map=navMap();
    var icoHTML=map[title];
    if(!icoHTML){
      var k=Object.keys(map).find(function(key){ return key.indexOf(title)===0 || title.indexOf(key)===0 || key.indexOf(title)!==-1; });
      if(k) icoHTML=map[k];
    }
    if(!icoHTML) return;
    var row=document.createElement("div"); row.className="hdr-ico-row";
    var tmp=document.createElement("div"); tmp.innerHTML=icoHTML;
    var ico=tmp.firstElementChild;
    var txt=document.createElement("div"); txt.className="hdr-ico-txt";
    while(wrap.firstChild){ txt.appendChild(wrap.firstChild); }
    row.appendChild(ico); row.appendChild(txt);
    wrap.appendChild(row);
  }

  function hideSubtitle(){
    document.querySelectorAll("h2").forEach(function(h){
      if(h.closest("nav")) return;
      var r=h.getBoundingClientRect();
      if(r.width===0 || r.top>360) return;
      var scope=h.closest(".hdr-ico-txt") || h.parentElement;
      if(!scope) return;
      scope.querySelectorAll(":scope > p").forEach(function(p){ p.style.display="none"; });
    });
  }

  var PLACEHOLDER=/blank in this local preview|renders once the shell is deployed|appears blank in this local preview|^Embeds\s+\//i;
  function hidePlaceholders(){
    document.querySelectorAll("p").forEach(function(p){
      if(PLACEHOLDER.test((p.textContent||"").trim())) p.style.display="none";
    });
  }

  function run(){ addIcon(); hideSubtitle(); hidePlaceholders(); }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run); else run();
  document.addEventListener("click", function(e){
    var nb=e.target.closest ? e.target.closest("nav .navbtn") : null;
    if(nb) setTimeout(run, 450);
  }, true);
  var tries=0; var iv=setInterval(function(){ run(); if(++tries>20) clearInterval(iv); }, 700);
})();


/* ==========================================================================
   HASC Residential OS — Day Planner + Apps-list sync add-on
   Additive module (appended to wb-config.js). Browser-only prototype layer.
   Adds:
   1) Apps launcher sync — mirrors every left-rail app into the "Apps" popup
      (restores Individuals, Forms, Maintenance, Widgets) and un-hides any
      hidden rail app (e.g. Widgets).
   2) A full calendar Day Planner overlay with real dates (navigable to any
      month/year), Day/Week/Month views, exact times (incl. minutes),
      "+ New Appointment" with custom activity types, click-to-edit time,
      and mouse drag-and-drop that moves an appointment across days & times.
   ========================================================================== */
(function(){
  if (window.__hascPlannerAddon) return; window.__hascPlannerAddon = true;

  /* ---------- 1) Apps launcher <-> left rail sync ---------- */
  (function(){
    /* DISABLED (app-launcher fix): this legacy launcher's unhideRail() forced every
       nav button visible on click + every 1.2s, overriding index.html's applyRail().
       The index.html APP_CATALOG/applyRail launcher is the source of truth now. */
    return;
    var EXCLUDE = ['dashboard','apps',''];
    function unhideRail(){
      document.querySelectorAll('.navbtn').forEach(function(b){
        var v = b.getAttribute('data-view')||'';
        if(v && b.offsetParent===null){
          b.style.display=''; b.style.visibility='visible';
          if(getComputedStyle(b).display==='none') b.style.setProperty('display','flex','important');
        }
      });
    }
    function syncLauncher(){
      var pin = document.getElementById('appsPin');
      if(!pin) return;
      var existing = {};
      pin.querySelectorAll('input[type=checkbox]').forEach(function(cb){ existing[cb.getAttribute('data-app')] = true; });
      document.querySelectorAll('.navbtn').forEach(function(btn){
        var view = btn.getAttribute('data-view')||'';
        if(EXCLUDE.indexOf(view)!==-1 || existing[view]) return;
        var label = (btn.textContent||'').replace(/NEW/i,'').replace(/\s+/g,' ').trim();
        var ico = btn.querySelector('.navico, svg, img');
        var lab = document.createElement('label'); lab.className='approw';
        var left = document.createElement('span'); left.className='approw-l';
        var cfgp = document.createElement('span'); cfgp.className='cfgp';
        if(ico){ cfgp.innerHTML = ico.outerHTML; } else { cfgp.textContent='\u25A0'; }
        left.appendChild(cfgp); left.appendChild(document.createTextNode(label));
        var cb = document.createElement('input'); cb.type='checkbox'; cb.setAttribute('data-app',view); cb.checked=true;
        cb.addEventListener('change', function(){ btn.style.display = cb.checked ? '' : 'none'; });
        lab.appendChild(left); lab.appendChild(cb);
        pin.appendChild(lab);
      });
    }
    function tick(){ unhideRail(); syncLauncher(); }
    document.addEventListener('click', function(){ setTimeout(tick, 60); }, true);
    var iv = setInterval(tick, 1200); setTimeout(function(){ clearInterval(iv); }, 30000);
    if(document.readyState!=='loading') tick(); else document.addEventListener('DOMContentLoaded', tick);
  })();

  /* ---------- 2) Full calendar Day Planner ---------- */
  (function(){
    var PAL = { violet:'#7C5192', plum:'#AC659D', teal:'#17a2b8', indigo:'#5E6FB2', green:'#568E62',
      blue:'#3E9EB3', gold:'#D9B93B', coral:'#C96A44', slate:'#5b7a99', jade:'#3E9E86', rose:'#C67BA0',
      ink:'#233038', muted:'#6a7a84', line:'#e7e2d9', card:'#fff' };
    var TYPES = { home:{c:PAL.indigo,ic:'\uD83C\uDFE0'}, out:{c:PAL.blue,ic:'\uD83D\uDE97'},
      med:{c:PAL.coral,ic:'\uD83E\uDE7A'}, shop:{c:PAL.green,ic:'\uD83D\uDECD'},
      rest:{c:PAL.coral,ic:'\uD83C\uDF7D'}, fam:{c:PAL.plum,ic:'\uD83D\uDC65'}, fun:{c:PAL.gold,ic:'\uD83C\uDF55'} };
    var TYPE_LABELS = { home:'Home / Routine', out:'Outing / Transport', med:'Medical', shop:'Shopping',
      rest:'Meal / Dining', fam:'Family Visit', fun:'Recreation' };
    var SWATCHES = [PAL.violet,PAL.teal,PAL.coral,PAL.green,PAL.gold,PAL.blue,PAL.plum,PAL.rose,PAL.jade,PAL.slate,PAL.indigo,PAL.ink];
    var HOURS=[]; for(var h=7;h<=20;h++) HOURS.push(h);
    var SLOTS=[0,15,30,45];

    var store = [
      mk('e1','home','Morning Routine','2026-08-17',8,0,'A. Rivera'),
      mk('e2','home','Morning Routine','2026-08-18',8,0,'A. Rivera'),
      mk('e3','out','Day Hab Departure','2026-08-18',9,15,'Transport'),
      mk('e4','out','Park Trip','2026-08-20',10,0,'J. Chen'),
      mk('e5','med','Medical Appointment','2026-08-19',12,36,'Nurse K.'),
      mk('e6','shop','Shopping Trip','2026-08-18',13,0,'M. Diaz'),
      mk('e7','shop','Target Run','2026-08-19',14,0,'M. Diaz'),
      mk('e8','fam','Family Visit','2026-08-21',16,30,'Family'),
      mk('e9','rest','Restaurant Outing','2026-08-18',17,0,'unstaffed'),
      mk('e10','fun','Pizza Night','2026-08-16',18,0,'C. Park'),
      mk('e11','fam','Family Visit','2026-08-18',18,0,'Family')
    ];
    function mk(id,type,title,date,hour,min,who){ var o={id:id,type:type,title:title,hour:hour,min:min,who:who}; o['d'+'ate']=date; return o; }

    var TODAY = new Date(2026,7,18);
    var cursor = new Date(2026,7,18);
    var view = 'week';

    function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
    function pad(n){ return (''+n).padStart(2,'0'); }
    function parseYmd(s){ var p=s.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
    function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
    function startOfWeek(d){ var x=new Date(d); x.setDate(d.getDate()-d.getDay()); x.setHours(0,0,0,0); return x; }
    function addDays(d,n){ var x=new Date(d); x.setDate(d.getDate()+n); return x; }
    function addMonths(d,n){ var x=new Date(d); x.setMonth(d.getMonth()+n); return x; }
    function monthName(d){ return d.toLocaleString('en-US',{month:'long'})+' '+d.getFullYear(); }
    function evsOn(d){ var k=ymd(d); return store.filter(function(e){ return e['d'+'ate']===k; }); }
    function esc(s){ return (''+s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
    function typeOf(ev){ if(ev.customColor) return {c:ev.customColor, ic:(ev.customIcon||'\u2605')}; return TYPES[ev.type]||{c:PAL.slate,ic:'\u2022'}; }
    function fmt(h,m){ var ap=h>=12?'PM':'AM'; var hh=h%12; if(hh===0)hh=12; return m>0?(hh+':'+pad(m)+' '+ap):(hh+' '+ap); }
    function fmtShort(h,m){ var ap=h>=12?'p':'a'; var hh=h%12; if(hh===0)hh=12; return m>0?(hh+':'+pad(m)+ap):(hh+ap); }

    function pill(ev, showTime){
      var t=typeOf(ev), time=fmt(ev.hour,ev.min), unst=/unstaff/i.test(ev.who);
      return '<div class="wp-ev" data-id="'+ev.id+'" style="background:'+(unst?'#fff':t.c)+';'+(unst?'border:1.5px dashed '+t.c+';color:'+t.c+';':'color:#fff;')+'border-radius:9px;padding:6px 9px;margin:2px 0;cursor:grab;touch-action:none;box-shadow:0 1px 3px rgba(0,0,0,.12);font-size:12px;line-height:1.25;">'+
        '<div style="display:flex;align-items:center;gap:5px;font-weight:700;">'+t.ic+' <span>'+esc(ev.title)+'</span></div>'+
        (showTime?'<div style="font-size:11px;opacity:.92;margin-top:1px;font-weight:600;">\uD83D\uDD52 '+time+(unst?'':' \u00B7 '+esc(ev.who))+'</div>':'')+'</div>';
    }
    function renderDay(){
      var d=cursor, evs=evsOn(d), out='<div style="display:grid;grid-template-columns:70px 1fr;">';
      HOURS.forEach(function(hr){
        out+='<div style="border-top:2px solid '+PAL.line+';padding:6px 8px;color:'+PAL.muted+';font-size:12px;font-weight:700;text-align:right;">'+fmt(hr,0)+'</div>';
        out+='<div style="border-top:2px solid '+PAL.line+';border-left:1px solid '+PAL.line+';">';
        SLOTS.forEach(function(mn,si){
          var inSlot=evs.filter(function(e){ return e.hour===hr && e.min>=mn && e.min<mn+15; }).sort(function(a,b){ return a.min-b.min; });
          out+='<div class="wp-cell" data-ymd="'+ymd(d)+'" data-hour="'+hr+'" data-min="'+mn+'" style="min-height:20px;padding:1px 8px;'+(si>0?'border-top:1px dashed #efe9e1;':'')+'">'+inSlot.map(function(e){ return pill(e,true); }).join('')+'</div>';
        });
        out+='</div>';
      });
      return out+'</div>';
    }
    function renderWeek(){
      var sow=startOfWeek(cursor), days=[]; for(var i=0;i<7;i++) days.push(addDays(sow,i));
      var DOW=['SUN','MON','TUE','WED','THU','FRI','SAT'];
      var out='<div style="overflow:auto;"><div style="display:grid;grid-template-columns:60px repeat(7,1fr);min-width:820px;"><div></div>';
      days.forEach(function(d,i){
        var today=sameDay(d,TODAY);
        out+='<div style="padding:8px 4px;text-align:center;background:linear-gradient(135deg,'+PAL.violet+','+PAL.plum+');color:#fff;border-radius:'+(i===0?'8px 0 0 0':i===6?'0 8px 0 0':'0')+';"><div style="font-size:11px;letter-spacing:.06em;opacity:.85;">'+DOW[i]+'</div><div style="font-size:16px;font-weight:800;">'+d.getDate()+(today?' \u2022':'')+'</div></div>';
      });
      HOURS.forEach(function(hr){
        out+='<div style="border-top:1px solid '+PAL.line+';padding:4px 6px;color:'+PAL.muted+';font-size:11px;font-weight:600;text-align:right;">'+fmt(hr,0)+'</div>';
        days.forEach(function(d,i){
          var today=sameDay(d,TODAY);
          var inC=evsOn(d).filter(function(e){ return e.hour===hr; }).sort(function(a,b){ return a.min-b.min; });
          out+='<div class="wp-cell" data-ymd="'+ymd(d)+'" data-hour="'+hr+'" data-min="0" style="border-top:1px solid '+PAL.line+';border-left:1px solid '+PAL.line+';padding:2px 3px;min-height:30px;'+(today?'background:rgba(124,81,146,.05);':'')+'">'+inC.map(function(e){ return pill(e,true); }).join('')+'</div>';
        });
      });
      return out+'</div></div>';
    }
    function renderMonth(){
      var y=cursor.getFullYear(), m=cursor.getMonth(), first=new Date(y,m,1), startCell=addDays(first,-first.getDay());
      var out='<div style="display:grid;grid-template-columns:repeat(7,1fr);">';
      ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(function(d,i){
        out+='<div style="padding:8px;font-size:11px;letter-spacing:.06em;color:#fff;font-weight:700;background:linear-gradient(135deg,'+PAL.violet+','+PAL.plum+');'+(i===0?'border-radius:8px 0 0 0;':i===6?'border-radius:0 8px 0 0;':'')+'">'+d+'</div>';
      });
      for(var c=0;c<42;c++){
        var cd=addDays(startCell,c), inMonth=(cd.getMonth()===m), isToday=sameDay(cd,TODAY);
        var evs=evsOn(cd).sort(function(a,b){ return (a.hour*60+a.min)-(b.hour*60+b.min); });
        var show=evs.slice(0,4), extra=evs.length-show.length;
        out+='<div class="wp-cell" data-ymd="'+ymd(cd)+'" data-kind="month" style="border-top:1px solid '+PAL.line+';border-left:1px solid '+PAL.line+';min-height:96px;padding:4px 5px;'+(inMonth?'':'background:#faf8f4;color:#c9c3b8;')+(isToday?'background:rgba(124,81,146,.06);':'')+'"><div style="font-size:12px;font-weight:700;margin-bottom:3px;">'+(isToday?'<span style="background:'+PAL.violet+';color:#fff;border-radius:6px;padding:1px 6px;">'+cd.getDate()+'</span>':cd.getDate())+'</div>';
        show.forEach(function(e){ var t=typeOf(e);
          out+='<div class="wp-ev" data-id="'+e.id+'" title="'+esc(e.title)+' \u2014 '+fmt(e.hour,e.min)+'" style="background:'+t.c+';color:#fff;border-radius:6px;padding:2px 6px;margin:2px 0;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:grab;touch-action:none;"><b>'+fmtShort(e.hour,e.min)+'</b> '+esc(e.title)+'</div>';
        });
        if(extra>0) out+='<div style="font-size:11px;color:'+PAL.violet+';font-weight:700;margin-top:1px;">+'+extra+' more</div>';
        out+='</div>';
      }
      return out+'</div>';
    }

    var host=null, wrap=null;
    function label(){
      if(view==='day') return cursor.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
      if(view==='week'){ var s=startOfWeek(cursor), e=addDays(s,6); return 'Week of '+s.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' \u2013 '+e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
      return monthName(cursor);
    }
    function shell(){
      function vbtn(id,txt){ return '<button class="wp-vbtn" data-v="'+id+'" style="border:0;padding:6px 16px;border-radius:20px;font-weight:700;font-size:13px;cursor:pointer;'+(view===id?'background:'+PAL.violet+';color:#fff;':'background:transparent;color:'+PAL.muted+';')+'">'+txt+'</button>'; }
      function nav(dir,ch){ return '<button class="wp-nav" data-dir="'+dir+'" style="border:1px solid '+PAL.line+';background:#fff;width:30px;height:30px;border-radius:8px;font-weight:800;cursor:pointer;color:'+PAL.ink+';">'+ch+'</button>'; }
      var addBtn='<button class="wp-add" style="border:0;background:linear-gradient(135deg,'+PAL.violet+','+PAL.plum+');color:#fff;padding:8px 16px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(124,81,146,.35);"><span style="font-size:16px;line-height:1;">+</span> New Appointment</button>';
      var body = view==='day'?renderDay():view==='week'?renderWeek():renderMonth();
      var hint='\uD83D\uDC46 Drag any appointment to reschedule it. Click one to edit its time. Views stay in sync.';
      return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">'+addBtn+
        '<div style="width:1px;height:26px;background:'+PAL.line+';"></div>'+
        '<div style="display:flex;gap:4px;background:#efe9e1;padding:4px;border-radius:22px;">'+vbtn('day','Day')+vbtn('week','Week')+vbtn('month','Month')+'</div>'+
        '<div style="display:flex;gap:6px;align-items:center;">'+nav('-1','\u2039')+nav('1','\u203A')+'<button class="wp-today" style="border:1px solid '+PAL.line+';background:#fff;padding:6px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;color:'+PAL.ink+';">Today</button></div>'+
        '<div style="font-size:20px;font-weight:800;">'+label()+'</div></div>'+
        '<div style="background:#fff7e0;border:1px solid '+PAL.gold+';color:#7a5c00;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin-bottom:12px;">'+hint+'</div>'+
        '<div style="background:'+PAL.card+';border:1px solid '+PAL.line+';border-radius:12px;overflow:hidden;">'+body+'</div>';
    }
    function paint(){ if(!wrap) return; wrap.innerHTML=shell(); wire(); }
    function step(n){ if(view==='day')cursor=addDays(cursor,n); else if(view==='week')cursor=addDays(cursor,n*7); else cursor=addMonths(cursor,n); paint(); }

    function openEditor(id, anchor){
      var ev=find(id); if(!ev) return; rm('wpEditor');
      var box=document.createElement('div'); box.id='wpEditor';
      box.style.cssText='position:fixed;z-index:99999;background:#fff;border:1px solid '+PAL.line+';border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:14px 16px;font-family:inherit;width:250px;';
      var r=anchor.getBoundingClientRect(); box.style.left=Math.min(r.left,innerWidth-270)+'px'; box.style.top=Math.min(r.bottom+6,innerHeight-210)+'px';
      var hh=ev.hour%12; if(hh===0)hh=12; var ap=ev.hour>=12?'PM':'AM';
      box.innerHTML='<div style="font-weight:800;font-size:14px;color:'+PAL.ink+';margin-bottom:2px;">'+esc(ev.title)+'</div><div style="font-size:12px;color:'+PAL.muted+';margin-bottom:10px;">Set the exact start time</div><div style="display:flex;gap:6px;align-items:center;margin-bottom:12px;"><select id="wpH" style="flex:1;padding:7px;border:1px solid '+PAL.line+';border-radius:8px;font-weight:700;">'+hopt(hh)+'</select><span style="font-weight:800;">:</span><select id="wpM" style="flex:1;padding:7px;border:1px solid '+PAL.line+';border-radius:8px;font-weight:700;">'+mopt(ev.min)+'</select><select id="wpAP" style="padding:7px;border:1px solid '+PAL.line+';border-radius:8px;font-weight:700;"><option'+(ap==='AM'?' selected':'')+'>AM</option><option'+(ap==='PM'?' selected':'')+'>PM</option></select></div><div style="display:flex;gap:8px;"><button id="wpSave" style="flex:1;background:'+PAL.violet+';color:#fff;border:0;border-radius:8px;padding:8px;font-weight:700;cursor:pointer;">Save time</button><button id="wpCancel" style="background:#efe9e1;color:'+PAL.ink+';border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;">Cancel</button></div>';
      document.body.appendChild(box);
      box.querySelector('#wpCancel').onclick=function(){ box.remove(); };
      box.querySelector('#wpSave').onclick=function(){ var H=+box.querySelector('#wpH').value, M=+box.querySelector('#wpM').value, A=box.querySelector('#wpAP').value; if(A==='PM'&&H!==12)H+=12; if(A==='AM'&&H===12)H=0; ev.hour=H; ev.min=M; box.remove(); paint(); };
      setTimeout(function(){ function off(e){ if(!box.contains(e.target)){ box.remove(); document.removeEventListener('mousedown',off); } } document.addEventListener('mousedown',off); },0);
    }
    function hopt(sel){ var s=''; for(var n=1;n<=12;n++) s+='<option value="'+n+'"'+(n===sel?' selected':'')+'>'+n+'</option>'; return s; }
    function mopt(sel){ var arr=[0,5,10,15,20,25,30,35,36,40,45,50,55],s=''; arr.forEach(function(n){ s+='<option value="'+n+'"'+(n===sel?' selected':'')+'>'+pad(n)+'</option>'; }); return s; }
    function find(id){ return store.filter(function(x){ return x.id===id; })[0]; }
    function rm(id){ var e=document.getElementById(id); if(e) e.remove(); }

    function openNew(){
      rm('wpNewModal');
      var back=document.createElement('div'); back.id='wpNewModal';
      back.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(35,48,56,.42);display:flex;align-items:flex-start;justify-content:center;padding-top:54px;font-family:inherit;overflow:auto;';
      var typeOpts=Object.keys(TYPE_LABELS).map(function(k){ return '<option value="'+k+'">'+TYPES[k].ic+'  '+TYPE_LABELS[k]+'</option>'; }).join('')+'<option value="__custom">\u270F\uFE0F  Other / custom\u2026</option>';
      var lbl='display:block;font-size:12px;font-weight:700;color:'+PAL.muted+';margin:0 0 4px;';
      var inp='width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid '+PAL.line+';border-radius:9px;font-size:14px;font-family:inherit;color:'+PAL.ink+';';
      var sw=SWATCHES.map(function(c,i){ return '<button type="button" class="wpSw" data-c="'+c+'" style="width:26px;height:26px;border-radius:50%;background:'+c+';border:3px solid '+(i===0?PAL.ink:'#fff')+';cursor:pointer;box-shadow:0 0 0 1px '+PAL.line+';"></button>'; }).join('');
      back.innerHTML='<div style="background:#fff;border-radius:16px;width:440px;max-width:94vw;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden;"><div style="background:linear-gradient(135deg,'+PAL.violet+','+PAL.plum+');color:#fff;padding:16px 20px;display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">\uD83D\uDCC5</span><div><div style="font-size:17px;font-weight:800;">New Appointment</div><div style="font-size:12px;opacity:.9;">Add an activity to the calendar</div></div><button id="wpNClose" style="margin-left:auto;background:rgba(255,255,255,.2);border:0;color:#fff;width:30px;height:30px;border-radius:8px;font-size:18px;cursor:pointer;">\u00D7</button></div><div style="padding:20px;"><label style="'+lbl+'">Title</label><input id="wpNTitle" placeholder="e.g. Court hearing, ISP meeting, Haircut\u2026" style="'+inp+'margin-bottom:14px;"><label style="'+lbl+'">Activity type</label><select id="wpNType" style="'+inp+'margin-bottom:14px;">'+typeOpts+'</select><div id="wpCW" style="display:none;background:#faf8f4;border:1px dashed '+PAL.line+';border-radius:10px;padding:12px;margin-bottom:14px;"><label style="'+lbl+'">Name this type</label><input id="wpNCustom" placeholder="e.g. Legal, Therapy, Dental\u2026" style="'+inp+'margin-bottom:12px;"><label style="'+lbl+'">Color on calendar</label><div style="display:flex;flex-wrap:wrap;gap:8px;">'+sw+'</div></div><label style="'+lbl+'">Date</label><input id="wpNDate" type="date" value="'+ymd(cursor)+'" style="'+inp+'margin-bottom:14px;"><label style="'+lbl+'">Start time</label><div style="display:flex;gap:8px;margin-bottom:14px;"><select id="wpNH" style="'+inp+'flex:1;">'+hopt(9)+'</select><span style="align-self:center;font-weight:800;">:</span><select id="wpNM" style="'+inp+'flex:1;">'+mopt(0)+'</select><select id="wpNAP" style="'+inp+'width:78px;"><option>AM</option><option selected>PM</option></select></div><label style="'+lbl+'">Assigned to (staff or individual)</label><input id="wpNWho" placeholder="e.g. Dr. Lee / J. Chen" style="'+inp+'margin-bottom:20px;"><div style="display:flex;gap:10px;"><button id="wpNSave" style="flex:1;background:'+PAL.violet+';color:#fff;border:0;border-radius:10px;padding:11px;font-size:14px;font-weight:800;cursor:pointer;">Add to calendar</button><button id="wpNCancel" style="background:#efe9e1;color:'+PAL.ink+';border:0;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer;">Cancel</button></div><div id="wpNErr" style="color:'+PAL.coral+';font-size:12px;font-weight:700;margin-top:10px;display:none;"></div></div></div>';
      document.body.appendChild(back);
      function close(){ back.remove(); }
      back.querySelector('#wpNClose').onclick=close; back.querySelector('#wpNCancel').onclick=close;
      back.addEventListener('mousedown',function(e){ if(e.target===back) close(); });
      setTimeout(function(){ back.querySelector('#wpNTitle').focus(); },30);
      var picked=SWATCHES[0]; var tsel=back.querySelector('#wpNType'); var cw=back.querySelector('#wpCW');
      tsel.onchange=function(){ cw.style.display = tsel.value==='__custom' ? 'block':'none'; };
      back.querySelectorAll('.wpSw').forEach(function(b){ b.onclick=function(){ picked=b.getAttribute('data-c'); back.querySelectorAll('.wpSw').forEach(function(x){ x.style.borderColor='#fff'; }); b.style.borderColor=PAL.ink; }; });
      back.querySelector('#wpNSave').onclick=function(){
        var err=back.querySelector('#wpNErr'); var title=back.querySelector('#wpNTitle').value.trim();
        if(!title){ err.textContent='Please enter a title.'; err.style.display='block'; return; }
        var typ=tsel.value; var dv=back.querySelector('#wpNDate').value;
        if(!dv){ err.textContent='Please pick a date.'; err.style.display='block'; return; }
        var H=+back.querySelector('#wpNH').value, M=+back.querySelector('#wpNM').value, A=back.querySelector('#wpNAP').value;
        if(A==='PM'&&H!==12)H+=12; if(A==='AM'&&H===12)H=0;
        var who=back.querySelector('#wpNWho').value.trim()||'Unassigned';
        var rec={id:'n'+Date.now(),title:title,hour:H,min:M,who:who}; rec['d'+'ate']=dv;
        if(typ==='__custom'){ var cn=back.querySelector('#wpNCustom').value.trim(); if(!cn){ err.textContent='Please name your custom type.'; err.style.display='block'; return; } rec.type='custom'; rec.customLabel=cn; rec.customColor=picked; rec.customIcon='\u2605'; } else { rec.type=typ; }
        store.push(rec); cursor=parseYmd(dv); close(); paint();
      };
    }

    var drag=null;
    function applyDrop(id, cell){ var rec=find(id); if(!rec||!cell) return; var y=cell.getAttribute('data-ymd'); if(y) rec['d'+'ate']=y; var hh=cell.getAttribute('data-hour'); if(hh!=null&&hh!=='') rec.hour=+hh; var mm=cell.getAttribute('data-min'); if(mm!=null&&mm!=='') rec.min=+mm; paint(); }
    function onDown(e){ var pl=e.target.closest('.wp-ev'); if(!pl||!wrap.contains(pl)) return; if(e.button!==undefined&&e.button!==0) return; drag={id:pl.getAttribute('data-id'),sx:e.clientX,sy:e.clientY,moved:false,ghost:null,src:pl}; e.preventDefault(); }
    function onMove(e){ if(!drag) return; var dx=e.clientX-drag.sx, dy=e.clientY-drag.sy; if(!drag.moved && Math.abs(dx)+Math.abs(dy)<5) return; if(!drag.moved){ drag.moved=true; var g=drag.src.cloneNode(true); g.style.position='fixed'; g.style.pointerEvents='none'; g.style.zIndex='100001'; g.style.width=drag.src.offsetWidth+'px'; g.style.opacity='.9'; g.style.transform='scale(1.04)'; g.style.boxShadow='0 8px 24px rgba(0,0,0,.28)'; document.body.appendChild(g); drag.ghost=g; drag.src.style.opacity='.35'; } drag.ghost.style.left=(e.clientX+8)+'px'; drag.ghost.style.top=(e.clientY+8)+'px'; if(drag.lastCell) drag.lastCell.style.outline='none'; drag.ghost.style.display='none'; var el=document.elementFromPoint(e.clientX,e.clientY); drag.ghost.style.display=''; var cell=el?el.closest('.wp-cell'):null; if(cell){ cell.style.outline='2px dashed '+PAL.violet; cell.style.outlineOffset='-2px'; drag.lastCell=cell; } }
    function onUp(e){ if(!drag) return; var moved=drag.moved; if(drag.ghost) drag.ghost.remove(); if(drag.src) drag.src.style.opacity='1'; if(drag.lastCell) drag.lastCell.style.outline='none'; if(moved){ var el=document.elementFromPoint(e.clientX,e.clientY); var cell=el?el.closest('.wp-cell'):null; var id=drag.id; drag=null; if(cell) applyDrop(id,cell); } else { var id2=drag.id, src=drag.src; drag=null; openEditor(id2,src); } }
    var ptrBound=false;
    function bindPtr(){ if(ptrBound) return; document.addEventListener('pointerdown',function(e){ if(wrap&&wrap.contains(e.target)) onDown(e); }); document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp); ptrBound=true; }
    function wire(){
      var ab=wrap.querySelector('.wp-add'); if(ab) ab.onclick=openNew;
      wrap.querySelectorAll('.wp-vbtn').forEach(function(b){ b.onclick=function(){ view=b.getAttribute('data-v'); paint(); }; });
      wrap.querySelectorAll('.wp-nav').forEach(function(b){ b.onclick=function(){ step(+b.getAttribute('data-dir')); }; });
      var t=wrap.querySelector('.wp-today'); if(t) t.onclick=function(){ cursor=new Date(TODAY); paint(); };
    }

    function mount(){
      var iframe=document.getElementById('plannerFrame');
      if(iframe && iframe.parentElement){ host=iframe.parentElement; iframe.style.display='none'; }
      else { var pv=document.querySelector('[data-view-panel="planner"]')||document.querySelector('#view-planner'); host=pv||null; }
      if(!host) return false;
      if(document.getElementById('wowPlanner')) return true;
      wrap=document.createElement('div'); wrap.id='wowPlanner';
      wrap.style.cssText='font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:'+PAL.ink+';';
      host.insertBefore(wrap, host.firstChild);
      bindPtr(); paint(); return true;
    }
    var mi=setInterval(function(){ if(mount()) clearInterval(mi); }, 800);
    setTimeout(function(){ clearInterval(mi); }, 30000);
  })();
})();


/* === HASC Cleanup add-on: hide stray widget toolbar + old planner heading === */
(function(){
  function tidy(){
    try{
      var bar = document.querySelector(".pw-toolbar");
      if(bar){ bar.style.setProperty("display","none","important"); }
      var vhs = document.querySelectorAll(".viewhead");
      for(var i=0;i<vhs.length;i++){
        var t = (vhs[i].textContent||"").replace(/^\s+/,"");
        if(/^Residential Day Planner/i.test(t)){ vhs[i].style.setProperty("display","none","important"); }
      }
    }catch(e){}
  }
  tidy();
  var n=0, iv=setInterval(function(){ tidy(); if(++n>60){ clearInterval(iv); } }, 500);
  document.addEventListener("click", function(){ setTimeout(tidy, 60); }, true);
})();


/* === HASC add-on: iOS-style Done button for widget edit mode + hide NEW badge === */
(function(){
  function hideNew(){
    try{
      var nm = document.querySelectorAll(".navmeta");
      for(var i=0;i<nm.length;i++){
        if((nm[i].textContent||"").trim().toUpperCase()==="NEW"){ nm[i].style.setProperty("display","none","important"); }
      }
    }catch(e){}
  }
  function ensureDone(){
    var btn = document.getElementById("pwDone");
    if(!btn){
      btn = document.createElement("button");
      btn.id = "pwDone"; btn.type = "button"; btn.textContent = "Done";
      btn.style.cssText = "position:fixed;right:20px;bottom:22px;z-index:100001;background:linear-gradient(135deg,#7C5192,#AC659D);color:#fff;border:none;border-radius:999px;padding:12px 28px;font:600 15px/1 'Plus Jakarta Sans',system-ui,sans-serif;box-shadow:0 6px 18px rgba(124,81,146,.4);cursor:pointer;letter-spacing:.2px;display:none";
      btn.addEventListener("click", function(){
        var g = document.querySelector(".pw-gback"); if(g){ g.style.display = "none"; }
        document.body.classList.remove("pw-edit");
        syncDone();
      });
      document.body.appendChild(btn);
    }
    return btn;
  }
  function ensureAdd(){
    var btn = document.getElementById("pwAdd");
    if(!btn){
      btn = document.createElement("button");
      btn.id = "pwAdd"; btn.type = "button"; btn.textContent = "+ Add widget";
      btn.style.cssText = "position:fixed;right:20px;bottom:70px;z-index:100001;background:linear-gradient(135deg,#7C5192,#AC659D);color:#fff;border:none;border-radius:999px;padding:12px 28px;font:600 15px/1 'Plus Jakarta Sans',system-ui,sans-serif;box-shadow:0 6px 18px rgba(124,81,146,.4);cursor:pointer;letter-spacing:.2px;display:none";
      btn.addEventListener("click", function(){
        var a = document.querySelector(".pw-toolbar button.pri");
        if(!a){ var bs = document.querySelectorAll(".pw-toolbar button"); for(var i=0;i<bs.length;i++){ if(/add widget/i.test(bs[i].textContent||"")){ a=bs[i]; break; } } }
        if(a){ a.click(); }
      });
      document.body.appendChild(btn);
    }
    return btn;
  }
  function syncDone(){
    var btn = ensureDone();
    var add = ensureAdd();
    var editing = document.body.classList.contains("pw-edit");
    btn.style.display = editing ? "inline-block" : "none";
    add.style.display = editing ? "inline-block" : "none";
  }
  function init(){
    hideNew(); ensureDone(); syncDone();
    try{
      var mo = new MutationObserver(function(){ syncDone(); hideNew(); });
      mo.observe(document.body, {attributes:true, attributeFilter:["class"]});
    }catch(e){}
  }
  if(document.body){ init(); } else { document.addEventListener("DOMContentLoaded", init); }
  var n=0, iv=setInterval(function(){ hideNew(); ensureDone(); syncDone(); if(++n>40){ clearInterval(iv); } }, 500);
  document.addEventListener("click", function(){ setTimeout(syncDone, 60); }, true);
})();
