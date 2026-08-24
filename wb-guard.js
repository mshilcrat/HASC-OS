/* wb-guard.js — HASC Residential OS security/access layer */

(function () {
  "use strict";

  var docEl = document.documentElement;
  var revealed = false;

  function revealPage() {
    if (revealed) return;
    revealed = true;

    try {
      docEl.style.visibility = "";
    } catch (e) {}
  }

  try {
    docEl.style.visibility = "hidden";
  } catch (e) {}

  /* Failsafe — never leave the page invisible */
  setTimeout(revealPage, 6000);


  /* =========================================================
     PATH / DEVICE HELPERS
     ========================================================= */

  function cleanPath() {
    try {
      return decodeURIComponent(location.pathname || "/");
    } catch (e) {
      return location.pathname || "/";
    }
  }

  function isPhone() {
    var ua =
      navigator.userAgent ||
      navigator.vendor ||
      "";

    return /Android|iPhone|iPod/i.test(ua);
  }

  function onMobileShell() {
    var path = cleanPath().toLowerCase();

    return (
      path === "/mobile.html" ||
      /\/mobile\.html$/.test(path)
    );
  }

  function onDesktopIndex() {
    var path = cleanPath().toLowerCase();

    return (
      path === "/" ||
      path === "/index.html" ||
      /\/index\.html$/.test(path)
    );
  }

  function isInsideDayHab() {
    return (
      cleanPath()
        .toLowerCase()
        .indexOf("/day hab/") !== -1
    );
  }


  /* =========================================================
     STORE PROFILE
     ========================================================= */

  function storeProfile(profile) {
    try {
      sessionStorage.setItem(
        "hasc_email",
        profile.email || ""
      );

      sessionStorage.setItem(
        "hasc_role",
        profile.role || ""
      );

      sessionStorage.setItem(
        "hasc_department",
        profile.department || ""
      );

      sessionStorage.setItem(
        "hasc_homes",
        JSON.stringify(profile.residences || [])
      );

      if (
        profile.apps !== null &&
        profile.apps !== undefined
      ) {
        sessionStorage.setItem(
          "hasc_apps",
          JSON.stringify(profile.apps)
        );
      } else {
        sessionStorage.removeItem("hasc_apps");
      }

    } catch (e) {
      console.warn(
        "HASC Guard: sessionStorage error",
        e
      );
    }
  }


  /* =========================================================
     LOAD USER PROFILE
     ========================================================= */

  function loadProfile(sb, session) {

    if (
      !session ||
      !session.user ||
      !session.user.email
    ) {
      return Promise.resolve(null);
    }

    var email =
      String(session.user.email)
        .trim()
        .toLowerCase();

    return sb
      .from("profiles")
      .select("*")
      .eq("email", session.user.email)
      .single()

      .then(function (result) {

        if (result.error) {
          console.error(
            "HASC Guard: profile lookup failed",
            result.error
          );

          return null;
        }

        var row = result.data || {};

        var profile = {
          email: email,

          full_name:
            row.full_name || "",

          role:
            row.role || "",

          residences:
            Array.isArray(row.residences)
              ? row.residences
              : [],

          department:
            row.department || "",

          apps:
            row.enabled_apps !== undefined &&
            row.enabled_apps !== null

              ? row.enabled_apps

              : (
                  row.apps !== undefined &&
                  row.apps !== null

                    ? row.apps
                    : null
                )
        };

        /* Make profile available to the OS */
        window.__hascProfile = profile;

        storeProfile(profile);

        return profile;
      });
  }


  /* =========================================================
     DEPARTMENT SECURITY
     ========================================================= */

  function enforceDepartmentRouting(profile) {

    if (!profile) return false;

    /*
     * NEVER kick someone out of mobile.html
     * because of their role.
     */
    if (onMobileShell()) {
      return false;
    }

    /*
     * Admin can remain in Residential.
     */
    if (profile.role === "admin") {
      return false;
    }

    /*
     * Day Hab users stay inside Day Hab.
     */
    if (
      String(profile.department)
        .trim()
        .toLowerCase() === "day hab"
    ) {

      if (!isInsideDayHab()) {

        location.replace(
          "/Day Hab/index.html"
        );

        return true;
      }
    }

    return false;
  }


  /* =========================================================
     START AUTHENTICATION
     ========================================================= */

  function startGuard() {

    var sb = window.__hascClient;

    /*
     * ONE Supabase client only.
     */
    if (!sb) {

      try {

        sb = window.supabase.createClient(
          window.HASC_CONFIG.SUPABASE_URL,
          window.HASC_CONFIG.SUPABASE_ANON_KEY
        );

        window.__hascClient = sb;

      } catch (e) {

        console.error(
          "HASC Guard: Supabase client failed",
          e
        );

        revealPage();
        return;
      }
    }


    console.log("HASC GUARD LOADED");
    console.log("PATH:", cleanPath());
    console.log("PHONE:", isPhone());


    sb.auth
      .getSession()

      .then(function (result) {

        var session =
          result &&
          result.data
            ? result.data.session
            : null;


        console.log(
          "SESSION:",
          !!session
        );


        /*
         * NOT LOGGED IN
         */
        if (!session) {

          location.replace(
            "/wb-login.html"
          );

          return null;
        }


        /*
         * =====================================================
         * PHONE ROUTING
         *
         * IMPORTANT:
         * This happens BEFORE the profile query.
         * =====================================================
         */

        if (
          isPhone() &&
          onDesktopIndex() &&
          !onMobileShell()
        ) {

          console.log(
            "REDIRECTING TO MOBILE"
          );

          location.replace(
            "/mobile.html"
          );

          return null;
        }


        /*
         * Correct shell reached.
         * Now load the user's profile.
         */
        return loadProfile(
          sb,
          session
        );
      })


      .then(function (profile) {

        /*
         * Redirect may already be happening.
         */
        if (!profile) {
          revealPage();
          return;
        }


        /*
         * MOBILE STAYS MOBILE
         */
        if (onMobileShell()) {

          console.log(
            "HASC MOBILE AUTHORIZED"
          );

          revealPage();
          return;
        }


        /*
         * Department security
         */
        if (
          enforceDepartmentRouting(profile)
        ) {
          return;
        }


        revealPage();
      })


      .catch(function (error) {

        console.error(
          "HASC Guard error:",
          error
        );

        revealPage();
      });
  }


  /* =========================================================
     WAIT FOR SUPABASE + CONFIG

     DO NOT permanently exit if they have not loaded yet.
     ========================================================= */

  function dependenciesReady() {

    return !!(
      window.supabase &&
      window.supabase.createClient &&
      window.HASC_CONFIG &&
      window.HASC_CONFIG.SUPABASE_URL &&
      window.HASC_CONFIG.SUPABASE_ANON_KEY
    );
  }


  var attempts = 0;
  var maxAttempts = 80;


  if (dependenciesReady()) {

    startGuard();

  } else {

    var dependencyWait =
      setInterval(function () {

        attempts++;


        if (dependenciesReady()) {

          clearInterval(
            dependencyWait
          );

          console.log(
            "HASC Guard: dependencies ready"
          );

          startGuard();

          return;
        }


        if (attempts >= maxAttempts) {

          clearInterval(
            dependencyWait
          );

          console.error(
            "HASC Guard: Supabase/config unavailable"
          );

          revealPage();
        }

      }, 100);
  }

})();
