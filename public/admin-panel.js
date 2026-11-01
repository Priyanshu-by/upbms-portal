// UPBMS V3 Universal Zero-Code Admin CMS
// 100% Control over Menus, Headings, Certificates, Multi-Signatory Modes, Custom Backgrounds, Terms, Member Edits & Password Reset

window.UPBMSAdmin = (function () {
  const { escapeHtml, uploadFileInput } = window.UPBMSHelpers;

  let activeTab = "dashboard";
  let memberFilter = "all"; // all | core | general | pending
  let memberAdminSearch = "";
  let auditLogSearch = "";
  let auditLogActionFilter = "all";

  function getActiveTab() {
    return activeTab;
  }

  function switchTab(tab) {
    activeTab = tab;
    window.UPBMSApp.rerender();
  }

  function renderAdminLoginModal(lang = "hi") {
    const isEn = lang === "en";
    return `
      <div class="modal-backdrop">
        <div class="modal-box" style="max-width:430px">
          <div class="modal-header">
            <h3 style="font-size:1.05rem;font-weight:900">🔐 ${isEn ? "Admin Control Panel Login" : "एडमिन कंट्रोल पैनल लॉगिन"}</h3>
            <button class="btn btn-sm btn-danger" onclick="window.UPBMSApp.closeModal()">✕</button>
          </div>
          <form class="modal-body" id="adminLoginForm">
            <div style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:10px;margin-bottom:14px;font-size:0.85rem;color:#9a3412">
              <b>${isEn ? "Demo Admin PIN:" : "डेमो एडमिन पिन:"}</b> <code style="font-size:1.05rem;font-weight:900">1234</code>
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">${isEn ? "Enter Security PIN" : "सुरक्षा पिन दर्ज करें"}</label>
              <input type="password" class="form-control" id="adminPinInput" value="1234" required />
            </div>
            <button type="submit" class="btn btn-accent" style="width:100%">
              ⚙️ ${isEn ? "Unlock Admin CMS" : "एडमिन पैनल खोलें"}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function askActionConfirm(message, onYes) {
    window._upbmsConfirmCb = onYes;
    const modalRoot = document.getElementById("modalRoot");
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="max-width:440px">
          <div class="modal-header">
            <h3 style="font-size:1rem;font-weight:900">⚠️ पुष्टि करें / Confirm Action</h3>
            <button class="btn btn-sm btn-danger" onclick="window.UPBMSApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.94rem;color:#1e293b;margin-bottom:18px;font-weight:700">${escapeHtml(message)}</p>
            <div style="display:flex;gap:10px;justify-content:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.closeModal()">रद्द करें / Cancel</button>
              <button class="btn btn-accent btn-sm" onclick="const fn=window._upbmsConfirmCb; window.UPBMSApp.closeModal(); if(fn) fn();">हाँ, आगे बढ़ें / Confirm</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function saveSettingsPatch(patchObj, successMsg = "✅ सेटिंग्स सफलतापूर्वक सेव हो गईं!") {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchObj)
    });
    const json = await res.json();
    if (json.ok) {
      await window.UPBMSApp.refreshData();
      window.UPBMSApp.toast(successMsg);
    } else {
      window.UPBMSApp.toast("❌ " + (json.error || "Save failed"));
    }
  }

  // ==================== ADMIN SHELL ====================
  function renderAdminShell(state) {
    const st = state.stats;
    const grvEnabled = state.settings.enableGrievanceModule !== false;

    const tabs = [
      { id: "dashboard", label: "📊 डैशबोर्ड व सारांश", badge: (st.pendingMembersCount + st.pendingPaymentsCount) || "" },
      { id: "security_logs", label: "🛡️ हस्ताक्षर/मुहर उपयोग लॉग", badge: (state.accessLogs || []).length || st.totalAccessLogs || 0 },
      { id: "menus_sections", label: "🧭 मेनू नाम, बटन व सेक्शन", badge: "CMS" },
      { id: "about_certs", label: "🏛️ हमारे बारे में व प्रमाण-पत्र", badge: (state.certificates || []).length },
      { id: "signatures_seal", label: "✍️ बहु-पदाधिकारी साइन व मुहर", badge: (state.settings.signatories || []).length },
      { id: "template_bg", label: "🎨 लेटर/ID/रसीद बैकग्राउंड व शर्तें", badge: "" },
      { id: "hero_campaign_stats", label: "🖼️ स्लाइडर, अभियान व 4 बॉक्स", badge: state.slides.length },
      { id: "members", label: "👥 सदस्य, संशोधन व पासवर्ड रीसेट", badge: state.members.length },
      { id: "circulars", label: "📑 बैंक मित्र सर्कुलर व PDF", badge: (state.circulars || []).length },
      { id: "documents", label: "📂 संघ दस्तावेज़ एवं मांगें", badge: state.documents.length },
      { id: "external_links", label: "🌐 महत्वपूर्ण पोर्टल लिंक", badge: state.externalLinks.length },
      { id: "payments", label: "💳 शुल्क व डोनेशन लेजर", badge: state.payments.length },
      { id: "grievances_news", label: `⚖️ शिकायत (${grvEnabled ? "चालू" : "छुपा"}) व समाचार`, badge: st.openGrievances || "" },
      { id: "branding", label: "🏢 संगठन पहचान, सोशल व पिन", badge: "" }
    ];

    return `
      <div class="container">
        <div class="admin-shell">
          <aside class="admin-sidebar no-print">
            <div style="padding:8px 10px 14px;border-bottom:1px solid rgba(255,255,255,0.15);margin-bottom:10px">
              <div style="font-size:0.74rem;color:#ffd166;font-weight:900;letter-spacing:0.6px">UNIVERSAL ZERO-CODE CMS</div>
              <div style="font-size:1.05rem;font-weight:900;margin-top:2px">सुपर एडमिन कंट्रोल पैनल</div>
            </div>
            ${tabs
              .map(
                (tb) => `
              <button class="admin-menu-btn ${activeTab === tb.id ? "active" : ""}" onclick="window.UPBMSAdmin.switchTab('${tb.id}')">
                <span>${tb.label}</span>
                ${tb.badge !== "" ? `<span style="background:rgba(0,0,0,0.25);padding:1px 7px;border-radius:99px;font-size:0.72rem">${tb.badge}</span>` : ""}
              </button>`
              )
              .join("")}

            <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.15);display:grid;gap:8px">
              <button class="btn btn-white btn-sm" style="width:100%" onclick="window.UPBMSApp.navigate('home')">🌐 वेबसाइट प्रीव्यू देखें</button>
              <button class="btn btn-danger btn-sm" style="width:100%" onclick="window.UPBMSApp.logoutAdmin()">🔒 एडमिन लॉगआउट</button>
            </div>
          </aside>

          <section style="min-width:0">
            ${renderCurrentAdminTab(state)}
          </section>
        </div>
      </div>
    `;
  }

  function renderCurrentAdminTab(state) {
    switch (activeTab) {
      case "security_logs": return renderSecurityLogsTab(state);
      case "menus_sections": return renderMenusAndSectionsTab(state);
      case "about_certs": return renderAboutAndCertsTab(state);
      case "signatures_seal": return renderSignaturesAndSealTab(state);
      case "template_bg": return renderTemplateBgAndTermsTab(state);
      case "hero_campaign_stats": return renderHeroCampaignStatsTab(state);
      case "members": return renderMembersAdminTab(state);
      case "circulars": return renderCircularsAdminTab(state);
      case "documents": return renderDocumentsAndDemandsTab(state);
      case "external_links": return renderExternalLinksTab(state);
      case "payments": return renderPaymentsAdminTab(state);
      case "grievances_news": return renderGrievancesAndNewsTab(state);
      case "branding": return renderBrandingAndSocialTab(state);
      default: return renderDashboardTab(state);
    }
  }

  // ==================== TAB 1: DASHBOARD ====================
  function renderDashboardTab(state) {
    const st = state.stats;
    const grvOn = state.settings.enableGrievanceModule !== false;
    const pendingMembers = state.members.filter((m) => m.status === "pending");

    return `
      <div style="display:grid;gap:20px">
        <div class="card-panel" style="background:var(--hero-deck-bg);color:#ffffff;border:none">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
            <div>
              <h2 style="font-size:1.45rem;font-weight:900;color:#ffd166">नमस्कार, सुपर एडमिन!</h2>
              <p style="font-size:0.9rem;color:#dbeafe">यहाँ से वेबसाइट का हर एक शब्द, मेनू नाम, सर्टिफिकेट, बैकग्राउंड, हस्ताक्षर, नियम-शर्तें व सदस्य पासवर्ड बिना कोडिंग बदला जा सकता है।</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-white btn-sm" onclick="window.UPBMSAdmin.downloadExport('/api/export/members.csv', 'UPBMS_Members.csv')">📥 सदस्य CSV</button>
              <button class="btn btn-white btn-sm" onclick="window.UPBMSAdmin.downloadExport('/api/export/payments.csv', 'UPBMS_Payments.csv')">📥 भुगतान CSV</button>
              <button class="btn btn-accent btn-sm" onclick="window.UPBMSAdmin.downloadExport('/api/admin/backup', 'UPBMS_Backup.json')">💾 JSON बैकअप</button>
              <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.resetDemoData()">🔄 डिफ़ॉल्ट रीसेट</button>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
          <div class="card-panel"><b>👑 मुख्य कार्यकारिणी:</b> <div style="font-size:1.6rem;font-weight:900;color:var(--primary)">${st.totalCoreMembers}</div></div>
          <div class="card-panel"><b>👥 सक्रिय सदस्य:</b> <div style="font-size:1.6rem;font-weight:900;color:var(--primary)">${st.totalActiveMembers}</div></div>
          <div class="card-panel"><b>💰 सत्यापित कोष:</b> <div style="font-size:1.6rem;font-weight:900;color:#15803d">₹${st.totalCollection}</div></div>
          <div class="card-panel" style="cursor:pointer;border-color:#93c5fd;background:#eff6ff" onclick="window.UPBMSAdmin.switchTab('security_logs')">
            <b>🛡️ हस्ताक्षर/मुहर उपयोग लॉग:</b>
            <div style="font-size:1.6rem;font-weight:900;color:#1d4ed8">${(state.accessLogs || []).length || st.totalAccessLogs || 0}</div>
            <div style="font-size:0.76rem;color:#1e40af;font-weight:800">किसने उपयोग किया देखें →</div>
          </div>
        </div>

        <!-- Recent Signature & Seal Usage Security Preview -->
        <div class="card-panel" style="border:1.5px solid #bfdbfe;background:#f8fafc">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">
            <div style="font-weight:900;font-size:1.02rem;color:var(--primary)">
              🛡️ हालिया हस्ताक्षर एवं मुहर उपयोग रिकॉर्ड (बिना सदस्य लॉगिन कोई भी विज़िटर हस्ताक्षर/मुहर नहीं देख सकता)
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.UPBMSAdmin.switchTab('security_logs')">
              📋 संपूर्ण सुरक्षा लॉग खोलें →
            </button>
          </div>
          <div style="display:grid;gap:8px">
            ${(state.accessLogs || [])
              .slice(0, 3)
              .map(
                (l) => `
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;font-size:0.83rem">
                <div>
                  <b style="color:#0a2252">${escapeHtml(l.memberNameHi)} (${escapeHtml(l.memberCode)})</b> — ${escapeHtml(l.mobile || "")} • ${escapeHtml(l.district || "")}
                  <div style="color:#15803d;font-weight:800">${escapeHtml(l.actionLabelHi)} — <span>${escapeHtml(l.targetTitleHi)}</span></div>
                </div>
                <span style="font-size:0.76rem;color:#64748b;font-weight:700">🕒 ${escapeHtml(l.timestamp)}</span>
              </div>`
              )
              .join("") || `<div style="font-size:0.84rem;color:#64748b">कोई उपयोग लॉग दर्ज नहीं है।</div>`}
          </div>
        </div>

        <!-- Quick Grievance Visibility Toggle -->
        <div class="card-panel" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;background:${grvOn ? "#f0fdf4" : "#fef2f2"};border-color:${grvOn ? "#86efac" : "#fecaca"}">
          <div>
            <div style="font-weight:900;font-size:1.02rem;color:#0f172a">
              ⚖️ शिकायत निवारण (Grievance Redressal) मॉड्यूल स्थिति:
              <span style="color:${grvOn ? "#15803d" : "#b91c1c"}">${grvOn ? "चालू (वेबसाइट पर दिख रहा है)" : "बंद / छुपा हुआ (हर जगह से हाइड है)"}</span>
            </div>
            <div style="font-size:0.84rem;color:#475569">इसे बंद करते ही मेनू बार, होमपेज बटन व फुटर सभी जगह से शिकायत निवारण के विकल्प तुरंत छिप जाएंगे।</div>
          </div>
          <button class="btn ${grvOn ? "btn-danger" : "btn-whatsapp"} btn-sm" onclick="window.UPBMSAdmin.toggleGrievanceModule(${!grvOn})">
            ${grvOn ? "🙈 शिकायत निवारण मेनू व विकल्प छिपाएँ (Hide)" : "👁️ शिकायत निवारण मेनू वापस दिखाएँ (Show)"}
          </button>
        </div>

        ${
          pendingMembers.length
            ? `<div class="card-panel">
                 <h3 style="font-size:1.05rem;font-weight:900;color:var(--primary);margin-bottom:12px">⏳ लंबित सदस्यता आवेदन (${pendingMembers.length})</h3>
                 <div style="display:grid;gap:10px">
                   ${pendingMembers
                     .map(
                       (m) => `
                     <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px">
                       <div><b>${escapeHtml(m.nameHi)} (${escapeHtml(m.nameEn)})</b> — ${escapeHtml(m.district)} • ${escapeHtml(m.mobile)}</div>
                       <div style="display:flex;gap:8px">
                         <button class="btn btn-whatsapp btn-sm" onclick="window.UPBMSAdmin.quickApproveMember('${m.id}')">✓ स्वीकृत करें</button>
                         <button class="btn btn-outline btn-sm" onclick="window.UPBMSAdmin.openEditMemberModal('${m.id}')">✏️ विवरण देखें/बदलें</button>
                       </div>
                     </div>`
                     )
                     .join("")}
                 </div>
               </div>`
            : ""
        }
      </div>
    `;
  }

  async function toggleGrievanceModule(nextVal) {
    await saveSettingsPatch(
      { enableGrievanceModule: Boolean(nextVal) },
      nextVal ? "✅ शिकायत निवारण मेनू व विकल्प सक्रिय कर दिए गए!" : "✅ शिकायत निवारण मेनू व संबंधित सभी विकल्प वेबसाइट से छिपा दिए गए!"
    );
  }

  // ==================== TAB 2: MENUS, HEADER BUTTONS & SECTION HEADINGS ====================
  function renderMenusAndSectionsTab(state) {
    const s = state.settings;
    const navItems = [...(s.navItems || [])].sort((a, b) => (a.order || 99) - (b.order || 99));
    const hb = s.headerButtons || {};
    const stx = s.sectionTexts || {};

    return `
      <div style="display:grid;gap:22px">
        <!-- 1. Main Navigation Menu Bar Editor -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveMenusForm(event)">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:6px">🧭 1. मुख्य मेनू बार नियंत्रण (नाम बदलें, क्रम बदलें या छिपाएँ)</h3>
          <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">हर मेनू का हिंदी व अंग्रेजी नाम यहाँ से बदला जा सकता है। (नोट: एडमिन पैनल, पहचान-पत्र व डोनेशन ऊपर हेडर में होने के कारण मेनू बार से हटा दिए गए हैं।)</p>

          <div class="admin-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>रूट ID</th>
                  <th>मेनू नाम (हिंदी)</th>
                  <th>Menu Name (English)</th>
                  <th>क्रम (Order)</th>
                  <th>दिखाएँ (Visible)</th>
                </tr>
              </thead>
              <tbody>
                ${navItems
                  .map(
                    (it, idx) => `
                  <tr>
                    <td><code>${escapeHtml(it.id)}</code><input type="hidden" name="nav_id_${idx}" value="${escapeHtml(it.id)}" /></td>
                    <td><input class="form-control" name="nav_hi_${idx}" value="${escapeHtml(it.labelHi)}" required /></td>
                    <td><input class="form-control" name="nav_en_${idx}" value="${escapeHtml(it.labelEn)}" required /></td>
                    <td style="width:90px"><input type="number" class="form-control" name="nav_ord_${idx}" value="${it.order || idx + 1}" /></td>
                    <td>
                      <label style="display:inline-flex;align-items:center;gap:6px;font-weight:800;cursor:pointer">
                        <input type="checkbox" name="nav_vis_${idx}" ${it.visible !== false ? "checked" : ""} />
                        <span>दिखाएँ</span>
                      </label>
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <input type="hidden" name="nav_count" value="${navItems.length}" />

          <div style="margin-top:16px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <label style="display:flex;align-items:center;gap:8px;font-weight:900;color:#9a3412;cursor:pointer">
              <input type="checkbox" name="enableGrievanceModule" ${s.enableGrievanceModule !== false ? "checked" : ""} />
              <span>⚖️ 'शिकायत निवारण' सुविधा पूरी वेबसाइट पर चालू रखें (अनचेक करने पर मेनू व सभी जगह से छिप जाएगा)</span>
            </label>
            <button type="submit" class="btn btn-accent">💾 मेनू सेटिंग सेव करें</button>
          </div>
        </form>

        <!-- 2. Top Header CTA Buttons Editor -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveHeaderButtonsForm(event)">
          <h3 style="font-size:1.12rem;font-weight:900;color:var(--primary);margin-bottom:12px">🔘 2. ऊपरी हेडर बटन (ID कार्ड, डोनेशन, सदस्य लॉगिन, एडमिन) के नाम व दृश्यता</h3>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">पहचान पत्र बटन नाम (हिंदी)</label>
              <input class="form-control" name="idcardLabelHi" value="${escapeHtml(hb.idcardLabelHi || "पहचान पत्र एवं नियुक्ति पत्र")}" />
            </div>
            <div class="form-group">
              <label class="form-label">ID Card Button (English)</label>
              <input class="form-control" name="idcardLabelEn" value="${escapeHtml(hb.idcardLabelEn || "ID Card & Appointment Letter")}" />
            </div>
            <div class="form-group">
              <label class="form-label">डोनेशन बटन नाम (हिंदी)</label>
              <input class="form-control" name="donationLabelHi" value="${escapeHtml(hb.donationLabelHi || "सहयोग राशि / डोनेशन")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Donation Button (English)</label>
              <input class="form-control" name="donationLabelEn" value="${escapeHtml(hb.donationLabelEn || "Donate")}" />
            </div>
            <div class="form-group">
              <label class="form-label">सदस्यता बटन नाम (हिंदी)</label>
              <input class="form-control" name="joinLabelHi" value="${escapeHtml(hb.joinLabelHi || "सदस्य बनें")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Join Button (English)</label>
              <input class="form-control" name="joinLabelEn" value="${escapeHtml(hb.joinLabelEn || "Join Membership")}" />
            </div>
            <div class="form-group">
              <label class="form-label">सदस्य लॉगिन बटन (हिंदी)</label>
              <input class="form-control" name="memberLoginLabelHi" value="${escapeHtml(hb.memberLoginLabelHi || "सदस्य लॉगिन")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Member Login Button (English)</label>
              <input class="form-control" name="memberLoginLabelEn" value="${escapeHtml(hb.memberLoginLabelEn || "Member Login")}" />
            </div>
            <div class="form-group">
              <label class="form-label">एडमिन बटन नाम (हिंदी)</label>
              <input class="form-control" name="adminLabelHi" value="${escapeHtml(hb.adminLabelHi || "एडमिन पैनल")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Admin Button (English)</label>
              <input class="form-control" name="adminLabelEn" value="${escapeHtml(hb.adminLabelEn || "Admin Panel")}" />
            </div>
            <div class="form-group full" style="display:flex;flex-wrap:wrap;gap:18px;padding-top:6px">
              <label style="font-weight:800"><input type="checkbox" name="idcardVisible" ${hb.idcardVisible !== false ? "checked" : ""} /> पहचान पत्र बटन दिखाएँ</label>
              <label style="font-weight:800"><input type="checkbox" name="donationVisible" ${hb.donationVisible !== false ? "checked" : ""} /> डोनेशन बटन दिखाएँ</label>
              <label style="font-weight:800"><input type="checkbox" name="joinVisible" ${hb.joinVisible !== false ? "checked" : ""} /> सदस्य बनें बटन दिखाएँ</label>
              <label style="font-weight:800"><input type="checkbox" name="memberLoginVisible" ${hb.memberLoginVisible !== false ? "checked" : ""} /> सदस्य लॉगिन बटन दिखाएँ</label>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:14px">💾 हेडर बटन सेव करें</button>
        </form>

        <!-- 3. Section Headings & Footer Copyright Editor -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveSectionTextsForm(event)">
          <h3 style="font-size:1.12rem;font-weight:900;color:var(--primary);margin-bottom:12px">📝 3. होमपेज सेक्शन शीर्षक व फुटर टेक्स्ट (हिंदी एवं English दोनों)</h3>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">टिकर बैज (हिंदी)</label>
              <input class="form-control" name="tickerBadgeHi" value="${escapeHtml(stx.tickerBadgeHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Ticker Badge (English)</label>
              <input class="form-control" name="tickerBadgeEn" value="${escapeHtml(stx.tickerBadgeEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">सर्कुलर सेक्शन शीर्षक (हिंदी)</label>
              <input class="form-control" name="homeCircularsTitleHi" value="${escapeHtml(stx.homeCircularsTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Circulars Section Title (English)</label>
              <input class="form-control" name="homeCircularsTitleEn" value="${escapeHtml(stx.homeCircularsTitleEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">महत्वपूर्ण पोर्टल शीर्षक (हिंदी)</label>
              <input class="form-control" name="homePortalsTitleHi" value="${escapeHtml(stx.homePortalsTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Portals Section Title (English)</label>
              <input class="form-control" name="homePortalsTitleEn" value="${escapeHtml(stx.homePortalsTitleEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">मांग-पत्र सेक्शन शीर्षक (हिंदी)</label>
              <input class="form-control" name="homeDemandsTitleHi" value="${escapeHtml(stx.homeDemandsTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Demands Section Title (English)</label>
              <input class="form-control" name="homeDemandsTitleEn" value="${escapeHtml(stx.homeDemandsTitleEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">सक्रिय सदस्य सेक्शन शीर्षक (हिंदी)</label>
              <input class="form-control" name="homeMembersTitleHi" value="${escapeHtml(stx.homeMembersTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Members Section Title (English)</label>
              <input class="form-control" name="homeMembersTitleEn" value="${escapeHtml(stx.homeMembersTitleEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">समाचार सेक्शन शीर्षक (हिंदी)</label>
              <input class="form-control" name="homeNewsTitleHi" value="${escapeHtml(stx.homeNewsTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">News Section Title (English)</label>
              <input class="form-control" name="homeNewsTitleEn" value="${escapeHtml(stx.homeNewsTitleEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">फुटर कॉपीराइट संदेश (हिंदी)</label>
              <input class="form-control" name="footerCopyrightHi" value="${escapeHtml(stx.footerCopyrightHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Footer Copyright Text (English)</label>
              <input class="form-control" name="footerCopyrightEn" value="${escapeHtml(stx.footerCopyrightEn || "")}" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:14px">💾 सभी सेक्शन शीर्षक सेव करें</button>
        </form>
      </div>
    `;
  }

  async function saveMenusForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const count = Number(fd.get("nav_count") || 0);
    const navItems = [];
    for (let i = 0; i < count; i++) {
      const id = fd.get(`nav_id_${i}`);
      navItems.push({
        id,
        labelHi: fd.get(`nav_hi_${i}`),
        labelEn: fd.get(`nav_en_${i}`),
        order: Number(fd.get(`nav_ord_${i}`) || i + 1),
        visible: e.target.querySelector(`[name="nav_vis_${i}"]`).checked
      });
    }
    const enableGrievanceModule = e.target.querySelector('[name="enableGrievanceModule"]').checked;
    // Sync grievance item visibility too
    const grvItem = navItems.find((x) => x.id === "grievance");
    if (grvItem && !enableGrievanceModule) grvItem.visible = false;
    else if (grvItem && enableGrievanceModule) grvItem.visible = true;

    await saveSettingsPatch({ navItems, enableGrievanceModule }, "✅ मेनू बार सेटिंग्स सफलतापूर्वक सेव हो गईं!");
  }

  async function saveHeaderButtonsForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = Object.fromEntries(fd.entries());
    const headerButtons = {
      idcardLabelHi: raw.idcardLabelHi,
      idcardLabelEn: raw.idcardLabelEn,
      donationLabelHi: raw.donationLabelHi,
      donationLabelEn: raw.donationLabelEn,
      joinLabelHi: raw.joinLabelHi,
      joinLabelEn: raw.joinLabelEn,
      memberLoginLabelHi: raw.memberLoginLabelHi,
      memberLoginLabelEn: raw.memberLoginLabelEn,
      adminLabelHi: raw.adminLabelHi,
      adminLabelEn: raw.adminLabelEn,
      idcardVisible: e.target.querySelector('[name="idcardVisible"]').checked,
      donationVisible: e.target.querySelector('[name="donationVisible"]').checked,
      joinVisible: e.target.querySelector('[name="joinVisible"]').checked,
      memberLoginVisible: e.target.querySelector('[name="memberLoginVisible"]').checked
    };
    await saveSettingsPatch({ headerButtons }, "✅ ऊपरी हेडर बटन अपडेट हो गए!");
  }

  async function saveSectionTextsForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sectionTexts = Object.fromEntries(fd.entries());
    await saveSettingsPatch({ sectionTexts }, "✅ सभी सेक्शन शीर्षक व फुटर टेक्स्ट सेव हो गए!");
  }

  // ==================== TAB 3: ABOUT US, VISION-MISSION & CERTIFICATES ====================
  function renderAboutAndCertsTab(state) {
    const avm = state.settings.aboutVisionMission || {};
    const certs = state.certificates || [];

    return `
      <div style="display:grid;gap:22px">
        <!-- 1. Combined About Us + Vision & Mission Editor -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveAboutVmForm(event)">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:12px">🏛️ 1. हमारे बारे में + विज़न एवं मिशन (हिंदी एवं English)</h3>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">परिचय शीर्षक (हिंदी)</label>
              <input class="form-control" name="aboutTitleHi" value="${escapeHtml(avm.aboutTitleHi || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">About Title (English)</label>
              <input class="form-control" name="aboutTitleEn" value="${escapeHtml(avm.aboutTitleEn || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">परिचय विवरण (हिंदी)</label>
              <textarea class="form-control" name="aboutBodyHi" rows="4">${escapeHtml(avm.aboutBodyHi || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">About Description (English)</label>
              <textarea class="form-control" name="aboutBodyEn" rows="4">${escapeHtml(avm.aboutBodyEn || "")}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">विज़न शीर्षक (हिंदी)</label>
              <input class="form-control" name="visionTitleHi" value="${escapeHtml(avm.visionTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Vision Title (English)</label>
              <input class="form-control" name="visionTitleEn" value="${escapeHtml(avm.visionTitleEn || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">विज़न विवरण (हिंदी)</label>
              <textarea class="form-control" name="visionBodyHi" rows="3">${escapeHtml(avm.visionBodyHi || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Vision Statement (English)</label>
              <textarea class="form-control" name="visionBodyEn" rows="3">${escapeHtml(avm.visionBodyEn || "")}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">मिशन शीर्षक (हिंदी)</label>
              <input class="form-control" name="missionTitleHi" value="${escapeHtml(avm.missionTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Mission Title (English)</label>
              <input class="form-control" name="missionTitleEn" value="${escapeHtml(avm.missionTitleEn || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">मिशन बिंदु — प्रति पंक्ति 1 बिंदु (हिंदी)</label>
              <textarea class="form-control" name="missionPointsHi" rows="5">${escapeHtml((avm.missionPointsHi || []).join("\n"))}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Mission Points — One per line (English)</label>
              <textarea class="form-control" name="missionPointsEn" rows="5">${escapeHtml((avm.missionPointsEn || []).join("\n"))}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">प्रमाण-पत्र सेक्शन शीर्षक (हिंदी)</label>
              <input class="form-control" name="certSectionTitleHi" value="${escapeHtml(avm.certSectionTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Certificates Section Title (English)</label>
              <input class="form-control" name="certSectionTitleEn" value="${escapeHtml(avm.certSectionTitleEn || "")}" />
            </div>

            <div class="form-group">
              <label class="form-label">मुख्य कार्यकारिणी सेक्शन शीर्षक (हिंदी)</label>
              <input class="form-control" name="coreSectionTitleHi" value="${escapeHtml(avm.coreSectionTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Core Committee Section Title (English)</label>
              <input class="form-control" name="coreSectionTitleEn" value="${escapeHtml(avm.coreSectionTitleEn || "")}" />
            </div>
          </div>
          <button type="submit" class="btn btn-accent" style="margin-top:14px">💾 परिचय व विज़न-मिशन सेव करें</button>
        </form>

        <!-- 2. Organization Certificates Upload & Manager -->
        <div class="card-panel">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:6px">📜 2. संगठन को प्राप्त प्रमाण-पत्र (Certificates) अपलोड करें</h3>
          <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">आप जैसा प्रमाण-पत्र (Image या PDF) अपलोड करेंगे, वेबसाइट के 'About Us' पेज पर हूबहू वैसा ही साफ़ दिखाई देगा।</p>

          <form onsubmit="window.UPBMSAdmin.addCertificateForm(event)" style="background:#f8fafc;border:1.5px solid #cbd5e1;padding:16px;border-radius:14px;margin-bottom:20px">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">प्रमाण-पत्र का नाम (हिंदी) *</label>
                <input class="form-control" name="titleHi" required placeholder="उदा: सोसायटी पंजीकरण प्रमाण-पत्र" />
              </div>
              <div class="form-group">
                <label class="form-label">Certificate Title (English) *</label>
                <input class="form-control" name="titleEn" required placeholder="e.g. Society Registration Certificate" />
              </div>
              <div class="form-group">
                <label class="form-label">जारीकर्ता संस्था (हिंदी)</label>
                <input class="form-control" name="issuerHi" placeholder="उदा: निबंधक कार्यालय, लखनऊ" />
              </div>
              <div class="form-group">
                <label class="form-label">Issuing Authority (English)</label>
                <input class="form-control" name="issuerEn" placeholder="e.g. Registrar Office, Lucknow" />
              </div>
              <div class="form-group">
                <label class="form-label">प्रमाण-पत्र क्रमांक (वैकल्पिक)</label>
                <input class="form-control" name="regRef" placeholder="UP-REG-..." />
              </div>
              <div class="form-group">
                <label class="form-label">दिनांक</label>
                <input type="date" class="form-control" name="date" value="${new Date().toISOString().slice(0, 10)}" />
              </div>
              <div class="form-group full">
                <label class="form-label">प्रमाण-पत्र फाइल चुनें (Image या PDF) *</label>
                <input type="file" accept="image/*,application/pdf" onchange="window.UPBMSAdmin.uploadCertFile(event)" />
                <input type="hidden" name="fileUrl" id="newCertFileUrl" />
                <input type="hidden" name="fileType" id="newCertFileType" value="image" />
                <span id="newCertUploadStatus" style="font-size:0.82rem;font-weight:800;color:#15803d"></span>
              </div>
              <div class="form-group full">
                <label style="display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:0.85rem;color:#9a3412;cursor:pointer">
                  <input type="checkbox" name="requiresMemberLogin" />
                  <span>🔒 इस प्रमाण-पत्र पर पदाधिकारी का हस्ताक्षर/मुहर है — इसे केवल सदस्य लॉगिन के बाद दिखाएँ (Require Member Login)</span>
                </label>
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:12px">➕ प्रमाण-पत्र जोड़ें</button>
          </form>

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
            ${certs
              .map(
                (c) => `
              <div style="border:1.5px solid #cbd5e1;border-radius:12px;padding:12px;background:#ffffff;display:flex;flex-direction:column;justify-content:space-between;gap:10px">
                <div>
                  ${
                    c.fileType === "pdf" || String(c.fileUrl).endsWith(".pdf")
                      ? `<div style="height:130px;background:#eff6ff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#0a2252">📕 PDF Certificate</div>`
                      : `<img src="${escapeHtml(c.fileUrl)}" style="width:100%;height:150px;object-fit:contain;background:#f8fafc;border-radius:8px" alt="Cert" />`
                  }
                  <div style="font-weight:900;color:var(--primary);margin-top:8px">${escapeHtml(c.titleHi)}</div>
                  <div style="font-size:0.78rem;color:#64748b">${escapeHtml(c.titleEn || "")}</div>
                  <div style="margin-top:4px;font-size:0.75rem;font-weight:800;color:${c.requiresMemberLogin ? "#b45309" : "#15803d"}">
                    ${c.requiresMemberLogin ? "🔒 केवल सदस्य लॉगिन हेतु संरक्षित" : "🌐 सार्वजनिक दृश्य"}
                  </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openRawFileModal('certificate', '${c.id}')">👁️ देखें</button>
                  <button class="btn btn-outline btn-sm" onclick="window.UPBMSAdmin.toggleItemLoginLock('/api/certificates', '${c.id}', ${!c.requiresMemberLogin})">${c.requiresMemberLogin ? "🌐 सार्वजनिक करें" : "🔒 लॉगिन लॉक लगाएँ"}</button>
                  <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/certificates', '${c.id}', 'प्रमाण-पत्र हटाएँ?')">🗑️ हटाएँ</button>
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  async function saveAboutVmForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = Object.fromEntries(fd.entries());
    const aboutVisionMission = {
      ...raw,
      missionPointsHi: String(raw.missionPointsHi || "").split("\n").map((s) => s.trim()).filter(Boolean),
      missionPointsEn: String(raw.missionPointsEn || "").split("\n").map((s) => s.trim()).filter(Boolean)
    };
    await saveSettingsPatch({ aboutVisionMission }, "✅ 'हमारे बारे में' व विज़न-मिशन सेव हो गया!");
  }

  async function uploadCertFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const st = document.getElementById("newCertUploadStatus");
    if (st) st.textContent = "⏳ अपलोड हो रहा है...";
    try {
      const url = await uploadFileInput(file, 1400);
      document.getElementById("newCertFileUrl").value = url;
      document.getElementById("newCertFileType").value = file.type === "application/pdf" ? "pdf" : "image";
      if (st) st.textContent = "✓ फाइल तैयार है!";
    } catch (err) {
      if (st) st.textContent = "❌ " + err.message;
    }
  }

  async function addCertificateForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.requiresMemberLogin = Boolean(e.target.querySelector('[name="requiresMemberLogin"]')?.checked);
    if (!payload.fileUrl) {
      window.UPBMSApp.toast("⚠️ कृपया पहले प्रमाण-पत्र की इमेज या PDF फाइल चुनें!");
      return;
    }
    await fetch("/api/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ प्रमाण-पत्र सफलतापूर्वक अपलोड हो गया!");
  }

  // ==================== TAB 4: MULTI-OFFICER SIGNATURES & SEAL (SEPARATE + COMBINED MODES) ====================
  function renderSignaturesAndSealTab(state) {
    const s = state.settings;
    const list = s.signatories || [];
    const defaultIds = Array.isArray(s.defaultSignatoryIds) && s.defaultSignatoryIds.length
      ? s.defaultSignatoryIds
      : [s.defaultSignatoryId || "sig-gs"];

    return `
      <div style="display:grid;gap:22px">
        <!-- 1. Central Seal & Default Multi-Signatory Selector -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveCentralSealAndDefaults(event)">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:8px">
            🏛️ 1. केंद्रीय आधिकारिक मुहर (Separate Seal) एवं डिफ़ॉल्ट हस्ताक्षरकर्ता पदाधिकारी
          </h3>
          <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">
            आप यहाँ <b>अलग मुहर इमेज</b> रख सकते हैं और साथ ही नीचे प्रत्येक पदाधिकारी के लिए <b>अलग साइन इमेज</b> या <b>मुहर+साइन एक साथ (Combined Single Image)</b> दोनों में से कोई भी विकल्प चुन सकते हैं! पत्रों पर एक साथ कई पदाधिकारियों के डिफ़ॉल्ट साइन भी टिक कर सकते हैं।
          </p>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">केंद्रीय गोल मुहर इमेज (PNG/SVG)</label>
              <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <img src="${escapeHtml(s.sealImageUrl || "/images/official-seal.svg")}" id="sealPreviewImg" style="width:76px;height:76px;object-fit:contain;border:1px solid #cbd5e1;border-radius:10px;padding:4px;background:#fff" alt="Seal" />
                <div>
                  <input type="file" accept="image/*" onchange="window.UPBMSAdmin.handleSealUpload(event)" />
                  <input type="hidden" name="sealImageUrl" id="sealImageUrlInput" value="${escapeHtml(s.sealImageUrl || "/images/official-seal.svg")}" />
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">मुहर के नीचे का लेबल (हिंदी व English)</label>
              <input class="form-control" name="sealLabelHi" value="${escapeHtml(s.sealLabelHi || "आधिकारिक संघ मुहर")}" placeholder="हिंदी लेबल" style="margin-bottom:8px" />
              <input class="form-control" name="sealLabelEn" value="${escapeHtml(s.sealLabelEn || "Official Association Seal")}" placeholder="English Label" />
            </div>

            <div class="form-group full" style="background:#fff7ed;border:1.5px solid #fed7aa;padding:14px;border-radius:12px">
              <label class="form-label" style="margin-bottom:8px">✍️ पत्रों व दस्तावेज़ों पर डिफ़ॉल्ट हस्ताक्षरकर्ता पदाधिकारी चुनें (1 या एक से अधिक टिक करें):</label>
              <div style="display:flex;flex-wrap:wrap;gap:12px">
                ${list
                  .map(
                    (sig) => `
                  <label style="display:inline-flex;align-items:center;gap:7px;padding:7px 12px;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:9px;font-weight:800;cursor:pointer">
                    <input type="checkbox" name="defaultSigCheck" value="${escapeHtml(sig.id)}" ${defaultIds.includes(sig.id) ? "checked" : ""} />
                    <span>${escapeHtml(sig.nameHi)} (${escapeHtml(sig.designationHi)})</span>
                  </label>`
                  )
                  .join("")}
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-accent" style="margin-top:14px">💾 केंद्रीय मुहर व डिफ़ॉल्ट हस्ताक्षरकर्ता सेव करें</button>
        </form>

        <!-- 2. Individual Officer Cards (Separate vs Combined Stamp+Signature) -->
        <div class="card-panel">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:14px">
            ✍️ 2. अधिकृत पदाधिकारी सूची — अलग साइन इमेज एवं मुहर+साइन मर्ज (Combined) इमेज सेटिंग
          </h3>

          <div style="display:grid;gap:18px;margin-bottom:24px">
            ${list
              .map(
                (sig, idx) => `
              <form onsubmit="window.UPBMSAdmin.updateOfficerRow(event, ${idx})" style="border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;background:#f8fafc">
                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">पदाधिकारी का नाम (हिंदी)</label>
                    <input class="form-control" name="nameHi" value="${escapeHtml(sig.nameHi)}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Officer Name (English)</label>
                    <input class="form-control" name="nameEn" value="${escapeHtml(sig.nameEn)}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">पदनाम (हिंदी)</label>
                    <input class="form-control" name="designationHi" value="${escapeHtml(sig.designationHi)}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Designation (English)</label>
                    <input class="form-control" name="designationEn" value="${escapeHtml(sig.designationEn)}" required />
                  </div>

                  <div class="form-group full">
                    <label class="form-label">हस्ताक्षर डिस्प्ले मोड चुनें (Separate बनाम Combined):</label>
                    <select class="form-control" name="signatureMode">
                      <option value="separate" ${sig.signatureMode !== "combined" ? "selected" : ""}>विकल्प 1 (अलग-अलग): केंद्रीय मुहर + अलग हस्ताक्षर इमेज दिखाएँ</option>
                      <option value="combined" ${sig.signatureMode === "combined" ? "selected" : ""}>विकल्प 2 (एक साथ): मुहर और हस्ताक्षर वाली एक ही इमेज (Combined Image) दिखाएँ</option>
                    </select>
                  </div>

                  <div class="form-group" style="background:#ffffff;padding:12px;border-radius:10px;border:1px solid #e2e8f0">
                    <label class="form-label">A) केवल हस्ताक्षर इमेज (Separate Signature)</label>
                    ${sig.signatureUrl ? `<img src="${escapeHtml(sig.signatureUrl)}" style="height:46px;object-fit:contain;margin-bottom:6px" alt="Sig" />` : `<div style="font-size:0.78rem;color:#94a3b8">कोई इमेज नहीं</div>`}
                    <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadOfficerImg(event, ${idx}, 'separate')" />
                    <input type="hidden" name="signatureUrl" id="offSep_${idx}" value="${escapeHtml(sig.signatureUrl || "")}" />
                  </div>

                  <div class="form-group" style="background:#ffffff;padding:12px;border-radius:10px;border:1px solid #e2e8f0">
                    <label class="form-label">B) मुहर + हस्ताक्षर एक साथ (Combined Single Image)</label>
                    ${sig.combinedStampSigUrl ? `<img src="${escapeHtml(sig.combinedStampSigUrl)}" style="height:58px;object-fit:contain;margin-bottom:6px" alt="Combined" />` : `<div style="font-size:0.78rem;color:#94a3b8">कोई संयुक्त इमेज अपलोड नहीं</div>`}
                    <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadOfficerImg(event, ${idx}, 'combined')" />
                    <input type="hidden" name="combinedStampSigUrl" id="offComb_${idx}" value="${escapeHtml(sig.combinedStampSigUrl || "")}" />
                  </div>
                </div>

                <div style="display:flex;justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:8px">
                  <button type="submit" class="btn btn-primary btn-sm">💾 इस पदाधिकारी को अपडेट करें</button>
                  ${
                    list.length > 1
                      ? `<button type="button" class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteOfficer(${idx})">🗑️ हटाएँ</button>`
                      : ""
                  }
                </div>
              </form>`
              )
              .join("")}
          </div>

          <!-- Add New Officer -->
          <form onsubmit="window.UPBMSAdmin.addNewOfficer(event)" style="border:2px dashed #94a3b8;padding:16px;border-radius:14px">
            <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">➕ नया हस्ताक्षरकर्ता पदाधिकारी जोड़ें</h4>
            <div class="form-grid">
              <input class="form-control" name="nameHi" placeholder="नाम (हिंदी) *" required />
              <input class="form-control" name="nameEn" placeholder="Name (English) *" required />
              <input class="form-control" name="designationHi" placeholder="पदनाम (हिंदी) — उदा: प्रदेश उपाध्यक्ष *" required />
              <input class="form-control" name="designationEn" placeholder="Designation (English) *" required />
              <div class="form-group">
                <label class="form-label">अलग हस्ताक्षर इमेज</label>
                <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadNewOffImg(event, 'newOffSep')" />
                <input type="hidden" name="signatureUrl" id="newOffSep" />
              </div>
              <div class="form-group">
                <label class="form-label">मुहर+साइन संयुक्त इमेज (वैकल्पिक)</label>
                <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadNewOffImg(event, 'newOffComb')" />
                <input type="hidden" name="combinedStampSigUrl" id="newOffComb" />
              </div>
            </div>
            <button type="submit" class="btn btn-accent btn-sm" style="margin-top:12px">➕ पदाधिकारी सूची में जोड़ें</button>
          </form>
        </div>
      </div>
    `;
  }

  async function handleSealUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFileInput(file, 600);
    document.getElementById("sealImageUrlInput").value = url;
    document.getElementById("sealPreviewImg").src = url;
    window.UPBMSApp.toast("✓ नई मुहर इमेज तैयार है, 'सेव करें' दबाएँ!");
  }

  async function saveCentralSealAndDefaults(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const checked = Array.from(e.target.querySelectorAll('[name="defaultSigCheck"]:checked')).map((el) => el.value);
    const defaultSignatoryIds = checked.length ? checked : [window.UPBMSApp.getState().settings.signatories?.[0]?.id || "sig-gs"];
    await saveSettingsPatch(
      {
        sealImageUrl: fd.get("sealImageUrl"),
        sealLabelHi: fd.get("sealLabelHi"),
        sealLabelEn: fd.get("sealLabelEn"),
        defaultSignatoryIds,
        defaultSignatoryId: defaultSignatoryIds[0]
      },
      "✅ मुहर एवं डिफ़ॉल्ट हस्ताक्षरकर्ता सेव हो गए!"
    );
  }

  async function uploadOfficerImg(e, idx, kind) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFileInput(file, 700);
    const targetId = kind === "combined" ? `offComb_${idx}` : `offSep_${idx}`;
    document.getElementById(targetId).value = url;
    window.UPBMSApp.toast("✓ इमेज अपलोड हो गई, अब 'अपडेट करें' बटन दबाएँ!");
  }

  async function uploadNewOffImg(e, hiddenId) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFileInput(file, 700);
    document.getElementById(hiddenId).value = url;
    window.UPBMSApp.toast("✓ इमेज तैयार है!");
  }

  async function updateOfficerRow(e, idx) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = Object.fromEntries(fd.entries());
    const list = [...(window.UPBMSApp.getState().settings.signatories || [])];
    list[idx] = { ...list[idx], ...raw };
    await saveSettingsPatch({ signatories: list }, "✅ पदाधिकारी हस्ताक्षर विवरण अपडेट हो गया!");
  }

  function deleteOfficer(idx) {
    askActionConfirm("क्या आप इस पदाधिकारी को हस्ताक्षर सूची से हटाना चाहते हैं?", async () => {
      const list = [...(window.UPBMSApp.getState().settings.signatories || [])];
      list.splice(idx, 1);
      await saveSettingsPatch({ signatories: list }, "🗑️ पदाधिकारी हटाया गया।");
    });
  }

  async function addNewOfficer(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const raw = Object.fromEntries(fd.entries());
    const list = [...(window.UPBMSApp.getState().settings.signatories || [])];
    list.push({
      id: "sig-" + Date.now(),
      nameHi: raw.nameHi,
      nameEn: raw.nameEn,
      designationHi: raw.designationHi,
      designationEn: raw.designationEn,
      signatureMode: raw.combinedStampSigUrl && !raw.signatureUrl ? "combined" : "separate",
      signatureUrl: raw.signatureUrl || "/images/sig-gs.svg",
      combinedStampSigUrl: raw.combinedStampSigUrl || ""
    });
    await saveSettingsPatch({ signatories: list }, "✅ नया हस्ताक्षरकर्ता पदाधिकारी जुड़ गया!");
  }

  // ==================== TAB 5: LETTER / ID / RECEIPT BACKGROUNDS & TERMS & CONDITIONS ====================
  function renderTemplateBgAndTermsTab(state) {
    const bg = state.settings.templateBackgrounds || {};
    const lBg = bg.letter || {};
    const iBg = bg.idcard || {};
    const rBg = bg.receipt || {};
    const lt = state.settings.letterTemplateText || {};
    const tc = state.settings.termsAndConditions || {};

    return `
      <div style="display:grid;gap:22px">
        <!-- 1. Backgrounds Customizer for Letter, ID Card & Receipt -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveTemplateBackgroundsForm(event)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <div>
              <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary)">🎨 1. लेटर, पहचान पत्र (ID) एवं रसीद का बैकग्राउंड बदलें</h3>
              <p style="font-size:0.84rem;color:#475569">डिफ़ॉल्ट डिज़ाइन सेट है; आप चाहें तो कस्टम बैकग्राउंड कलर या बैकग्राउंड इमेज अपलोड कर सकते हैं अथवा कभी भी डिफ़ॉल्ट पर रीसेट कर सकते हैं।</p>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="window.UPBMSAdmin.resetTemplateBackgrounds()">🔄 डिफ़ॉल्ट बैकग्राउंड रीसेट करें</button>
          </div>

          <div style="display:grid;gap:18px">
            <!-- Letter Background -->
            <div style="border:1.5px solid #cbd5e1;border-radius:12px;padding:15px;background:#f8fafc">
              <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">📄 A) नियुक्ति पत्र एवं संघ दस्तावेज़ (Letter) बैकग्राउंड</h4>
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">पेज बैकग्राउंड रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="letter_bgColor" value="${escapeHtml(lBg.bgColor || "#ffffff")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">हेडर व एक्सेंट रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="letter_headerColor" value="${escapeHtml(lBg.headerColor || "#0a2252")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">बॉर्डर रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="letter_borderColor" value="${escapeHtml(lBg.borderColor || "#c59b27")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">बैकग्राउंड इमेज पारदर्शिता (0.05 - 0.50)</label>
                  <input type="number" step="0.02" min="0" max="1" class="form-control" name="letter_bgOpacity" value="${lBg.bgOpacity ?? 0.14}" />
                </div>
                <div class="form-group full">
                  <label class="form-label">कस्टम लेटर बैकग्राउंड इमेज अपलोड करें (वैकल्पिक)</label>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadBgImg(event, 'letterBgUrlInput')" />
                    <input class="form-control" style="flex:1" name="letter_bgImageUrl" id="letterBgUrlInput" value="${escapeHtml(lBg.bgImageUrl || "")}" placeholder="खाली रखने पर डिफ़ॉल्ट क्लीन बैकग्राउंड रहेगा" />
                  </div>
                </div>
              </div>
            </div>

            <!-- ID Card Background -->
            <div style="border:1.5px solid #cbd5e1;border-radius:12px;padding:15px;background:#f8fafc">
              <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">🪪 B) पहचान पत्र (ID Card) बैकग्राउंड</h4>
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">फ्रंट कार्ड बैकग्राउंड रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="id_frontBgColor" value="${escapeHtml(iBg.frontBgColor || "#ffffff")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">कार्ड हेडर पट्टी रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="id_headerColor" value="${escapeHtml(iBg.headerColor || "#0a2252")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">बैक कार्ड बैकग्राउंड रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="id_backBgColor" value="${escapeHtml(iBg.backBgColor || "#ffffff")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">बैकग्राउंड इमेज पारदर्शिता</label>
                  <input type="number" step="0.02" min="0" max="1" class="form-control" name="id_bgOpacity" value="${iBg.bgOpacity ?? 0.15}" />
                </div>
                <div class="form-group full">
                  <label class="form-label">कस्टम ID कार्ड बैकग्राउंड इमेज (वैकल्पिक)</label>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadBgImg(event, 'idBgUrlInput')" />
                    <input class="form-control" style="flex:1" name="id_bgImageUrl" id="idBgUrlInput" value="${escapeHtml(iBg.bgImageUrl || "")}" placeholder="खाली रखने पर डिफ़ॉल्ट बैकग्राउंड रहेगा" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Receipt Background -->
            <div style="border:1.5px solid #cbd5e1;border-radius:12px;padding:15px;background:#f8fafc">
              <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">🧾 C) शुल्क व डोनेशन रसीद (Receipt) बैकग्राउंड</h4>
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">रसीद बैकग्राउंड रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="rcp_bgColor" value="${escapeHtml(rBg.bgColor || "#ffffff")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">रसीद हेडर रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="rcp_headerColor" value="${escapeHtml(rBg.headerColor || "#0a2252")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">रसीद बॉर्डर रंग</label>
                  <input type="color" class="form-control" style="height:42px;padding:4px" name="rcp_borderColor" value="${escapeHtml(rBg.borderColor || "#cbd5e1")}" />
                </div>
                <div class="form-group">
                  <label class="form-label">बैकग्राउंड इमेज पारदर्शिता</label>
                  <input type="number" step="0.02" min="0" max="1" class="form-control" name="rcp_bgOpacity" value="${rBg.bgOpacity ?? 0.12}" />
                </div>
                <div class="form-group full">
                  <label class="form-label">कस्टम रसीद बैकग्राउंड इमेज (वैकल्पिक)</label>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadBgImg(event, 'rcpBgUrlInput')" />
                    <input class="form-control" style="flex:1" name="rcp_bgImageUrl" id="rcpBgUrlInput" value="${escapeHtml(rBg.bgImageUrl || "")}" placeholder="खाली रखने पर डिफ़ॉल्ट बैकग्राउंड रहेगा" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-accent" style="margin-top:16px">💾 तीनों बैकग्राउंड सेटिंग्स सेव करें</button>
        </form>

        <!-- 2. Membership Terms & Conditions Editor -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveTermsForm(event)">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:8px">📜 2. सदस्यता पंजीकरण के नियम एवं शर्तें (Terms & Conditions)</h3>
          <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">सदस्यता लेते समय प्रत्येक आवेदक को इन शर्तों को टिक करना अनिवार्य है। इसे हिंदी व English दोनों में संपादित करें:</p>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">शीर्षक (हिंदी)</label>
              <input class="form-control" name="titleHi" value="${escapeHtml(tc.titleHi || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Terms Heading (English)</label>
              <input class="form-control" name="titleEn" value="${escapeHtml(tc.titleEn || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">नियम एवं शर्तें विवरण (हिंदी)</label>
              <textarea class="form-control" name="contentHi" rows="6" required>${escapeHtml(tc.contentHi || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Terms & Conditions Body (English)</label>
              <textarea class="form-control" name="contentEn" rows="6" required>${escapeHtml(tc.contentEn || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">अनिवार्य टिक-बॉक्स वाक्य (हिंदी)</label>
              <input class="form-control" name="checkboxLabelHi" value="${escapeHtml(tc.checkboxLabelHi || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Mandatory Checkbox Label (English)</label>
              <input class="form-control" name="checkboxLabelEn" value="${escapeHtml(tc.checkboxLabelEn || "")}" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:14px">💾 नियम एवं शर्तें सेव करें</button>
        </form>

        <!-- 3. Appointment Letter & ID Card Text Editor -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveLetterTextForm(event)">
          <h3 style="font-size:1.12rem;font-weight:900;color:var(--primary);margin-bottom:12px">📝 3. नियुक्ति पत्र व पहचान पत्र के आंतरिक वाक्य (हिंदी व English)</h3>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">नियुक्ति पत्र शीर्षक (हिंदी)</label>
              <input class="form-control" name="docTitleHi" value="${escapeHtml(lt.docTitleHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Certificate Heading (English)</label>
              <input class="form-control" name="docTitleEn" value="${escapeHtml(lt.docTitleEn || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">विषय पंक्ति (हिंदी)</label>
              <input class="form-control" name="subjectHi" value="${escapeHtml(lt.subjectHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Subject Line (English)</label>
              <input class="form-control" name="subjectEn" value="${escapeHtml(lt.subjectEn || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">मुख्य अनुच्छेद (हिंदी)</label>
              <textarea class="form-control" name="bodyParaHi" rows="3">${escapeHtml(lt.bodyParaHi || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Main Paragraph (English)</label>
              <textarea class="form-control" name="bodyParaEn" rows="3">${escapeHtml(lt.bodyParaEn || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">ID कार्ड पीछे के निर्देश (हिंदी)</label>
              <textarea class="form-control" name="idBackRulesHi" rows="3">${escapeHtml(lt.idBackRulesHi || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">ID Card Back Guidelines (English)</label>
              <textarea class="form-control" name="idBackRulesEn" rows="3">${escapeHtml(lt.idBackRulesEn || "")}</textarea>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:14px">💾 पत्र व कार्ड शब्दावली सेव करें</button>
        </form>
      </div>
    `;
  }

  async function uploadBgImg(e, inputId) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFileInput(file, 1400);
    document.getElementById(inputId).value = url;
    window.UPBMSApp.toast("✓ बैकग्राउंड इमेज तैयार है, सेव बटन दबाएँ!");
  }

  async function saveTemplateBackgroundsForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = Object.fromEntries(fd.entries());
    const templateBackgrounds = {
      letter: {
        bgColor: r.letter_bgColor,
        headerColor: r.letter_headerColor,
        borderColor: r.letter_borderColor,
        bgOpacity: Number(r.letter_bgOpacity || 0.14),
        bgImageUrl: r.letter_bgImageUrl,
        watermarkOpacity: 0.05
      },
      idcard: {
        frontBgColor: r.id_frontBgColor,
        headerColor: r.id_headerColor,
        backBgColor: r.id_backBgColor,
        bgOpacity: Number(r.id_bgOpacity || 0.15),
        bgImageUrl: r.id_bgImageUrl
      },
      receipt: {
        bgColor: r.rcp_bgColor,
        headerColor: r.rcp_headerColor,
        borderColor: r.rcp_borderColor,
        bgOpacity: Number(r.rcp_bgOpacity || 0.12),
        bgImageUrl: r.rcp_bgImageUrl
      }
    };
    await saveSettingsPatch({ templateBackgrounds }, "✅ लेटर, पहचान पत्र व रसीद बैकग्राउंड सेव हो गए!");
  }

  function resetTemplateBackgrounds() {
    askActionConfirm("क्या आप लेटर, ID कार्ड और रसीद तीनों का बैकग्राउंड पुनः डिफ़ॉल्ट करना चाहते हैं?", async () => {
      await saveSettingsPatch(
        {
          templateBackgrounds: {
            letter: { bgColor: "#ffffff", headerColor: "#0a2252", borderColor: "#c59b27", bgImageUrl: "", bgOpacity: 0.14, watermarkOpacity: 0.05 },
            idcard: { frontBgColor: "#ffffff", headerColor: "#0a2252", backBgColor: "#ffffff", bgImageUrl: "", bgOpacity: 0.15 },
            receipt: { bgColor: "#ffffff", headerColor: "#0a2252", borderColor: "#cbd5e1", bgImageUrl: "", bgOpacity: 0.12 }
          }
        },
        "✅ डिफ़ॉल्ट बैकग्राउंड पुनः लागू कर दिया गया!"
      );
    });
  }

  async function saveTermsForm(e) {
    e.preventDefault();
    const termsAndConditions = Object.fromEntries(new FormData(e.target).entries());
    await saveSettingsPatch({ termsAndConditions }, "✅ सदस्यता नियम एवं शर्तें अपडेट हो गईं!");
  }

  async function saveLetterTextForm(e) {
    e.preventDefault();
    const prev = window.UPBMSApp.getState().settings.letterTemplateText || {};
    const patch = Object.fromEntries(new FormData(e.target).entries());
    await saveSettingsPatch({ letterTemplateText: { ...prev, ...patch } }, "✅ नियुक्ति पत्र व कार्ड शब्दावली सेव हो गई!");
  }

  // ==================== TAB 6: HERO SLIDER, CAMPAIGN & 4 STAT BOXES ====================
  function renderHeroCampaignStatsTab(state) {
    const cb = state.settings.campaignBlock || {};
    const stats = state.settings.statCards || [];

    return `
      <div style="display:grid;gap:22px">
        <div class="card-panel">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:12px">🖼️ 1. मुख्य बैनर स्लाइडर (स्पष्ट अनुपात बिना कटे)</h3>

          <form onsubmit="window.UPBMSAdmin.addSlideForm(event)" style="background:#f8fafc;border:1.5px solid #cbd5e1;padding:15px;border-radius:12px;margin-bottom:18px">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">स्लाइड कैप्शन (हिंदी)</label>
                <input class="form-control" name="captionHi" required placeholder="हिंदी कैप्शन" />
              </div>
              <div class="form-group">
                <label class="form-label">Slide Caption (English)</label>
                <input class="form-control" name="captionEn" required placeholder="English Caption" />
              </div>
              <div class="form-group">
                <label class="form-label">इमेज फिट विकल्प</label>
                <select class="form-control" name="fitMode">
                  <option value="cover">Cover (फुल बैनर)</option>
                  <option value="contain">Contain (पूरी इमेज फिट)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">बैनर इमेज अपलोड करें *</label>
                <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadGenericImg(event, 'newSlideUrl')" />
                <input type="hidden" name="imageUrl" id="newSlideUrl" />
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="margin-top:10px">➕ नई स्लाइड जोड़ें</button>
          </form>

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px">
            ${state.slides
              .map(
                (sl) => `
              <div style="border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff">
                <img src="${escapeHtml(sl.imageUrl)}" style="width:100%;aspect-ratio:16/9;object-fit:${sl.fitMode === "contain" ? "contain" : "cover"};background:#040d21" alt="Slide" />
                <div style="padding:12px">
                  <div style="font-weight:800;font-size:0.88rem">${escapeHtml(sl.captionHi)}</div>
                  <div style="font-size:0.78rem;color:#64748b;margin-bottom:8px">${escapeHtml(sl.captionEn || "")}</div>
                  <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/slides', '${sl.id}', 'यह स्लाइड हटाएँ?')">🗑️ हटाएँ</button>
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>

        <!-- Below-Slider Campaign & 4 Highlight Stat Boxes -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveCampaignAndStatsForm(event)">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:8px">🎯 2. स्लाइडर के नीचे का मुख्य अभियान संदेश एवं 4 हाइलाइट बॉक्स</h3>
          <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">स्लाइडर के ठीक नीचे दिखने वाला अभियान संदेश, तीनों बटन और चारों आंकड़ों वाले बॉक्स यहाँ से हिंदी व English दोनों में बदलें:</p>

          <div class="form-grid" style="margin-bottom:18px">
            <div class="form-group">
              <label class="form-label">अभियान बैज (हिंदी)</label>
              <input class="form-control" name="badgeHi" value="${escapeHtml(cb.badgeHi || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">Campaign Badge (English)</label>
              <input class="form-control" name="badgeEn" value="${escapeHtml(cb.badgeEn || "")}" />
            </div>
            <div class="form-group">
              <label class="form-label">मुख्य शीर्षक (हिंदी)</label>
              <input class="form-control" name="titleHi" value="${escapeHtml(cb.titleHi || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Main Headline (English)</label>
              <input class="form-control" name="titleEn" value="${escapeHtml(cb.titleEn || "")}" required />
            </div>
            <div class="form-group">
              <label class="form-label">उप-शीर्षक (हिंदी)</label>
              <textarea class="form-control" name="subtitleHi" rows="2">${escapeHtml(cb.subtitleHi || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Subtitle (English)</label>
              <textarea class="form-control" name="subtitleEn" rows="2">${escapeHtml(cb.subtitleEn || "")}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">बटन 1 नाम (हिंदी | English)</label>
              <div style="display:flex;gap:8px">
                <input class="form-control" name="btn1Hi" value="${escapeHtml(cb.btn1Hi || "")}" />
                <input class="form-control" name="btn1En" value="${escapeHtml(cb.btn1En || "")}" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">बटन 2 नाम (हिंदी | English)</label>
              <div style="display:flex;gap:8px">
                <input class="form-control" name="btn2Hi" value="${escapeHtml(cb.btn2Hi || "")}" />
                <input class="form-control" name="btn2En" value="${escapeHtml(cb.btn2En || "")}" />
              </div>
            </div>
            <div class="form-group full">
              <label class="form-label">बटन 3 नाम (हिंदी | English)</label>
              <div style="display:flex;gap:8px">
                <input class="form-control" name="btn3Hi" value="${escapeHtml(cb.btn3Hi || "")}" />
                <input class="form-control" name="btn3En" value="${escapeHtml(cb.btn3En || "")}" />
              </div>
            </div>
          </div>

          <h4 style="font-weight:900;color:var(--primary);margin-bottom:10px">📊 चारों हाइलाइट बॉक्स (Stat Cards):</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
            ${[0, 1, 2, 3]
              .map((i) => {
                const st = stats[i] || { icon: "⭐", valueHi: "", valueEn: "", labelHi: "", labelEn: "" };
                return `
                  <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px;border-radius:10px;display:grid;gap:8px">
                    <div style="font-weight:900;color:var(--accent)">बॉक्स #${i + 1}</div>
                    <input class="form-control" name="st_icon_${i}" value="${escapeHtml(st.icon)}" placeholder="आइकॉन" />
                    <input class="form-control" name="st_valHi_${i}" value="${escapeHtml(st.valueHi)}" placeholder="मुख्य संख्या (हिंदी)" />
                    <input class="form-control" name="st_valEn_${i}" value="${escapeHtml(st.valueEn)}" placeholder="Value (English)" />
                    <input class="form-control" name="st_lblHi_${i}" value="${escapeHtml(st.labelHi)}" placeholder="विवरण (हिंदी)" />
                    <input class="form-control" name="st_lblEn_${i}" value="${escapeHtml(st.labelEn)}" placeholder="Label (English)" />
                  </div>`;
              })
              .join("")}
          </div>

          <button type="submit" class="btn btn-accent" style="margin-top:16px">💾 अभियान व चारों बॉक्स सेव करें</button>
        </form>
      </div>
    `;
  }

  async function addSlideForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    if (!payload.imageUrl) {
      window.UPBMSApp.toast("⚠️ कृपया बैनर इमेज चुनें!");
      return;
    }
    payload.active = true;
    payload.order = (window.UPBMSApp.getState().slides.length || 0) + 1;
    await fetch("/api/slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ नई स्लाइड जुड़ गई!");
  }

  async function saveCampaignAndStatsForm(e) {
    e.preventDefault();
    const r = Object.fromEntries(new FormData(e.target).entries());
    const prevCb = window.UPBMSApp.getState().settings.campaignBlock || {};
    const campaignBlock = {
      ...prevCb,
      badgeHi: r.badgeHi, badgeEn: r.badgeEn,
      titleHi: r.titleHi, titleEn: r.titleEn,
      subtitleHi: r.subtitleHi, subtitleEn: r.subtitleEn,
      btn1Hi: r.btn1Hi, btn1En: r.btn1En,
      btn2Hi: r.btn2Hi, btn2En: r.btn2En,
      btn3Hi: r.btn3Hi, btn3En: r.btn3En
    };
    const statCards = [0, 1, 2, 3].map((i) => ({
      id: `st-${i + 1}`,
      icon: r[`st_icon_${i}`],
      valueHi: r[`st_valHi_${i}`],
      valueEn: r[`st_valEn_${i}`],
      labelHi: r[`st_lblHi_${i}`],
      labelEn: r[`st_lblEn_${i}`]
    }));
    await saveSettingsPatch({ campaignBlock, statCards }, "✅ अभियान व चारों हाइलाइट बॉक्स अपडेट हो गए!");
  }

  // ==================== TAB 7: MEMBERS MANAGEMENT, FULL EDIT & PASSWORD RESET + MASTER LISTS ====================
  function renderMembersAdminTab(state) {
    const filtered = state.members.filter((m) => {
      if (memberFilter === "core" && !m.isCoreMember) return false;
      if (memberFilter === "general" && m.isCoreMember) return false;
      if (memberFilter === "pending" && m.status !== "pending") return false;
      if (memberAdminSearch) {
        const q = memberAdminSearch.toLowerCase();
        if (!`${m.nameHi} ${m.nameEn} ${m.memberCode} ${m.mobile} ${m.district} ${m.koCode}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return `
      <div style="display:grid;gap:22px">
        <div class="card-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
            <div>
              <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary)">👥 सदस्य प्रबंधन — पूर्ण विवरण संशोधन एवं पासवर्ड रीसेट</h3>
              <p style="font-size:0.84rem;color:#475569">किसी भी सदस्य की पूरी डिटेल मॉडिफाई करें, पदनाम/Core श्रेणी बदलें या पासवर्ड भूल जाने पर नया पासवर्ड सेट करें।</p>
            </div>
            <button class="btn btn-accent btn-sm" onclick="window.UPBMSAdmin.openAddMemberModal()">➕ नया सदस्य / पदाधिकारी जोड़ें</button>
          </div>

          <div class="filter-bar">
            <input class="form-control" style="flex:1;min-width:200px" placeholder="नाम, Member ID, मोबाइल या जनपद खोजें..." value="${escapeHtml(memberAdminSearch)}" oninput="window.UPBMSAdmin.setMemberSearch(this.value)" />
            <select class="form-control" style="max-width:220px" onchange="window.UPBMSAdmin.setMemberFilter(this.value)">
              <option value="all" ${memberFilter === "all" ? "selected" : ""}>सभी सदस्य (${state.members.length})</option>
              <option value="core" ${memberFilter === "core" ? "selected" : ""}>👑 प्रदेश मुख्य कार्यकारिणी</option>
              <option value="general" ${memberFilter === "general" ? "selected" : ""}>👤 जिला व सामान्य सदस्य</option>
              <option value="pending" ${memberFilter === "pending" ? "selected" : ""}>⏳ लंबित आवेदन</option>
            </select>
          </div>

          <div class="admin-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID / श्रेणी</th>
                  <th>नाम एवं पदनाम</th>
                  <th>जनपद व बैंक</th>
                  <th>मोबाइल</th>
                  <th>स्थिति</th>
                  <th>कार्यवाही (संशोधन / पासवर्ड रीसेट)</th>
                </tr>
              </thead>
              <tbody>
                ${filtered
                  .map(
                    (m) => `
                  <tr>
                    <td>
                      <b>${escapeHtml(m.memberCode)}</b><br/>
                      ${m.isCoreMember ? `<span class="badge" style="background:#fef3c7;color:#b45309">★ CORE</span>` : `<span style="font-size:0.75rem;color:#64748b">सामान्य/जिला</span>`}
                    </td>
                    <td>
                      <b>${escapeHtml(m.nameHi)}</b><br/>
                      <span style="font-size:0.78rem;color:#475569">${escapeHtml(m.nameEn)}</span><br/>
                      <span style="font-size:0.78rem;color:var(--accent);font-weight:800">${escapeHtml(m.designationHi)}</span>
                    </td>
                    <td>${escapeHtml(m.district)}<br/><span style="font-size:0.76rem;color:#64748b">${escapeHtml(m.bankName)} (${escapeHtml(m.koCode)})</span></td>
                    <td>${escapeHtml(m.mobile)}</td>
                    <td>
                      <span class="badge badge-${m.status === "active" ? "active" : m.status === "pending" ? "pending" : "suspended"}">
                        ${m.status === "active" ? "सक्रिय" : m.status === "pending" ? "लंबित" : "निलंबित"}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex;flex-wrap:wrap;gap:6px">
                        ${m.status !== "active" ? `<button class="btn btn-whatsapp btn-sm" onclick="window.UPBMSAdmin.quickApproveMember('${m.id}')">✓ स्वीकृत</button>` : ""}
                        <button class="btn btn-primary btn-sm" onclick="window.UPBMSAdmin.openEditMemberModal('${m.id}')">✏️ संशोधित करें</button>
                        <button class="btn btn-outline btn-sm" onclick="window.UPBMSAdmin.openResetPasswordModal('${m.id}')">🔑 पासवर्ड रीसेट</button>
                        <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openMemberDocsModal('${m.id}')">🪪 पत्र/ID</button>
                        <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/members', '${m.id}', 'इस सदस्य रिकॉर्ड को हटाएँ?')">🗑️</button>
                      </div>
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Master Dropdown Lists Editor (Districts, Banks, BC Companies) -->
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveMasterListsForm(event)">
          <h3 style="font-size:1.1rem;font-weight:900;color:var(--primary);margin-bottom:8px">🗂️ मास्टर ड्रॉपडाउन सूचियाँ (जनपद, बैंक एवं कॉर्पोरेट बीसी कंपनियाँ)</h3>
          <p style="font-size:0.82rem;color:#475569;margin-bottom:12px">फॉर्म में दिखने वाले जनपद, बैंक और बीसी कंपनियों की सूची में नया नाम जोड़ें या संशोधित करें (प्रति पंक्ति एक नाम):</p>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">बैंक सूची (${state.meta.banks.length})</label>
              <textarea class="form-control" name="banks" rows="5">${escapeHtml(state.meta.banks.join("\n"))}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">बीसी कंपनी सूची (${state.meta.bcCompanies.length})</label>
              <textarea class="form-control" name="bcCompanies" rows="5">${escapeHtml(state.meta.bcCompanies.join("\n"))}</textarea>
            </div>
            <div class="form-group full">
              <label class="form-label">जनपद सूची (${state.meta.districts.length})</label>
              <textarea class="form-control" name="districts" rows="4">${escapeHtml(state.meta.districts.join("\n"))}</textarea>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm" style="margin-top:12px">💾 मास्टर सूचियाँ सेव करें</button>
        </form>
      </div>
    `;
  }

  function setMemberFilter(v) { memberFilter = v; window.UPBMSApp.rerender(); }
  function setMemberSearch(v) { memberAdminSearch = v; window.UPBMSApp.rerender(); }

  async function quickApproveMember(id) {
    await fetch(`/api/members/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" })
    });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ सदस्य आवेदन स्वीकृत कर दिया गया!");
  }

  function openResetPasswordModal(memberId) {
    const state = window.UPBMSApp.getState();
    const m = state.members.find((x) => x.id === memberId);
    if (!m) return;
    document.getElementById("modalRoot").innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="max-width:460px">
          <div class="modal-header">
            <h3 style="font-size:1rem;font-weight:900">🔑 सदस्य पासवर्ड रीसेट करें</h3>
            <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕</button>
          </div>
          <form class="modal-body" onsubmit="window.UPBMSAdmin.submitPasswordReset(event, '${m.id}')">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;padding:12px;border-radius:10px;margin-bottom:14px;font-size:0.86rem">
              <b>सदस्य:</b> ${escapeHtml(m.nameHi)} (${escapeHtml(m.memberCode)})<br/>
              <b>मोबाइल:</b> ${escapeHtml(m.mobile)}
            </div>
            <div class="form-group" style="margin-bottom:14px">
              <label class="form-label">नया पासवर्ड दर्ज करें (कम से कम 4 अक्षर) *</label>
              <input type="text" class="form-control" id="resetPwdInput" name="newPassword" value="UPBMS@123" required minlength="4" />
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button type="button" class="btn btn-outline btn-sm" onclick="window.UPBMSApp.closeModal()">रद्द करें</button>
              <button type="submit" class="btn btn-accent btn-sm">✅ नया पासवर्ड सेव करें</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function submitPasswordReset(e, memberId) {
    e.preventDefault();
    const newPassword = document.getElementById("resetPwdInput").value.trim();
    const res = await fetch(`/api/members/${memberId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword })
    });
    const json = await res.json();
    if (json.ok) {
      window.UPBMSApp.closeModal();
      window.UPBMSApp.toast(`✅ सदस्य का पासवर्ड सफलतापूर्वक '${newPassword}' पर रीसेट कर दिया गया!`);
    } else {
      window.UPBMSApp.toast("❌ " + (json.error || "Error"));
    }
  }

  function openAddMemberModal() {
    openMemberFormModal(null);
  }

  function openEditMemberModal(memberId) {
    const m = window.UPBMSApp.getState().members.find((x) => x.id === memberId);
    if (m) openMemberFormModal(m);
  }

  function openMemberFormModal(m) {
    const state = window.UPBMSApp.getState();
    const s = state.settings || {};
    const sigs = s.signatories || [];
    const isEdit = Boolean(m);
    const cur = m || {
      nameHi: "", nameEn: "", fatherName: "", fatherNameEn: "",
      isCoreMember: false, designationHi: "सक्रिय बैंक मित्र सदस्य", designationEn: "Active Bank Mitra Member",
      displayOrder: 50, district: state.meta.districts[0], block: "", blockEn: "",
      bankName: state.meta.banks[0], bcCompany: state.meta.bcCompanies[0], koCode: "",
      mobile: "", whatsapp: "", bloodGroup: "O+", photoUrl: "",
      messageHi: "", messageEn: "", status: "active",
      joinedDate: new Date().toISOString().slice(0, 10),
      validUntil: "2027-12-31", feePaid: 251
    };

    document.getElementById("modalRoot").innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="max-width:780px">
          <div class="modal-header">
            <h3 style="font-size:1.02rem;font-weight:900">${isEdit ? `✏️ सदस्य विवरण संशोधित करें (${escapeHtml(cur.memberCode)})` : "➕ नया सदस्य / पदाधिकारी जोड़ें"}</h3>
            <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕</button>
          </div>
          <form class="modal-body" onsubmit="window.UPBMSAdmin.submitMemberModalForm(event, '${isEdit ? cur.id : ""}')">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">पूरा नाम (हिंदी) *</label>
                <input class="form-control" name="nameHi" value="${escapeHtml(cur.nameHi)}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Full Name (English) *</label>
                <input class="form-control" name="nameEn" value="${escapeHtml(cur.nameEn)}" required />
              </div>
              <div class="form-group">
                <label class="form-label">पिता का नाम (हिंदी)</label>
                <input class="form-control" name="fatherName" value="${escapeHtml(cur.fatherName || "")}" />
              </div>
              <div class="form-group">
                <label class="form-label">Father's Name (English)</label>
                <input class="form-control" name="fatherNameEn" value="${escapeHtml(cur.fatherNameEn || "")}" />
              </div>
              <div class="form-group">
                <label class="form-label">पदनाम (हिंदी) *</label>
                <input class="form-control" name="designationHi" value="${escapeHtml(cur.designationHi)}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Designation (English) *</label>
                <input class="form-control" name="designationEn" value="${escapeHtml(cur.designationEn)}" required />
              </div>
              <div class="form-group">
                <label class="form-label">जनपद (District)</label>
                <select class="form-control" name="district">
                  ${state.meta.districts.map((d) => `<option value="${escapeHtml(d)}" ${cur.district === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">ब्लॉक / केंद्र (हिंदी | English)</label>
                <div style="display:flex;gap:6px">
                  <input class="form-control" name="block" value="${escapeHtml(cur.block || "")}" placeholder="हिंदी" />
                  <input class="form-control" name="blockEn" value="${escapeHtml(cur.blockEn || "")}" placeholder="English" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">संबंधित बैंक</label>
                <select class="form-control" name="bankName">
                  ${state.meta.banks.map((b) => `<option value="${escapeHtml(b)}" ${cur.bankName === b ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">बीसी कंपनी</label>
                <select class="form-control" name="bcCompany">
                  ${state.meta.bcCompanies.map((c) => `<option value="${escapeHtml(c)}" ${cur.bcCompany === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">केओ / सीएसपी कोड</label>
                <input class="form-control" name="koCode" value="${escapeHtml(cur.koCode || "")}" />
              </div>
              <div class="form-group">
                <label class="form-label">मोबाइल नंबर *</label>
                <input class="form-control" name="mobile" value="${escapeHtml(cur.mobile)}" required />
              </div>
              <div class="form-group">
                <label class="form-label">WhatsApp नंबर</label>
                <input class="form-control" name="whatsapp" value="${escapeHtml(cur.whatsapp || cur.mobile || "")}" />
              </div>
              <div class="form-group">
                <label class="form-label">रक्त समूह एवं क्रम</label>
                <div style="display:flex;gap:8px">
                  <input class="form-control" name="bloodGroup" value="${escapeHtml(cur.bloodGroup || "O+")}" style="width:90px" />
                  <input type="number" class="form-control" name="displayOrder" value="${cur.displayOrder || 50}" placeholder="क्रम" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">पंजीकरण तिथि / वैधता तिथि</label>
                <div style="display:flex;gap:6px">
                  <input type="date" class="form-control" name="joinedDate" value="${escapeHtml(cur.joinedDate || "")}" />
                  <input type="date" class="form-control" name="validUntil" value="${escapeHtml(cur.validUntil || "")}" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">सदस्य स्थिति (Status)</label>
                <select class="form-control" name="status">
                  <option value="active" ${cur.status === "active" ? "selected" : ""}>सक्रिय (Active)</option>
                  <option value="pending" ${cur.status === "pending" ? "selected" : ""}>लंबित (Pending)</option>
                  <option value="suspended" ${cur.status === "suspended" ? "selected" : ""}>निलंबित (Suspended)</option>
                </select>
              </div>

              <!-- ADMIN-ONLY SIGNATORY & SEAL ASSIGNMENT FOR THIS MEMBER (NEVER SHOWN IN MEMBER LOGIN!) -->
              <div class="form-group full" style="background:#fff7ed;border:1.5px solid #fdba74;padding:14px 16px;border-radius:12px">
                <div style="font-size:0.9rem;font-weight:900;color:#0a2252;margin-bottom:4px">
                  ✍️ सदस्य के प्रपत्रों (ID Card, नियुक्ति पत्र व रसीद) हेतु हस्ताक्षरकर्ता पदाधिकारी चयन — केवल एडमिन हेतु
                </div>
                <div style="font-size:0.76rem;color:#9a3412;font-weight:700;margin-bottom:10px">
                  (यह विकल्प सदस्य लॉगिन में कभी प्रदर्शित नहीं होता; केवल एडमिन यहाँ से सदस्य के हस्ताक्षरकर्ता पदाधिकारी निर्धारित या संशोधित कर सकता है।)
                </div>

                <div style="margin-bottom:12px">
                  <label class="form-label" style="margin-bottom:4px">🪪 1. पहचान पत्र (ID Card) पर हस्ताक्षरकर्ता पदाधिकारी:</label>
                  <select class="form-control" name="signatoryId" style="background:#fff;font-weight:800">
                    ${sigs
                      .map((sg) => {
                        const modeTag = sg.signatureMode === "combined" ? "[मुहर+साइन एक साथ]" : "[अलग मुहर व साइन]";
                        const selId = cur.signatoryId || s.defaultSignatoryId || "sig-gs";
                        return `<option value="${escapeHtml(sg.id)}" ${selId === sg.id ? "selected" : ""}>${escapeHtml(sg.nameHi)} (${escapeHtml(sg.designationHi)}) ${modeTag}</option>`;
                      })
                      .join("")}
                  </select>
                </div>

                <div>
                  <label class="form-label" style="margin-bottom:6px">📄 2. नियुक्ति पत्र एवं शुल्क रसीद पर एक या एक से अधिक हस्ताक्षरकर्ता पदाधिकारी चुनें:</label>
                  <div style="display:flex;gap:10px;flex-wrap:wrap">
                    ${(() => {
                      const activeLetterIds = Array.isArray(cur.letterSignatoryIds) && cur.letterSignatoryIds.length
                        ? cur.letterSignatoryIds
                        : (cur.signatoryId ? [cur.signatoryId] : (s.defaultSignatoryIds || [s.defaultSignatoryId || "sig-gs"]));
                      return sigs
                        .map((sg) => {
                          const checked = activeLetterIds.includes(sg.id);
                          const modeTag = sg.signatureMode === "combined" ? "मुहर+साइन एक साथ" : "अलग मुहर व साइन";
                          return `
                            <label style="display:inline-flex;align-items:center;gap:6px;background:${checked ? "#0a2252" : "#ffffff"};color:${checked ? "#ffffff" : "#1e293b"};border:1.5px solid #0a2252;padding:6px 12px;border-radius:999px;font-size:0.8rem;font-weight:800;cursor:pointer">
                              <input type="checkbox" name="memberLetterSigIds" value="${escapeHtml(sg.id)}" ${checked ? "checked" : ""} />
                              <span>${escapeHtml(sg.nameHi)} (${escapeHtml(sg.designationHi)})</span>
                              <span style="font-size:0.68rem;opacity:0.88">[${modeTag}]</span>
                            </label>`;
                        })
                        .join("");
                    })()}
                  </div>
                </div>
              </div>

              ${
                !isEdit
                  ? `<div class="form-group">
                       <label class="form-label">प्रारंभिक लॉगिन पासवर्ड *</label>
                       <input class="form-control" name="password" value="123456" required />
                     </div>
                     <div class="form-group">
                       <label class="form-label">सदस्यता शुल्क जमा (₹)</label>
                       <input type="number" class="form-control" name="feePaid" value="251" />
                     </div>`
                  : ""
              }

              <div class="form-group full" style="background:#fff7ed;border:1px solid #fed7aa;padding:10px 14px;border-radius:10px">
                <label style="display:flex;align-items:center;gap:8px;font-weight:900;color:#9a3412;cursor:pointer">
                  <input type="checkbox" name="isCoreMember" ${cur.isCoreMember ? "checked" : ""} />
                  <span>👑 प्रदेश मुख्य कार्यकारिणी (Core Member — About Us पेज पर बड़े कार्ड में दिखाएँ)</span>
                </label>
              </div>

              <div class="form-group">
                <label class="form-label">संदेश / उद्गार (हिंदी — Core हेतु)</label>
                <textarea class="form-control" name="messageHi" rows="2">${escapeHtml(cur.messageHi || "")}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Message / Quote (English)</label>
                <textarea class="form-control" name="messageEn" rows="2">${escapeHtml(cur.messageEn || "")}</textarea>
              </div>

              <div class="form-group full">
                <label class="form-label">फोटो अपलोड / बदलें</label>
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                  ${cur.photoUrl ? `<img src="${escapeHtml(cur.photoUrl)}" style="width:52px;height:58px;object-fit:cover;border-radius:8px" alt="Photo" />` : ""}
                  <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadGenericImg(event, 'modalMemberPhotoInput')" />
                  <input type="hidden" name="photoUrl" id="modalMemberPhotoInput" value="${escapeHtml(cur.photoUrl || "")}" />
                </div>
              </div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
              <button type="button" class="btn btn-outline" onclick="window.UPBMSApp.closeModal()">रद्द करें</button>
              <button type="submit" class="btn btn-accent">💾 ${isEdit ? "परिवर्तन सेव करें" : "सदस्य जोड़ें"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function submitMemberModalForm(e, editId) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.isCoreMember = e.target.querySelector('[name="isCoreMember"]').checked;
    const pickedLetterSigs = Array.from(e.target.querySelectorAll('[name="memberLetterSigIds"]:checked')).map((el) => el.value);
    payload.letterSignatoryIds = pickedLetterSigs.length ? pickedLetterSigs : [payload.signatoryId || "sig-gs"];
    delete payload.memberLetterSigIds;
    payload.fromAdmin = true;

    const url = editId ? `/api/members/${editId}` : "/api/members";
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.ok) {
      window.UPBMSApp.closeModal();
      await window.UPBMSApp.refreshData();
      window.UPBMSApp.toast(editId ? "✅ सदस्य का विवरण सफलतापूर्वक संशोधित कर दिया गया!" : "✅ नया सदस्य सफलतापूर्वक जोड़ा गया!");
    }
  }

  async function saveMasterListsForm(e) {
    e.preventDefault();
    const r = Object.fromEntries(new FormData(e.target).entries());
    const parseLines = (txt) => String(txt || "").split("\n").map((s) => s.trim()).filter(Boolean);
    await fetch("/api/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        districts: parseLines(r.districts),
        banks: parseLines(r.banks),
        bcCompanies: parseLines(r.bcCompanies)
      })
    });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ जनपद, बैंक व बीसी कंपनी सूचियाँ अपडेट हो गईं!");
  }

  // ==================== TAB 8: CIRCULARS & PDFS (EXACT UPLOADED DISPLAY — ZERO ADDED SIGN!) ====================
  function renderCircularsAdminTab(state) {
    const circulars = state.circulars || [];
    return `
      <div class="card-panel">
        <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:6px">📑 बैंक मित्र सर्कुलर एवं PDF अपलोड (हूबहू मूल दस्तावेज़ प्रदर्शन)</h3>
        <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">
          यहाँ किसी भी प्रकार के हस्ताक्षर जोड़ने की आवश्यकता नहीं है — आप जो भी PDF या इमेज अपलोड करेंगे, वह आपके दिए गए शीर्षक (Title) के साथ हूबहू वैसा ही दिखाई देगा।
        </p>

        <form onsubmit="window.UPBMSAdmin.addCircularForm(event)" style="background:#f8fafc;border:1.5px solid #cbd5e1;padding:16px;border-radius:12px;margin-bottom:20px">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">सर्कुलर शीर्षक (हिंदी) *</label>
              <input class="form-control" name="titleHi" required placeholder="उदा: एसबीआई कमीशन संशोधन परिपत्र" />
            </div>
            <div class="form-group">
              <label class="form-label">Circular Title (English) *</label>
              <input class="form-control" name="titleEn" required placeholder="e.g. SBI Commission Revision Circular" />
            </div>
            <div class="form-group">
              <label class="form-label">जारीकर्ता विभाग/बैंक (हिंदी)</label>
              <input class="form-control" name="issuerHi" placeholder="उदा: भारतीय स्टेट बैंक / SLBC" />
            </div>
            <div class="form-group">
              <label class="form-label">Issuer (English)</label>
              <input class="form-control" name="issuerEn" placeholder="e.g. State Bank of India / SLBC" />
            </div>
            <div class="form-group">
              <label class="form-label">दिनांक</label>
              <input type="date" class="form-control" name="date" value="${new Date().toISOString().slice(0, 10)}" />
            </div>
            <div class="form-group">
              <label class="form-label">सर्कुलर फाइल अपलोड करें (PDF या Image) *</label>
              <input type="file" accept="image/*,application/pdf" onchange="window.UPBMSAdmin.uploadCircularFile(event)" />
              <input type="hidden" name="fileUrl" id="newCirUrl" />
              <input type="hidden" name="fileType" id="newCirType" value="image" />
              <span id="newCirStatus" style="font-size:0.8rem;color:#15803d;font-weight:800"></span>
            </div>
            <div class="form-group full">
              <label style="display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:0.85rem;color:#9a3412;cursor:pointer">
                <input type="checkbox" name="requiresMemberLogin" />
                <span>🔒 इस सर्कुलर/PDF पर पदाधिकारी का हस्ताक्षर/मुहर है — इसे केवल सदस्य लॉगिन के बाद दिखाएँ (Require Member Login)</span>
              </label>
            </div>
          </div>
          <button type="submit" class="btn btn-accent" style="margin-top:12px">➕ सर्कुलर / PDF प्रकाशित करें</button>
        </form>

        <div style="display:grid;gap:12px">
          ${circulars
            .map(
              (c) => `
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 15px;border:1px solid #cbd5e1;border-radius:12px;background:#fff">
              <div>
                <span class="badge badge-in_progress">${c.fileType === "pdf" ? "PDF" : "IMAGE"}</span>
                ${c.requiresMemberLogin ? `<span class="badge badge-pending" style="margin-left:4px">🔒 सदस्य लॉगिन लॉक</span>` : ""}
                <b style="margin-left:6px;color:var(--primary)">${escapeHtml(c.titleHi)}</b>
                <div style="font-size:0.8rem;color:#64748b">${escapeHtml(c.titleEn || "")} • ${escapeHtml(c.date || "")}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openRawFileModal('circular', '${c.id}')">👁️ मूल फाइल देखें</button>
                <button class="btn btn-outline btn-sm" onclick="window.UPBMSAdmin.toggleItemLoginLock('/api/circulars', '${c.id}', ${!c.requiresMemberLogin})">${c.requiresMemberLogin ? "🌐 सार्वजनिक करें" : "🔒 लॉगिन लॉक लगाएँ"}</button>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/circulars', '${c.id}', 'यह सर्कुलर हटाएँ?')">🗑️ हटाएँ</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
  }

  async function uploadCircularFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const st = document.getElementById("newCirStatus");
    if (st) st.textContent = "⏳ अपलोड हो रहा है...";
    const url = await uploadFileInput(file, 1400);
    document.getElementById("newCirUrl").value = url;
    document.getElementById("newCirType").value = file.type === "application/pdf" ? "pdf" : "image";
    if (st) st.textContent = "✓ फाइल तैयार है!";
  }

  async function addCircularForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.requiresMemberLogin = Boolean(e.target.querySelector('[name="requiresMemberLogin"]')?.checked);
    if (!payload.fileUrl) {
      window.UPBMSApp.toast("⚠️ कृपया सर्कुलर की PDF या इमेज फाइल चुनें!");
      return;
    }
    await fetch("/api/circulars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ सर्कुलर सफलतापूर्वक प्रकाशित हो गया!");
  }

  // ==================== TAB 9: ASSOCIATION DOCUMENTS & CHARTER OF DEMANDS ====================
  function renderDocumentsAndDemandsTab(state) {
    const officers = state.settings.signatories || [];
    return `
      <div style="display:grid;gap:22px">
        <!-- 1. Association Documents (संघ दस्तावेज़) -->
        <div class="card-panel">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:6px">📂 1. संघ दस्तावेज़ (Association Documents — ज्ञापन, संविधान व पत्र)</h3>
          <p style="font-size:0.84rem;color:#475569;margin-bottom:14px">नया संघ पत्र/ज्ञापन जोड़ें और उस पर हस्ताक्षर करने हेतु एक या एक से अधिक पदाधिकारियों का चयन करें:</p>

          <form onsubmit="window.UPBMSAdmin.addAssociationDocForm(event)" style="background:#f8fafc;border:1.5px solid #cbd5e1;padding:16px;border-radius:12px;margin-bottom:18px">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">दस्तावेज़ शीर्षक (हिंदी) *</label>
                <input class="form-control" name="titleHi" required />
              </div>
              <div class="form-group">
                <label class="form-label">Document Title (English) *</label>
                <input class="form-control" name="titleEn" required />
              </div>
              <div class="form-group">
                <label class="form-label">दस्तावेज़ प्रकार (हिंदी — उदा: मांग ज्ञापन) *</label>
                <input class="form-control" name="categoryHi" value="मांग ज्ञापन" required />
              </div>
              <div class="form-group">
                <label class="form-label">Document Category (English) *</label>
                <input class="form-control" name="categoryEn" value="Official Memorandum" required />
              </div>
              <div class="form-group">
                <label class="form-label">पत्रांक संख्या</label>
                <input class="form-control" name="refNo" placeholder="UPBMS/2026/..." />
              </div>
              <div class="form-group">
                <label class="form-label">दिनांक</label>
                <input type="date" class="form-control" name="date" value="${new Date().toISOString().slice(0, 10)}" />
              </div>
              <div class="form-group">
                <label class="form-label">संक्षिप्त विवरण (हिंदी)</label>
                <input class="form-control" name="summaryHi" required />
              </div>
              <div class="form-group">
                <label class="form-label">Short Summary (English)</label>
                <input class="form-control" name="summaryEn" required />
              </div>
              <div class="form-group">
                <label class="form-label">मुख्य पत्र सामग्री (हिंदी)</label>
                <textarea class="form-control" name="contentHi" rows="5" required></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Document Content (English)</label>
                <textarea class="form-control" name="contentEn" rows="5" required></textarea>
              </div>
              <div class="form-group full" style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:10px">
                <label class="form-label">✍️ इस पत्र पर किन-किन पदाधिकारियों के हस्ताक्षर होंगे? (एक या अधिक टिक करें):</label>
                <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
                  ${officers
                    .map(
                      (o, i) => `
                    <label style="font-weight:800;display:inline-flex;align-items:center;gap:6px">
                      <input type="checkbox" name="docSigIds" value="${escapeHtml(o.id)}" ${i === 0 ? "checked" : ""} />
                      <span>${escapeHtml(o.nameHi)} (${escapeHtml(o.designationHi)})</span>
                    </label>`
                    )
                    .join("")}
                </div>
              </div>
            </div>
            <button type="submit" class="btn btn-accent" style="margin-top:12px">➕ संघ दस्तावेज़ जोड़ें</button>
          </form>

          <div style="display:grid;gap:12px">
            ${state.documents
              .map(
                (d) => {
                  const docSigs = Array.isArray(d.signatoryIds) && d.signatoryIds.length ? d.signatoryIds : [s.defaultSignatoryId || "sig-gs"];
                  return `
              <div style="padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px">
                  <div>
                    <span class="badge badge-in_progress">${escapeHtml(d.categoryHi || d.category)}</span>
                    <b style="margin-left:6px">${escapeHtml(d.titleHi)}</b>
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openAssocDocModal('${d.id}')">📄 देखें व प्रिंट</button>
                    <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/documents', '${d.id}', 'यह दस्तावेज़ हटाएँ?')">🗑️</button>
                  </div>
                </div>
                <div style="background:#fff7ed;border:1px dashed #fdba74;border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap" id="docSigWrap_${escapeHtml(d.id)}">
                    <span style="font-size:0.78rem;font-weight:900;color:#0a2252">✍️ ज्ञापन/दस्तावेज़ हस्ताक्षरकर्ता (केवल एडमिन):</span>
                    ${sigs
                      .map((sg) => {
                        const checked = docSigs.includes(sg.id);
                        const modeTag = sg.signatureMode === "combined" ? "मुहर+साइन एक साथ" : "अलग मुहर व साइन";
                        return `
                          <label style="display:inline-flex;align-items:center;gap:5px;background:${checked ? "#0a2252" : "#ffffff"};color:${checked ? "#ffffff" : "#1e293b"};border:1px solid #0a2252;padding:3px 9px;border-radius:999px;font-size:0.74rem;font-weight:800;cursor:pointer">
                            <input type="checkbox" name="editDocSig_${escapeHtml(d.id)}" value="${escapeHtml(sg.id)}" ${checked ? "checked" : ""} />
                            <span>${escapeHtml(sg.nameHi)} (${escapeHtml(sg.designationHi)}) [${modeTag}]</span>
                          </label>`;
                      })
                      .join("")}
                  </div>
                  <button type="button" class="btn btn-primary btn-sm" onclick="window.UPBMSAdmin.updateDocSignatories('${escapeHtml(d.id)}')">💾 हस्ताक्षर सेव करें</button>
                </div>
              </div>`;
                }
              )
              .join("")}
          </div>
        </div>

        <!-- 2. Charter of Demands -->
        <div class="card-panel">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:12px">✊ 2. प्रमुख मांग-पत्र (Charter of Demands — हिंदी व English)</h3>
          <form onsubmit="window.UPBMSAdmin.addDemandForm(event)" style="background:#f8fafc;border:1px solid #cbd5e1;padding:14px;border-radius:12px;margin-bottom:16px">
            <div class="form-grid">
              <input class="form-control" name="titleHi" placeholder="मांग शीर्षक (हिंदी) *" required />
              <input class="form-control" name="titleEn" placeholder="Demand Title (English) *" required />
              <input class="form-control" name="descHi" placeholder="विवरण (हिंदी) *" required />
              <input class="form-control" name="descEn" placeholder="Description (English) *" required />
              <input class="form-control" name="statusHi" value="प्रमुख मांग" placeholder="स्थिति बैज (हिंदी)" />
              <input class="form-control" name="statusEn" value="Priority Demand" placeholder="Status Badge (English)" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="margin-top:10px">➕ नई मांग जोड़ें</button>
          </form>

          <div style="display:grid;gap:8px">
            ${state.demands
              .map(
                (dm) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px">
                <div><b>#${dm.number} ${escapeHtml(dm.titleHi)}</b><br/><span style="font-size:0.78rem;color:#64748b">${escapeHtml(dm.titleEn)}</span></div>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/demands', '${dm.id}', 'यह मांग हटाएँ?')">🗑️</button>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  async function addAssociationDocForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const sigs = Array.from(e.target.querySelectorAll('[name="docSigIds"]:checked')).map((el) => el.value);
    payload.signatoryIds = sigs.length ? sigs : ["sig-gs"];
    delete payload.docSigIds;
    await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ नया संघ दस्तावेज़ जोड़ा गया!");
  }

  async function updateDocSignatories(docId) {
    const wrap = document.getElementById(`docSigWrap_${docId}`);
    if (!wrap) return;
    const picked = Array.from(wrap.querySelectorAll("input[type='checkbox']:checked")).map((el) => el.value);
    if (!picked.length) {
      window.UPBMSApp.toast("⚠️ कृपया कम से कम एक हस्ताक्षरकर्ता पदाधिकारी चुनें!");
      return;
    }
    await fetch(`/api/documents/${docId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatoryIds: picked })
    });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ ज्ञापन/दस्तावेज़ के हस्ताक्षरकर्ता पदाधिकारी अपडेट हो गए!");
  }

  async function addDemandForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.number = (window.UPBMSApp.getState().demands.length || 0) + 1;
    await fetch("/api/demands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ नई मांग जोड़ी गई!");
  }

  // ==================== TAB 10: EXTERNAL PORTALS ====================
  function renderExternalLinksTab(state) {
    return `
      <div class="card-panel">
        <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:12px">🌐 महत्वपूर्ण बाहरी पोर्टल व वेबसाइट लिंक</h3>
        <form onsubmit="window.UPBMSAdmin.addPortalForm(event)" style="background:#f8fafc;border:1.5px solid #cbd5e1;padding:15px;border-radius:12px;margin-bottom:18px">
          <div class="form-grid">
            <input class="form-control" name="titleHi" placeholder="वेबसाइट नाम (हिंदी) *" required />
            <input class="form-control" name="titleEn" placeholder="Portal Name (English) *" required />
            <input class="form-control" name="categoryHi" placeholder="श्रेणी (हिंदी)" value="बैंकिंग पोर्टल" />
            <input class="form-control" name="categoryEn" placeholder="Category (English)" value="Banking Portal" />
            <input class="form-control" name="url" placeholder="https://example.gov.in *" required />
            <input class="form-control" name="domainLabel" placeholder="example.gov.in" />
            <input class="form-control" name="descHi" placeholder="विवरण (हिंदी) *" required />
            <input class="form-control" name="descEn" placeholder="Description (English) *" required />
            <div class="form-group full">
              <label class="form-label">पोर्टल प्रीव्यू इमेज अपलोड करें *</label>
              <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadGenericImg(event, 'newPortalImgUrl')" />
              <input type="hidden" name="imageUrl" id="newPortalImgUrl" value="/images/portal-csc.jpg" />
            </div>
          </div>
          <button type="submit" class="btn btn-accent btn-sm" style="margin-top:12px">➕ पोर्टल जोड़ें</button>
        </form>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
          ${state.externalLinks
            .map(
              (l) => `
            <div style="border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff">
              <img src="${escapeHtml(l.imageUrl)}" style="width:100%;aspect-ratio:16/9;object-fit:cover" alt="" />
              <div style="padding:12px">
                <div style="font-weight:900;color:var(--primary)">${escapeHtml(l.titleHi)}</div>
                <div style="font-size:0.78rem;color:#64748b;margin-bottom:8px">${escapeHtml(l.url)}</div>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/external-links', '${l.id}', 'यह पोर्टल लिंक हटाएँ?')">🗑️ हटाएँ</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
  }

  async function addPortalForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.active = true;
    payload.order = (window.UPBMSApp.getState().externalLinks.length || 0) + 1;
    await fetch("/api/external-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ नया पोर्टल लिंक जुड़ गया!");
  }

  // ==================== TAB 11: PAYMENTS & FEE SETTINGS ====================
  function renderPaymentsAdminTab(state) {
    const s = state.settings;
    return `
      <div style="display:grid;gap:22px">
        <form class="card-panel" onsubmit="window.UPBMSAdmin.saveFeeBankForm(event)">
          <h3 style="font-size:1.12rem;font-weight:900;color:var(--primary);margin-bottom:12px">💳 सदस्यता शुल्क दरें, यूपीआई एवं बैंक खाता विवरण</h3>
          <div class="form-grid">
            <div class="form-group"><label class="form-label">सामान्य सदस्यता शुल्क (₹)</label><input type="number" class="form-control" name="membershipFeeGeneral" value="${s.membershipFeeGeneral}" /></div>
            <div class="form-group"><label class="form-label">जिला पदाधिकारी शुल्क (₹)</label><input type="number" class="form-control" name="membershipFeeDistrictOfficer" value="${s.membershipFeeDistrictOfficer}" /></div>
            <div class="form-group"><label class="form-label">मुख्य कार्यकारिणी शुल्क (₹)</label><input type="number" class="form-control" name="membershipFeeCore" value="${s.membershipFeeCore}" /></div>
            <div class="form-group"><label class="form-label">आधिकारिक UPI ID</label><input class="form-control" name="upiId" value="${escapeHtml(s.upiId)}" /></div>
            <div class="form-group"><label class="form-label">खाता धारक नाम</label><input class="form-control" name="bankAccountName" value="${escapeHtml(s.bankAccountName)}" /></div>
            <div class="form-group"><label class="form-label">खाता संख्या</label><input class="form-control" name="bankAccountNumber" value="${escapeHtml(s.bankAccountNumber)}" /></div>
            <div class="form-group"><label class="form-label">IFSC कोड</label><input class="form-control" name="bankIfsc" value="${escapeHtml(s.bankIfsc)}" /></div>
            <div class="form-group"><label class="form-label">शाखा</label><input class="form-control" name="bankBranch" value="${escapeHtml(s.bankBranch)}" /></div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm" style="margin-top:12px">💾 शुल्क व बैंक विवरण सेव करें</button>
        </form>

        <div class="card-panel">
          <h3 style="font-size:1.12rem;font-weight:900;color:var(--primary);margin-bottom:12px">🧾 समस्त शुल्क एवं सहयोग रसीद रजिस्टर (${state.payments.length})</h3>
          <div class="admin-table-wrap">
            <table class="data-table">
              <thead><tr><th>रसीद सं.</th><th>नाम</th><th>प्रकार</th><th>राशि</th><th>स्थिति</th><th>कार्यवाही</th></tr></thead>
              <tbody>
                ${state.payments
                  .map(
                    (p) => `
                  <tr>
                    <td><b>${escapeHtml(p.receiptNo)}</b><br/><span style="font-size:0.75rem">${escapeHtml(p.date)}</span></td>
                    <td>${escapeHtml(p.payerName)}<br/><span style="font-size:0.75rem">${escapeHtml(p.district)}</span></td>
                    <td>${p.paymentCategory === "donation" ? "सहयोग राशि" : "सदस्यता शुल्क"}</td>
                    <td><b>₹${p.amount}</b></td>
                    <td><span class="badge badge-${p.status === "verified" ? "verified" : "pending"}">${p.status === "verified" ? "सत्यापित" : "लंबित"}</span></td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap">
                      ${p.status !== "verified" ? `<button class="btn btn-whatsapp btn-sm" onclick="window.UPBMSAdmin.verifyPayment('${p.id}')">✓ सत्यापित</button>` : ""}
                      <button class="btn btn-outline btn-sm" onclick="window.UPBMSAdmin.openReceiptSigModal('${p.id}')">✍️ हस्ताक्षर संशोधित</button>
                      <button class="btn btn-outline btn-sm" onclick="window.UPBMSApp.openReceiptModal('${p.id}')">🧾 रसीद</button>
                      <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/payments', '${p.id}', 'यह रसीद हटाएँ?')">🗑️</button>
                    </td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async function saveFeeBankForm(e) {
    e.preventDefault();
    const r = Object.fromEntries(new FormData(e.target).entries());
    r.membershipFeeGeneral = Number(r.membershipFeeGeneral);
    r.membershipFeeDistrictOfficer = Number(r.membershipFeeDistrictOfficer);
    r.membershipFeeCore = Number(r.membershipFeeCore);
    await saveSettingsPatch(r, "✅ शुल्क व बैंक खाता विवरण अपडेट हो गए!");
  }

  function openReceiptSigModal(payId) {
    const state = window.UPBMSApp.getState();
    const p = state.payments.find((x) => x.id === payId);
    if (!p) return;
    const s = state.settings || {};
    const sigs = s.signatories || [];
    const activeIds = Array.isArray(p.signatoryIds) && p.signatoryIds.length ? p.signatoryIds : [s.defaultSignatoryId || "sig-gs"];

    document.getElementById("modalRoot").innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-box" style="max-width:560px">
          <div class="modal-header">
            <h3 style="font-size:0.98rem;font-weight:900">✍️ रसीद हस्ताक्षरकर्ता संशोधित करें (${escapeHtml(p.receiptNo)})</h3>
            <button class="btn btn-danger btn-sm" onclick="window.UPBMSApp.closeModal()">✕</button>
          </div>
          <form class="modal-body" onsubmit="window.UPBMSAdmin.submitReceiptSigModal(event, '${escapeHtml(p.id)}')">
            <div style="font-size:0.84rem;color:#475569;margin-bottom:10px">
              रसीद धारक: <b>${escapeHtml(p.payerName)}</b> (₹${p.amount}) — एक या अधिक हस्ताक्षरकर्ता पदाधिकारी चुनें:
            </div>
            <div style="display:grid;gap:8px;margin-bottom:16px">
              ${sigs
                .map((sg) => {
                  const checked = activeIds.includes(sg.id);
                  const modeTag = sg.signatureMode === "combined" ? "मुहर+साइन एक साथ" : "अलग मुहर व साइन";
                  return `
                    <label style="display:flex;align-items:center;gap:8px;background:#fff7ed;border:1.5px solid #fdba74;padding:8px 12px;border-radius:10px;font-size:0.84rem;font-weight:800;color:#0a2252;cursor:pointer">
                      <input type="checkbox" name="receiptSigIds" value="${escapeHtml(sg.id)}" ${checked ? "checked" : ""} />
                      <span>${escapeHtml(sg.nameHi)} (${escapeHtml(sg.designationHi)}) — <span style="color:#9a3412">[${modeTag}]</span></span>
                    </label>`;
                })
                .join("")}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px">
              <button type="button" class="btn btn-outline" onclick="window.UPBMSApp.closeModal()">रद्द करें</button>
              <button type="submit" class="btn btn-accent">💾 हस्ताक्षर सेव करें</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  async function submitReceiptSigModal(e, payId) {
    e.preventDefault();
    const picked = Array.from(e.target.querySelectorAll('[name="receiptSigIds"]:checked')).map((el) => el.value);
    if (!picked.length) {
      window.UPBMSApp.toast("⚠️ कम से कम एक हस्ताक्षरकर्ता पदाधिकारी चुनें!");
      return;
    }
    await fetch(`/api/payments/${payId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatoryIds: picked })
    });
    window.UPBMSApp.closeModal();
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ रसीद के हस्ताक्षरकर्ता पदाधिकारी अपडेट हो गए!");
  }

  async function verifyPayment(id) {
    await fetch(`/api/payments/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "verified" }) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ भुगतान सत्यापित हो गया!");
  }

  // ==================== TAB 12: GRIEVANCES (WITH HIDE SWITCH) & NEWS ====================
  function renderGrievancesAndNewsTab(state) {
    const grvOn = state.settings.enableGrievanceModule !== false;
    return `
      <div style="display:grid;gap:22px">
        <div class="card-panel" style="border:2px solid ${grvOn ? "#86efac" : "#fecaca"}">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px">
            <div>
              <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary)">⚖️ 1. शिकायत निवारण नियंत्रण (दिखाएँ / छिपाएँ विकल्प सहित)</h3>
              <p style="font-size:0.84rem;color:#475569">वर्तमान स्थिति: <b>${grvOn ? "चालू (वेबसाइट पर दिख रहा है)" : "छुपा हुआ (पूरी वेबसाइट पर हाइड है)"}</b></p>
            </div>
            <button class="btn ${grvOn ? "btn-danger" : "btn-whatsapp"} btn-sm" onclick="window.UPBMSAdmin.toggleGrievanceModule(${!grvOn})">
              ${grvOn ? "🙈 शिकायत निवारण को वेबसाइट से छिपाएँ" : "👁️ शिकायत निवारण को वेबसाइट पर दिखाएँ"}
            </button>
          </div>

          <div style="display:grid;gap:12px">
            ${state.grievances
              .map(
                (g) => `
              <form onsubmit="window.UPBMSAdmin.updateGrievanceRow(event, '${g.id}')" style="background:#f8fafc;border:1px solid #cbd5e1;padding:14px;border-radius:12px">
                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
                  <b>🎫 ${escapeHtml(g.ticketNo)} — ${escapeHtml(g.applicantName)} (${escapeHtml(g.district)})</b>
                  <select name="status" class="form-control" style="max-width:190px;padding:4px 10px">
                    <option value="pending" ${g.status === "pending" ? "selected" : ""}>पंजीकृत (Pending)</option>
                    <option value="in_progress" ${g.status === "in_progress" ? "selected" : ""}>कार्यवाही जारी (In Progress)</option>
                    <option value="resolved" ${g.status === "resolved" ? "selected" : ""}>समाधान पूर्ण (Resolved)</option>
                  </select>
                </div>
                <div style="font-size:0.86rem;margin-bottom:8px">${escapeHtml(g.subject)}</div>
                <div class="form-grid">
                  <input class="form-control" name="adminRemark" value="${escapeHtml(g.adminRemark || "")}" placeholder="कार्यवाही टिप्पणी (हिंदी)" />
                  <input class="form-control" name="adminRemarkEn" value="${escapeHtml(g.adminRemarkEn || "")}" placeholder="Action Remark (English)" />
                </div>
                <div style="margin-top:8px;display:flex;gap:8px">
                  <button type="submit" class="btn btn-primary btn-sm">💾 अपडेट करें</button>
                  <button type="button" class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/grievances', '${g.id}', 'यह शिकायत हटाएँ?')">🗑️</button>
                </div>
              </form>`
              )
              .join("")}
          </div>
        </div>

        <!-- News Manager -->
        <div class="card-panel">
          <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:12px">📰 2. समाचार एवं गतिविधियाँ (हिंदी एवं English)</h3>
          <form onsubmit="window.UPBMSAdmin.addNewsForm(event)" style="background:#f8fafc;border:1px solid #cbd5e1;padding:15px;border-radius:12px;margin-bottom:16px">
            <div class="form-grid">
              <input class="form-control" name="titleHi" placeholder="समाचार शीर्षक (हिंदी) *" required />
              <input class="form-control" name="titleEn" placeholder="News Headline (English) *" required />
              <input class="form-control" name="categoryHi" value="संगठन समाचार" placeholder="श्रेणी (हिंदी)" />
              <input class="form-control" name="categoryEn" value="Union Update" placeholder="Category (English)" />
              <input class="form-control" name="district" value="लखनऊ" placeholder="स्थान (हिंदी)" />
              <input class="form-control" name="districtEn" value="Lucknow" placeholder="Location (English)" />
              <textarea class="form-control" name="summaryHi" placeholder="सारांश (हिंदी) *" required></textarea>
              <textarea class="form-control" name="summaryEn" placeholder="Summary (English) *" required></textarea>
              <div class="form-group full">
                <label class="form-label">समाचार फोटो</label>
                <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadGenericImg(event, 'newNewsImgUrl')" />
                <input type="hidden" name="imageUrl" id="newNewsImgUrl" value="/images/hero-banner-1.jpg" />
              </div>
            </div>
            <button type="submit" class="btn btn-accent btn-sm" style="margin-top:10px">➕ समाचार प्रकाशित करें</button>
          </form>

          <div style="display:grid;gap:10px">
            ${state.news
              .map(
                (n) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px">
                <div><b>${escapeHtml(n.titleHi)}</b><br/><span style="font-size:0.78rem;color:#64748b">${escapeHtml(n.titleEn)}</span></div>
                <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteCollectionItem('/api/news', '${n.id}', 'यह समाचार हटाएँ?')">🗑️</button>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  async function updateGrievanceRow(e, id) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await fetch(`/api/grievances/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ शिकायत स्थिति अपडेट हो गई!");
  }

  async function addNewsForm(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.date = new Date().toISOString().slice(0, 10);
    await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("✅ नया समाचार जुड़ गया!");
  }

  // ==================== TAB 13: BRANDING, TICKER, SOCIAL & ADMIN PIN ====================
  function renderBrandingAndSocialTab(state) {
    const s = state.settings;
    const sl = s.socialLinks || {};
    return `
      <form class="card-panel" onsubmit="window.UPBMSAdmin.saveBrandingForm(event)">
        <h3 style="font-size:1.15rem;font-weight:900;color:var(--primary);margin-bottom:14px">🏢 संगठन पहचान, लोगो, थीम, टिकर, सोशल मीडिया व सुरक्षा पिन</h3>

        <div class="form-grid">
          <div class="form-group"><label class="form-label">संगठन नाम (हिंदी)</label><input class="form-control" name="orgNameHi" value="${escapeHtml(s.orgNameHi)}" required /></div>
          <div class="form-group"><label class="form-label">Organization Name (English)</label><input class="form-control" name="orgNameEn" value="${escapeHtml(s.orgNameEn)}" required /></div>
          <div class="form-group"><label class="form-label">संक्षिप्त नाम (Short Name)</label><input class="form-control" name="shortName" value="${escapeHtml(s.shortName)}" /></div>
          <div class="form-group"><label class="form-label">पंजीकरण विवरण</label><input class="form-control" name="regNumber" value="${escapeHtml(s.regNumber)}" /></div>
          <div class="form-group"><label class="form-label">टैगलाइन (हिंदी)</label><input class="form-control" name="taglineHi" value="${escapeHtml(s.taglineHi)}" /></div>
          <div class="form-group"><label class="form-label">Tagline (English)</label><input class="form-control" name="taglineEn" value="${escapeHtml(s.taglineEn)}" /></div>
          <div class="form-group"><label class="form-label">प्राथमिक हेल्पलाइन</label><input class="form-control" name="helplinePrimary" value="${escapeHtml(s.helplinePrimary)}" /></div>
          <div class="form-group"><label class="form-label">ईमेल एवं WhatsApp नंबर</label>
            <div style="display:flex;gap:8px">
              <input class="form-control" name="email" value="${escapeHtml(s.email)}" />
              <input class="form-control" name="whatsappNumber" value="${escapeHtml(s.whatsappNumber)}" />
            </div>
          </div>
          <div class="form-group"><label class="form-label">मुख्यालय पता (हिंदी)</label><input class="form-control" name="headOfficeHi" value="${escapeHtml(s.headOfficeHi)}" /></div>
          <div class="form-group"><label class="form-label">Head Office Address (English)</label><input class="form-control" name="headOfficeEn" value="${escapeHtml(s.headOfficeEn)}" /></div>

          <div class="form-group">
            <label class="form-label">रंग थीम (Color Theme)</label>
            <select class="form-control" name="themePreset">
              <option value="navy_saffron" ${s.themePreset === "navy_saffron" ? "selected" : ""}>नेवी ब्लू एवं केसरिया (Navy & Saffron)</option>
              <option value="blue_green" ${s.themePreset === "blue_green" ? "selected" : ""}>रॉयल ब्लू एवं एमराल्ड ग्रीन (Blue & Green)</option>
              <option value="maroon_gold" ${s.themePreset === "maroon_gold" ? "selected" : ""}>मैरून एवं गोल्ड (Maroon & Gold)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">संगठन लोगो बदलें</label>
            <div style="display:flex;gap:10px;align-items:center">
              <img src="${escapeHtml(s.logoUrl)}" id="brandLogoPrev" style="width:48px;height:48px;border-radius:50%" alt="Logo" />
              <input type="file" accept="image/*" onchange="window.UPBMSAdmin.uploadGenericImg(event, 'brandLogoInput', 'brandLogoPrev')" />
              <input type="hidden" name="logoUrl" id="brandLogoInput" value="${escapeHtml(s.logoUrl)}" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">ताज़ा सूचना टिकर — प्रति पंक्ति 1 (हिंदी)</label>
            <textarea class="form-control" name="tickerNoticesHi" rows="3">${escapeHtml((s.tickerNoticesHi || []).join("\n"))}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Ticker Notices — One per line (English)</label>
            <textarea class="form-control" name="tickerNoticesEn" rows="3">${escapeHtml((s.tickerNoticesEn || []).join("\n"))}</textarea>
          </div>

          <!-- Social Media Links -->
          <div class="form-group"><label class="form-label">WhatsApp Channel URL</label><input class="form-control" name="soc_waCh" value="${escapeHtml(sl.whatsappChannel || "")}" /></div>
          <div class="form-group"><label class="form-label">WhatsApp Group URL</label><input class="form-control" name="soc_waGr" value="${escapeHtml(sl.whatsappGroup || "")}" /></div>
          <div class="form-group"><label class="form-label">Facebook URL</label><input class="form-control" name="soc_fb" value="${escapeHtml(sl.facebook || "")}" /></div>
          <div class="form-group"><label class="form-label">Instagram URL</label><input class="form-control" name="soc_ig" value="${escapeHtml(sl.instagram || "")}" /></div>
          <div class="form-group"><label class="form-label">YouTube URL</label><input class="form-control" name="soc_yt" value="${escapeHtml(sl.youtube || "")}" /></div>
          <div class="form-group"><label class="form-label">X (Twitter) URL</label><input class="form-control" name="soc_tw" value="${escapeHtml(sl.twitter || "")}" /></div>
          <div class="form-group"><label class="form-label">Telegram URL</label><input class="form-control" name="soc_tg" value="${escapeHtml(sl.telegram || "")}" /></div>
          <div class="form-group"><label class="form-label">नया एडमिन सुरक्षा पिन (बदलना हो तो लिखें)</label><input class="form-control" name="newAdminPin" placeholder="खाली छोड़ने पर वर्तमान पिन रहेगा" /></div>

          <div class="form-group"><label class="form-label">अतिरिक्त कस्टम लिंक 1 (नाम | URL)</label>
            <div style="display:flex;gap:6px">
              <input class="form-control" name="soc_ex1Lbl" value="${escapeHtml(sl.extra1Label || "")}" placeholder="नाम" style="max-width:130px" />
              <input class="form-control" name="soc_ex1Url" value="${escapeHtml(sl.extra1Url || "")}" placeholder="https://..." />
            </div>
          </div>
          <div class="form-group"><label class="form-label">अतिरिक्त कस्टम लिंक 2 (नाम | URL)</label>
            <div style="display:flex;gap:6px">
              <input class="form-control" name="soc_ex2Lbl" value="${escapeHtml(sl.extra2Label || "")}" placeholder="नाम" style="max-width:130px" />
              <input class="form-control" name="soc_ex2Url" value="${escapeHtml(sl.extra2Url || "")}" placeholder="https://..." />
            </div>
          </div>
        </div>

        <button type="submit" class="btn btn-accent" style="margin-top:16px">💾 संगठन पहचान व सोशल लिंक सेव करें</button>
      </form>
    `;
  }

  async function saveBrandingForm(e) {
    e.preventDefault();
    const r = Object.fromEntries(new FormData(e.target).entries());
    const parseLines = (txt) => String(txt || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const patch = {
      orgNameHi: r.orgNameHi, orgNameEn: r.orgNameEn,
      shortName: r.shortName, regNumber: r.regNumber,
      taglineHi: r.taglineHi, taglineEn: r.taglineEn,
      helplinePrimary: r.helplinePrimary, email: r.email, whatsappNumber: r.whatsappNumber,
      headOfficeHi: r.headOfficeHi, headOfficeEn: r.headOfficeEn,
      themePreset: r.themePreset, logoUrl: r.logoUrl,
      tickerNoticesHi: parseLines(r.tickerNoticesHi),
      tickerNoticesEn: parseLines(r.tickerNoticesEn),
      socialLinks: {
        whatsappChannel: r.soc_waCh, whatsappGroup: r.soc_waGr,
        facebook: r.soc_fb, instagram: r.soc_ig,
        youtube: r.soc_yt, twitter: r.soc_tw, telegram: r.soc_tg,
        extra1Label: r.soc_ex1Lbl, extra1Url: r.soc_ex1Url,
        extra2Label: r.soc_ex2Lbl, extra2Url: r.soc_ex2Url
      }
    };
    if (r.newAdminPin && r.newAdminPin.trim()) patch.newAdminPin = r.newAdminPin.trim();
    await saveSettingsPatch(patch, "✅ ब्रांडिंग व सोशल मीडिया सेटिंग्स सेव हो गईं!");
  }

  // ==================== SHARED UTILITIES ====================
  async function uploadGenericImg(e, hiddenInputId, previewImgId) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFileInput(file, 1100);
    const inp = document.getElementById(hiddenInputId);
    if (inp) inp.value = url;
    if (previewImgId) {
      const pr = document.getElementById(previewImgId);
      if (pr) pr.src = url;
    }
    window.UPBMSApp.toast("✓ इमेज अपलोड हो गई!");
  }

  function deleteCollectionItem(baseRoute, id, msg) {
    askActionConfirm(msg || "क्या आप इसे हटाना चाहते हैं?", async () => {
      await fetch(`${baseRoute}/${id}`, { method: "DELETE" });
      await window.UPBMSApp.refreshData();
      window.UPBMSApp.toast("🗑️ सफलतापूर्वक हटा दिया गया!");
    });
  }

  // ==================== SECURITY & SIGNATURE/SEAL USAGE AUDIT LOG TAB ====================
  function renderSecurityLogsTab(state) {
    const allLogs = state.accessLogs || [];
    const printCount = allLogs.filter((l) => String(l.actionType || "").startsWith("print_")).length;
    const viewCount = allLogs.filter((l) => String(l.actionType || "").startsWith("view_")).length;
    const loginCount = allLogs.filter((l) => l.actionType === "member_login").length;
    const uniqueUsers = new Set(allLogs.map((l) => l.memberCode).filter(Boolean)).size;

    const filtered = allLogs.filter((l) => {
      if (auditLogActionFilter === "prints" && !String(l.actionType || "").startsWith("print_")) return false;
      if (auditLogActionFilter === "idcard" && !String(l.actionType || "").includes("idcard")) return false;
      if (auditLogActionFilter === "letter" && !String(l.actionType || "").includes("letter")) return false;
      if (auditLogActionFilter === "assoc_doc" && !String(l.actionType || "").includes("assoc_doc")) return false;
      if (auditLogActionFilter === "receipt" && !String(l.actionType || "").includes("receipt")) return false;
      if (auditLogActionFilter === "login" && l.actionType !== "member_login") return false;

      if (auditLogSearch) {
        const q = auditLogSearch.toLowerCase();
        const hay = `${l.auditCode} ${l.memberCode} ${l.memberNameHi} ${l.memberNameEn} ${l.mobile} ${l.district} ${l.actionLabelHi} ${l.targetTitleHi} ${l.signatoriesUsedHi}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return `
      <div style="display:grid;gap:20px">
        <div class="card-panel" style="background:#eff6ff;border:1.5px solid #93c5fd">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <h3 style="font-size:1.2rem;font-weight:900;color:var(--primary)">🛡️ पदाधिकारी हस्ताक्षर एवं आधिकारिक मुहर उपयोग पंजिका (Security Audit Log)</h3>
              <p style="font-size:0.86rem;color:#1e3a8a;margin-top:4px">
                सुरक्षा नीति सक्रिय है: बिना सदस्य लॉगिन के किसी भी विज़िटर को हस्ताक्षर व मुहर युक्त प्रपत्र नहीं दिखते। जब भी कोई लॉगिन सदस्य पहचान-पत्र, नियुक्ति पत्र, संघ दस्तावेज़ या रसीद खोलता/प्रिंट करता है, उसका पूरा रिकॉर्ड यहाँ स्वतः दर्ज हो जाता है।
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" onclick="window.UPBMSAdmin.downloadExport('/api/export/access-logs.csv', 'UPBMS_Signature_Usage_Audit_Logs.csv')">
                📥 सुरक्षा लॉग CSV डाउनलोड करें
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.clearAllAccessLogs()">
                🗑️ पुराने लॉग साफ़ करें
              </button>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px">
          <div class="card-panel"><b>🖨️ कुल प्रिंट / डाउनलोड:</b> <div style="font-size:1.55rem;font-weight:900;color:#b91c1c">${printCount}</div></div>
          <div class="card-panel"><b>👁️ हस्ताक्षर प्रपत्र देखे गए:</b> <div style="font-size:1.55rem;font-weight:900;color:var(--primary)">${viewCount}</div></div>
          <div class="card-panel"><b>🔑 कुल सदस्य लॉगिन:</b> <div style="font-size:1.55rem;font-weight:900;color:#15803d">${loginCount}</div></div>
          <div class="card-panel"><b>👤 उपयोगकर्ता सदस्य संख्या:</b> <div style="font-size:1.55rem;font-weight:900;color:var(--accent)">${uniqueUsers}</div></div>
        </div>

        <div class="card-panel">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <input
              class="form-control"
              style="flex:1;min-width:220px"
              placeholder="सदस्य का नाम, ID, मोबाइल नंबर, जनपद या दस्तावेज़ नाम खोजें..."
              value="${escapeHtml(auditLogSearch)}"
              oninput="window.UPBMSAdmin.setAuditLogFilter('search', this.value)"
            />
            <select class="form-control" style="max-width:250px" onchange="window.UPBMSAdmin.setAuditLogFilter('action', this.value)">
              <option value="all" ${auditLogActionFilter === "all" ? "selected" : ""}>सभी रिकॉर्ड (${allLogs.length})</option>
              <option value="prints" ${auditLogActionFilter === "prints" ? "selected" : ""}>🖨️ केवल प्रिंट / डाउनलोड किए गए</option>
              <option value="idcard" ${auditLogActionFilter === "idcard" ? "selected" : ""}>🪪 पहचान पत्र उपयोग</option>
              <option value="letter" ${auditLogActionFilter === "letter" ? "selected" : ""}>📄 नियुक्ति पत्र उपयोग</option>
              <option value="assoc_doc" ${auditLogActionFilter === "assoc_doc" ? "selected" : ""}>📂 संघ दस्तावेज़ उपयोग</option>
              <option value="receipt" ${auditLogActionFilter === "receipt" ? "selected" : ""}>🧾 रसीद उपयोग</option>
              <option value="login" ${auditLogActionFilter === "login" ? "selected" : ""}>🔑 सदस्य लॉगिन रिकॉर्ड</option>
            </select>
          </div>

          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>दिनांक व समय / लॉग ID</th>
                  <th>उपयोगकर्ता सदस्य (किसने उपयोग किया)</th>
                  <th>मोबाइल व जनपद</th>
                  <th>किया गया कार्य</th>
                  <th>दस्तावेज़ व प्रयुक्त हस्ताक्षर/मुहर</th>
                  <th>हटाएँ</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length === 0
                    ? `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px">कोई सुरक्षा लॉग रिकॉर्ड नहीं मिला।</td></tr>`
                    : filtered
                        .map((l) => {
                          const isPrint = String(l.actionType || "").startsWith("print_");
                          return `
                            <tr>
                              <td style="white-space:nowrap">
                                <div style="font-weight:900;color:#0a2252">${escapeHtml(l.auditCode || "")}</div>
                                <div style="font-size:0.78rem;color:#475569">${escapeHtml(l.timestamp || "")}</div>
                              </td>
                              <td>
                                <div style="font-weight:900;color:#0f172a">${escapeHtml(l.memberNameHi)}</div>
                                <div style="font-size:0.78rem;color:#1d4ed8;font-weight:800">${escapeHtml(l.memberCode)} ${l.designationHi ? `• ${escapeHtml(l.designationHi)}` : ""}</div>
                              </td>
                              <td>
                                <div style="font-weight:800">${escapeHtml(l.mobile || "—")}</div>
                                <div style="font-size:0.78rem;color:#64748b">${escapeHtml(l.district || "—")}</div>
                              </td>
                              <td>
                                <span class="badge ${isPrint ? "badge-pending" : "badge-verified"}">
                                  ${isPrint ? "🖨️ " : "👁️ "}${escapeHtml(l.actionLabelHi)}
                                </span>
                              </td>
                              <td>
                                <div style="font-weight:800;color:#0a2252">${escapeHtml(l.targetTitleHi || "—")}</div>
                                <div style="font-size:0.76rem;color:#9a3412;font-weight:700">✍️ ${escapeHtml(l.signatoriesUsedHi || "—")}</div>
                              </td>
                              <td>
                                <button class="btn btn-danger btn-sm" onclick="window.UPBMSAdmin.deleteAccessLogItem('${l.id}')">✕</button>
                              </td>
                            </tr>
                          `;
                        })
                        .join("")
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function setAuditLogFilter(kind, val) {
    if (kind === "search") auditLogSearch = val;
    if (kind === "action") auditLogActionFilter = val;
    window.UPBMSApp.rerender();
  }

  async function deleteAccessLogItem(id) {
    await fetch(`/api/access-logs/${id}`, {
      method: "DELETE",
      headers: window.UPBMSApp.getAuthHeaders()
    });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast("🗑️ लॉग प्रविष्टि हटा दी गई।");
  }

  function clearAllAccessLogs() {
    askActionConfirm("क्या आप सभी पुराने हस्ताक्षर उपयोग लॉग साफ़ करना चाहते हैं?", async () => {
      await fetch("/api/access-logs", {
        method: "DELETE",
        headers: window.UPBMSApp.getAuthHeaders()
      });
      await window.UPBMSApp.refreshData();
      window.UPBMSApp.toast("✅ उपयोग पंजिका साफ़ कर दी गई।");
    });
  }

  async function toggleItemLoginLock(baseApi, id, nextVal) {
    await fetch(`${baseApi}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requiresMemberLogin: Boolean(nextVal) })
    });
    await window.UPBMSApp.refreshData();
    window.UPBMSApp.toast(nextVal ? "🔒 सदस्य लॉगिन सुरक्षा लॉक सक्रिय किया गया!" : "🌐 प्रपत्र सार्वजनिक दृश्य के लिए खोल दिया गया!");
  }

  async function downloadExport(apiUrl, filename) {
    const res = await fetch(apiUrl, { headers: window.UPBMSApp.getAuthHeaders() });
    const text = await res.text();
    const blob = new Blob([text], { type: filename.endsWith(".json") ? "application/json" : "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function resetDemoData() {
    askActionConfirm("क्या आप पूरे पोर्टल डेटा को प्रारंभिक डिफ़ॉल्ट स्थिति में रीसेट करना चाहते हैं?", async () => {
      await fetch("/api/admin/reset", { method: "POST" });
      await window.UPBMSApp.refreshData();
      window.UPBMSApp.toast("✅ डिफ़ॉल्ट डेटा पुनः लोड हो गया!");
    });
  }

  return {
    getActiveTab,
    switchTab,
    renderAdminLoginModal,
    renderAdminShell,
    setAuditLogFilter,
    deleteAccessLogItem,
    clearAllAccessLogs,
    toggleItemLoginLock,
    toggleGrievanceModule,
    saveMenusForm,
    saveHeaderButtonsForm,
    saveSectionTextsForm,
    saveAboutVmForm,
    uploadCertFile,
    addCertificateForm,
    handleSealUpload,
    saveCentralSealAndDefaults,
    uploadOfficerImg,
    uploadNewOffImg,
    updateOfficerRow,
    deleteOfficer,
    addNewOfficer,
    uploadBgImg,
    saveTemplateBackgroundsForm,
    resetTemplateBackgrounds,
    saveTermsForm,
    saveLetterTextForm,
    addSlideForm,
    saveCampaignAndStatsForm,
    setMemberFilter,
    setMemberSearch,
    quickApproveMember,
    openResetPasswordModal,
    submitPasswordReset,
    openAddMemberModal,
    openEditMemberModal,
    submitMemberModalForm,
    saveMasterListsForm,
    uploadCircularFile,
    addCircularForm,
    addAssociationDocForm,
    updateDocSignatories,
    addDemandForm,
    addPortalForm,
    saveFeeBankForm,
    openReceiptSigModal,
    submitReceiptSigModal,
    verifyPayment,
    updateGrievanceRow,
    addNewsForm,
    saveBrandingForm,
    uploadGenericImg,
    deleteCollectionItem,
    downloadExport,
    resetDemoData
  };
})();
