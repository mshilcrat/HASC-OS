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

/* HASC dashboard: tiling grid panels (snap to columns, pack with no gaps) */
(function(){
  var KEY='hasc_dash_grid_v2';
  var COLS=12, GUT=12, MINW=980, ROWH=8;
  function titleOf(p){ var h=p.querySelector('.ph,[data-wm]'); var t=h?(h.textContent||''):(p.textContent||''); return (t.trim().slice(0,40))||'panel'; }
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ return {}; } }
  var saveT; function save(map){ clearTimeout(saveT); saveT=setTimeout(function(){ try{ localStorage.setItem(KEY, JSON.stringify(map)); }catch(e){} }, 250); }
  var board, panels=[], enabled=false;
  var meta=[]; // per panel: {p, c, s, h}
  function colW(){ return (board.clientWidth-(COLS-1)*GUT)/COLS; }
  function xToCol(x){ var cw=colW(); return Math.max(0,Math.min(COLS-1, Math.round(x/(cw+GUT)))); }
  function wToSpan(w){ var cw=colW(); var s=Math.round((w+GUT)/(cw+GUT)); return Math.max(3,Math.min(COLS,s)); }
  function reflow(){
    var cw=colW();
    // shelf pack in current order
    var cursorCol=0, rowTop=0, rowMaxH=0;
    meta.forEach(function(m){
      if(m.s>COLS) m.s=COLS;
      if(cursorCol+m.s>COLS){ rowTop+=rowMaxH+GUT; cursorCol=0; rowMaxH=0; }
      var left=Math.round(cursorCol*(cw+GUT));
      var width=Math.round(m.s*cw+(m.s-1)*GUT);
      m.p.style.left=left+'px';
      m.p.style.top=rowTop+'px';
      m.p.style.width=width+'px';
      m.p.style.height=m.h+'px';
      cursorCol+=m.s;
      if(m.h>rowMaxH) rowMaxH=m.h;
    });
    board.style.height=(rowTop+rowMaxH)+'px';
  }
  function persist(){ var map={}; meta.forEach(function(m,i){ map[titleOf(m.p)]={c:i,s:m.s,h:m.h}; }); save(map); }
  function fit(){ if(board) reflow(); }
  function addResetBtn(){
    if(document.getElementById('wmReset')) return;
    var b=document.createElement('button'); b.id='wmReset'; b.textContent='Reset layout';
    b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9999;background:#fff;border:1px solid var(--line,#e2d6c4);border-radius:8px;padding:7px 11px;font:600 12px/1.2 inherit;color:var(--ink,#33333a);box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:pointer';
    b.onclick=function(){ localStorage.removeItem(KEY); location.reload(); };
    document.body.appendChild(b);
  }
  function enable(){
    if(enabled) return;
    if(window.innerWidth<MINW) return;
    board=document.querySelector('.board'); if(!board) return;
    panels=[].slice.call(board.querySelectorAll('.left > .panel, .right > .panel')).filter(function(p){ return getComputedStyle(p).display!=='none'; });
    if(panels.length<2) return;
    board.style.position='relative'; board.style.display='block';
    [].slice.call(board.querySelectorAll('.left,.right')).forEach(function(c){ c.style.position='static'; c.style.height='0'; c.style.margin='0'; c.style.padding='0'; c.style.overflow='visible'; c.style.display='block'; });
    var saved=load();
    var withOrder=panels.map(function(p,i){ var s=saved[titleOf(p)]; var rect=p.getBoundingClientRect(); return {p:p, c:(s&&typeof s.c==='number')?s.c:i, s:(s&&s.s)?s.s:wToSpan(rect.width), h:(s&&s.h)?s.h:Math.max(120,Math.round(rect.height)) }; });
    withOrder.sort(function(a,b){ return a.c-b.c; });
    meta=withOrder;
    meta.forEach(function(m){
      var p=m.p;
      p.style.position='absolute'; p.style.margin='0'; p.style.boxSizing='border-box';
      p.style.resize='both'; p.style.overflow='auto'; p.style.minWidth='200px'; p.style.minHeight='90px';
      var head=p.querySelector('.ph'); if(head){ head.style.cursor='move'; head.setAttribute('data-wm','1'); head.title='Drag to reorder · drag corner to resize'; }
    });
    reflow(); addResetBtn(); enabled=true;
    try{ var ro=new ResizeObserver(function(ents){ if(drag) return; clearTimeout(window.__wmRz); var tg=ents&&ents[0]&&ents[0].target; window.__wmRz=setTimeout(function(){ var m=meta.filter(function(x){return x.p===tg;})[0]; if(m){ m.s=wToSpan(tg.getBoundingClientRect().width); m.h=Math.max(90,Math.round(tg.getBoundingClientRect().height)); reflow(); persist(); } }, 200); }); meta.forEach(function(m){ ro.observe(m.p); }); }catch(e){}
    var drag=null;
    board.addEventListener('mousedown',function(e){
      var head=e.target.closest('[data-wm]'); if(!head) return;
      if(e.target.closest('button,a,input,select,textarea')) return;
      var panel=head.closest('.panel'); var m=meta.filter(function(x){return x.p===panel;})[0]; if(!m) return;
      drag={m:m, panel:panel, sx:e.clientX, sy:e.clientY, ol:parseFloat(panel.style.left)||0, ot:parseFloat(panel.style.top)||0};
      panel.style.zIndex=10; panel.style.opacity='.85'; e.preventDefault();
    });
    window.addEventListener('mousemove',function(e){ if(!drag) return; drag.panel.style.left=(drag.ol+(e.clientX-drag.sx))+'px'; drag.panel.style.top=(drag.ot+(e.clientY-drag.sy))+'px'; });
    window.addEventListener('mouseup',function(e){
      if(!drag) return;
      var panel=drag.panel, m=drag.m;
      var bl=board.getBoundingClientRect();
      var cx=(e.clientX-bl.left); var cy=(e.clientY-bl.top);
      var targetCol=xToCol(cx);
      // compute a linear index from column + vertical position
      var others=meta.filter(function(x){return x!==m;});
      // find insertion index: order by (top row implied). Use y to pick before/after neighbours.
      var idx=0; var acc=0;
      // rebuild order: place m at position based on cx,cy relative to others' centers
      var centers=others.map(function(x){ var r=x.p.getBoundingClientRect(); return {x:x, cy:r.top+r.height/2-bl.top, cx:r.left+r.width/2-bl.left}; });
      var insertAt=others.length;
      for(var i=0;i<centers.length;i++){ var c=centers[i]; if(cy<c.cy || (Math.abs(cy-c.cy)<80 && cx<c.cx)){ insertAt=i; break; } }
      others.splice(insertAt,0,m);
      meta=others;
      panel.style.zIndex=''; panel.style.opacity='';
      reflow(); persist(); drag=null;
    });
  }
  var tries=0; var iv=setInterval(function(){ tries++; if(enabled || tries>40){ clearInterval(iv); return; } if(document.querySelector('.board')){ enable(); } }, 300);
  window.addEventListener('resize',function(){ clearTimeout(window.__wmRs); window.__wmRs=setTimeout(function(){ if(enabled) reflow(); },200); });
})();
