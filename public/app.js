// UPBMS V3 Main Frontend Portal Controller
// 100% Complete Hindi <-> English Conversion • Pure Orthography • Auto-Fit Layout
// Exact Uploaded Circulars & Certificates • Multi-Officer Signing • Member Login & Terms

window.UPBMSApp = (function () {
  const { escapeHtml, generateQrSvg, uploadFileInput, initialsAvatarSvg } = window.UPBMSHelpers;
  const {
    localizeDual,
    resolveSignatories,
    formatSignatoriesAuditSummary,
    renderSignatoryPickerBar,
    renderIdCardHtml,
    renderAppointmentLetterHtml,
    renderAssociationDocumentHtml,
    renderUnsignedAssocDocumentHtml,
    renderExactUploadedFileHtml,
    renderReceiptHtml,
    renderUnsignedReceiptAckHtml
  } = window.UPBMSPrint;

  let state = null;
  let lang = "hi"; // 'hi' | 'en'
  let currentRoute = "home"; // home | about | members | join | donation | idcard | circulars | documents | grievance | portals | admin
  let isAdminLoggedIn = false;
  let adminPinSession = "";
  let loggedInMember = null;
  let memberAuthSession = null; // { id, password }
  let pendingPostLoginAction = null;
  let loginPromptReason = null; // { hi, en }

  let slideIdx = 0;
  let slideTimer = null;

  // Filters
  let memberSearch = "";
  let memberDistrictFilter = "";
  let memberBankFilter = "";
  let circularSearch = "";

  // Signatory selection state
  let pageSingleSigId = null;
  let pageMultiSigIds = null;
  let modalMultiSigIds = null;
  let activeModalContext = null; // { kind: 'assocDoc' | 'unsignedAssocDoc' | 'receipt' | 'unsignedReceipt' | 'rawFile' | 'regAck', subType?, id, data? }

  let verifiedResult = null;
  let activeDocTab = "idcard"; // idcard | letter | receipt
  let trackedGrievances = null;

  function t(hi, en) {
    return lang === "en" ? (en !== undefined && en !== "" ? en : hi) : (hi !== undefined && hi !== "" ? hi : en);
  }

  function getState() {
    return state;
  }

  function getAuthHeaders(extra = {}) {
    const h = { ...extra };
    if (isAdminLoggedIn && adminPinSession) {
      h["X-Admin-Pin"] = adminPinSession;
    } else if (loggedInMember && memberAuthSession) {
      h["X-Member-Id"] = memberAuthSession.id;
      h["X-Member-Pass"] = encodeURIComponent(memberAuthSession.password);
    }
    return h;
  }

  function canAccessSignedAssets() {
    return Boolean(isAdminLoggedIn || (loggedInMember && loggedInMember.status === "active"));
  }

  function canAccessPersonalMemberDocs(memberId) {
    if (isAdminLoggedIn) return true;
    return Boolean(loggedInMember && loggedInMember.status === "active" && loggedInMember.id === memberId);
  }

  function canAccessSignedReceipt(payment) {
    if (!payment) return false;
    if (isAdminLoggedIn) return true;
    if (!loggedInMember || loggedInMember.status !== "active") return false;
    return (
      payment.memberId === loggedInMember.id ||
      (payment.memberCode && payment.memberCode === loggedInMember.memberCode) ||
      (payment.mobile && payment.mobile === loggedInMember.mobile)
    );
  }

  function getAuditActor() {
    if (!canAccessSignedAssets()) return null;
    if (isAdminLoggedIn) {
      return {
        code: "ADMIN",
        nameHi: "प्रांतीय एडमिन नियंत्रण कक्ष",
        nameEn: "State Admin Control Panel",
        timeLabel: new Date().toISOString().slice(0, 10)
      };
    }
    return {
      code: loggedInMember.memberCode,
      nameHi: loggedInMember.nameHi,
      nameEn: loggedInMember.nameEn,
      timeLabel: new Date().toISOString().slice(0, 10)
    };
  }

  async function recordSignedUsage({ actionType, actionLabelHi, actionLabelEn, targetTitleHi, targetTitleEn, signatoryIds, memberId }) {
    if (!canAccessSignedAssets() || !state) return;
    try {
      const officers = resolveSignatories(state.settings, signatoryIds);
      const sigSummary = formatSignatoriesAuditSummary(officers, state.settings);
      const res = await fetch("/api/access-logs", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          memberId: memberId || (loggedInMember ? loggedInMember.id : ""),
          actionType,
          actionLabelHi,
          actionLabelEn,
          targetTitleHi,
          targetTitleEn,
          signatoriesUsedHi: sigSummary.hi,
          signatoriesUsedEn: sigSummary.en
        })
      });
      const json = await res.json();
      if (json.ok && json.logItem && state) {
        state.accessLogs = [json.logItem, ...(state.accessLogs || [])];
        if (state.stats) state.stats.totalAccessLogs = (state.stats.totalAccessLogs || 0) + 1;
      }
    } catch (e) {}
  }

  async function printWithAudit(actionType, actionLabelHi, actionLabelEn, targetTitleHi, targetTitleEn, sigIdsCsv) {
    const sigIds = sigIdsCsv ? String(sigIdsCsv).split(",").filter(Boolean) : undefined;
    await recordSignedUsage({
      actionType,
      actionLabelHi,
      actionLabelEn,
      targetTitleHi,
      targetTitleEn,
      signatoryIds: sigIds
    });
    window.print();
  }

  function requireMemberLogin(afterLoginFn, reasonHi, reasonEn) {
    pendingPostLoginAction = typeof afterLoginFn === "function" ? afterLoginFn : null;
    loginPromptReason = {
      hi: reasonHi || "सुरक्षा नीति के अनुसार पदाधिकारियों के हस्ताक्षर एवं आधिकारिक मुहर युक्त प्रपत्र केवल सदस्य लॉगिन के बाद ही खोले जा सकते हैं।",
      en: reasonEn || "For security & accountability, documents bearing Office-Bearers' Signatures or Official Seal require Member Login."
    };
    openMemberLoginModal();
  }

  function isGrievanceEnabled() {
    if (!state || !state.settings) return true;
    if (state.settings.enableGrievanceModule === false) return false;
    const navGrv = (state.settings.navItems || []).find((x) => x.id === "grievance");
    if (navGrv && navGrv.visible === false) return false;
    return true;
  }

  const NAV_ICONS = {
    home: "🏠",
    about: "🏛️",
    members: "👥",
    join: "✍️",
    circulars: "📑",
    documents: "📂",
    grievance: "⚖️",
    portals: "🌐"
  };

  const SOCIAL_SVGS = {
    whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.5 14.2c-.2.6-1.3 1.2-1.8 1.3-.5.1-1.1.1-1.8-.1a16.4 16.4 0 0 1-6.2-5.4c-.7-.9-1.2-2.1-1.2-3.2 0-1.1.6-1.7.8-2 .2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.2.1.3 0 .5-.1.2-.2.3-.4.5l-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.6 1.6.3.1.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.2.7-.1.3.1 1.8.8 2.1 1 .3.2.5.2.6.4.1.1.1.7-.1 1.3z"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.3v3.2h2.8V22h3.4z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3a2.7 2.7 0 0 0-1.9 1.9C2 8.9 2 12 2 12s0 3.1.4 4.8a2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9c.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15V9l5.2 3-5.2 3z"/></svg>`,
    twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2h3.4l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.1l8-9.2L.7 2h7.1l4.9 6.4L18.2 2zm-1.2 18h1.9L7.1 3.9H5.1L17 20z"/></svg>`,
    telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.4c.3-1.2-.5-1.8-1.5-1.4L2.6 9.9c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 10.5-6.6c.5-.3.9-.1.6.2l-8.5 7.7-.3 4.7c.5 0 .7-.2 1-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3.3-14.4z"/></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zm-2.1 4.9a3 3 0 0 1 0-4.2l2.1-2.1-1.4-1.4-2.1 2.1a5 5 0 1 0 7.1 7.1l2.1-2.1-1.4-1.4-2.1 2.1a3 3 0 0 1-4.3-.1zm7-12.6a5 5 0 0 0-7.1 0L6.3 7.8l1.4 1.4 2.1-2.1a3 3 0 1 1 4.2 4.2l-2.1 2.1 1.4 1.4 2.1-2.1a5 5 0 0 0 .1-7z"/></svg>`
  };

  async function init() {
    await refreshData();
    startHeroSlider();
  }

  async function refreshData() {
    const res = await fetch("/api/bootstrap", { headers: getAuthHeaders() });
    const json = await res.json();
    if (json.ok) {
      state = json;
      if (loggedInMember) {
        const freshMem = state.members.find((m) => m.id === loggedInMember.id);
        if (freshMem) loggedInMember = freshMem;
      }
      document.documentElement.setAttribute("data-theme", state.settings.themePreset || "navy_saffron");
      document.documentElement.lang = lang;
      document.title = lang === "en"
        ? `${state.settings.orgNameEn} (${state.settings.shortName})`
        : `${state.settings.orgNameHi} (${state.settings.shortName})`;
      if (currentRoute === "grievance" && !isGrievanceEnabled()) {
        currentRoute = "home";
      }
      rerender();
    }
  }

  function startHeroSlider() {
    if (slideTimer) clearInterval(slideTimer);
    slideTimer = setInterval(() => {
      if (!state || currentRoute !== "home" || state.slides.length <= 1) return;
      slideIdx = (slideIdx + 1) % state.slides.length;
      const heroMount = document.getElementById("hero16x9Mount");
      if (heroMount) heroMount.innerHTML = renderSliderHtml();
    }, 6000);
  }

  function setSlide(i) {
    if (!state || !state.slides.length) return;
    slideIdx = (i + state.slides.length) % state.slides.length;
    const heroMount = document.getElementById("hero16x9Mount");
    if (heroMount) heroMount.innerHTML = renderSliderHtml();
  }

  function toggleLang() {
    lang = lang === "hi" ? "en" : "hi";
    document.documentElement.lang = lang;
    document.title = lang === "en"
      ? `${state.settings.orgNameEn} (${state.settings.shortName})`
      : `${state.settings.orgNameHi} (${state.settings.shortName})`;
    toast(lang === "hi" ? "वेबसाइट भाषा हिंदी में बदल दी गई है।" : "Website language switched to English.");
    rerender();
    if (activeModalContext) renderCurrentModal();
  }

  function navigate(route) {
    if (route === "grievance" && !isGrievanceEnabled()) {
      currentRoute = "home";
      rerender();
      return;
    }
    if (route === "demands") {
      currentRoute = "home";
      rerender();
      setTimeout(() => document.getElementById("demandsSection")?.scrollIntoView({ behavior: "smooth" }), 60);
      return;
    }
    if (route === "admin" && !isAdminLoggedIn) {
      openAdminLogin();
      return;
    }
    currentRoute = route;
    rerender();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAdminLogin() {
    const modalRoot = document.getElementById("modalRoot");
    modalRoot.innerHTML = window.UPBMSAdmin.renderAdminLoginModal(lang);
    const form = document.getElementById("adminLoginForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = document.getElementById("adminPinInput").value.trim();
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const json = await res.json();
      if (json.ok) {
        isAdminLoggedIn = true;
        adminPinSession = pin;
        closeModal();
        currentRoute = "admin";
        await refreshData();
        toast(t("✅ एडमिन कंट्रोल पैनल में आपका स्वागत है!", "✅ Welcome to the Admin Control Panel!"));
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toast("❌ " + (json.error || t("गलत पिन!", "Incorrect PIN!")));
      }
    });
  }

  async function logoutAdmin() {
    isAdminLoggedIn = false;
    adminPinSession = "";
    currentRoute = "home";
    await refreshData();
    toast(t("एडमिन पैनल से लॉगआउट हो गया।", "Logged out from Admin Panel."));
  }

  // ==================== MEMBER LOGIN PORTAL (SECURITY GATE FOR ALL SIGNED/STAMPED FUNCTIONS!) ====================
  function openMemberLoginModal(prefillQuery = "") {
    const modalRoot = document.getElementById("modalRoot");
    if (loggedInMember) {
      const m = loggedInMember;
      const isAct = m.status === "active";
      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box" style="max-width:540px">
            <div class="modal-header">
              <h3 style="font-size:1.02rem;font-weight:900">👤 ${t("सुरक्षित सदस्य प्रोफ़ाइल डैशबोर्ड", "Secure Member Profile Dashboard")}</h3>
              <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕</button>
            </div>
            <div class="modal-body">
              <div style="background:${isAct ? "#f0fdf4" : "#fff7ed"};border:1px solid ${isAct ? "#86efac" : "#fed7aa"};padding:14px;border-radius:12px;margin-bottom:14px">
                <div style="font-weight:900;font-size:1.08rem;color:#0a2252">${escapeHtml(t(m.nameHi, m.nameEn))}</div>
                <div style="font-size:0.86rem;color:${isAct ? "#15803d" : "#b45309"};font-weight:800">${escapeHtml(t(m.designationHi, m.designationEn))} (${escapeHtml(m.memberCode)})</div>
                <div style="font-size:0.82rem;color:#475569;margin-top:4px">${t("जनपद:", "District:")} ${escapeHtml(localizeDual(m.district, lang))} • ${escapeHtml(m.mobile)}</div>
                <div style="margin-top:8px;font-size:0.78rem;font-weight:800;color:#0f172a">
                  ${
                    isAct
                      ? t("✓ सदस्य खाता स्थिति: सक्रिय एवं सत्यापित", "✓ Account Status: Active & Verified")
                      : t("⏳ आपकी सदस्यता एडमिन सत्यापन हेतु लंबित है। अनुमोदन के बाद प्रपत्र खुलेंगे।", "⏳ Membership approval pending. Documents unlock after Admin approval.")
                  }
                </div>
              </div>
              <div style="display:grid;gap:10px">
                ${
                  isAct
                    ? `<button class="btn btn-primary" onclick="window.UPBMSApp.closeModal(); window.UPBMSApp.openMemberDocsModal('${m.id}')">
                         🪪 ${t("मेरा हस्ताक्षर युक्त पहचान पत्र एवं नियुक्ति पत्र खोलें", "Open My Signed ID Card & Appointment Letter")}
                       </button>
                       <button class="btn btn-outline" onclick="window.UPBMSApp.closeModal(); window.UPBMSApp.navigate('documents')">
                         📂 ${t("हस्ताक्षर एवं मुहर युक्त संघ दस्तावेज़ देखें", "View Signed & Stamped Association Documents")}
                       </button>`
                    : ""
                }
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.logoutMember()">
                  🔒 ${t("सदस्य लॉगआउट करें", "Logout Member Account")}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const qVal = prefillQuery || "9450011223";
    const reasonBanner = loginPromptReason
      ? `<div style="background:#fff7ed;border:1.5px solid #fdba74;padding:11px 13px;border-radius:10px;margin-bottom:12px;font-size:0.83rem;font-weight:800;color:#9a3412">
           🔒 ${escapeHtml(t(loginPromptReason.hi, loginPromptReason.en))}
         </div>`
      : `<div style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:0.81rem;font-weight:700;color:#9a3412">
           🔒 ${t("हस्ताक्षर एवं आधिकारिक मुहर युक्त सभी प्रपत्र केवल पंजीकृत सदस्य लॉगिन के बाद ही उपलब्ध हैं।", "Official documents bearing signatures and seal are available exclusively after Member Login.")}
         </div>`;

    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="max-width:480px">
          <div class="modal-header">
            <h3 style="font-size:1.02rem;font-weight:900">🔑 ${t("सुरक्षित सदस्य लॉगिन", "Secure Member Login")}</h3>
            <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕</button>
          </div>
          <form class="modal-body" onsubmit="window.UPBMSApp.submitMemberLogin(event)">
            ${reasonBanner}
            <div style="background:#eff6ff;border:1px solid #bfdbfe;padding:10px 12px;border-radius:10px;margin-bottom:14px;font-size:0.81rem;color:#1e3a8a">
              ${t("डेमो सदस्य लॉगिन: मोबाइल 9450011223 (या अपनी सदस्य ID जैसे UPBMS-2026-0101) और पासवर्ड 123456 डालें।", "Demo Member Login: Enter Mobile 9450011223 (or Member ID e.g. UPBMS-2026-0101) & Password 123456.")}
            </div>
            <div class="form-group" style="margin-bottom:12px">
              <label class="form-label">${t("सदस्य आईडी या मोबाइल नंबर *", "Member ID or Mobile Number *")}</label>
              <input class="form-control" id="memLoginQuery" value="${escapeHtml(qVal)}" required />
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">${t("पासवर्ड *", "Password *")}</label>
              <input type="password" class="form-control" id="memLoginPwd" value="${prefillQuery ? "" : "123456"}" placeholder="${t("अपना पासवर्ड दर्ज करें", "Enter your password")}" required />
            </div>
            <button type="submit" class="btn btn-accent" style="width:100%">
              🔓 ${t("सत्यापित सदस्य लॉगिन करें", "Sign In to Member Account")}
            </button>
            <div style="margin-top:12px;text-align:center">
              <button type="button" class="btn btn-outline btn-sm" onclick="window.UPBMSApp.closeModal(); window.UPBMSApp.navigate('join')">
                ✍️ ${t("अभी सदस्य नहीं बने हैं? सदस्यता हेतु पंजीकरण करें", "Not a member yet? Register for Membership")}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function submitMemberLogin(e) {
    e.preventDefault();
    const query = document.getElementById("memLoginQuery").value.trim();
    const password = document.getElementById("memLoginPwd").value.trim();
    const res = await fetch("/api/member/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, password })
    });
    const json = await res.json();
    if (json.ok) {
      loggedInMember = json.member;
      memberAuthSession = { id: json.member.id, password };
      verifiedResult = { member: json.member, receipts: json.receipts || [] };
      const nextFn = pendingPostLoginAction;
      pendingPostLoginAction = null;
      loginPromptReason = null;
      closeModal();
      await refreshData();
      toast(t(`✅ स्वागत है, ${json.member.nameHi}! सुरक्षित सत्र सक्रिय।`, `✅ Welcome, ${json.member.nameEn}! Secure session active.`));

      if (nextFn && json.member.status === "active") {
        nextFn();
      } else {
        currentRoute = "idcard";
        if (json.member.status === "active") {
          await recordSignedUsage({
            actionType: "view_idcard",
            actionLabelHi: "हस्ताक्षर एवं मुहर युक्त पहचान पत्र खोला",
            actionLabelEn: "Opened Signed & Stamped Identity Card",
            targetTitleHi: `आधिकारिक पहचान पत्र (${json.member.memberCode})`,
            targetTitleEn: `Official Identity Card (${json.member.memberCode})`,
            signatoryIds: [json.member.signatoryId || state.settings.defaultSignatoryId || "sig-gs"]
          });
        }
        rerender();
      }
    } else {
      toast("❌ " + (json.error || t("लॉगिन विफल", "Login failed")));
    }
  }

  async function logoutMember() {
    loggedInMember = null;
    memberAuthSession = null;
    pendingPostLoginAction = null;
    loginPromptReason = null;
    verifiedResult = null;
    closeModal();
    await refreshData();
    toast(t("🔒 सदस्य खाते से सुरक्षित लॉगआउट हो गया।", "🔒 Safely logged out from member account."));
  }

  function closeModal() {
    activeModalContext = null;
    modalMultiSigIds = null;
    const modalRoot = document.getElementById("modalRoot");
    if (modalRoot) modalRoot.innerHTML = "";
  }

  function toast(msg) {
    const wrap = document.getElementById("toastRoot");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  // ==================== HEADER & CLEAN MENU BAR ====================
  function renderHeader() {
    const s = state.settings;
    const sl = s.socialLinks || {};
    const hb = s.headerButtons || {};
    const stx = s.sectionTexts || {};
    const pendingTotal = (state.stats.pendingMembersCount || 0) + (state.stats.pendingPaymentsCount || 0);
    const grvEnabled = isGrievanceEnabled();

    // Filter navItems cleanly (NO admin, NO idcard, NO donation in menu bar, plus hide grievance if disabled!)
    const navItems = [...(s.navItems || [])]
      .filter((it) => {
        if (it.visible === false) return false;
        if (it.id === "grievance" && !grvEnabled) return false;
        if (["admin", "idcard", "donation"].includes(it.id)) return false;
        return true;
      })
      .sort((a, b) => (a.order || 99) - (b.order || 99));

    const tickerList = lang === "en" ? (s.tickerNoticesEn || s.tickerNoticesHi || []) : (s.tickerNoticesHi || []);

    return `
      <!-- Top Utility Bar -->
      <div class="top-utility no-print">
        <div class="container top-utility-inner">
          <div class="top-left-meta">
            <a href="tel:${escapeHtml(s.helplinePrimary)}" class="top-pill">📞 <b>${t("हेल्पलाइन:", "Helpline:")}</b> ${escapeHtml(s.helplinePrimary)}</a>
            <a href="mailto:${escapeHtml(s.email)}" class="top-pill">✉️ ${escapeHtml(s.email)}</a>
          </div>

          <div class="top-right-actions">
            <div class="social-icon-strip">
              ${sl.whatsappChannel ? `<a href="${escapeHtml(sl.whatsappChannel)}" target="_blank" rel="noopener" class="soc-icon-btn" title="WhatsApp Channel">${SOCIAL_SVGS.whatsapp}<span>WA</span></a>` : ""}
              ${sl.whatsappGroup ? `<a href="${escapeHtml(sl.whatsappGroup)}" target="_blank" rel="noopener" class="soc-icon-btn" title="WhatsApp Group">${SOCIAL_SVGS.whatsapp}<span>${t("ग्रुप", "Group")}</span></a>` : ""}
              ${sl.facebook ? `<a href="${escapeHtml(sl.facebook)}" target="_blank" rel="noopener" class="soc-icon-btn" title="Facebook">${SOCIAL_SVGS.facebook}<span>FB</span></a>` : ""}
              ${sl.instagram ? `<a href="${escapeHtml(sl.instagram)}" target="_blank" rel="noopener" class="soc-icon-btn" title="Instagram">${SOCIAL_SVGS.instagram}<span>Insta</span></a>` : ""}
              ${sl.youtube ? `<a href="${escapeHtml(sl.youtube)}" target="_blank" rel="noopener" class="soc-icon-btn" title="YouTube">${SOCIAL_SVGS.youtube}<span>YT</span></a>` : ""}
              ${sl.twitter ? `<a href="${escapeHtml(sl.twitter)}" target="_blank" rel="noopener" class="soc-icon-btn" title="X">${SOCIAL_SVGS.twitter}<span>X</span></a>` : ""}
              ${sl.telegram ? `<a href="${escapeHtml(sl.telegram)}" target="_blank" rel="noopener" class="soc-icon-btn" title="Telegram">${SOCIAL_SVGS.telegram}<span>TG</span></a>` : ""}
              ${sl.extra1Url ? `<a href="${escapeHtml(sl.extra1Url)}" target="_blank" rel="noopener" class="soc-icon-btn">${SOCIAL_SVGS.link}<span>${escapeHtml(sl.extra1Label || "Link 1")}</span></a>` : ""}
              ${sl.extra2Url ? `<a href="${escapeHtml(sl.extra2Url)}" target="_blank" rel="noopener" class="soc-icon-btn">${SOCIAL_SVGS.link}<span>${escapeHtml(sl.extra2Label || "Link 2")}</span></a>` : ""}
            </div>

            <button class="btn-lang" onclick="window.UPBMSApp.toggleLang()">
              🌐 ${lang === "hi" ? "Switch to English" : "हिंदी में देखें"}
            </button>

            <button class="btn-admin-launch" onclick="window.UPBMSApp.navigate('admin')">
              ⚙️ ${escapeHtml(t(hb.adminLabelHi || "एडमिन पैनल", hb.adminLabelEn || "Admin Panel"))} ${pendingTotal ? `(${pendingTotal})` : ""}
            </button>
          </div>
        </div>
      </div>

      <!-- Brand Masthead + Top Action Buttons (ID Card/Letter, Donation, Join, Member Login) -->
      <header class="site-header no-print">
        <div class="container brand-row">
          <div class="brand-identity" onclick="window.UPBMSApp.navigate('home')">
            <div class="brand-logo-wrap">
              <img src="${escapeHtml(s.logoUrl || "/images/upbms-crest.svg")}" alt="${escapeHtml(s.shortName)}" />
            </div>
            <div style="min-width:0">
              <div class="brand-badge-row">
                <span class="short-tag">${escapeHtml(s.shortName)}</span>
                <span class="reg-tag">${escapeHtml(s.regNumber)}</span>
              </div>
              <div class="brand-name">${escapeHtml(t(s.orgNameHi, s.orgNameEn))}</div>
              <div class="brand-tagline">${escapeHtml(t(s.taglineHi, s.taglineEn))}</div>
            </div>
          </div>

          <div class="header-cta-group">
            ${
              hb.memberLoginVisible !== false
                ? `<button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openMemberLoginModal()">
                     🔑 ${loggedInMember ? escapeHtml(t(loggedInMember.nameHi, loggedInMember.nameEn)) : escapeHtml(t(hb.memberLoginLabelHi || "सदस्य लॉगिन", hb.memberLoginLabelEn || "Member Login"))}
                   </button>`
                : ""
            }
            ${
              hb.idcardVisible !== false
                ? `<button class="btn ${currentRoute === "idcard" ? "btn-primary" : "btn-outline"} btn-sm" onclick="window.UPBMSApp.navigate('idcard')">
                     🪪 ${escapeHtml(t(hb.idcardLabelHi || "पहचान पत्र एवं नियुक्ति पत्र", hb.idcardLabelEn || "ID Card & Appointment Letter"))}
                   </button>`
                : ""
            }
            ${
              hb.donationVisible !== false
                ? `<button class="btn btn-whatsapp btn-sm" onclick="window.UPBMSApp.navigate('donation')">
                     🤝 ${escapeHtml(t(hb.donationLabelHi || "सहयोग राशि / डोनेशन", hb.donationLabelEn || "Donate"))}
                   </button>`
                : ""
            }
            ${
              hb.joinVisible !== false
                ? `<button class="btn btn-accent btn-sm" onclick="window.UPBMSApp.navigate('join')">
                     ✍️ ${escapeHtml(t(hb.joinLabelHi || "सदस्य बनें", hb.joinLabelEn || "Join Membership"))}
                   </button>`
                : ""
            }
          </div>
        </div>

        <!-- Clean Navigation Menu Bar (Editable from Admin!) -->
        <nav class="main-nav">
          <div class="container nav-list">
            ${navItems
              .map(
                (it) => `
              <button class="nav-btn ${currentRoute === it.id ? "active" : ""}" onclick="window.UPBMSApp.navigate('${escapeHtml(it.id)}')">
                <span>${NAV_ICONS[it.id] || "•"}</span>
                <span>${escapeHtml(t(it.labelHi, it.labelEn))}</span>
              </button>`
              )
              .join("")}
          </div>
        </nav>
      </header>

      ${
        tickerList.length
          ? `<div class="ticker-bar no-print">
               <div class="container ticker-inner">
                 <span class="ticker-label">${escapeHtml(t(stx.tickerBadgeHi || "ताज़ा सूचना", stx.tickerBadgeEn || "LATEST UPDATE"))}</span>
                 <div class="ticker-track-wrap">
                   <div class="ticker-track">${tickerList.map(escapeHtml).join("   ✦   ")}</div>
                 </div>
               </div>
             </div>`
          : ""
      }
    `;
  }

  // ==================== SHARED CARD RENDERERS ====================
  function renderSliderHtml() {
    const activeSlides = state.slides.filter((s) => s.active !== false);
    if (!activeSlides.length) return "";
    const sl = activeSlides[slideIdx % activeSlides.length];
    const caption = t(sl.captionHi, sl.captionEn);

    return `
      <div class="hero-16x9-stage">
        <img
          src="${escapeHtml(sl.imageUrl)}"
          alt="${escapeHtml(caption || "UPBMS")}"
          class="hero-16x9-img ${sl.fitMode === "contain" ? "fit-contain" : ""}"
        />
        ${caption ? `<div class="hero-caption-pill">📸 ${escapeHtml(caption)}</div>` : ""}
        ${
          activeSlides.length > 1
            ? `
              <button class="hero-arrow prev" onclick="window.UPBMSApp.setSlide(${slideIdx - 1})" aria-label="Previous">‹</button>
              <button class="hero-arrow next" onclick="window.UPBMSApp.setSlide(${slideIdx + 1})" aria-label="Next">›</button>
              <div class="hero-dots">
                ${activeSlides
                  .map(
                    (_, idx) =>
                      `<button class="hero-dot ${idx === slideIdx % activeSlides.length ? "active" : ""}" onclick="window.UPBMSApp.setSlide(${idx})"></button>`
                  )
                  .join("")}
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  function renderCoreMemberBigCard(m) {
    const photo = m.photoUrl || initialsAvatarSvg(m.nameEn || m.nameHi);
    const waText = lang === "en"
      ? "Greetings, I am reaching out via the Uttar Pradesh Bank Mitra Sangh (UPBMS) portal."
      : "नमस्कार, मैं उत्तर प्रदेश बैंक मित्र संघ (UPBMS) पोर्टल के माध्यम से संपर्क कर रहा हूँ।";
    const waLink = `https://wa.me/${String(m.whatsapp || m.mobile).replace(/\D/g, "")}?text=${encodeURIComponent(waText)}`;
    const quote = t(m.messageHi, m.messageEn);

    return `
      <article class="core-card">
        <div class="core-card-top-ribbon">
          <span>★ ${t("प्रदेश मुख्य कार्यकारिणी", "STATE CORE EXECUTIVE COMMITTEE")}</span>
          <span>ID: ${escapeHtml(m.memberCode)}</span>
        </div>
        <div class="core-card-body">
          <div class="core-photo-frame">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(t(m.nameHi, m.nameEn))}" />
            <span class="core-verified-seal">✓ ${t("सत्यापित", "Verified")}</span>
          </div>
          <div class="core-info">
            <div class="core-designation-banner">🎖️ ${escapeHtml(t(m.designationHi, m.designationEn))}</div>
            <h3 class="core-name">${escapeHtml(t(m.nameHi, m.nameEn))}</h3>
            <div class="core-meta-list">
              <span>📍 ${escapeHtml(localizeDual(m.district, lang))}</span>
              <span>🏦 ${escapeHtml(localizeDual(m.bankName, lang))}</span>
              <span>🩸 ${t("रक्त समूह:", "Blood Group:")} <b>${escapeHtml(m.bloodGroup || "O+")}</b></span>
            </div>
            ${quote ? `<div class="core-quote">“${escapeHtml(quote)}”</div>` : ""}
            <div class="core-actions">
              <a href="tel:${escapeHtml(m.mobile)}" class="btn btn-primary btn-sm">📞 ${escapeHtml(m.mobile)}</a>
              <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-sm">💬 WhatsApp</a>
              ${
                canAccessPersonalMemberDocs(m.id)
                  ? `<button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openMemberDocsModal('${m.id}')">
                       🪪 ${t("मेरा पहचान पत्र व नियुक्ति पत्र", "My ID Card & Appointment Letter")}
                     </button>`
                  : ""
              }
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderGeneralMemberCompactCard(m) {
    const photo = m.photoUrl || initialsAvatarSvg(m.nameEn || m.nameHi, "#184296", "#ffffff");
    return `
      <div class="member-compact-card">
        <div class="member-avatar-sm"><img src="${escapeHtml(photo)}" alt="${escapeHtml(t(m.nameHi, m.nameEn))}" /></div>
        <div class="member-compact-info">
          <div class="member-compact-name">${escapeHtml(t(m.nameHi, m.nameEn))}</div>
          <div class="member-compact-role">${escapeHtml(t(m.designationHi, m.designationEn))}</div>
          <div class="member-compact-meta">📍 ${escapeHtml(localizeDual(m.district, lang))} • ${escapeHtml(localizeDual(m.bankName, lang))}</div>
          <div class="member-compact-meta">ID: <b>${escapeHtml(m.memberCode)}</b></div>
        </div>
        ${
          canAccessPersonalMemberDocs(m.id)
            ? `<button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openMemberDocsModal('${m.id}')">
                 🪪 ${t("मेरा कार्ड", "My Card")}
               </button>`
            : `<span class="badge badge-verified" style="font-size:0.7rem">✓ ${t("सक्रिय", "Active")}</span>`
        }
      </div>
    `;
  }

  function renderPortalCard(link) {
    return `
      <article class="portal-big-card">
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="portal-big-image-box">
          <img src="${escapeHtml(link.imageUrl)}" alt="${escapeHtml(t(link.titleHi, link.titleEn))}" />
          <span class="portal-cat-badge">${escapeHtml(t(link.categoryHi, link.categoryEn))}</span>
          <span class="portal-domain-pill">🔗 ${escapeHtml(link.domainLabel || link.url.replace(/^https?:\/\//, "").split("/")[0])}</span>
        </a>
        <div class="portal-big-content">
          <div>
            <h3 class="portal-big-title">${escapeHtml(t(link.titleHi, link.titleEn))}</h3>
            <p class="portal-big-desc">${escapeHtml(t(link.descHi, link.descEn))}</p>
          </div>
          <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="width:100%">
            🌐 ${t("आधिकारिक पोर्टल खोलें", "Open Official Portal")} ↗
          </a>
        </div>
      </article>
    `;
  }

  // ==================== PAGE 1: HOME ====================
  function renderHomePage() {
    const s = state.settings;
    const cb = s.campaignBlock || {};
    const stx = s.sectionTexts || {};
    const statCards = s.statCards || [];
    const generalMembers = state.members.filter((m) => m.status === "active" && !m.isCoreMember);
    const portals = state.externalLinks.filter((l) => l.active !== false);
    const circulars = state.circulars || [];
    const sl = s.socialLinks || {};
    const grvEnabled = isGrievanceEnabled();

    return `
      <!-- 1. Hero Slider + Campaign & 4 Highlight Stats Deck -->
      <section class="hero-showcase-wrapper">
        <div class="container">
          <div id="hero16x9Mount">${renderSliderHtml()}</div>

          <div class="campaign-impact-deck">
            <div class="campaign-top-grid">
              <div>
                <div class="campaign-pill">✨ ${escapeHtml(t(cb.badgeHi, cb.badgeEn))}</div>
                <h1 class="campaign-headline">${escapeHtml(t(cb.titleHi, cb.titleEn))}</h1>
                <p class="campaign-sub">${escapeHtml(t(cb.subtitleHi, cb.subtitleEn))}</p>
              </div>
              <div class="campaign-cta-stack">
                <button class="btn btn-accent btn-lg" onclick="window.UPBMSApp.navigate('${escapeHtml(cb.btn1Route || "join")}')">
                  ✍️ ${escapeHtml(t(cb.btn1Hi, cb.btn1En))}
                </button>
                <button class="btn btn-white btn-lg" onclick="window.UPBMSApp.navigate('${escapeHtml(cb.btn2Route || "demands")}')">
                  📋 ${escapeHtml(t(cb.btn2Hi, cb.btn2En))}
                </button>
                ${
                  (cb.btn3Route === "grievance" && !grvEnabled)
                    ? `<button class="btn btn-whatsapp btn-lg" onclick="window.UPBMSApp.navigate('about')">🏛️ ${t("हमारे बारे में जानें", "About Association")}</button>`
                    : `<button class="btn btn-whatsapp btn-lg" onclick="window.UPBMSApp.navigate('${escapeHtml(cb.btn3Route || "grievance")}')">⚖️ ${escapeHtml(t(cb.btn3Hi, cb.btn3En))}</button>`
                }
              </div>
            </div>

            <div class="impact-stats-row">
              ${statCards
                .map(
                  (st) => `
                <div class="impact-stat-box">
                  <div class="impact-stat-icon">${escapeHtml(st.icon || "⭐")}</div>
                  <div>
                    <div class="impact-stat-val">${escapeHtml(t(st.valueHi, st.valueEn))}</div>
                    <div class="impact-stat-lbl">${escapeHtml(t(st.labelHi, st.labelEn))}</div>
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Circulars & Guidelines Preview (Exact Uploaded Documents) -->
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">📑 ${escapeHtml(t(stx.homeCircularsEyebrowHi, stx.homeCircularsEyebrowEn))}</span>
              <h2 class="section-title">${escapeHtml(t(stx.homeCircularsTitleHi, stx.homeCircularsTitleEn))}</h2>
              <p class="section-sub">${escapeHtml(t(stx.homeCircularsSubHi, stx.homeCircularsSubEn))}</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.navigate('circulars')">
              📑 ${t("सभी सर्कुलर व पीडीएफ देखें", "View All Circulars & PDFs")} →
            </button>
          </div>

          <div class="circulars-grid">
            ${circulars
              .slice(0, 3)
              .map((c) => renderCircularCard(c))
              .join("")}
          </div>
        </div>
      </section>

      <!-- 3. Important Banking & Govt Portals -->
      <section class="section-block alt-bg" id="externalPortalsSection">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">🌐 ${escapeHtml(t(stx.homePortalsEyebrowHi, stx.homePortalsEyebrowEn))}</span>
              <h2 class="section-title">${escapeHtml(t(stx.homePortalsTitleHi, stx.homePortalsTitleEn))}</h2>
              <p class="section-sub">${escapeHtml(t(stx.homePortalsSubHi, stx.homePortalsSubEn))}</p>
            </div>
            <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.navigate('portals')">
              🌐 ${t("सभी पोर्टल देखें", "View All Portals")} →
            </button>
          </div>

          <div class="external-portals-grid">
            ${portals.map(renderPortalCard).join("")}
          </div>
        </div>
      </section>

      <!-- 4. Charter of Demands -->
      <section class="section-block" id="demandsSection">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">✊ ${escapeHtml(t(stx.homeDemandsEyebrowHi, stx.homeDemandsEyebrowEn))}</span>
              <h2 class="section-title">${escapeHtml(t(stx.homeDemandsTitleHi, stx.homeDemandsTitleEn))}</h2>
              <p class="section-sub">${escapeHtml(t(stx.homeDemandsSubHi, stx.homeDemandsSubEn))}</p>
            </div>
            <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.navigate('about')">
              🏛️ ${t("संघ परिचय, प्रमाण-पत्र व मुख्य कार्यकारिणी", "About Us, Certificates & Core Leadership")} →
            </button>
          </div>

          <div class="demands-grid">
            ${state.demands
              .map(
                (d) => `
              <div class="demand-card">
                <div class="demand-num-row">
                  <span class="demand-num">${d.number}</span>
                  <span class="demand-status">${escapeHtml(t(d.statusHi || d.status, d.statusEn || d.status))}</span>
                </div>
                <h3 class="demand-title">${escapeHtml(t(d.titleHi, d.titleEn))}</h3>
                <p class="demand-desc">${escapeHtml(t(d.descHi, d.descEn))}</p>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </section>

      <!-- 5. Active District & General Members Preview -->
      <section class="section-block alt-bg">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">👥 ${escapeHtml(t(stx.homeMembersEyebrowHi, stx.homeMembersEyebrowEn))}</span>
              <h2 class="section-title">${escapeHtml(t(stx.homeMembersTitleHi, stx.homeMembersTitleEn))}</h2>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.navigate('about')">
                👑 ${t("प्रदेश मुख्य कार्यकारिणी देखें", "View State Core Committee")}
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.navigate('members')">
                🔍 ${t("संपूर्ण सदस्य सूची", "Full Member Directory")} →
              </button>
            </div>
          </div>
          <div class="general-members-grid">
            ${generalMembers.slice(0, 6).map(renderGeneralMemberCompactCard).join("")}
          </div>
        </div>
      </section>

      <!-- 6. News & Official Social Media Hub -->
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">📰 ${escapeHtml(t(stx.homeNewsEyebrowHi, stx.homeNewsEyebrowEn))}</span>
              <h2 class="section-title">${escapeHtml(t(stx.homeNewsTitleHi, stx.homeNewsTitleEn))}</h2>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:22px;margin-bottom:34px">
            ${state.news
              .map((n) => {
                const titleTxt = t(n.titleHi, n.titleEn);
                const sumTxt = t(n.summaryHi, n.summaryEn);
                const waShare = `https://wa.me/?text=${encodeURIComponent(`*${t(s.orgNameHi, s.orgNameEn)}*\n\n${titleTxt}\n\n${sumTxt}`)}`;
                return `
                  <article class="card-panel" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
                    <img src="${escapeHtml(n.imageUrl || "/images/hero-banner-1.jpg")}" style="width:100%;aspect-ratio:16/9;object-fit:cover" alt="News" />
                    <div style="padding:18px;flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:12px">
                      <div>
                        <div style="font-size:0.78rem;color:var(--accent);font-weight:800">
                          ${escapeHtml(t(n.categoryHi || n.category, n.categoryEn || n.category))} • 📍 ${escapeHtml(t(n.district, n.districtEn))} • 📅 ${escapeHtml(n.date)}
                        </div>
                        <h3 style="font-size:1.06rem;font-weight:900;color:var(--primary);margin:6px 0">${escapeHtml(titleTxt)}</h3>
                        <p style="font-size:0.88rem;color:var(--text-muted)">${escapeHtml(sumTxt)}</p>
                      </div>
                      <a href="${waShare}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-sm" style="align-self:flex-start">
                        📲 ${t("WhatsApp पर साझा करें", "Share on WhatsApp")}
                      </a>
                    </div>
                  </article>`;
              })
              .join("")}
          </div>

          <div class="social-connect-grid">
            ${sl.whatsappChannel ? `<a href="${escapeHtml(sl.whatsappChannel)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#16a34a;width:26px">${SOCIAL_SVGS.whatsapp}</span><div><div style="color:#15803d">WhatsApp Channel</div><div style="font-size:0.75rem;color:#64748b">${t("आधिकारिक चैनल", "Official Channel")}</div></div></a>` : ""}
            ${sl.whatsappGroup ? `<a href="${escapeHtml(sl.whatsappGroup)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#15803d;width:26px">${SOCIAL_SVGS.whatsapp}</span><div><div style="color:#16a34a">${t("WhatsApp समूह", "WhatsApp Group")}</div><div style="font-size:0.75rem;color:#64748b">${t("प्रदेश बैंक मित्र समूह", "State Bank Mitra Group")}</div></div></a>` : ""}
            ${sl.facebook ? `<a href="${escapeHtml(sl.facebook)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#1d4ed8;width:26px">${SOCIAL_SVGS.facebook}</span><div><div style="color:#1d4ed8">Facebook</div><div style="font-size:0.75rem;color:#64748b">${t("लाइव सम्मेलन अपडेट", "Live Updates")}</div></div></a>` : ""}
            ${sl.instagram ? `<a href="${escapeHtml(sl.instagram)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#db2777;width:26px">${SOCIAL_SVGS.instagram}</span><div><div style="color:#db2777">Instagram</div><div style="font-size:0.75rem;color:#64748b">${t("अभियान झलकियाँ", "Campaign Highlights")}</div></div></a>` : ""}
            ${sl.youtube ? `<a href="${escapeHtml(sl.youtube)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#dc2626;width:26px">${SOCIAL_SVGS.youtube}</span><div><div style="color:#dc2626">YouTube</div><div style="font-size:0.75rem;color:#64748b">${t("वीडियो मार्गदर्शन", "Video Guidance")}</div></div></a>` : ""}
            ${sl.twitter ? `<a href="${escapeHtml(sl.twitter)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#0f172a;width:26px">${SOCIAL_SVGS.twitter}</span><div><div style="color:#0f172a">X (Twitter)</div><div style="font-size:0.75rem;color:#64748b">${t("आधिकारिक संवाद", "Official Handle")}</div></div></a>` : ""}
            ${sl.telegram ? `<a href="${escapeHtml(sl.telegram)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#0284c7;width:26px">${SOCIAL_SVGS.telegram}</span><div><div style="color:#0284c7">Telegram</div><div style="font-size:0.75rem;color:#64748b">${t("सर्कुलर अलर्ट", "Circular Alerts")}</div></div></a>` : ""}
            ${sl.extra1Url ? `<a href="${escapeHtml(sl.extra1Url)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#ea580c;width:26px">${SOCIAL_SVGS.link}</span><div><div style="color:#0a2252">${escapeHtml(sl.extra1Label || "Link 1")}</div><div style="font-size:0.75rem;color:#64748b">${t("आधिकारिक लिंक", "Official Link")}</div></div></a>` : ""}
            ${sl.extra2Url ? `<a href="${escapeHtml(sl.extra2Url)}" target="_blank" rel="noopener" class="social-big-btn"><span style="color:#ea580c;width:26px">${SOCIAL_SVGS.link}</span><div><div style="color:#0a2252">${escapeHtml(sl.extra2Label || "Link 2")}</div><div style="font-size:0.75rem;color:#64748b">${t("आधिकारिक लिंक", "Official Link")}</div></div></a>` : ""}
          </div>
        </div>
      </section>
    `;
  }

  // ==================== PAGE 2: ABOUT US (COMBINED ABOUT + VISION-MISSION + CERTIFICATES + CORE MEMBERS!) ====================
  function renderAboutPage() {
    const avm = state.settings.aboutVisionMission || {};
    const certs = state.certificates || [];
    const coreMembers = state.members.filter((m) => m.status === "active" && m.isCoreMember);
    const missionPoints = lang === "en" ? (avm.missionPointsEn || avm.missionPointsHi || []) : (avm.missionPointsHi || []);

    return `
      <!-- Section A: Combined About Us + Vision & Mission -->
      <section class="section-block">
        <div class="container">
          <div class="about-vm-card">
            <div class="about-hero-banner">
              <span class="campaign-pill">🏛️ ${t("संगठन परिचय एवं संकल्प", "ABOUT THE ASSOCIATION")}</span>
              <h1 style="font-size:clamp(1.45rem,2.6vw,2.1rem);font-weight:900;color:#ffd166;margin-bottom:12px">
                ${escapeHtml(t(avm.aboutTitleHi, avm.aboutTitleEn))}
              </h1>
              <p style="font-size:1rem;line-height:1.8;color:#f1f5f9">${escapeHtml(t(avm.aboutBodyHi, avm.aboutBodyEn))}</p>
            </div>

            <div class="vm-two-col">
              <div class="vm-panel">
                <h2 style="font-size:1.22rem;font-weight:900;color:var(--primary);margin-bottom:10px">
                  🔭 ${escapeHtml(t(avm.visionTitleHi || "हमारी दूरदृष्टि", avm.visionTitleEn || "Our Vision"))}
                </h2>
                <p style="font-size:0.95rem;color:#334155;line-height:1.78">${escapeHtml(t(avm.visionBodyHi, avm.visionBodyEn))}</p>
              </div>

              <div class="vm-panel mission">
                <h2 style="font-size:1.22rem;font-weight:900;color:var(--primary);margin-bottom:10px">
                  🎯 ${escapeHtml(t(avm.missionTitleHi || "हमारा मिशन", avm.missionTitleEn || "Our Mission"))}
                </h2>
                <ul style="padding-left:20px;display:grid;gap:8px;font-size:0.93rem;color:#334155;line-height:1.68">
                  ${missionPoints.map((pt) => `<li>${escapeHtml(pt)}</li>`).join("")}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section B: Association Registrations & Certificates (Exact as Uploaded!) -->
      <section class="section-block alt-bg">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">📜 ${t("आधिकारिक प्रमाणन", "OFFICIAL CERTIFICATES")}</span>
              <h2 class="section-title">${escapeHtml(t(avm.certSectionTitleHi || "संगठन पंजीकरण एवं प्राप्त प्रमाण-पत्र", avm.certSectionTitleEn || "Association Registrations & Certificates"))}</h2>
              <p class="section-sub">${escapeHtml(t(avm.certSectionSubHi, avm.certSectionSubEn))}</p>
            </div>
          </div>

          ${
            certs.length === 0
              ? `<div class="card-panel" style="text-align:center;color:#64748b">${t("अभी कोई प्रमाण-पत्र अपलोड नहीं किया गया है।", "No certificates uploaded yet.")}</div>`
              : `<div class="certificates-grid">
                   ${certs
                     .map((c) => {
                       const locked = Boolean((c.requiresMemberLogin || c.isLockedForVisitor) && !canAccessSignedAssets());
                       const isPdf = c.fileType === "pdf" || String(c.fileUrl).toLowerCase().endsWith(".pdf");
                       const titleTxt = t(c.titleHi, c.titleEn);
                       const issuerTxt = t(c.issuerHi, c.issuerEn);
                       return `
                         <article class="cert-card">
                           <div class="cert-exact-frame" style="cursor:pointer" onclick="window.UPBMSApp.openRawFileModal('certificate', '${c.id}')">
                             ${
                               locked
                                 ? `<div style="padding:36px;text-align:center"><div style="font-size:2.4rem">🔒</div><div style="font-weight:900;color:var(--primary);margin-top:8px">${t("हस्ताक्षर/मुहर युक्त संरक्षित प्रमाण-पत्र", "Protected Signed/Stamped Certificate")}</div><div style="font-size:0.8rem;color:#64748b;margin-top:4px">${t("देखने हेतु सदस्य लॉगिन आवश्यक", "Member Login required to view")}</div></div>`
                                 : isPdf
                                 ? `<div style="padding:36px;text-align:center"><div style="font-size:2.6rem">📕</div><div style="font-weight:900;color:var(--primary);margin-top:8px">${t("पीडीएफ प्रमाण-पत्र खोलें", "Open PDF Certificate")}</div></div>`
                                 : `<img src="${escapeHtml(c.fileUrl)}" alt="${escapeHtml(titleTxt)}" />`
                             }
                           </div>
                           <div style="padding:16px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                             <div>
                               <h3 style="font-size:1.05rem;font-weight:900;color:var(--primary)">${escapeHtml(titleTxt)}</h3>
                               <div style="font-size:0.82rem;color:#64748b;font-weight:700">
                                 ${issuerTxt ? `${escapeHtml(issuerTxt)} • ` : ""}${c.date ? escapeHtml(c.date) : ""}
                               </div>
                             </div>
                             <div style="display:flex;gap:8px">
                               <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.openRawFileModal('certificate', '${c.id}')">
                                 ${locked ? `🔑 ${t("सदस्य लॉगिन से देखें", "Login to View")}` : `👁️ ${t("पूरा देखें", "View Full")}`}
                               </button>
                               ${!locked && c.fileUrl ? `<a href="${escapeHtml(c.fileUrl)}" download class="btn btn-outline btn-sm">⬇️</a>` : ""}
                             </div>
                           </div>
                         </article>`;
                     })
                     .join("")}
                 </div>`
          }
        </div>
      </section>

      <!-- Section C: State Core Executive Committee (प्रदेश मुख्य कार्यकारिणी) -->
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">★ ${t("शीर्ष नेतृत्व", "STATE LEADERSHIP")}</span>
              <h2 class="section-title">${escapeHtml(t(avm.coreSectionTitleHi || "प्रदेश मुख्य कार्यकारिणी (Core Members)", avm.coreSectionTitleEn || "State Core Executive Committee"))}</h2>
              <p class="section-sub">${escapeHtml(t(avm.coreSectionSubHi, avm.coreSectionSubEn))}</p>
            </div>
          </div>

          <div class="core-members-grid">
            ${coreMembers.map(renderCoreMemberBigCard).join("")}
          </div>
        </div>
      </section>
    `;
  }

  // ==================== PAGE 3: MEMBERS DIRECTORY ====================
  function renderMembersDirectoryPage() {
    const activeMembers = state.members.filter((m) => {
      if (m.status !== "active") return false;
      if (memberDistrictFilter && m.district !== memberDistrictFilter) return false;
      if (memberBankFilter && m.bankName !== memberBankFilter) return false;
      if (memberSearch) {
        const q = memberSearch.toLowerCase();
        const hay = `${m.nameHi} ${m.nameEn} ${m.memberCode} ${m.district} ${m.block} ${m.koCode} ${m.mobile}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">👥 ${t("75 जनपद सदस्य नेटवर्क", "75 DISTRICTS MEMBER DIRECTORY")}</span>
              <h1 class="section-title">${t("पंजीकृत पदाधिकारी एवं बैंक मित्र सदस्य सूची", "Registered Office-Bearers & Bank Mitra Members")}</h1>
            </div>
            <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.navigate('about')">
              👑 ${t("प्रदेश मुख्य कार्यकारिणी (About Us में देखें)", "View Core Committee in About Us")} →
            </button>
          </div>

          <div class="filter-bar">
            <input class="form-control" style="flex:1;min-width:210px" placeholder="${t("नाम, सदस्य आईडी, मोबाइल या केओ कोड खोजें...", "Search Name, Member ID, Mobile or KO Code...")}" value="${escapeHtml(memberSearch)}" oninput="window.UPBMSApp.setMemberFilter('search', this.value)" />
            <select class="form-control" style="max-width:250px" onchange="window.UPBMSApp.setMemberFilter('district', this.value)">
              <option value="">${t("सभी 75 जनपद", "All 75 Districts")}</option>
              ${state.meta.districts.map((d) => `<option value="${escapeHtml(d)}" ${memberDistrictFilter === d ? "selected" : ""}>${escapeHtml(localizeDual(d, lang))}</option>`).join("")}
            </select>
            <select class="form-control" style="max-width:250px" onchange="window.UPBMSApp.setMemberFilter('bank', this.value)">
              <option value="">${t("सभी बैंक", "All Sponsor Banks")}</option>
              ${state.meta.banks.map((b) => `<option value="${escapeHtml(b)}" ${memberBankFilter === b ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
            </select>
            <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.setMemberFilter('reset', '')">${t("रीसेट", "Reset")}</button>
          </div>

          <div id="generalMembersMount">
            ${
              activeMembers.length === 0
                ? `<div class="card-panel" style="text-align:center;color:#64748b">${t("इस खोज में कोई सदस्य रिकॉर्ड नहीं मिला।", "No member records matched your search.")}</div>`
                : `<div class="general-members-grid">${activeMembers.map(renderGeneralMemberCompactCard).join("")}</div>`
            }
          </div>
        </div>
      </section>
    `;
  }

  function setMemberFilter(type, val) {
    if (type === "search") memberSearch = val;
    if (type === "district") memberDistrictFilter = val;
    if (type === "bank") memberBankFilter = val;
    if (type === "reset") { memberSearch = ""; memberDistrictFilter = ""; memberBankFilter = ""; rerender(); return; }
    const mount = document.getElementById("generalMembersMount");
    if (mount) {
      const list = state.members.filter((m) => {
        if (m.status !== "active") return false;
        if (memberDistrictFilter && m.district !== memberDistrictFilter) return false;
        if (memberBankFilter && m.bankName !== memberBankFilter) return false;
        if (memberSearch) {
          const q = memberSearch.toLowerCase();
          if (!`${m.nameHi} ${m.nameEn} ${m.memberCode} ${m.district} ${m.block} ${m.koCode} ${m.mobile}`.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      mount.innerHTML = list.length === 0
        ? `<div class="card-panel" style="text-align:center;color:#64748b">${t("कोई रिकॉर्ड नहीं मिला।", "No records found.")}</div>`
        : `<div class="general-members-grid">${list.map(renderGeneralMemberCompactCard).join("")}</div>`;
    }
  }

  // ==================== PAGE 4: MEMBERSHIP REGISTRATION & FEE (WITH TERMS & CONDITIONS + PASSWORD!) ====================
  function renderMembershipJoinPage() {
    const s = state.settings;
    const tc = s.termsAndConditions || {};
    const upiUri = `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.upiPayeeName)}&cu=INR`;
    const upiQrSvg = generateQrSvg(upiUri, 128, "#0a2252");
    const memPayments = state.payments.filter((p) => p.paymentCategory !== "donation");

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">✍️ ${t("ऑनलाइन सदस्यता पोर्टल", "ONLINE MEMBERSHIP REGISTRATION")}</span>
              <h1 class="section-title">${t("बैंक मित्र सदस्यता पंजीकरण एवं वार्षिक शुल्क भुगतान", "Bank Mitra Membership Registration & Annual Fee")}</h1>
              <p class="section-sub">${t("पंजीकरण पूर्ण करते ही अपना डिजिटल पहचान पत्र, नियुक्ति पत्र एवं शुल्क रसीद प्राप्त करें।", "Complete registration to immediately download your Identity Card, Appointment Letter, and Fee Receipt.")}</p>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1.55fr 1fr;gap:24px;align-items:start" class="form-grid">
            <form class="card-panel" onsubmit="window.UPBMSApp.submitPublicMembership(event)">
              <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:14px">
                ✍️ ${t("नया बैंक मित्र सदस्यता आवेदन प्रपत्र", "New Bank Mitra Membership Application")}
              </h3>

              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">${t("पूरा नाम (हिंदी में) *", "Full Name (in Hindi) *")}</label>
                  <input class="form-control" name="nameHi" required placeholder="${t("उदा: सुरेश चंद्र मौर्य", "e.g. सुरेश चंद्र मौर्य")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("पूरा नाम (अंग्रेजी में) *", "Full Name (in English) *")}</label>
                  <input class="form-control" name="nameEn" required placeholder="e.g. Suresh Chandra Maurya" />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("पिता का नाम *", "Father's Name *")}</label>
                  <input class="form-control" name="fatherName" required />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("मोबाइल नंबर (WhatsApp) *", "Mobile Number (WhatsApp) *")}</label>
                  <input class="form-control" name="mobile" pattern="[0-9]{10}" required placeholder="${t("10 अंकों का मोबाइल नंबर", "10-digit mobile number")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("जनपद *", "District *")}</label>
                  <select class="form-control" name="district">
                    ${state.meta.districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(localizeDual(d, lang))}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">${t("ब्लॉक / केंद्र का नाम *", "Block / Center Name *")}</label>
                  <input class="form-control" name="block" required />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("संबंधित बैंक *", "Sponsor Bank *")}</label>
                  <select class="form-control" name="bankName">
                    ${state.meta.banks.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">${t("कॉर्पोरेट बीसी कंपनी", "Corporate BC Company")}</label>
                  <select class="form-control" name="bcCompany">
                    ${state.meta.bcCompanies.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">${t("केओ / सीएसपी कोड *", "KO / CSP Code *")}</label>
                  <input class="form-control" name="koCode" required placeholder="e.g. SBI-KNP-5501" />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("रक्त समूह", "Blood Group")}</label>
                  <select class="form-control" name="bloodGroup">
                    ${["O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"].map((bg) => `<option value="${bg}">${bg}</option>`).join("")}
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">${t("लॉगिन पासवर्ड बनाएँ *", "Create Login Password *")}</label>
                  <input type="password" class="form-control" name="password" minlength="4" required placeholder="${t("कम से कम 4 अक्षर", "Minimum 4 characters")}" />
                </div>

                <div class="form-group">
                  <label class="form-label">${t("पासपोर्ट साइज फोटो", "Passport Size Photo")}</label>
                  <input type="file" accept="image/*" onchange="window.UPBMSApp.handlePublicPhotoUpload(event)" />
                  <input type="hidden" name="photoUrl" id="publicJoinPhotoUrl" value="" />
                  <span id="publicPhotoStatus" style="font-size:0.78rem;color:#15803d;font-weight:700"></span>
                </div>

                <div class="form-group full">
                  <label class="form-label">${t("सदस्यता श्रेणी एवं शुल्क चुनें *", "Select Membership Category & Fee *")}</label>
                  <select class="form-control" name="planType" id="joinPlanSelect" onchange="window.UPBMSApp.updateJoinFeeDisplay()">
                    <option value="general" data-fee="${s.membershipFeeGeneral}">${t(`सामान्य सक्रिय बैंक मित्र सदस्य — ₹${s.membershipFeeGeneral} / वर्ष`, `Active Bank Mitra Member — ₹${s.membershipFeeGeneral} / Year`)}</option>
                    <option value="district" data-fee="${s.membershipFeeDistrictOfficer}">${t(`जिला / ब्लॉक पदाधिकारी सदस्यता — ₹${s.membershipFeeDistrictOfficer} / वर्ष`, `District / Block Officer Membership — ₹${s.membershipFeeDistrictOfficer} / Year`)}</option>
                    <option value="core" data-fee="${s.membershipFeeCore}">${t(`प्रदेश कार्यकारिणी सदस्यता — ₹${s.membershipFeeCore} / वर्ष`, `State Executive Membership — ₹${s.membershipFeeCore} / Year`)}</option>
                  </select>
                </div>

                <!-- UPI Payment Block -->
                <div class="form-group full" style="background:#fff7ed;border:1.5px solid #fed7aa;padding:15px;border-radius:12px">
                  <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
                    <div>${upiQrSvg}</div>
                    <div style="flex:1;min-width:210px;font-size:0.86rem">
                      <div style="font-weight:900;color:#0a2252;font-size:1.05rem">${t("देय सदस्यता शुल्क:", "Payable Membership Fee:")} <span id="joinFeeAmountLabel">₹${s.membershipFeeGeneral}</span></div>
                      <div><b>UPI ID:</b> <code>${escapeHtml(s.upiId)}</code></div>
                      <div><b>${t("बैंक खाता:", "Bank A/c:")}</b> ${escapeHtml(s.bankAccountNumber)} (${escapeHtml(s.bankIfsc)})</div>
                      <input class="form-control" style="margin-top:8px" name="utrNumber" placeholder="${t("भुगतान का 12-अंकीय यूटीआर नंबर (डेमो में वैकल्पिक)", "12-digit UPI UTR Number (Optional in Demo)")}" />
                      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-weight:800;color:#15803d;cursor:pointer">
                        <input type="checkbox" name="instantDemoVerify" checked />
                        <span>⚡ ${t("डेमो मोड: तुरंत भुगतान सत्यापित कर पहचान पत्र व नियुक्ति पत्र जारी करें", "Demo Mode: Instantly verify payment & generate ID Card & Letter")}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <!-- MANDATORY TERMS & CONDITIONS -->
                <div class="form-group full" style="background:#f8fafc;border:1.5px solid #cbd5e1;padding:14px;border-radius:12px">
                  <div style="font-weight:900;color:var(--primary);margin-bottom:6px">
                    📜 ${escapeHtml(t(tc.titleHi || "सदस्यता नियम एवं शर्तें", tc.titleEn || "Membership Terms & Conditions"))}
                  </div>
                  <div class="terms-scroll-box">${escapeHtml(t(tc.contentHi, tc.contentEn))}</div>
                  <label style="display:flex;align-items:flex-start;gap:10px;margin-top:10px;font-size:0.87rem;font-weight:800;color:#0f172a;cursor:pointer">
                    <input type="checkbox" name="acceptTerms" required style="margin-top:4px;width:18px;height:18px;flex-shrink:0" />
                    <span>${escapeHtml(t(tc.checkboxLabelHi, tc.checkboxLabelEn))} *</span>
                  </label>
                </div>
              </div>

              <button type="submit" class="btn btn-accent btn-lg" style="width:100%;margin-top:16px">
                ✅ ${t("शर्तें स्वीकार कर सदस्यता पंजीकरण पूर्ण करें", "Accept Terms & Complete Membership Registration")}
              </button>
            </form>

            <div style="display:grid;gap:18px">
              <div class="card-panel" style="background:var(--primary-soft);border-color:#bfdbfe">
                <h3 style="font-size:1.05rem;font-weight:900;color:var(--primary);margin-bottom:8px">
                  🪪 ${t("पंजीकरण के साथ मिलने वाले लाभ व सुरक्षा नियम", "Membership Documents & Security Policy")}
                </h3>
                <ul style="padding-left:18px;font-size:0.88rem;color:#334155;display:grid;gap:8px">
                  <li><b>${t("आधिकारिक पहचान पत्र:", "Official Identity Card:")}</b> ${t("सदस्य लॉगिन के उपरांत पदाधिकारी हस्ताक्षर एवं मुहर सहित उपलब्ध।", "Available after Member Login with official seal & signature.")}</li>
                  <li><b>${t("नियुक्ति / सदस्यता प्रमाण-पत्र:", "Appointment / Membership Certificate:")}</b> ${t("सुरक्षित सदस्य लॉगिन के बाद लेटरहेड पर जारी।", "Issued on official letterhead after secure Member Login.")}</li>
                  <li><b>${t("सदस्यता शुल्क रसीद:", "Membership Fee Receipt:")}</b> ${t("सदस्य लॉगिन के उपरांत आधिकारिक डिजिटल रसीद उपलब्ध।", "Official digital receipt available after Member Login.")}</li>
                </ul>
              </div>

              <div class="card-panel">
                <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">📋 ${t("हालिया सदस्यता पंजीकरण सारांश", "Recent Membership Registrations")}</h4>
                <div style="display:grid;gap:8px">
                  ${memPayments
                    .slice(0, 4)
                    .map(
                      (p) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#f8fafc;border-radius:8px;font-size:0.82rem">
                      <div><b>${escapeHtml(t(p.payerName, p.payerNameEn || p.payerName))}</b><br/><span style="color:#64748b">${escapeHtml(p.receiptNo)}</span></div>
                      ${
                        canAccessSignedReceipt(p)
                          ? `<button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openReceiptModal('${p.id}')">₹${p.amount} 🧾</button>`
                          : `<span class="badge badge-verified">₹${escapeHtml(p.amount)} ✓</span>`
                      }
                    </div>`
                    )
                    .join("")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // ==================== PAGE 5: DONATION (ACCESSED FROM TOP HEADER BUTTON) ====================
  function renderDonationPage() {
    const s = state.settings;
    const upiUri = `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.upiPayeeName)}&cu=INR`;
    const upiQrSvg = generateQrSvg(upiUri, 146, "#0a2252");
    const donations = state.payments.filter((p) => p.paymentCategory === "donation");

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">🤝 ${t("संघर्ष एवं कल्याण कोष", "WELFARE & STRUGGLE FUND")}</span>
              <h1 class="section-title">${t("स्वैच्छिक सहयोग राशि एवं डोनेशन पोर्टल", "Voluntary Contribution & Donation Portal")}</h1>
              <p class="section-sub">${t("पीड़ित बैंक मित्रों की विधिक सहायता एवं प्रांतीय संगठनात्मक अभियानों हेतु सहयोग करें तथा तुरंत आधिकारिक सहयोग रसीद प्राप्त करें।", "Contribute towards legal aid for distressed Bank Mitras and statewide union initiatives with instant official receipts.")}</p>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:24px;align-items:start" class="form-grid">
            <form class="card-panel" style="border:2px solid #fed7aa" onsubmit="window.UPBMSApp.submitDonation(event)">
              <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:12px">🤝 ${t("सहयोग राशि विवरण प्रपत्र", "Contribution Form")}</h3>

              <div style="margin-bottom:14px">
                <div class="form-label" style="margin-bottom:6px">${t("त्वरित राशि चुनें:", "Quick Select Amount:")}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  ${[101, 251, 501, 1100, 2100, 5100]
                    .map((amt) => `<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('donationAmountInput').value='${amt}'">₹${amt}</button>`)
                    .join("")}
                </div>
              </div>

              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">${t("सहयोगकर्ता का पूरा नाम *", "Contributor's Full Name *")}</label>
                  <input class="form-control" name="payerName" required />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("मोबाइल नंबर *", "Mobile Number *")}</label>
                  <input class="form-control" name="mobile" required />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("जनपद", "District")}</label>
                  <select class="form-control" name="district">
                    ${state.meta.districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(localizeDual(d, lang))}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">${t("सहयोग राशि (₹) *", "Contribution Amount (₹) *")}</label>
                  <input class="form-control" type="number" id="donationAmountInput" name="amount" min="51" value="501" required />
                </div>
                <div class="form-group full">
                  <label class="form-label">${t("सहयोग का उद्देश्य", "Purpose of Contribution")}</label>
                  <select class="form-control" name="purposeHi">
                    <option value="बैंक मित्र संघर्ष एवं कल्याण कोष सहयोग राशि">${t("बैंक मित्र संघर्ष एवं कल्याण कोष", "Bank Mitra Struggle & Welfare Fund")}</option>
                    <option value="पीड़ित बैंक मित्र विधिक सहायता कोष">${t("पीड़ित बैंक मित्र विधिक सहायता कोष", "Distressed Bank Mitra Legal Aid Fund")}</option>
                    <option value="प्रांतीय महा-अधिवेशन सहयोग राशि">${t("प्रांतीय महा-अधिवेशन सहयोग", "State Convention Support")}</option>
                  </select>
                </div>
                <div class="form-group full">
                  <label class="form-label">${t("यूपीआई यूटीआर / रेफरेंस नंबर", "UPI UTR / Reference Number")}</label>
                  <input class="form-control" name="utrNumber" placeholder="${t("डेमो में वैकल्पिक", "Optional in Demo")}" />
                </div>
              </div>

              <button type="submit" class="btn btn-whatsapp btn-lg" style="width:100%;margin-top:16px">
                🙏 ${t("सहयोग राशि जमा करें एवं आधिकारिक रसीद प्राप्त करें", "Submit Contribution & Download Official Receipt")}
              </button>
            </form>

            <div style="display:grid;gap:18px">
              <div class="card-panel" style="text-align:center">
                <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">📲 ${t("स्कैन कर आधिकारिक खाते में सहयोग करें", "Scan QR to Contribute")}</h4>
                <div style="display:flex;justify-content:center;margin-bottom:10px">${upiQrSvg}</div>
                <div style="font-weight:900;color:var(--accent)">UPI ID: ${escapeHtml(s.upiId)}</div>
                <div style="font-size:0.84rem;color:#475569;margin-top:4px">
                  <b>${t("खाता नाम:", "Account Name:")}</b> ${escapeHtml(s.bankAccountName)}<br/>
                  <b>A/c No.:</b> ${escapeHtml(s.bankAccountNumber)} | <b>IFSC:</b> ${escapeHtml(s.bankIfsc)}
                </div>
              </div>

              <div class="card-panel">
                <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">🌟 ${t("सम्मानित सहयोगकर्ता सूची", "Honored Contributors")}</h4>
                <div style="display:grid;gap:8px">
                  ${donations
                    .map(
                      (d) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:0.84rem">
                      <div><b>${escapeHtml(t(d.payerName, d.payerNameEn || d.payerName))}</b> (${escapeHtml(localizeDual(d.district, lang))})</div>
                      ${
                        canAccessSignedReceipt(d)
                          ? `<button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openReceiptModal('${d.id}')">₹${d.amount} 🧾</button>`
                          : `<span class="badge badge-verified">₹${escapeHtml(d.amount)}</span>`
                      }
                    </div>`
                    )
                    .join("")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // ==================== PAGE 6: CIRCULARS & PDFS (EXACT UPLOADED FILE + TITLE, ZERO UNION SIGN!) ====================
  function renderCircularCard(c) {
    const locked = Boolean((c.requiresMemberLogin || c.isLockedForVisitor) && !canAccessSignedAssets());
    const isPdf = c.fileType === "pdf" || String(c.fileUrl).toLowerCase().endsWith(".pdf");
    const titleTxt = t(c.titleHi, c.titleEn);
    const issuerTxt = t(c.issuerHi, c.issuerEn);

    return `
      <article class="card-panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="badge badge-in_progress">${locked ? `🔒 ${t("सदस्य लॉगिन संरक्षित", "Members Only")}` : isPdf ? "PDF" : t("परिपत्र / इमेज", "Circular")}</span>
            <span style="font-size:0.78rem;color:#64748b;font-weight:700">📅 ${escapeHtml(c.date || "")}</span>
          </div>

          <div class="circular-exact-thumb" style="cursor:pointer" onclick="window.UPBMSApp.openRawFileModal('circular', '${c.id}')">
            ${
              locked
                ? `<div style="text-align:center;padding:24px"><div style="font-size:2.3rem">🔒</div><div style="font-weight:900;color:var(--primary);margin-top:6px">${t("हस्ताक्षर/मुहर युक्त परिपत्र — सदस्य लॉगिन आवश्यक", "Signed/Stamped Circular — Member Login Required")}</div></div>`
                : isPdf
                ? `<div style="text-align:center;padding:24px"><div style="font-size:2.4rem">📕</div><div style="font-weight:900;color:var(--primary);margin-top:6px">${t("पीडीएफ दस्तावेज़ खोलें", "Click to Open PDF")}</div></div>`
                : `<img src="${escapeHtml(c.fileUrl)}" alt="${escapeHtml(titleTxt)}" />`
            }
          </div>

          ${issuerTxt ? `<div style="font-size:0.78rem;font-weight:800;color:var(--accent);margin-bottom:4px">${escapeHtml(issuerTxt)}</div>` : ""}
          <h3 style="font-size:1.04rem;font-weight:900;color:var(--primary)">${escapeHtml(titleTxt)}</h3>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.openRawFileModal('circular', '${c.id}')">
            ${locked ? `🔑 ${t("सदस्य लॉगिन से देखें", "Login to View")}` : `👁️ ${t("दस्तावेज़ देखें", "View Document")}`}
          </button>
          ${
            !locked && c.fileUrl
              ? `<a href="${escapeHtml(c.fileUrl)}" download class="btn btn-outline btn-sm">
                   ⬇️ ${t("डाउनलोड करें", "Download")}
                 </a>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderCircularsPage() {
    const circulars = (state.circulars || []).filter((c) => {
      if (!circularSearch) return true;
      const q = circularSearch.toLowerCase();
      return `${c.titleHi} ${c.titleEn} ${c.issuerHi} ${c.issuerEn}`.toLowerCase().includes(q);
    });

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">📑 ${t("बैंक परिपत्र एवं पीडीएफ संग्रह", "BANK CIRCULARS & PDF ARCHIVE")}</span>
              <h1 class="section-title">${t("बैंक मित्र सर्कुलर, आदेश एवं पीडीएफ दिशानिर्देश", "Bank Mitra Circulars, Orders & PDF Guidelines")}</h1>
              <p class="section-sub">${t("यहाँ अपलोड किए गए सभी बैंक आदेश, इमेज व पीडीएफ अपने मूल स्वरूप में शीर्षक सहित उपलब्ध हैं।", "All uploaded banking circulars, notices, and PDF documents displayed in their exact original format.")}</p>
            </div>
          </div>

          <div class="filter-bar">
            <input class="form-control" style="flex:1" placeholder="${t("सर्कुलर शीर्षक या जारीकर्ता बैंक खोजें...", "Search circular title or issuing bank...")}" value="${escapeHtml(circularSearch)}" oninput="window.UPBMSApp.setCircularSearch(this.value)" />
          </div>

          ${
            circulars.length === 0
              ? `<div class="card-panel" style="text-align:center;color:#64748b">${t("कोई सर्कुलर उपलब्ध नहीं है।", "No circulars found.")}</div>`
              : `<div class="circulars-grid">${circulars.map(renderCircularCard).join("")}</div>`
          }
        </div>
      </section>
    `;
  }

  function setCircularSearch(val) {
    circularSearch = val;
    rerender();
  }

  // ==================== PAGE 7: ASSOCIATION DOCUMENTS ('संघ दस्तावेज़') ====================
  function renderDocumentsPage() {
    const signedOk = canAccessSignedAssets();

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">📂 ${t("आधिकारिक संघ अभिलेख", "OFFICIAL ASSOCIATION RECORDS")}</span>
              <h1 class="section-title">${t("संघ दस्तावेज़ — मांग ज्ञापन, संविधान एवं आवेदन प्रारूप", "Association Documents — Memorandums, Constitution & Formats")}</h1>
              <p class="section-sub">${t("सामान्य विज़िटर के लिए साधारण सूचना पाठ उपलब्ध है; पदाधिकारियों के हस्ताक्षर एवं आधिकारिक मुहर युक्त प्रपत्र केवल सदस्य लॉगिन के उपरांत प्राप्त होते हैं।", "Plain informational reading is available publicly; official copies bearing Office-Bearers' Signatures and Official Seal require Member Login.")}</p>
            </div>
          </div>

          ${
            !signedOk
              ? `<div class="card-panel" style="margin-bottom:20px;background:#fff7ed;border:1.5px solid #fdba74;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                   <div style="font-size:0.88rem;color:#9a3412;font-weight:800">
                     🔒 ${t("सुरक्षा सूचना: बिना सदस्य लॉगिन के केवल बिना हस्ताक्षर/मुहर वाली साधारण पठन जानकारी दिखेगी। हस्ताक्षर व मुहर युक्त प्रपत्र हेतु लॉगिन करें।", "Security Notice: Visitors without Member Login can only read unsigned plain text. Please sign in to access signed & stamped documents.")}
                   </div>
                   <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.openMemberLoginModal()">
                     🔑 ${t("सदस्य लॉगिन करें", "Member Login")}
                   </button>
                 </div>`
              : `<div class="card-panel" style="margin-bottom:20px;background:#f0fdf4;border:1.5px solid #86efac;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                   <div style="font-size:0.87rem;color:#15803d;font-weight:800">
                     ✓ ${t("सत्यापित सदस्य सत्र सक्रिय: आप आधिकारिक संघ दस्तावेज़ देख व प्रिंट कर सकते हैं।", "Verified Member Session Active: You may view & print official Association Documents.")}
                   </div>
                 </div>`
          }

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,350px),1fr));gap:20px">
            ${state.documents
              .map((d) => {
                const catName = t(d.categoryHi || d.category || "संघ दस्तावेज़", d.categoryEn || "Association Document");
                const titleTxt = t(d.titleHi, d.titleEn);
                const sumTxt = t(d.summaryHi, d.summaryEn);
                return `
                  <div class="card-panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px">
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <span class="badge badge-in_progress">${escapeHtml(catName)}</span>
                        <span style="font-size:0.76rem;color:#64748b">${escapeHtml(d.date || "")}</span>
                      </div>
                      <h3 style="font-size:1.06rem;font-weight:900;color:var(--primary);margin-bottom:6px">${escapeHtml(titleTxt)}</h3>
                      <p style="font-size:0.88rem;color:var(--text-muted)">${escapeHtml(sumTxt)}</p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openUnsignedAssocDocModal('${d.id}')">
                        📖 ${t("साधारण पाठ पढ़ें", "Read Plain Info")}
                      </button>
                      <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.openAssocDocModal('${d.id}')">
                        ${signedOk ? `✍️ ${t("हस्ताक्षर/मुहर युक्त प्रपत्र", "Signed & Stamped Copy")}` : `🔒 ${t("हस्ताक्षर युक्त प्रपत्र (लॉगिन)", "Signed Copy (Login)")}`}
                      </button>
                    </div>
                  </div>`;
              })
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  // ==================== PAGE 8: ID CARD, APPOINTMENT LETTER & RECEIPT ====================
  function renderIdAndDocsVerifyPage() {
    // If logged in as an active member and nothing was searched yet, show their own record by default
    let m = verifiedResult?.member;
    let receipts = verifiedResult?.receipts || [];
    if (!m && loggedInMember) {
      m = loggedInMember;
      receipts = state.payments.filter(
        (p) => p.memberId === m.id || p.memberCode === m.memberCode || p.mobile === m.mobile
      );
    }

    const canSeePersonalSigned = m ? canAccessPersonalMemberDocs(m.id) : false;
    const defaultIds = state.settings.defaultSignatoryIds || [state.settings.defaultSignatoryId || "sig-gs"];
    const curSingleId = m?.signatoryId || defaultIds[0];
    const curMultiIds = (Array.isArray(m?.letterSignatoryIds) && m.letterSignatoryIds.length)
      ? m.letterSignatoryIds
      : (m?.signatoryId ? [m.signatoryId] : defaultIds);
    const auditActor = null;
    const photo = m ? (m.photoUrl || initialsAvatarSvg(m.nameEn || m.nameHi)) : "";

    let printType = "print_idcard";
    let printLblHi = "हस्ताक्षर एवं मुहर युक्त पहचान पत्र प्रिंट/डाउनलोड किया";
    let printLblEn = "Printed/Downloaded Signed & Stamped Identity Card";
    let printTgtHi = m ? `आधिकारिक पहचान पत्र (${m.memberCode})` : "";
    let printTgtEn = m ? `Official Identity Card (${m.memberCode})` : "";
    let printSigs = curSingleId;

    if (activeDocTab === "letter") {
      printType = "print_letter";
      printLblHi = "हस्ताक्षर एवं मुहर युक्त नियुक्ति पत्र प्रिंट/डाउनलोड किया";
      printLblEn = "Printed/Downloaded Signed & Stamped Appointment Letter";
      printTgtHi = m ? `नियुक्ति / सदस्यता प्रमाण-पत्र (${m.memberCode})` : "";
      printTgtEn = m ? `Appointment / Membership Certificate (${m.memberCode})` : "";
      printSigs = curMultiIds.join(",");
    } else if (activeDocTab === "receipt" && receipts[0]) {
      printType = "print_receipt";
      printLblHi = "हस्ताक्षर एवं मुहर युक्त शुल्क रसीद प्रिंट/डाउनलोड की";
      printLblEn = "Printed/Downloaded Signed & Stamped Fee Receipt";
      printTgtHi = `आधिकारिक रसीद (${receipts[0].receiptNo})`;
      printTgtEn = `Official Receipt (${receipts[0].receiptNo})`;
      printSigs = curMultiIds.join(",");
    }

    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">🪪 ${t("ऑनलाइन सदस्य सत्यापन एवं सुरक्षित प्रपत्र पोर्टल", "MEMBER VERIFICATION & SECURE DOCUMENTS")}</span>
              <h1 class="section-title">${t("सदस्य सत्यापन, पहचान पत्र, नियुक्ति पत्र एवं शुल्क रसीद", "Member Verification, ID Card, Appointment Letter & Receipt")}</h1>
              <p class="section-sub">${t("सार्वजनिक सत्यापन में केवल बिना हस्ताक्षर/मुहर का बुनियादी सदस्य विवरण दिखता है। हस्ताक्षर एवं मुहर युक्त कार्ड, नियुक्ति पत्र व रसीद केवल सदस्य लॉगिन के बाद खुलते हैं।", "Public lookup displays basic unsigned verification info only. Signed & stamped ID Cards, Appointment Letters, and Receipts require Member Login.")}</p>
            </div>
          </div>

          <div class="card-panel no-print" style="margin-bottom:20px">
            <form onsubmit="window.UPBMSApp.handleVerifySubmit(event)" style="display:flex;gap:10px;flex-wrap:wrap">
              <input class="form-control" id="verifyQueryInput" style="flex:1;min-width:230px" placeholder="${t("सदस्यता स्थिति जाँचने हेतु सदस्य आईडी या मोबाइल नंबर दर्ज करें...", "Enter Member ID or Mobile Number to verify membership status...")}" value="${escapeHtml(m?.memberCode || "")}" required />
              <button type="submit" class="btn btn-primary">🔍 ${t("सदस्यता स्थिति जांचें", "Check Membership Status")}</button>
              ${
                loggedInMember && m && m.id !== loggedInMember.id
                  ? `<button type="button" class="btn btn-accent" onclick="window.UPBMSApp.openMemberDocsModal('${loggedInMember.id}')">
                       🪪 ${t("मेरे स्वयं के हस्ताक्षर युक्त दस्तावेज़ खोलें", "Open My Own Signed Documents")}
                     </button>`
                  : ""
              }
            </form>
          </div>

          ${
            !m
              ? `<div class="card-panel" style="text-align:center;padding:30px">
                   <div style="font-size:2.2rem;margin-bottom:8px">🔒</div>
                   <h3 style="font-size:1.12rem;font-weight:900;color:var(--primary);margin-bottom:8px">
                     ${t("हस्ताक्षर एवं मुहर युक्त पहचान पत्र, नियुक्ति पत्र व रसीद डाउनलोड करने हेतु सदस्य लॉगिन करें", "Sign In as a Member to Access Your Signed & Stamped ID Card, Appointment Letter & Receipt")}
                   </h3>
                   <p style="font-size:0.88rem;color:#475569;max-width:620px;margin:0 auto 16px">
                     ${t("संघ के पदाधिकारियों के हस्ताक्षर व आधिकारिक मुहर युक्त सभी प्रपत्र केवल पंजीकृत सदस्यों को लॉगिन के उपरांत उपलब्ध कराए जाते हैं।", "Official documents bearing office-bearers' signatures and the union seal are accessible exclusively after Member Login.")}
                   </p>
                   <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
                     <button class="btn btn-accent" onclick="window.UPBMSApp.openMemberLoginModal()">
                       🔑 ${t("सदस्य लॉगिन करें", "Member Login")}
                     </button>
                     <button class="btn btn-outline" onclick="window.UPBMSApp.navigate('join')">
                       ✍️ ${t("नवीन सदस्यता पंजीकरण करें", "New Membership Registration")}
                     </button>
                   </div>
                 </div>`
              : !canSeePersonalSigned
              ? `
                <!-- UNSIGNED PUBLIC VERIFICATION SUMMARY ONLY (ZERO SIGNATURE, ZERO SEAL!) -->
                <div class="card-panel" style="margin-bottom:20px;border:2px solid ${m.status === "active" ? "#86efac" : "#fde68a"};background:#ffffff">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;margin-bottom:14px">
                    <div style="font-weight:900;font-size:1.02rem;color:${m.status === "active" ? "#15803d" : "#b45309"}">
                      ${m.status === "active" ? t("✅ सार्वजनिक सत्यापन परिणाम: वैध एवं सक्रिय सदस्य", "✅ Public Verification Result: Active & Valid Member") : t("⏳ सार्वजनिक सत्यापन परिणाम: अनुमोदन लंबित", "⏳ Public Verification Result: Approval Pending")}
                    </div>
                    <span class="badge badge-in_progress">${t("बिना हस्ताक्षर/मुहर सार्वजनिक सूचना", "Unsigned Public Info Only")}</span>
                  </div>

                  <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
                    <img src="${escapeHtml(photo)}" alt="" style="width:78px;height:78px;border-radius:12px;object-fit:cover;border:2px solid #cbd5e1" />
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 20px;flex:1;font-size:0.9rem">
                      <div><b>${t("सदस्य का नाम:", "Member Name:")}</b> ${escapeHtml(t(m.nameHi, m.nameEn))}</div>
                      <div><b>${t("सदस्य संख्या:", "Member ID:")}</b> ${escapeHtml(m.memberCode)}</div>
                      <div><b>${t("पदनाम:", "Designation:")}</b> ${escapeHtml(t(m.designationHi, m.designationEn))}</div>
                      <div><b>${t("जनपद:", "District:")}</b> ${escapeHtml(localizeDual(m.district, lang))}</div>
                      <div><b>${t("संबद्ध बैंक:", "Sponsor Bank:")}</b> ${escapeHtml(localizeDual(m.bankName, lang))}</div>
                      <div><b>${t("सदस्यता वैधता:", "Valid Until:")}</b> ${escapeHtml(m.validUntil || "—")}</div>
                    </div>
                  </div>
                </div>

                <div class="card-panel" style="background:#fff7ed;border:1.5px solid #fdba74;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
                  <div style="max-width:680px">
                    <div style="font-weight:900;color:#9a3412;font-size:0.98rem;margin-bottom:4px">
                      🔒 ${t("हस्ताक्षर एवं आधिकारिक मुहर युक्त प्रपत्र लॉक हैं", "Signed & Stamped Official Documents Are Locked")}
                    </div>
                    <div style="font-size:0.86rem;color:#7c2d12">
                      ${
                        loggedInMember && loggedInMember.id === m.id && m.status !== "active"
                          ? t("आपकी सदस्यता अभी एडमिन सत्यापन हेतु लंबित है। अनुमोदन पूर्ण होते ही आपके हस्ताक्षर युक्त प्रपत्र खुल जाएंगे।", "Your membership is pending Admin verification. Signed documents will unlock once approved.")
                          : loggedInMember && loggedInMember.id !== m.id
                          ? t("सुरक्षा नियम के अनुसार कोई भी सदस्य केवल स्वयं का पहचान पत्र व नियुक्ति पत्र ही डाउनलोड कर सकता है।", "For security reasons, a logged-in member can only download their own personal ID Card and Appointment Letter.")
                          : t("यदि यह आपका सदस्य खाता है, तो पदाधिकारी हस्ताक्षर व आधिकारिक मुहर युक्त पहचान पत्र, नियुक्ति पत्र एवं शुल्क रसीद प्राप्त करने हेतु सदस्य लॉगिन करें।", "If this is your account, please sign in with your Member ID/Mobile and Password to access your signed ID Card, Appointment Letter, and Receipt.")
                      }
                    </div>
                  </div>
                  ${
                    !loggedInMember
                      ? `<button class="btn btn-primary" onclick="window.UPBMSApp.openMemberLoginModal('${escapeHtml(m.memberCode)}')">
                           🔑 ${t("इस सदस्य खाते में लॉगिन करें", "Sign In to This Member Account")}
                         </button>`
                      : loggedInMember.id !== m.id
                      ? `<button class="btn btn-primary" onclick="window.UPBMSApp.openMemberDocsModal('${loggedInMember.id}')">
                           🪪 ${t("मेरे स्वयं के दस्तावेज़ खोलें", "Open My Own Documents")}
                         </button>`
                      : ""
                  }
                </div>
              `
              : `
                <!-- AUTHENTICATED MEMBER / ADMIN VIEW (CLEAN DOCUMENT VIEW — ZERO SIGNATORY PICKER FOR MEMBERS!) -->
                <div class="card-panel no-print" style="margin-bottom:20px;background:#dcfce7;border:1.5px solid #86efac;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                  <div>
                    <div style="font-weight:900;color:#15803d">
                      🛡️ ${t("✅ सुरक्षित लॉगिन सत्यापित: हस्ताक्षर एवं मुहर युक्त आधिकारिक प्रपत्र", "✅ Secure Login Verified: Signed & Stamped Official Documents")}
                    </div>
                    <div style="font-size:0.86rem"><b>${escapeHtml(t(m.nameHi, m.nameEn))}</b> — ${escapeHtml(t(m.designationHi, m.designationEn))} (${escapeHtml(localizeDual(m.district, lang))})</div>
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn ${activeDocTab === "idcard" ? "btn-primary" : "btn-outline"} btn-sm" onclick="window.UPBMSApp.switchDocPreviewTab('idcard')">🪪 ${t("पहचान पत्र", "Identity Card")}</button>
                    <button class="btn ${activeDocTab === "letter" ? "btn-primary" : "btn-outline"} btn-sm" onclick="window.UPBMSApp.switchDocPreviewTab('letter')">📄 ${t("नियुक्ति पत्र", "Appointment Letter")}</button>
                    <button class="btn ${activeDocTab === "receipt" ? "btn-primary" : "btn-outline"} btn-sm" onclick="window.UPBMSApp.switchDocPreviewTab('receipt')">🧾 ${t("शुल्क रसीद", "Fee Receipt")} (${receipts.length})</button>
                    <button class="btn btn-accent btn-sm" onclick="window.UPBMSApp.printWithAudit('${escapeHtml(printType)}', '${escapeHtml(printLblHi)}', '${escapeHtml(printLblEn)}', '${escapeHtml(printTgtHi)}', '${escapeHtml(printTgtEn)}', '${escapeHtml(printSigs)}')">🖨️ ${t("प्रिंट / पीडीएफ सेव करें", "Print / Save PDF")}</button>
                  </div>
                </div>

                <div>
                  ${
                    activeDocTab === "idcard"
                      ? renderIdCardHtml(m, state.settings, curSingleId, lang, auditActor)
                      : activeDocTab === "letter"
                      ? renderAppointmentLetterHtml(m, state.settings, curMultiIds, lang, auditActor)
                      : receipts.length
                      ? renderReceiptHtml(receipts[0], state.settings, curMultiIds, lang, auditActor)
                      : `<div class="card-panel" style="text-align:center">${t("इस सदस्य से जुड़ी कोई रसीद उपलब्ध नहीं है।", "No receipt found for this member.")}</div>`
                  }
                </div>
              `
          }
        </div>
      </section>
    `;
  }

  function setSingleSignatory(sigId) {
    pageSingleSigId = sigId;
    toast(t("✍️ पहचान पत्र पर हस्ताक्षरकर्ता पदाधिकारी अपडेट हो गए!", "✍️ Identity Card signing officer updated!"));
    rerender();
  }

  function toggleMultiSignatory(sigId, checked, contextKind) {
    const defaultIds = state.settings.defaultSignatoryIds || [state.settings.defaultSignatoryId || "sig-gs"];
    if (contextKind === "page") {
      let arr = [...(pageMultiSigIds || defaultIds)];
      if (checked && !arr.includes(sigId)) arr.push(sigId);
      if (!checked) arr = arr.filter((x) => x !== sigId);
      if (!arr.length) arr = [sigId]; // Keep at least 1 officer
      pageMultiSigIds = arr;
      rerender();
    } else {
      let arr = [...(modalMultiSigIds || defaultIds)];
      if (checked && !arr.includes(sigId)) arr.push(sigId);
      if (!checked) arr = arr.filter((x) => x !== sigId);
      if (!arr.length) arr = [sigId];
      modalMultiSigIds = arr;
      renderCurrentModal();
    }
  }

  // ==================== PAGE 9: IMPORTANT PORTALS ====================
  function renderPortalsPage() {
    const portals = state.externalLinks.filter((l) => l.active !== false);
    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">🌐 ${t("समस्त संबद्ध वेबसाइट्स", "ALL LINKED PORTALS")}</span>
              <h1 class="section-title">${t("बैंक मित्रों के लिए महत्वपूर्ण बैंकिंग एवं सरकारी पोर्टल", "Important Banking & Government Portals for Bank Mitras")}</h1>
            </div>
          </div>
          <div class="external-portals-grid">
            ${portals.map(renderPortalCard).join("")}
          </div>
        </div>
      </section>
    `;
  }

  // ==================== PAGE 10: GRIEVANCE REDRESSAL ====================
  function renderGrievancePage() {
    const displayList = trackedGrievances ?? state.grievances;
    return `
      <section class="section-block">
        <div class="container">
          <div class="section-head">
            <div>
              <span class="section-eyebrow">⚖️ ${t("बैंक मित्र विधिक सहायता प्रकोष्ठ", "BANK MITRA GRIEVANCE & LEGAL CELL")}</span>
              <h1 class="section-title">${t("समस्या एवं शिकायत निवारण पोर्टल", "Grievance Redressal Portal")}</h1>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:24px;align-items:start" class="form-grid">
            <form class="card-panel" onsubmit="window.UPBMSApp.submitGrievanceForm(event)">
              <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:14px">⚖️ ${t("नई समस्या / शिकायत दर्ज करें", "Register a New Grievance")}</h3>
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">${t("बैंक मित्र का नाम *", "Bank Mitra Name *")}</label>
                  <input class="form-control" name="applicantName" required />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("मोबाइल नंबर *", "Mobile Number *")}</label>
                  <input class="form-control" name="mobile" required />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("जनपद *", "District *")}</label>
                  <select class="form-control" name="district">
                    ${state.meta.districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(localizeDual(d, lang))}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">${t("संबंधित बैंक *", "Sponsor Bank *")}</label>
                  <select class="form-control" name="bankName">
                    ${state.meta.banks.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">${t("केओ / सीएसपी कोड", "KO / CSP Code")}</label>
                  <input class="form-control" name="koCode" />
                </div>
                <div class="form-group">
                  <label class="form-label">${t("समस्या का प्रकार *", "Issue Category *")}</label>
                  <select class="form-control" name="issueType">
                    <option value="बिना नोटिस केओ कोड ब्लॉक">${t("बिना नोटिस केओ / सीएसपी आईडी ब्लॉक", "Unfair KO / CSP ID Block Without Notice")}</option>
                    <option value="कमीशन कटौती / भुगतान लंबित">${t("कमीशन कटौती या भुगतान लंबित", "Commission Delayed or Deducted")}</option>
                    <option value="सेटलमेंट खाता लीन / फ्रीज">${t("सेटलमेंट खाता लीन / फ्रीज", "Settlement Account Lien / Freeze")}</option>
                    <option value="शाखा / बीसी कंपनी उत्पीड़न">${t("शाखा या बीसी कंपनी द्वारा अनुचित दबाव", "Harassment by Branch / Corporate BC")}</option>
                    <option value="कैश ट्रांज़िट / बीमा सहायता">${t("कैश ट्रांज़िट घटना / बीमा सहायता", "Cash-in-Transit / Insurance Legal Support")}</option>
                  </select>
                </div>
                <div class="form-group full">
                  <label class="form-label">${t("संक्षिप्त विषय *", "Subject *")}</label>
                  <input class="form-control" name="subject" required />
                </div>
                <div class="form-group full">
                  <label class="form-label">${t("संपूर्ण विवरण *", "Detailed Description *")}</label>
                  <textarea class="form-control" name="description" required></textarea>
                </div>
              </div>
              <button type="submit" class="btn btn-accent btn-lg" style="width:100%;margin-top:14px">
                🚨 ${t("शिकायत पंजीकृत करें एवं टिकट संख्या प्राप्त करें", "Submit Grievance & Get Ticket ID")}
              </button>
            </form>

            <div style="display:grid;gap:16px">
              <div class="card-panel">
                <h3 style="font-size:1.05rem;font-weight:900;color:var(--primary);margin-bottom:10px">🔍 ${t("शिकायत की स्थिति जाँचें", "Track Grievance Status")}</h3>
                <form onsubmit="window.UPBMSApp.searchGrievanceStatus(event)" style="display:flex;gap:8px">
                  <input class="form-control" id="grvTrackInput" style="flex:1" placeholder="${t("टिकट संख्या (GRV-2026-101) या मोबाइल...", "Ticket ID (GRV-2026-101) or Mobile...")}" />
                  <button type="submit" class="btn btn-primary btn-sm">${t("खोजें", "Track")}</button>
                  ${trackedGrievances ? `<button type="button" class="btn btn-outline btn-sm" onclick="window.UPBMSApp.resetGrievanceTrack()">${t("सभी", "All")}</button>` : ""}
                </form>
              </div>

              ${displayList
                .map(
                  (g) => `
                <div class="card-panel" style="padding:18px;border-left:5px solid ${g.status === "resolved" ? "#15803d" : g.status === "in_progress" ? "#f59e0b" : "#dc2626"}">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <b style="color:var(--primary)">🎫 ${escapeHtml(g.ticketNo)}</b>
                    <span class="badge badge-${g.status}">
                      ${g.status === "resolved" ? t("✅ समाधान पूर्ण", "✅ Resolved") : g.status === "in_progress" ? t("⚡ कार्यवाही जारी", "⚡ In Progress") : t("⏳ पंजीकृत", "⏳ Registered")}
                    </span>
                  </div>
                  <div style="font-weight:800;margin-bottom:4px">${escapeHtml(t(g.subject, g.subjectEn || g.subject))}</div>
                  <div style="font-size:0.78rem;color:#64748b;margin-bottom:8px">📍 ${escapeHtml(localizeDual(g.district, lang))} • 🏦 ${escapeHtml(g.bankName)}</div>
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:8px;font-size:0.84rem">
                    <b style="color:var(--primary)">📋 ${t("प्रांतीय प्रकोष्ठ टिप्पणी:", "Action Remark:")}</b><br/>
                    ${escapeHtml(t(g.adminRemark, g.adminRemarkEn || g.adminRemark))}
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // ==================== FORM ACTIONS & MODALS ====================
  function updateJoinFeeDisplay() {
    const sel = document.getElementById("joinPlanSelect");
    const fee = sel?.selectedOptions?.[0]?.getAttribute("data-fee") || state.settings.membershipFeeGeneral;
    const lbl = document.getElementById("joinFeeAmountLabel");
    if (lbl) lbl.textContent = "₹" + fee;
  }

  async function handlePublicPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const st = document.getElementById("publicPhotoStatus");
    if (st) st.textContent = t("⏳ फोटो अपलोड हो रही है...", "⏳ Uploading photo...");
    try {
      const url = await uploadFileInput(file, 700);
      document.getElementById("publicJoinPhotoUrl").value = url;
      if (st) st.textContent = t("✓ फोटो तैयार है!", "✓ Photo uploaded!");
    } catch (err) {
      if (st) st.textContent = "❌ " + err.message;
    }
  }

  async function submitPublicMembership(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = Object.fromEntries(fd.entries());
    const s = state.settings;
    let fee = s.membershipFeeGeneral;
    let memberCategory = "General Member (सक्रिय सदस्य)";
    let designationHi = "सक्रिय बैंक मित्र सदस्य";
    let designationEn = "Active Bank Mitra Member";

    const distCleanHi = localizeDual(raw.district, "hi");
    const distCleanEn = localizeDual(raw.district, "en");

    if (raw.planType === "district") {
      fee = s.membershipFeeDistrictOfficer;
      memberCategory = "District Officer (जिला पदाधिकारी)";
      designationHi = `जिला कार्यकारिणी सदस्य — ${distCleanHi}`;
      designationEn = `District Executive Member — ${distCleanEn}`;
    } else if (raw.planType === "core") {
      fee = s.membershipFeeCore;
      memberCategory = "Core Supporter";
      designationHi = "प्रदेश विशेष आमंत्रित पदाधिकारी";
      designationEn = "State Special Invitee Member";
    }

    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...raw,
        feePaid: fee,
        memberCategory,
        designationHi,
        designationEn,
        signatoryId: s.defaultSignatoryId || "sig-gs",
        instantDemoVerify: e.target.querySelector('[name="instantDemoVerify"]').checked
      })
    });
    const json = await res.json();
    if (json.ok) {
      e.target.reset();
      await refreshData();
      // Do NOT bypass Member Login! Show Unsigned Registration Acknowledgement + Login Prompt
      activeModalContext = { kind: "regAck", data: json.member };
      renderCurrentModal();
      toast(t(`🎉 पंजीकरण पूर्ण! आपकी सदस्य संख्या ${json.member.memberCode} जारी हो गई है।`, `🎉 Registration complete! Your Member ID ${json.member.memberCode} is ready.`));
    }
  }

  async function submitDonation(e) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target).entries());
    if (loggedInMember) {
      raw.memberId = loggedInMember.id;
      raw.memberCode = loggedInMember.memberCode;
    }
    raw.paymentCategory = "donation";
    raw.purpose = raw.purposeHi;
    raw.purposeEn = "Bank Mitra Welfare & Struggle Fund Contribution";
    raw.instantDemoVerify = true;
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raw)
    });
    const json = await res.json();
    if (json.ok) {
      e.target.reset();
      await refreshData();
      if (canAccessSignedAssets()) {
        toast(t("🙏 सहयोग के लिए धन्यवाद! हस्ताक्षर युक्त आधिकारिक रसीद तैयार है।", "🙏 Thank you! Signed official receipt is ready."));
        openReceiptModal(json.payment.id);
      } else {
        toast(t("🙏 सहयोग के लिए धन्यवाद! भुगतान पावती विवरण तैयार है।", "🙏 Thank you! Payment acknowledgement summary is ready."));
        activeModalContext = { kind: "unsignedReceipt", id: json.payment.id };
        renderCurrentModal();
      }
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault();
    const q = document.getElementById("verifyQueryInput").value.trim();
    await lookupMemberByQuery(q, false);
  }

  async function lookupMemberByQuery(q, silent = false) {
    const res = await fetch(`/api/verify/${encodeURIComponent(q)}`);
    const json = await res.json();
    if (json.ok) {
      verifiedResult = json;
      pageSingleSigId = null;
      pageMultiSigIds = null;
      if (!silent) {
        toast(t(`✓ सदस्य रिकॉर्ड मिला: ${json.member.nameHi}`, `✓ Member record found: ${json.member.nameEn}`));
        rerender();
      }
    } else if (!silent) {
      verifiedResult = null;
      toast("❌ " + (json.error || t("रिकॉर्ड नहीं मिला", "Record not found")));
      rerender();
    }
  }

  async function switchDocPreviewTab(tab) {
    activeDocTab = tab;
    const m = verifiedResult?.member || loggedInMember;
    const receipts = verifiedResult?.receipts || [];
    if (m && canAccessPersonalMemberDocs(m.id)) {
      const defaultIds = state.settings.defaultSignatoryIds || [state.settings.defaultSignatoryId || "sig-gs"];
      if (tab === "idcard") {
        await recordSignedUsage({
          actionType: "view_idcard",
          actionLabelHi: "हस्ताक्षर एवं मुहर युक्त पहचान पत्र खोला",
          actionLabelEn: "Opened Signed & Stamped Identity Card",
          targetTitleHi: `आधिकारिक पहचान पत्र (${m.memberCode})`,
          targetTitleEn: `Official Identity Card (${m.memberCode})`,
          signatoryIds: [pageSingleSigId || m.signatoryId || defaultIds[0]],
          memberId: m.id
        });
      } else if (tab === "letter") {
        await recordSignedUsage({
          actionType: "view_letter",
          actionLabelHi: "हस्ताक्षर एवं मुहर युक्त नियुक्ति पत्र खोला",
          actionLabelEn: "Opened Signed & Stamped Appointment Letter",
          targetTitleHi: `नियुक्ति / सदस्यता प्रमाण-पत्र (${m.memberCode})`,
          targetTitleEn: `Appointment / Membership Certificate (${m.memberCode})`,
          signatoryIds: pageMultiSigIds || defaultIds,
          memberId: m.id
        });
      } else if (tab === "receipt" && receipts[0]) {
        await recordSignedUsage({
          actionType: "view_receipt",
          actionLabelHi: "हस्ताक्षर एवं मुहर युक्त शुल्क रसीद खोली",
          actionLabelEn: "Opened Signed & Stamped Fee Receipt",
          targetTitleHi: `आधिकारिक रसीद (${receipts[0].receiptNo})`,
          targetTitleEn: `Official Receipt (${receipts[0].receiptNo})`,
          signatoryIds: pageMultiSigIds || defaultIds,
          memberId: m.id
        });
      }
    }
    rerender();
  }

  async function openMemberDocsModal(memberId) {
    const m = state.members.find((x) => x.id === memberId);
    if (!m) return;
    if (!canAccessPersonalMemberDocs(m.id)) {
      requireMemberLogin(
        () => openMemberDocsModal(memberId),
        "हस्ताक्षर एवं आधिकारिक मुहर युक्त पहचान पत्र व नियुक्ति पत्र देखने हेतु सदस्य लॉगिन अनिवार्य है।",
        "Member Login is mandatory to access your signed & stamped ID Card and Appointment Letter."
      );
      return;
    }
    const receipts = state.payments.filter((p) => p.memberId === m.id || p.memberCode === m.memberCode || p.mobile === m.mobile);
    verifiedResult = { member: m, receipts };
    pageSingleSigId = null;
    pageMultiSigIds = null;
    activeDocTab = "idcard";
    currentRoute = "idcard";
    await recordSignedUsage({
      actionType: "view_idcard",
      actionLabelHi: "हस्ताक्षर एवं मुहर युक्त पहचान पत्र खोला",
      actionLabelEn: "Opened Signed & Stamped Identity Card",
      targetTitleHi: `आधिकारिक पहचान पत्र (${m.memberCode})`,
      targetTitleEn: `Official Identity Card (${m.memberCode})`,
      signatoryIds: [m.signatoryId || state.settings.defaultSignatoryId || "sig-gs"],
      memberId: m.id
    });
    rerender();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Raw File Viewer Modal (Circulars, PDFs & Certificates — checks optional requiresMemberLogin lock!)
  async function openRawFileModal(subType, id) {
    const list = subType === "certificate" ? (state.certificates || []) : (state.circulars || []);
    const item = list.find((x) => x.id === id);
    if (!item) return;

    if ((item.requiresMemberLogin || item.isLockedForVisitor) && !canAccessSignedAssets()) {
      requireMemberLogin(
        () => openRawFileModal(subType, id),
        "इस प्रपत्र पर पदाधिकारी का हस्ताक्षर/मुहर अंकित है, अतः इसे केवल सदस्य लॉगिन के बाद देखा जा सकता है।",
        "This document bears an official signature/seal and is accessible strictly after Member Login."
      );
      return;
    }

    if (item.requiresMemberLogin && canAccessSignedAssets()) {
      await recordSignedUsage({
        actionType: "view_protected_file",
        actionLabelHi: "हस्ताक्षर/मुहर युक्त संरक्षित प्रपत्र खोला",
        actionLabelEn: "Opened Protected Signed/Stamped File",
        targetTitleHi: item.titleHi || item.titleEn,
        targetTitleEn: item.titleEn || item.titleHi,
        signatoryIds: state.settings.defaultSignatoryIds || ["sig-gs"]
      });
    }

    activeModalContext = { kind: "rawFile", subType, id };
    renderCurrentModal();
  }

  function openUnsignedAssocDocModal(id) {
    activeModalContext = { kind: "unsignedAssocDoc", id };
    renderCurrentModal();
  }

  async function openAssocDocModal(id) {
    const item = state.documents.find((x) => x.id === id);
    if (!item) return;
    if (!canAccessSignedAssets()) {
      requireMemberLogin(
        () => openAssocDocModal(id),
        "पदाधिकारियों के हस्ताक्षर एवं संघ की आधिकारिक मुहर युक्त दस्तावेज़ खोलने व प्रिंट करने हेतु सदस्य लॉगिन अनिवार्य है।",
        "Member Login is mandatory to open or print Association Documents bearing Office-Bearers' Signatures and Official Seal."
      );
      return;
    }
    const sigIds = item.signatoryIds || state.settings.defaultSignatoryIds || ["sig-gs"];
    modalMultiSigIds = sigIds;
    activeModalContext = { kind: "assocDoc", id };
    await recordSignedUsage({
      actionType: "view_assoc_doc",
      actionLabelHi: "हस्ताक्षर एवं मुहर युक्त संघ दस्तावेज़ खोला",
      actionLabelEn: "Opened Signed & Stamped Association Document",
      targetTitleHi: item.titleHi || item.titleEn,
      targetTitleEn: item.titleEn || item.titleHi,
      signatoryIds: sigIds
    });
    renderCurrentModal();
  }

  async function openReceiptModal(paymentId) {
    const p = state.payments.find((x) => x.id === paymentId);
    if (!p) return;
    if (!canAccessSignedAssets()) {
      requireMemberLogin(
        () => openReceiptModal(paymentId),
        "पदाधिकारी हस्ताक्षर एवं आधिकारिक मुहर युक्त भुगतान रसीद प्राप्त करने हेतु सदस्य लॉगिन अनिवार्य है।",
        "Member Login is mandatory to access official receipts bearing Office-Bearers' Signatures and Official Seal."
      );
      return;
    }
    if (!isAdminLoggedIn && !canAccessSignedReceipt(p)) {
      toast(t("🔒 सुरक्षा नियम: आप केवल अपने खाते से जुड़ी हस्ताक्षर युक्त रसीद ही खोल सकते हैं।", "🔒 Security Rule: You may only open signed receipts associated with your own member account."));
      return;
    }
    const sigIds = p.signatoryIds || state.settings.defaultSignatoryIds || ["sig-gs"];
    modalMultiSigIds = sigIds;
    activeModalContext = { kind: "receipt", id: paymentId };
    await recordSignedUsage({
      actionType: "view_receipt",
      actionLabelHi: "हस्ताक्षर एवं मुहर युक्त आधिकारिक रसीद खोली",
      actionLabelEn: "Opened Signed & Stamped Official Receipt",
      targetTitleHi: `आधिकारिक रसीद (${p.receiptNo})`,
      targetTitleEn: `Official Receipt (${p.receiptNo})`,
      signatoryIds: sigIds
    });
    renderCurrentModal();
  }

  function renderCurrentModal() {
    if (!activeModalContext) return;
    const modalRoot = document.getElementById("modalRoot");
    const { kind, subType, id, data } = activeModalContext;
    const auditActor = getAuditActor();

    if (kind === "regAck" && data) {
      const isAct = data.status === "active";
      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box" style="max-width:540px">
            <div class="modal-header no-print">
              <h3 style="font-size:1rem;font-weight:900">🎉 ${t("सदस्यता पंजीकरण सफल (पावती सूचना)", "Membership Registration Successful")}</h3>
              <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕</button>
            </div>
            <div class="modal-body">
              <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:16px;margin-bottom:14px">
                <div style="font-size:0.86rem;color:#15803d;font-weight:800">${t("आपकी विशिष्ट सदस्य पंजीकरण संख्या:", "Your Unique Member Registration ID:")}</div>
                <div style="font-size:1.5rem;font-weight:900;color:#0a2252;margin:4px 0">${escapeHtml(data.memberCode)}</div>
                <div style="font-size:0.88rem;color:#334155"><b>${escapeHtml(t(data.nameHi, data.nameEn))}</b> — ${escapeHtml(localizeDual(data.district, lang))}</div>
                <div style="font-size:0.82rem;margin-top:6px;font-weight:800;color:${isAct ? "#15803d" : "#b45309"}">
                  ${isAct ? t("✓ सदस्यता स्थिति: सक्रिय एवं सत्यापित", "✓ Status: Active & Verified") : t("⏳ सदस्यता स्थिति: एडमिन सत्यापन लंबित", "⏳ Status: Pending Admin Verification")}
                </div>
              </div>

              <div style="background:#fff7ed;border:1px solid #fed7aa;padding:12px 14px;border-radius:10px;font-size:0.84rem;color:#9a3412;font-weight:700;margin-bottom:16px">
                🔒 ${t("पदाधिकारियों के हस्ताक्षर एवं आधिकारिक मुहर युक्त पहचान पत्र, नियुक्ति पत्र व रसीद सीधे प्रदर्शित नहीं किए जाते। कृपया अपनी सदस्य ID और बनाए गए पासवर्ड से लॉगिन कर उन्हें प्राप्त करें।", "Official ID Cards, Appointment Letters, and Receipts are available after Member Login. Please sign in with your Member ID & Password to access them.")}
              </div>

              <button class="btn btn-accent" style="width:100%" onclick="window.UPBMSApp.closeModal(); window.UPBMSApp.openMemberLoginModal('${escapeHtml(data.memberCode)}')">
                🔑 ${t("सदस्य लॉगिन करें (हस्ताक्षर एवं मुहर युक्त प्रपत्र प्राप्त करें)", "Member Login (Access Signed & Stamped Documents)")}
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (kind === "unsignedAssocDoc") {
      const item = state.documents.find((x) => x.id === id);
      if (!item) return;
      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box" style="max-width:840px">
            <div class="modal-header no-print">
              <h3 style="font-size:0.98rem;font-weight:900">📖 ${escapeHtml(t(item.titleHi, item.titleEn))}</h3>
              <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕ ${t("बंद करें", "Close")}</button>
            </div>
            <div class="modal-body">
              ${renderUnsignedAssocDocumentHtml(item, state.settings, lang)}
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (kind === "unsignedReceipt") {
      const p = state.payments.find((x) => x.id === id);
      if (!p) return;
      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box" style="max-width:760px">
            <div class="modal-header no-print">
              <h3 style="font-size:0.98rem;font-weight:900">📋 ${t("भुगतान पावती विवरण (बिना हस्ताक्षर/मुहर)", "Payment Reference Summary (Unsigned)")}</h3>
              <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕ ${t("बंद करें", "Close")}</button>
            </div>
            <div class="modal-body">
              ${renderUnsignedReceiptAckHtml(p, state.settings, lang)}
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (kind === "rawFile") {
      const list = subType === "certificate" ? (state.certificates || []) : (state.circulars || []);
      const item = list.find((x) => x.id === id);
      if (!item) return;
      const modalHeading = t(item.titleHi, item.titleEn);

      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box">
            <div class="modal-header no-print">
              <h3 style="font-size:0.98rem;font-weight:900">📜 ${escapeHtml(modalHeading)}</h3>
              <div style="display:flex;gap:8px">
                <button class="btn btn-accent btn-sm" onclick="window.print()">🖨️ ${t("प्रिंट करें", "Print")}</button>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕ ${t("बंद करें", "Close")}</button>
              </div>
            </div>
            <div class="modal-body">
              ${renderExactUploadedFileHtml(item, lang)}
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (kind === "receipt") {
      if (!canAccessSignedAssets()) {
        closeModal();
        openMemberLoginModal();
        return;
      }
      const p = state.payments.find((x) => x.id === id);
      if (!p) return;
      const curIds = p.signatoryIds || state.settings.defaultSignatoryIds || ["sig-gs"];
      const heading = p.paymentCategory === "donation"
        ? t("सहयोग राशि रसीद", "Contribution Receipt")
        : t("सदस्यता शुल्क रसीद", "Membership Fee Receipt");

      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box">
            <div class="modal-header no-print">
              <h3 style="font-size:1rem;font-weight:900">🧾 ${escapeHtml(heading)} (${escapeHtml(p.receiptNo)})</h3>
              <div style="display:flex;gap:8px">
                <button class="btn btn-accent btn-sm" onclick="window.UPBMSApp.printWithAudit('print_receipt', 'हस्ताक्षर एवं मुहर युक्त रसीद प्रिंट/डाउनलोड की', 'Printed/Downloaded Signed & Stamped Receipt', 'आधिकारिक रसीद (${escapeHtml(p.receiptNo)})', 'Official Receipt (${escapeHtml(p.receiptNo)})', '${escapeHtml(curIds.join(","))}')">🖨️ ${t("प्रिंट / पीडीएफ", "Print / PDF")}</button>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕ ${t("बंद करें", "Close")}</button>
              </div>
            </div>
            <div class="modal-body">
              ${renderReceiptHtml(p, state.settings, curIds, lang, null)}
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (kind === "assocDoc") {
      if (!canAccessSignedAssets()) {
        closeModal();
        openMemberLoginModal();
        return;
      }
      const item = state.documents.find((x) => x.id === id);
      if (!item) return;
      const curIds = item.signatoryIds || state.settings.defaultSignatoryIds || ["sig-gs"];
      const catHeading = t(item.categoryHi || item.category || "संघ दस्तावेज़", item.categoryEn || "Association Document");

      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-box">
            <div class="modal-header no-print">
              <h3 style="font-size:0.98rem;font-weight:900">📄 ${escapeHtml(catHeading)}</h3>
              <div style="display:flex;gap:8px">
                <button class="btn btn-accent btn-sm" onclick="window.UPBMSApp.printWithAudit('print_assoc_doc', 'हस्ताक्षर एवं मुहर युक्त संघ दस्तावेज़ प्रिंट/डाउनलोड किया', 'Printed/Downloaded Signed Association Document', '${escapeHtml(item.titleHi || "")}', '${escapeHtml(item.titleEn || "")}', '${escapeHtml(curIds.join(","))}')">🖨️ ${t("प्रिंट / पीडीएफ सेव करें", "Print / Save PDF")}</button>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕ ${t("बंद करें", "Close")}</button>
              </div>
            </div>
            <div class="modal-body">
              ${renderAssociationDocumentHtml(item, state.settings, curIds, lang, null)}
            </div>
          </div>
        </div>
      `;
    }
  }

  async function submitGrievanceForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const res = await fetch("/api/grievances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    if (json.ok) {
      e.target.reset();
      trackedGrievances = null;
      await refreshData();
      toast(t(`✅ शिकायत सफलतापूर्वक पंजीकृत! टिकट संख्या: ${json.grievance.ticketNo}`, `✅ Grievance registered! Ticket ID: ${json.grievance.ticketNo}`));
    }
  }

  async function searchGrievanceStatus(e) {
    e.preventDefault();
    const q = document.getElementById("grvTrackInput").value.trim();
    if (!q) { trackedGrievances = null; rerender(); return; }
    const res = await fetch(`/api/grievances/track/${encodeURIComponent(q)}`);
    const json = await res.json();
    trackedGrievances = json.grievances || [];
    rerender();
  }

  function resetGrievanceTrack() { trackedGrievances = null; rerender(); }

  // ==================== FOOTER ====================
  function renderFooter() {
    const s = state.settings;
    const stx = s.sectionTexts || {};
    const grvEnabled = isGrievanceEnabled();
    const waUrl = `https://wa.me/${String(s.whatsappNumber || "919450011223").replace(/\D/g, "")}`;
    const navItems = [...(s.navItems || [])]
      .filter((it) => it.visible !== false && (it.id !== "grievance" || grvEnabled))
      .sort((a, b) => (a.order || 99) - (b.order || 99));

    return `
      <footer class="site-footer no-print">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <img src="${escapeHtml(s.logoUrl || "/images/upbms-crest.svg")}" style="width:48px;height:48px;border-radius:50%;background:#fff;padding:2px" alt="Logo" />
                <div>
                  <div style="color:#ffd166;font-weight:900;font-size:1.08rem">${escapeHtml(t(s.orgNameHi, s.orgNameEn))}</div>
                  <div style="font-size:0.78rem">${escapeHtml(s.regNumber)}</div>
                </div>
              </div>
              <p style="font-size:0.86rem;line-height:1.65;color:#94a3b8">${escapeHtml(t(s.taglineHi, s.taglineEn))}</p>
            </div>

            <div>
              <div class="footer-title">${t("प्रमुख मेनू लिंक", "Quick Navigation")}</div>
              <ul class="footer-links">
                ${navItems.map((it) => `<li><button onclick="window.UPBMSApp.navigate('${escapeHtml(it.id)}')">• ${escapeHtml(t(it.labelHi, it.labelEn))}</button></li>`).join("")}
                <li><button onclick="window.UPBMSApp.navigate('idcard')">• ${t("पहचान पत्र एवं नियुक्ति पत्र", "ID Card & Appointment Letter")}</button></li>
                <li><button onclick="window.UPBMSApp.navigate('donation')">• ${t("सहयोग राशि / डोनेशन", "Contribute / Donate")}</button></li>
              </ul>
            </div>

            <div>
              <div class="footer-title">${t("उपयोगी बैंकिंग पोर्टल", "Important Portals")}</div>
              <ul class="footer-links">
                ${state.externalLinks.slice(0, 5).map((l) => `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(t(l.titleHi, l.titleEn))}</a></li>`).join("")}
              </ul>
            </div>

            <div>
              <div class="footer-title">${t("प्रांतीय कार्यालय संपर्क", "State Office Contact")}</div>
              <div style="font-size:0.86rem;display:grid;gap:6px">
                <div>📍 ${escapeHtml(t(s.headOfficeHi, s.headOfficeEn))}</div>
                <div>📞 ${escapeHtml(s.helplinePrimary)}</div>
                <div>✉️ ${escapeHtml(s.email)}</div>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.12);padding-top:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:0.81rem;color:#94a3b8">
            <span>© 2026 ${escapeHtml(t(s.orgNameHi, s.orgNameEn))} (${escapeHtml(s.shortName)})</span>
            <span>${escapeHtml(t(stx.footerCopyrightHi, stx.footerCopyrightEn))}</span>
          </div>
        </div>
      </footer>

      <a href="${waUrl}" target="_blank" rel="noopener" class="floating-wa no-print">
        💬 ${t("UPBMS WhatsApp सहायता", "UPBMS WhatsApp Support")}
      </a>
    `;
  }

  function rerender() {
    if (!state) return;
    const root = document.getElementById("appRoot");
    let pageHtml = "";

    if (currentRoute === "admin" && isAdminLoggedIn) pageHtml = window.UPBMSAdmin.renderAdminShell(state);
    else if (currentRoute === "about") pageHtml = renderAboutPage();
    else if (currentRoute === "members") pageHtml = renderMembersDirectoryPage();
    else if (currentRoute === "join") pageHtml = renderMembershipJoinPage();
    else if (currentRoute === "donation") pageHtml = renderDonationPage();
    else if (currentRoute === "circulars") pageHtml = renderCircularsPage();
    else if (currentRoute === "documents") pageHtml = renderDocumentsPage();
    else if (currentRoute === "idcard") pageHtml = renderIdAndDocsVerifyPage();
    else if (currentRoute === "portals") pageHtml = renderPortalsPage();
    else if (currentRoute === "grievance" && isGrievanceEnabled()) pageHtml = renderGrievancePage();
    else pageHtml = renderHomePage();

    root.innerHTML = renderHeader() + `<main>${pageHtml}</main>` + renderFooter();
  }

  return {
    init,
    getState,
    getAuthHeaders,
    refreshData,
    rerender,
    navigate,
    toggleLang,
    setSlide,
    closeModal,
    toast,
    logoutAdmin,
    openMemberLoginModal,
    submitMemberLogin,
    logoutMember,
    printWithAudit,
    setMemberFilter,
    setCircularSearch,
    updateJoinFeeDisplay,
    handlePublicPhotoUpload,
    submitPublicMembership,
    submitDonation,
    handleVerifySubmit,
    lookupMemberByQuery,
    switchDocPreviewTab,
    setSingleSignatory,
    toggleMultiSignatory,
    openMemberDocsModal,
    openRawFileModal,
    openUnsignedAssocDocModal,
    openAssocDocModal,
    openReceiptModal,
    submitGrievanceForm,
    searchGrievanceStatus,
    resetGrievanceTrack
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  window.UPBMSApp.init();
});
