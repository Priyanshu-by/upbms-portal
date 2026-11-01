// UPBMS V3 Print & Security-Gated Templates
// Signed & Stamped templates ONLY render after Member/Admin Login and include traceable Security Audit tags.
// Visitors (unauthenticated) only receive unsigned plain-information views with ZERO signatures or seals.

window.UPBMSPrint = (function () {
  const { generateQrSvg, escapeHtml, initialsAvatarSvg } = window.UPBMSHelpers;

  function localizeDual(val, lang) {
    const str = String(val || "").trim();
    const m = str.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (m) {
      return lang === "en" ? m[2].trim() : m[1].trim();
    }
    return str;
  }

  function resolveSignatories(settings, overrideIds) {
    const list = Array.isArray(settings?.signatories) && settings.signatories.length
      ? settings.signatories
      : [
          {
            id: "sig-gs",
            nameHi: "श्री आलोक कुमार वर्मा",
            nameEn: "Shri Alok Kumar Verma",
            designationHi: "प्रदेश महामंत्री",
            designationEn: "State General Secretary",
            signatureMode: "separate",
            signatureUrl: "",
            combinedStampSigUrl: ""
          }
        ];

    let ids = [];
    if (Array.isArray(overrideIds) && overrideIds.length) {
      ids = overrideIds;
    } else if (typeof overrideIds === "string" && overrideIds) {
      ids = [overrideIds];
    } else if (Array.isArray(settings?.defaultSignatoryIds) && settings.defaultSignatoryIds.length) {
      ids = settings.defaultSignatoryIds;
    } else if (settings?.defaultSignatoryId) {
      ids = [settings.defaultSignatoryId];
    }

    const found = ids
      .map((id) => list.find((s) => s.id === id))
      .filter(Boolean);

    return found.length ? found : [list[0]];
  }

  function formatSignatoriesAuditSummary(officers, settings) {
    const sealHi = settings?.sealLabelHi || "आधिकारिक संघ मुहर";
    const sealEn = settings?.sealLabelEn || "Official Seal";
    return {
      hi: officers.map((o) => `${o.nameHi} (${o.designationHi})`).join(", ") + ` + ${sealHi}`,
      en: officers.map((o) => `${o.nameEn} (${o.designationEn})`).join(", ") + ` + ${sealEn}`
    };
  }

  function renderAuditTraceStrip() {
    // Audit & usage data is strictly confidential to Admin Panel — NEVER shown to members or printed on member copies!
    return "";
  }

  // Signatory selection is strictly controlled inside Admin Panel (Member Edit/Modify, Documents & Receipts) — never shown on Member/Document views!
  function renderSignatoryPickerBar() {
    return "";
  }

  // Render Multi-Officer Signature + Seal Footer for Authenticated Letters, Association Documents & Receipts
  function renderMultiOfficerFooterHtml(officers, settings, leftHtml, lang = "hi") {
    const isEn = lang === "en";
    const sealUrl = settings.sealImageUrl || "";
    const anySeparateMode = officers.some((o) => !(o.signatureMode === "combined" && o.combinedStampSigUrl));

    return `
      <div class="a4-sign-footer">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          ${leftHtml || ""}
          ${
            anySeparateMode && sealUrl
              ? `<div style="text-align:center">
                   <img src="${escapeHtml(sealUrl)}" class="a4-seal-img" alt="Seal" />
                   <div style="font-size:0.68rem;font-weight:800;color:#475569;margin-top:2px">
                     ${escapeHtml(isEn ? (settings.sealLabelEn || "Official Seal") : (settings.sealLabelHi || "आधिकारिक संघ मुहर"))}
                   </div>
                 </div>`
              : ""
          }
        </div>

        <div class="multi-sig-grid">
          ${officers
            .map((sig) => {
              const useCombined = sig.signatureMode === "combined" && Boolean(sig.combinedStampSigUrl);
              return `
                <div class="a4-sig-block">
                  ${
                    useCombined
                      ? `<img src="${escapeHtml(sig.combinedStampSigUrl)}" class="a4-combined-img" alt="Stamp and Signature" />`
                      : sig.signatureUrl
                      ? `<img src="${escapeHtml(sig.signatureUrl)}" class="a4-sig-img" alt="Signature" />`
                      : ""
                  }
                  <div style="border-top:1.5px solid #0a2252;padding-top:4px;font-weight:900;color:#0a2252;font-size:0.9rem">
                    ${escapeHtml(isEn ? sig.nameEn : sig.nameHi)}
                  </div>
                  <div style="font-size:0.8rem;font-weight:800;color:#ea580c">
                    ${escapeHtml(isEn ? sig.designationEn : sig.designationHi)}
                  </div>
                  <div style="font-size:0.72rem;color:#475569;font-weight:700">
                    ${escapeHtml(isEn ? settings.orgNameEn : settings.orgNameHi)}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  // ==================== 1. IDENTITY CARD (FRONT & BACK — REQUIRES MEMBER/ADMIN LOGIN) ====================
  function renderIdCardHtml(member, settings, overrideIds, lang = "hi", auditActor = null) {
    const isEn = lang === "en";
    const sig = resolveSignatories(settings, overrideIds || member.signatoryId)[0];
    const sealUrl = settings.sealImageUrl || "";
    const useCombined = sig.signatureMode === "combined" && Boolean(sig.combinedStampSigUrl);

    const bgCfg = settings.templateBackgrounds?.idcard || {};
    const frontBg = bgCfg.frontBgColor || "#ffffff";
    const backBg = bgCfg.backBgColor || "#ffffff";
    const headerBg = bgCfg.headerColor || "#0a2252";
    const bgImg = bgCfg.bgImageUrl || "";
    const bgOp = Number(bgCfg.bgOpacity ?? 0.15);

    const photo = member.photoUrl || initialsAvatarSvg(member.nameEn || member.nameHi);
    const verifyPayload = `UPBMS|${member.memberCode}|${member.nameEn}|${member.status}`;
    const qrFront = generateQrSvg(verifyPayload, 44, "#0a2252");
    const qrBack = generateQrSvg(verifyPayload, 84, "#0a2252");

    const tplTxt = settings.letterTemplateText || {};
    const rulesText = isEn
      ? (tplTxt.idBackRulesEn || "1. Valid for organizational identification only.\n2. Inform State Office immediately if lost.\n3. Scan QR code above for online verification.")
      : (tplTxt.idBackRulesHi || "1. यह पहचान पत्र केवल संगठनात्मक पहचान हेतु मान्य है।\n2. खो जाने पर तुरंत प्रांतीय कार्यालय को सूचित करें।\n3. ऊपर दिए गए क्यूआर कोड से ऑनलाइन सत्यापन करें।");

    const nameDisp = isEn ? (member.nameEn || member.nameHi) : (member.nameHi || member.nameEn);
    const roleDisp = isEn ? (member.designationEn || member.designationHi) : (member.designationHi || member.designationEn);
    const fatherDisp = isEn ? (member.fatherNameEn || member.fatherName || "—") : (member.fatherName || "—");
    const distDisp = localizeDual(member.district, lang);

    return `
      <div>
        <div id="printableArea" class="id-card-stage">
          <!-- FRONT SIDE -->
          <div class="cr80-card ${member.isCoreMember ? "is-core-pvc" : ""}" style="background:${escapeHtml(frontBg)}">
            ${bgImg ? `<div class="tpl-bg-overlay" style="background-image:url('${escapeHtml(bgImg)}');opacity:${bgOp}"></div>` : ""}
            <div class="tpl-content-layer">
              <div>
                <div class="cr80-header" style="background:${escapeHtml(headerBg)}">
                  <img src="${escapeHtml(settings.logoUrl || "/images/upbms-crest.svg")}" alt="Logo" />
                  <div style="min-width:0">
                    <div class="cr80-org-hi">${escapeHtml(isEn ? settings.orgNameEn : settings.orgNameHi)}</div>
                    <div class="cr80-org-en">${escapeHtml(settings.regNumber)}</div>
                  </div>
                </div>

                <div class="cr80-role-band">
                  ${member.isCoreMember ? "★ " : ""}${escapeHtml(roleDisp)}
                </div>

                <div class="cr80-photo-row">
                  <div class="cr80-photo">
                    <img src="${escapeHtml(photo)}" alt="${escapeHtml(nameDisp)}" />
                  </div>
                </div>

                <div class="cr80-name">${escapeHtml(nameDisp)}</div>
                <div class="cr80-code">ID: ${escapeHtml(member.memberCode)}</div>

                <div class="cr80-table">
                  <div class="cr80-tr"><span>${isEn ? "Father" : "पिता का नाम"}</span><span>${escapeHtml(fatherDisp)}</span></div>
                  <div class="cr80-tr"><span>${isEn ? "District" : "जनपद"}</span><span>${escapeHtml(distDisp)}</span></div>
                  <div class="cr80-tr"><span>${isEn ? "Bank" : "बैंक"}</span><span>${escapeHtml(localizeDual(member.bankName, lang))}</span></div>
                  <div class="cr80-tr"><span>${isEn ? "KO Code" : "केओ कोड"}</span><span>${escapeHtml(member.koCode || "—")}</span></div>
                  <div class="cr80-tr"><span>${isEn ? "Mobile" : "मोबाइल"}</span><span>${escapeHtml(member.mobile)}</span></div>
                  <div class="cr80-tr"><span>${isEn ? "Blood / Exp." : "रक्त / वैधता"}</span><span style="color:#b91c1c">${escapeHtml(member.bloodGroup || "O+")} | ${escapeHtml(member.validUntil || "2027-12-31")}</span></div>
                </div>
              </div>

              <div class="cr80-footer">
                <div>${qrFront}</div>
                <div class="cr80-sign-area">
                  ${
                    useCombined
                      ? `<div>
                           <img src="${escapeHtml(sig.combinedStampSigUrl)}" class="cr80-combined-img" alt="Stamp & Sign" />
                           <div style="font-size:7.6px;font-weight:900;color:#0a2252">${escapeHtml(isEn ? sig.designationEn : sig.designationHi)}</div>
                         </div>`
                      : `${sealUrl ? `<img src="${escapeHtml(sealUrl)}" class="cr80-seal-img" alt="Seal" />` : ""}
                         <div>
                           ${sig.signatureUrl ? `<img src="${escapeHtml(sig.signatureUrl)}" class="cr80-sig-img" alt="Signature" />` : ""}
                           <div style="font-size:7.8px;font-weight:900;color:#0a2252">${escapeHtml(isEn ? sig.nameEn : sig.nameHi)}</div>
                           <div style="font-size:7.2px;font-weight:800;color:#ea580c">${escapeHtml(isEn ? sig.designationEn : sig.designationHi)}</div>
                         </div>`
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- BACK SIDE -->
          <div class="cr80-card ${member.isCoreMember ? "is-core-pvc" : ""}" style="background:${escapeHtml(backBg)}">
            ${bgImg ? `<div class="tpl-bg-overlay" style="background-image:url('${escapeHtml(bgImg)}');opacity:${bgOp}"></div>` : ""}
            <div class="tpl-content-layer">
              <div>
                <div class="cr80-header" style="background:${escapeHtml(headerBg)};justify-content:center;text-align:center">
                  <div>
                    <div class="cr80-org-hi">${isEn ? "VERIFICATION & GUIDELINES" : "सत्यापन एवं आवश्यक निर्देश"}</div>
                    <div class="cr80-org-en">${escapeHtml(settings.shortName)}</div>
                  </div>
                </div>

                <div style="padding:10px 12px;text-align:center">
                  <div style="display:flex;justify-content:center;margin-bottom:5px">${qrBack}</div>
                  <div style="font-size:8.5px;font-weight:900;color:#15803d;background:#dcfce7;padding:2px 8px;border-radius:99px;display:inline-block">
                    ✓ ${isEn ? "QR VERIFIED ACTIVE MEMBER" : "क्यूआर सत्यापित सक्रिय सदस्य"}
                  </div>

                  <div style="text-align:left;margin-top:8px;background:rgba(248,250,252,0.92);border:1px solid #e2e8f0;border-radius:7px;padding:7px;font-size:8.2px;color:#334155;white-space:pre-line;line-height:1.45">${escapeHtml(rulesText)}</div>

                  <div style="margin-top:8px;font-size:8.2px;color:#0f172a;text-align:left">
                    <div style="font-weight:900;color:#0a2252">${isEn ? "State Office:" : "प्रांतीय कार्यालय:"}</div>
                    <div>${escapeHtml(isEn ? settings.headOfficeEn : settings.headOfficeHi)}</div>
                    <div style="margin-top:2px"><b>${isEn ? "Helpline:" : "हेल्पलाइन:"}</b> ${escapeHtml(settings.helplinePrimary)}</div>
                  </div>
                </div>
              </div>

              <div style="background:${escapeHtml(headerBg)};color:#ffd166;text-align:center;font-size:8px;font-weight:800;padding:5px">
                ${escapeHtml(isEn ? settings.taglineEn : settings.taglineHi)}
              </div>
            </div>
          </div>
        </div>
        <div class="no-print" style="max-width:540px;margin:10px auto 0">${renderAuditTraceStrip(auditActor, lang)}</div>
      </div>
    `;
  }

  // ==================== 2. APPOINTMENT LETTER (REQUIRES MEMBER/ADMIN LOGIN) ====================
  function renderAppointmentLetterHtml(member, settings, overrideIds, lang = "hi", auditActor = null) {
    const isEn = lang === "en";
    const officers = resolveSignatories(settings, overrideIds || member.letterSignatoryIds || member.signatoryId);
    const bgCfg = settings.templateBackgrounds?.letter || {};
    const bgColor = bgCfg.bgColor || "#ffffff";
    const headerColor = bgCfg.headerColor || "#0a2252";
    const borderColor = bgCfg.borderColor || "#c59b27";
    const bgImg = bgCfg.bgImageUrl || "";
    const bgOp = Number(bgCfg.bgOpacity ?? 0.14);
    const wmOp = Number(bgCfg.watermarkOpacity ?? 0.05);

    const tplTxt = settings.letterTemplateText || {};
    const photo = member.photoUrl || initialsAvatarSvg(member.nameEn || member.nameHi);
    const qrSvg = generateQrSvg(`UPBMS-LETTER|${member.memberCode}|${member.joinedDate}`, 78, headerColor);

    const nameDisp = isEn ? (member.nameEn || member.nameHi) : (member.nameHi || member.nameEn);
    const fatherDisp = isEn ? (member.fatherNameEn || member.fatherName || "—") : (member.fatherName || "—");
    const roleDisp = isEn ? (member.designationEn || member.designationHi) : (member.designationHi || member.designationEn);
    const distDisp = localizeDual(member.district, lang);
    const blockDisp = isEn ? (member.blockEn || member.block || "—") : (member.block || "—");

    const leftQrHtml = `
      <div style="display:flex;align-items:center;gap:10px">
        ${qrSvg}
        <div style="font-size:0.75rem;color:#475569">
          <div style="font-weight:900;color:${escapeHtml(headerColor)}">${isEn ? "Online QR Verification" : "ऑनलाइन क्यूआर सत्यापन"}</div>
          <div>ID: <b>${escapeHtml(member.memberCode)}</b></div>
          <div>${isEn ? "Status: Active & Valid" : "स्थिति: सक्रिय एवं वैध"}</div>
        </div>
      </div>
    `;

    return `
      <div class="a4-preview-scroll">
        <div id="printableArea" class="a4-sheet" style="background:${escapeHtml(bgColor)};border-color:${escapeHtml(borderColor)}">
          ${bgImg ? `<div class="tpl-bg-overlay" style="background-image:url('${escapeHtml(bgImg)}');opacity:${bgOp}"></div>` : ""}
          ${
            wmOp > 0
              ? `<img src="${escapeHtml(settings.logoUrl || "/images/upbms-crest.svg")}" style="position:absolute;top:52%;left:50%;transform:translate(-50%,-50%);width:300px;height:300px;opacity:${wmOp};pointer-events:none;z-index:0" alt="" />`
              : ""
          }

          <div class="tpl-content-layer">
            <div>
              <div class="a4-letterhead" style="border-bottom-color:${escapeHtml(headerColor)}">
                <div style="display:flex;align-items:center;gap:14px">
                  <img src="${escapeHtml(settings.logoUrl || "/images/upbms-crest.svg")}" style="width:70px;height:70px;border-radius:50%;border:2px solid #ff9933" alt="Logo" />
                  <div>
                    <div style="font-size:1.45rem;font-weight:900;color:${escapeHtml(headerColor)};line-height:1.15">${escapeHtml(isEn ? settings.orgNameEn : settings.orgNameHi)}</div>
                    <div style="font-size:0.86rem;font-weight:800;color:#475569">${escapeHtml(isEn ? settings.orgNameHi : settings.orgNameEn)} (${escapeHtml(settings.shortName)})</div>
                    <div style="font-size:0.78rem;color:#ea580c;font-weight:800">${escapeHtml(settings.regNumber)}</div>
                  </div>
                </div>
                <div style="text-align:right;font-size:0.77rem;color:#334155">
                  <div><b>${isEn ? "Helpline:" : "हेल्पलाइन:"}</b> ${escapeHtml(settings.helplinePrimary)}</div>
                  <div><b>${isEn ? "Email:" : "ईमेल:"}</b> ${escapeHtml(settings.email)}</div>
                  <div>${escapeHtml(isEn ? settings.headOfficeEn : settings.headOfficeHi)}</div>
                </div>
              </div>

              <div style="display:flex;justify-content:space-between;font-size:0.86rem;font-weight:800;margin-bottom:14px;color:#334155;flex-wrap:wrap;gap:8px">
                <span>${isEn ? "Ref. No.:" : "पत्रांक:"} UPBMS/APT/${escapeHtml(member.memberCode)}</span>
                <span>${isEn ? "Issue Date:" : "दिनांक:"} ${escapeHtml(member.joinedDate || new Date().toISOString().slice(0, 10))}</span>
              </div>

              <div style="text-align:center;margin:10px 0 18px">
                <span style="background:${escapeHtml(headerColor)};color:#ffd166;padding:6px 22px;border-radius:999px;font-weight:900;font-size:0.96rem;display:inline-block">
                  ${escapeHtml(isEn ? (tplTxt.docTitleEn || "OFFICIAL APPOINTMENT & MEMBERSHIP CERTIFICATE") : (tplTxt.docTitleHi || "आधिकारिक नियुक्ति एवं सदस्यता प्रमाण-पत्र"))}
                </span>
              </div>

              <div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:16px">
                <div style="font-size:0.95rem;line-height:1.72">
                  <p><b>${isEn ? "To," : "प्रति,"}</b></p>
                  <p style="font-size:1.1rem;font-weight:900;color:${escapeHtml(headerColor)}">${escapeHtml(nameDisp)}</p>
                  <p>${isEn ? "Father's Name:" : "पिता का नाम:"} ${escapeHtml(fatherDisp)}</p>
                  <p>${isEn ? "District:" : "जनपद:"} <b>${escapeHtml(distDisp)}</b> | ${isEn ? "Block/Center:" : "ब्लॉक/केंद्र:"} ${escapeHtml(blockDisp)}</p>
                  <p>${isEn ? "Bank:" : "संबद्ध बैंक:"} ${escapeHtml(localizeDual(member.bankName, lang))} (${isEn ? "KO Code:" : "केओ कोड:"} ${escapeHtml(member.koCode || "—")})</p>
                </div>
                <img src="${escapeHtml(photo)}" style="width:94px;height:112px;object-fit:cover;border:2.5px solid ${escapeHtml(headerColor)};border-radius:8px;flex-shrink:0" alt="Photo" />
              </div>

              <div style="font-size:0.94rem;line-height:1.82;text-align:justify;color:#1e293b">
                <p style="margin-bottom:10px">
                  <b>${isEn ? "Subject:" : "विषय:"}</b> ${escapeHtml(isEn ? (tplTxt.subjectEn || "") : (tplTxt.subjectHi || ""))}
                </p>
                <p style="margin-bottom:12px">
                  ${escapeHtml(isEn ? (tplTxt.bodyParaEn || "") : (tplTxt.bodyParaHi || ""))}
                </p>

                <div style="background:rgba(248,250,252,0.92);border-left:4px solid #ff9933;padding:12px 16px;border-radius:8px;margin:14px 0;font-weight:800;color:${escapeHtml(headerColor)}">
                  🎖️ ${isEn ? "Designated Role:" : "मनोनीत पदनाम:"} <span style="color:#ea580c">${escapeHtml(roleDisp)}</span><br/>
                  🪪 ${isEn ? "Registration ID:" : "सदस्य पंजीकरण संख्या:"} ${escapeHtml(member.memberCode)} &nbsp;|&nbsp; ${isEn ? "Valid Until:" : "वैधता तिथि:"} ${escapeHtml(member.validUntil || "2027-12-31")}
                </div>

                <p>${escapeHtml(isEn ? (tplTxt.pledgeEn || "") : (tplTxt.pledgeHi || ""))}</p>
              </div>
            </div>

            <div>
              ${renderMultiOfficerFooterHtml(officers, settings, leftQrHtml, lang)}
              ${renderAuditTraceStrip(auditActor, lang)}
              <div style="margin-top:8px;background:${escapeHtml(headerColor)};color:#ffffff;text-align:center;font-size:0.74rem;padding:6px;border-radius:6px;font-weight:700">
                ${escapeHtml(isEn ? settings.headOfficeEn : settings.headOfficeHi)} • ${escapeHtml(settings.helplinePrimary)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 3. SIGNED ASSOCIATION DOCUMENT (REQUIRES MEMBER/ADMIN LOGIN) ====================
  function renderAssociationDocumentHtml(docItem, settings, overrideIds, lang = "hi", auditActor = null) {
    if (docItem.uploadedFileUrl && !docItem.contentHi && !docItem.contentEn) {
      return renderExactUploadedFileHtml(docItem, lang);
    }

    const isEn = lang === "en";
    const officers = resolveSignatories(settings, overrideIds || docItem.signatoryIds || docItem.signatoryId);
    const bgCfg = settings.templateBackgrounds?.letter || {};
    const bgColor = bgCfg.bgColor || "#ffffff";
    const headerColor = bgCfg.headerColor || "#0a2252";
    const borderColor = bgCfg.borderColor || "#c59b27";
    const bgImg = bgCfg.bgImageUrl || "";
    const bgOp = Number(bgCfg.bgOpacity ?? 0.14);

    const qrSvg = generateQrSvg(`UPBMS-DOC|${docItem.id}|${docItem.refNo || ""}`, 70, headerColor);
    const titleDisp = isEn ? (docItem.titleEn || docItem.titleHi) : (docItem.titleHi || docItem.titleEn);
    const catDisp = isEn ? (docItem.categoryEn || docItem.categoryHi || "Association Document") : (docItem.categoryHi || docItem.category || "संघ दस्तावेज़");
    const contentDisp = isEn ? (docItem.contentEn || docItem.contentHi || "") : (docItem.contentHi || docItem.contentEn || "");

    const leftQrHtml = `
      <div style="display:flex;align-items:center;gap:10px">
        ${qrSvg}
        <div style="font-size:0.74rem;color:#475569">
          <div style="font-weight:900;color:${escapeHtml(headerColor)}">${isEn ? "Verified Official Document" : "सत्यापित संघ दस्तावेज़"}</div>
          <div>${escapeHtml(docItem.refNo || docItem.id)}</div>
        </div>
      </div>
    `;

    return `
      <div class="a4-preview-scroll">
        <div id="printableArea" class="a4-sheet" style="background:${escapeHtml(bgColor)};border-color:${escapeHtml(borderColor)}">
          ${bgImg ? `<div class="tpl-bg-overlay" style="background-image:url('${escapeHtml(bgImg)}');opacity:${bgOp}"></div>` : ""}
          <div class="tpl-content-layer">
            <div>
              <div class="a4-letterhead" style="border-bottom-color:${escapeHtml(headerColor)}">
                <div style="display:flex;align-items:center;gap:14px">
                  <img src="${escapeHtml(settings.logoUrl || "/images/upbms-crest.svg")}" style="width:66px;height:66px;border-radius:50%;border:2px solid #ff9933" alt="Logo" />
                  <div>
                    <div style="font-size:1.38rem;font-weight:900;color:${escapeHtml(headerColor)};line-height:1.15">${escapeHtml(isEn ? settings.orgNameEn : settings.orgNameHi)}</div>
                    <div style="font-size:0.84rem;font-weight:800;color:#475569">${escapeHtml(isEn ? settings.orgNameHi : settings.orgNameEn)} (${escapeHtml(settings.shortName)})</div>
                    <div style="font-size:0.76rem;color:#ea580c;font-weight:800">${escapeHtml(settings.regNumber)}</div>
                  </div>
                </div>
                <div style="text-align:right;font-size:0.76rem;color:#334155">
                  <div><b>${isEn ? "Helpline:" : "हेल्पलाइन:"}</b> ${escapeHtml(settings.helplinePrimary)}</div>
                  <div>${escapeHtml(isEn ? settings.headOfficeEn : settings.headOfficeHi)}</div>
                </div>
              </div>

              <div style="display:flex;justify-content:space-between;font-size:0.84rem;font-weight:800;color:#334155;margin-bottom:14px;flex-wrap:wrap;gap:8px">
                <span>${isEn ? "Ref. No.:" : "पत्रांक:"} ${escapeHtml(docItem.refNo || "UPBMS/2026/" + docItem.id)}</span>
                <span>${isEn ? "Date:" : "दिनांक:"} ${escapeHtml(docItem.date || new Date().toISOString().slice(0, 10))}</span>
              </div>

              <div style="background:rgba(241,245,249,0.92);border-left:4px solid ${escapeHtml(headerColor)};padding:10px 14px;border-radius:8px;margin-bottom:16px">
                <div style="font-size:0.74rem;font-weight:900;color:#ea580c;text-transform:uppercase">${escapeHtml(catDisp)}</div>
                <div style="font-size:1.05rem;font-weight:900;color:${escapeHtml(headerColor)}">${escapeHtml(titleDisp)}</div>
              </div>

              ${
                docItem.uploadedFileUrl
                  ? `<div style="margin-bottom:14px;text-align:center">
                       <img src="${escapeHtml(docItem.uploadedFileUrl)}" style="max-height:280px;margin:0 auto;border:1px solid #cbd5e1;border-radius:8px;object-fit:contain" alt="Attachment" />
                     </div>`
                  : ""
              }

              <div style="white-space:pre-line;font-size:0.93rem;line-height:1.82;color:#0f172a;text-align:justify">${escapeHtml(contentDisp)}</div>
            </div>

            <div>
              ${renderMultiOfficerFooterHtml(officers, settings, leftQrHtml, lang)}
              ${renderAuditTraceStrip(auditActor, lang)}
              <div style="margin-top:8px;background:${escapeHtml(headerColor)};color:#ffffff;text-align:center;font-size:0.74rem;padding:6px;border-radius:6px;font-weight:700">
                ${escapeHtml(isEn ? settings.headOfficeEn : settings.headOfficeHi)} • ${escapeHtml(settings.email)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 3B. UNSIGNED PUBLIC READING VIEW (FOR VISITORS — ZERO SIGNATURE, ZERO SEAL!) ====================
  function renderUnsignedAssocDocumentHtml(docItem, settings, lang = "hi") {
    const isEn = lang === "en";
    const titleDisp = isEn ? (docItem.titleEn || docItem.titleHi) : (docItem.titleHi || docItem.titleEn);
    const catDisp = isEn ? (docItem.categoryEn || docItem.categoryHi || "Association Information") : (docItem.categoryHi || docItem.category || "संघ जानकारी");
    const contentDisp = isEn ? (docItem.contentEn || docItem.contentHi || "") : (docItem.contentHi || docItem.contentEn || "");

    return `
      <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-bottom:12px;border-bottom:1.5px solid #e2e8f0;margin-bottom:16px">
          <div>
            <span class="badge badge-in_progress">${escapeHtml(catDisp)}</span>
            <h3 style="font-size:1.15rem;font-weight:900;color:#0a2252;margin-top:6px">${escapeHtml(titleDisp)}</h3>
          </div>
          <span style="font-size:0.8rem;font-weight:800;color:#64748b">
            📖 ${isEn ? "Public Informational Copy (Unsigned)" : "सार्वजनिक पठन प्रति (बिना हस्ताक्षर एवं मुहर)"}
          </span>
        </div>

        <div style="white-space:pre-line;font-size:0.94rem;line-height:1.84;color:#1e293b;text-align:justify;margin-bottom:20px">${escapeHtml(contentDisp)}</div>

        <div class="no-print" style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div style="font-size:0.86rem;color:#9a3412;font-weight:800;max-width:560px">
            🔒 ${
              isEn
                ? "Security Policy: Official letterhead copies bearing Office-Bearers' Signatures and Association Seal are strictly restricted to logged-in registered members."
                : "सुरक्षा नीति: पदाधिकारियों के हस्ताक्षर एवं संघ की आधिकारिक मुहर युक्त प्रपत्र केवल पंजीकृत सदस्यों को लॉगिन के उपरांत ही प्राप्त होते हैं।"
            }
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.closeModal(); window.UPBMSApp.openAssocDocModal('${escapeHtml(docItem.id)}')">
            🔑 ${isEn ? "Member Login for Signed Copy" : "हस्ताक्षर/मुहर युक्त प्रति हेतु सदस्य लॉगिन करें"}
          </button>
        </div>
      </div>
    `;
  }

  // ==================== 4. EXACT UPLOADED CIRCULAR / PDF / CERTIFICATE VIEWER (ZERO SIGNATURE ADDED!) ====================
  function renderExactUploadedFileHtml(item, lang = "hi") {
    const isEn = lang === "en";
    const title = isEn ? (item.titleEn || item.titleHi) : (item.titleHi || item.titleEn);
    const issuer = isEn ? (item.issuerEn || item.issuerHi || "") : (item.issuerHi || item.issuer || "");
    const url = item.fileUrl || "";
    const isPdf = item.fileType === "pdf" || url.toLowerCase().endsWith(".pdf") || url.startsWith("data:application/pdf");

    return `
      <div id="printableArea" style="background:#ffffff;border-radius:14px;padding:12px">
        <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:1.1rem;font-weight:900;color:#0a2252">${escapeHtml(title)}</h3>
            <div style="font-size:0.82rem;color:#64748b;font-weight:700">
              ${issuer ? `${escapeHtml(issuer)} • ` : ""}${item.date ? escapeHtml(item.date) : ""}${item.regRef ? ` • ${escapeHtml(item.regRef)}` : ""}
            </div>
          </div>
          ${
            url
              ? `<a href="${escapeHtml(url)}" download="${escapeHtml((item.titleEn || "Document").replace(/\s+/g, "_"))}" class="btn btn-primary btn-sm no-print">
                   ⬇️ ${isEn ? "Download Original File" : "मूल फाइल डाउनलोड करें"}
                 </a>`
              : ""
          }
        </div>

        ${
          !url
            ? `<div style="padding:30px;text-align:center;color:#64748b">${isEn ? "No file attached." : "कोई फाइल संलग्न नहीं है।"}</div>`
            : isPdf
            ? `<iframe src="${escapeHtml(url)}" class="pdf-viewer-iframe" title="${escapeHtml(title)}"></iframe>`
            : `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;display:flex;justify-content:center">
                 <img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" style="max-width:100%;height:auto;object-fit:contain;margin:0 auto" />
               </div>`
        }
      </div>
    `;
  }

  // ==================== 5. SIGNED PAYMENT / DONATION RECEIPT (REQUIRES MEMBER/ADMIN LOGIN) ====================
  function renderReceiptHtml(payment, settings, overrideIds, lang = "hi", auditActor = null) {
    const isEn = lang === "en";
    const officers = resolveSignatories(settings, overrideIds || payment.signatoryIds || payment.signatoryId);
    const bgCfg = settings.templateBackgrounds?.receipt || {};
    const bgColor = bgCfg.bgColor || "#ffffff";
    const headerColor = bgCfg.headerColor || "#0a2252";
    const borderColor = bgCfg.borderColor || "#cbd5e1";
    const bgImg = bgCfg.bgImageUrl || "";
    const bgOp = Number(bgCfg.bgOpacity ?? 0.12);

    const qrSvg = generateQrSvg(`UPBMS-RCP|${payment.receiptNo}|INR:${payment.amount}|${payment.status}`, 76, headerColor);
    const isDonation = payment.paymentCategory === "donation";
    const receiptHeading = isDonation
      ? (isEn ? "CONTRIBUTION / DONATION RECEIPT" : "सहयोग राशि रसीद")
      : (isEn ? "MEMBERSHIP FEE RECEIPT" : "सदस्यता शुल्क रसीद");

    const payerDisp = isEn ? (payment.payerNameEn || payment.payerName) : (payment.payerName || payment.payerNameEn);
    const purposeDisp = isEn ? (payment.purposeEn || payment.purpose) : (payment.purposeHi || payment.purpose);
    const distDisp = localizeDual(payment.district, lang);

    const leftQrHtml = `
      <div style="display:flex;align-items:center;gap:10px">
        ${qrSvg}
        <div style="font-size:0.75rem;color:#475569">
          <div style="font-weight:900;color:${escapeHtml(headerColor)}">${isEn ? "Digital Verification QR" : "डिजिटल सत्यापन क्यूआर"}</div>
          <div>${escapeHtml(payment.receiptNo)}</div>
        </div>
      </div>
    `;

    return `
      <div class="a4-preview-scroll">
        <div id="printableArea" class="a4-sheet" style="min-height:auto;background:${escapeHtml(bgColor)};border-color:${escapeHtml(borderColor)}">
          ${bgImg ? `<div class="tpl-bg-overlay" style="background-image:url('${escapeHtml(bgImg)}');opacity:${bgOp}"></div>` : ""}
          <div class="tpl-content-layer">
            <div>
              <div class="a4-letterhead" style="border-bottom-color:${escapeHtml(headerColor)}">
                <div style="display:flex;align-items:center;gap:12px">
                  <img src="${escapeHtml(settings.logoUrl || "/images/upbms-crest.svg")}" style="width:60px;height:60px;border-radius:50%" alt="Logo" />
                  <div>
                    <div style="font-size:1.28rem;font-weight:900;color:${escapeHtml(headerColor)}">${escapeHtml(isEn ? settings.orgNameEn : settings.orgNameHi)}</div>
                    <div style="font-size:0.8rem;color:#475569;font-weight:700">${escapeHtml(settings.regNumber)}</div>
                  </div>
                </div>
                <div style="text-align:right">
                  <span style="background:${escapeHtml(headerColor)};color:#ffd166;padding:5px 14px;border-radius:8px;font-weight:900;font-size:0.84rem;display:inline-block">
                    ${escapeHtml(receiptHeading)}
                  </span>
                  <div style="font-size:0.8rem;margin-top:5px;font-weight:800">${escapeHtml(payment.receiptNo)}</div>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;background:rgba(248,250,252,0.92);padding:16px;border-radius:12px;border:1px solid #e2e8f0;font-size:0.9rem">
                <div><b>${isEn ? "Contributor / Member:" : "प्राप्तकर्ता / सदस्य नाम:"}</b> ${escapeHtml(payerDisp)}</div>
                <div><b>${isEn ? "Payment Date:" : "भुगतान दिनांक:"}</b> ${escapeHtml(payment.date)}</div>
                <div><b>${isEn ? "Member ID / Category:" : "सदस्य आईडी / श्रेणी:"}</b> ${escapeHtml(payment.memberCode || "—")}</div>
                <div><b>${isEn ? "District:" : "जनपद:"}</b> ${escapeHtml(distDisp || "—")}</div>
                <div><b>${isEn ? "Mobile Number:" : "मोबाइल नंबर:"}</b> ${escapeHtml(payment.mobile || "—")}</div>
                <div><b>${isEn ? "Mode & UTR Ref.:" : "माध्यम एवं यूटीआर:"}</b> ${escapeHtml(payment.mode)} (${escapeHtml(payment.utrNumber)})</div>
                <div style="grid-column:1 / -1"><b>${isEn ? "Purpose:" : "उद्देश्य:"}</b> ${escapeHtml(purposeDisp)}</div>
              </div>

              <div style="margin-top:16px;padding:14px 18px;background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                <div>
                  <div style="font-size:0.8rem;color:#9a3412;font-weight:800">${isEn ? "Total Amount Received" : "कुल प्राप्त राशि"}</div>
                  <div style="font-size:1.65rem;font-weight:900;color:#0a2252">₹ ${escapeHtml(payment.amount)} /-</div>
                </div>
                <span class="badge ${payment.status === "verified" ? "badge-verified" : "badge-pending"}" style="font-size:0.86rem;padding:6px 14px">
                  ${payment.status === "verified" ? (isEn ? "✓ VERIFIED RECEIPT" : "✓ सत्यापित भुगतान") : (isEn ? "⏳ VERIFICATION PENDING" : "⏳ सत्यापन लंबित")}
                </span>
              </div>
            </div>

            <div>
              ${renderMultiOfficerFooterHtml(officers, settings, leftQrHtml, lang)}
              ${renderAuditTraceStrip(auditActor, lang)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 5B. UNSIGNED PAYMENT ACKNOWLEDGEMENT (FOR VISITORS — ZERO SIGNATURE, ZERO SEAL!) ====================
  function renderUnsignedReceiptAckHtml(payment, settings, lang = "hi") {
    const isEn = lang === "en";
    const payerDisp = isEn ? (payment.payerNameEn || payment.payerName) : (payment.payerName || payment.payerNameEn);
    const purposeDisp = isEn ? (payment.purposeEn || payment.purpose) : (payment.purposeHi || payment.purpose);
    const distDisp = localizeDual(payment.district, lang);

    return `
      <div id="printableArea" style="background:#ffffff;border:2px solid #cbd5e1;border-radius:14px;padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1.5px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px">
          <div>
            <div style="font-size:1.15rem;font-weight:900;color:#0a2252">${escapeHtml(isEn ? settings.orgNameEn : settings.orgNameHi)}</div>
            <div style="font-size:0.8rem;color:#64748b;font-weight:700">
              ${isEn ? "Online Payment Reference Summary (Unsigned Visitor Copy)" : "ऑनलाइन भुगतान पावती सारांश (बिना हस्ताक्षर एवं मुहर)"}
            </div>
          </div>
          <span class="badge badge-in_progress" style="font-size:0.82rem;padding:5px 12px">${escapeHtml(payment.receiptNo)}</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;background:#f8fafc;padding:16px;border-radius:12px;border:1px solid #e2e8f0;font-size:0.9rem">
          <div><b>${isEn ? "Name:" : "सहयोगकर्ता नाम:"}</b> ${escapeHtml(payerDisp)}</div>
          <div><b>${isEn ? "Date:" : "दिनांक:"}</b> ${escapeHtml(payment.date)}</div>
          <div><b>${isEn ? "District:" : "जनपद:"}</b> ${escapeHtml(distDisp || "—")}</div>
          <div><b>${isEn ? "Amount:" : "राशि:"}</b> <b style="color:#0a2252">₹ ${escapeHtml(payment.amount)} /-</b></div>
          <div style="grid-column:1 / -1"><b>${isEn ? "Purpose:" : "उद्देश्य:"}</b> ${escapeHtml(purposeDisp)}</div>
        </div>

        <div class="no-print" style="margin-top:16px;background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div style="font-size:0.85rem;color:#9a3412;font-weight:800;max-width:540px">
            🔒 ${
              isEn
                ? "Office-Bearers' Signatures and Official Seal are protected. Please sign in as an active member to view or print signed official receipts."
                : "सुरक्षा कारणों से पदाधिकारी हस्ताक्षर एवं आधिकारिक मुहर युक्त रसीद केवल सदस्य लॉगिन के उपरांत उपलब्ध है।"
            }
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.UPBMSApp.closeModal(); window.UPBMSApp.openReceiptModal('${escapeHtml(payment.id)}')">
            🔑 ${isEn ? "Member Login for Signed Receipt" : "हस्ताक्षर युक्त रसीद हेतु सदस्य लॉगिन"}
          </button>
        </div>
      </div>
    `;
  }

  return {
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
  };
})();
