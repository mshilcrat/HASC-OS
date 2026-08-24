/* wb-guard.js — HASC Residential OS security/access layer
 * Responsibilities ONLY:
 *  - initialize/reuse ONE Supabase client (window.__hascClient)
 *  - verify authenticated session (else -> /wb-login.html)
 *  - load the user's profile and store role/residences/department/email/apps
 *  - enforce department/residence security where appropriate
 *  - if a phone opens the desktop index, route to /mobile.html
 *  - never redirect the user away from /mobile.html because of their role
 * It does NOT route to app-specific checklist pages and does NOT paint the DOM.
 */
(function(){
  var docEl = document.documentElement;
  var revealed = false;
  function reveal(){ if(revealed) return; revealed = true; try{ docEl.style.visibility=""; }catch(e){} }
  try{ docEl.style.visibility="hidden"; }catch(e){}
  setTimeout(reveal, 4000);

  if(!window.supabase || !window.HASC_CONFIG){ reveal(); return; }

  // ONE shared client, reused everywhere.
  var sb = window.__hascClient;
  if(!sb){
    sb = window.supabase.createClient(window.HASC_CONFIG.SUPABASE_URL, window.HASC_CONFIG.SUPABASE_ANON_KEY);
    window.__hascClient = sb;
  }

  function isPhone(){
    var ua = navigator.userAgent || navigator.vendor || "";
    // iPhone / iPod / Android phones only. iPad + desktop get the desktop UI.
    return /iPhone|iPod/.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
  }
  function onMobileShell(){ return /\/mobile\.html$/i.test(location.pathname); }
  function onDesktopIndex(){ return location.pathname === "/" || /\/index\.html$/i.test(location.pathname); }

  sb.auth.getSession().then(function(res){
    var session = (res && res.data) ? res.data.session : null;
    if(!session){ location.replace("/wb-login.html"); return; }

    // Select "*" so an optional column such as app permissions never breaks the query.
    return sb.from("profiles")
      .select("*")
      .eq("email", session.user.email)
      .single()
      .then(function(p){
        var row = (p && p.data) ? p.data : {};
        var email = (session.user.email || "").toLowerCase();
        var profile = {
          email: email,
          full_name: row.full_name || "",
          role: row.role || "",
          residences: row.residences || [],
          department: row.department || "",
          // enabled apps / permissions, whatever the profile happens to carry
          apps: (row.apps != null ? row.apps : (row.enabled_apps != null ? row.enabled_apps : null))
        };
        // Publish profile for the shell (mobile.html / index.html) to read.
        window.__hascProfile = profile;
        try{
          sessionStorage.setItem("hasc_email", email);
          sessionStorage.setItem("hasc_role", profile.role);
          sessionStorage.setItem("hasc_department", profile.department);
          sessionStorage.setItem("hasc_homes", JSON.stringify(profile.residences));
          if(profile.apps != null) sessionStorage.setItem("hasc_apps", JSON.stringify(profile.apps));
        }catch(e){}

        // Once on the mobile shell, stay there regardless of role.
        if(onMobileShell()) return;

        // Phone entering the desktop index -> hand off to the mobile shell.
        if(isPhone() && onDesktopIndex()){ location.replace("/mobile.html"); return; }

        // Department security: Day Hab users stay inside their own section.
        if(profile.department === "Day Hab" && profile.role !== "admin"){
          var dhp = decodeURIComponent(location.pathname).toLowerCase();
          if(dhp.indexOf("/day hab/") === -1){ location.replace("/Day Hab/index.html"); return; }
        }
      });
  }).then(reveal).catch(function(){ location.replace("/wb-login.html"); });
})();
