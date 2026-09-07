(() => {
  const $ = (id) => document.getElementById(id);
  const toast = (msg) => { const el=$('toast'); if(!el) return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1600); };

  const APPS = [
    {key:'checklists',name:'Checklists',url:'checklists/wb-checklists-mark2.html',color:'var(--green)',icon:'✓',desc:'Daily tasks and safety checks'},
    {key:'ledgers',name:'Ledgers',url:'ledgers.html',color:'var(--blue)',icon:'▤',desc:'Resident funds and monthly sheets'},
    {key:'planner',name:'Day Planner',url:'residential-day-planner.html',color:'var(--plum)',icon:'◫',desc:'Weekly activities and staffing'},
    {key:'training',name:'Training',url:'training/wb-index.html',color:'var(--gold)',icon:'🎓',desc:'Courses, certs, and progress'},
    {key:'ot',name:'OT Dashboard',url:'HASC_OT_Dashboard_v3_CEO_7_2_26.html',color:'var(--coral)',icon:'▥',desc:'Overtime and staffing'},
    {key:'lifeplan',name:'Life Plan',url:'',color:'var(--slate)',icon:'♡',desc:'Individual plans and goals'},
    {key:'staff',name:'Staff',url:'hasc-residential-staff.html',color:'var(--jade)',icon:'●',desc:'Staff roster and coverage'},
    {key:'orgtraining',name:'Org Training',url:'',color:'var(--rose)',icon:'◇',desc:'Organization-wide training'},
    {key:'nurse',name:'Nurse',url:'hasc-nurse.html',color:'var(--red)',icon:'+',desc:'Nursing coverage and ER sheets'},
    {key:'shabbos',name:'Shabbos',url:'Shabbos/qr_code_generator.html',color:'var(--teal)',icon:'✦',desc:'QR codes and sign-offs'},
    {key:'system',name:'System',url:'hasc-system.html',color:'var(--violet)',icon:'⚙',desc:'HASC OS settings'}
  ];

  const HOME_FALLBACK = [
    {name:'Bedford Avenue - 3245',address:'3245 Bedford Ave Bklyn NY 11210',rm:'David Kogan',ac:'Aviva Rosenzweig'},
    {name:'East 35th St - 1431',address:'1431 East 35th St Bklyn NY 11234',rm:'Sarah Nathan',ac:'Aviva Rosenzweig'},
    {name:'New York Avenue',address:'1831 NY Ave Bklyn NY 11210',rm:'Sarah Nathan',ac:'Aviva Rosenzweig'},
    {name:'Avenue I - 2802',address:'2802 Avenue I Bklyn NY 11210',rm:'Bracha Klein',ac:'Aviva Rosenzweig'},
    {name:'1503 East 14th Street',address:'1503 East 14th St Bklyn NY 11230',rm:'Eli Rosengarten',ac:'Aviva Rosenzweig'},
    {name:'Avenue H - 824',address:'824 East 9th St Bklyn NY 11230',rm:'Yuti Kluger',ac:'Aviva Rosenzweig'}
  ];

  let sb=null, profile=null, homes=HOME_FALLBACK.slice(), selectedHome='ALL';
  const railKey='hascos.friday.rail.v1';
  let pinned = (()=>{ try { return JSON.parse(localStorage.getItem(railKey)||'null') || APPS.map(a=>a.key); } catch(e) { return APPS.map(a=>a.key); }})();

  function updateClock(){
    const now=new Date(),h=now.getHours();
    $('indexDate').textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    $('indexClock').textContent=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    $('greetWord').textContent=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  }

  function renderRail(){
    $('navRail').innerHTML='<button class="navbtn active" data-dashboard><span class="navico" style="--acc:var(--teal)">⌂</span>Dashboard</button>'+APPS.filter(a=>pinned.includes(a.key)).map(a=>`<button class="navbtn" data-app="${a.key}"><span class="navico" style="--acc:${a.color}">${a.icon}</span>${a.name}</button>`).join('');
    document.querySelector('[data-dashboard]').onclick=showDashboard;
    document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openApp(b.dataset.app));
  }

  function renderPinMenu(){
    $('appsPin').innerHTML=APPS.map(a=>`<label class="approw"><span class="approw-l"><span class="navico" style="--acc:${a.color}">${a.icon}</span>${a.name}</span><input type="checkbox" data-pin="${a.key}" ${pinned.includes(a.key)?'checked':''}></label>`).join('');
    document.querySelectorAll('[data-pin]').forEach(cb=>cb.onchange=()=>{
      const k=cb.dataset.pin;
      pinned=cb.checked?[...new Set([...pinned,k])]:pinned.filter(x=>x!==k);
      localStorage.setItem(railKey,JSON.stringify(pinned));
      renderRail(); toast('Left rail updated');
    });
  }

  function openAppsMenu(){ renderPinMenu(); $('appsMenu').classList.add('open'); $('appsMenuBk').classList.add('open'); }
  function closeAppsMenu(){ $('appsMenu').classList.remove('open'); $('appsMenuBk').classList.remove('open'); }

  function showDashboard(){
    $('view-dashboard').classList.add('active'); $('view-app').classList.remove('active');
    document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));
    const d=document.querySelector('[data-dashboard]'); if(d)d.classList.add('active');
    $('appFrame').removeAttribute('src');
  }

  function openApp(key){
    const app=APPS.find(a=>a.key===key); if(!app)return;
    if(!app.url){ toast(app.name+' is still in development'); return; }
    $('appTitle').textContent=app.name; $('appSub').textContent=app.desc; $('appFrame').src=app.url;
    $('view-dashboard').classList.remove('active'); $('view-app').classList.add('active');
    document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.app===key));
  }

  function renderAppGrid(){
    $('appGrid').innerHTML=APPS.map(a=>`<button class="apptile" data-gridapp="${a.key}"><span class="appdot" style="--acc:${a.color}">${a.icon}</span><span><b>${a.name}</b><small>${a.desc}</small></span></button>`).join('');
    document.querySelectorAll('[data-gridapp]').forEach(b=>b.onclick=()=>openApp(b.dataset.gridapp));
  }

  function renderHomes(){
    const visible = selectedHome==='ALL'?homes:homes.filter(h=>h.name===selectedHome);
    $('houseCount').textContent=visible.length+' homes';
    $('houses').innerHTML=visible.map(h=>`<div class="house" data-home="${h.name}"><div class="hname">${h.name}</div><div class="hmeta">RM ${h.rm||'—'} · ${h.ac||'—'}</div><div class="hstatus">View residence ›</div></div>`).join('');
    document.querySelectorAll('[data-home]').forEach(el=>el.onclick=()=>{selectedHome=el.dataset.home; syncHero(); renderHomes();});
  }

  function syncHero(){
    $('heroHomeFilter').innerHTML='<option value="ALL">Main Dashboard</option>'+homes.map(h=>`<option value="${h.name}">${h.name}</option>`).join('');
    $('heroHomeFilter').value=selectedHome;
    const h=selectedHome==='ALL'?(homes[0]||{}):(homes.find(x=>x.name===selectedHome)||homes[0]||{});
    $('heroHomeName').textContent=selectedHome==='ALL'?'Residential Department':h.name||'No residence';
    $('welcomeHome').textContent=selectedHome==='ALL'?'your homes':(h.name||'your home');
    $('heroRM').textContent=selectedHome==='ALL'?'—':(h.rm||'—'); $('heroAC').textContent=selectedHome==='ALL'?'—':(h.ac||'—'); $('heroAddress').textContent=selectedHome==='ALL'?'All assigned residences':(h.address||'—');
  }

  async function loadAuth(){
    try{
      if(window.supabase&&window.HASC_CONFIG){
        sb=window.__hascClient||window.supabase.createClient(window.HASC_CONFIG.SUPABASE_URL,window.HASC_CONFIG.SUPABASE_ANON_KEY); window.__hascClient=sb;
        const session=(await sb.auth.getSession()).data.session;
        if(!session)return;
        const email=session.user.email||'';
        const res=await sb.from('profiles').select('full_name,role,residences').eq('email',email).single();
        profile=res.data||{};
        const full=(profile.full_name||email.split('@')[0]||'User').trim(); const first=full.split(/\s+/)[0];
        $('userName').textContent=full; $('firstName').textContent=first; $('userRole').textContent=String(profile.role||'').replace(/_/g,' ').toUpperCase(); $('userInitials').textContent=full.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
        if(Array.isArray(profile.residences)&&profile.residences.length){
          const allowed=new Set(profile.residences.map(x=>String(x).trim().toLowerCase()));
          const filtered=HOME_FALLBACK.filter(h=>allowed.has(h.name.toLowerCase()));
          if(filtered.length) homes=filtered;
          if(profile.role!=='admin'&&homes.length===1) selectedHome=homes[0].name;
        }
      }
    }catch(e){console.error('FRIDAY auth/profile load failed',e);}
    syncHero(); renderHomes();
  }

  async function signOut(){
    try{ if(sb) await sb.auth.signOut(); window.location.replace('/wb-login.html'); }
    catch(e){ console.error('Sign out failed',e); toast('Sign out failed'); }
  }

  $('logoutBtn').onclick=signOut; $('appsLauncher').onclick=openAppsMenu; $('appsMenuBk').onclick=closeAppsMenu; $('backDashboard').onclick=showDashboard; $('heroHomeFilter').onchange=()=>{selectedHome=$('heroHomeFilter').value;syncHero();renderHomes();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAppsMenu();});
  updateClock(); setInterval(updateClock,30000); renderRail(); renderPinMenu(); renderAppGrid(); renderHomes(); syncHero(); loadAuth();
})();
