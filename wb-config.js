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
