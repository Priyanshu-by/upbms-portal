import base64
import io
import json
import os
import subprocess
from PIL import Image

ROOT = "/home/user/upbms-portal"
PUBLIC = os.path.join(ROOT, "public")
IMG_DIR = os.path.join(PUBLIC, "images")
OUT_HTML = "/home/user/UPBMS_Complete_Pro_V3.html"

# 1. Convert all images & SVGs in /public/images/ to crisp Data URIs
asset_map = {}
for fname in sorted(os.listdir(IMG_DIR)):
    fpath = os.path.join(IMG_DIR, fname)
    if not os.path.isfile(fpath):
        continue
    key = "/images/" + fname
    ext = os.path.splitext(fname)[1].lower()
    if ext == ".svg":
        with open(fpath, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        asset_map[key] = f"data:image/svg+xml;base64,{b64}"
    elif ext in (".jpg", ".jpeg", ".png", ".webp"):
        im = Image.open(fpath)
        if im.mode in ("RGBA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            if im.mode == "P":
                im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[3] if len(im.split()) == 4 else None)
            im = bg
        else:
            im = im.convert("RGB")
        max_w = 1120 if "hero" in fname else (680 if "portal" in fname else 440)
        if im.width > max_w:
            ratio = max_w / float(im.width)
            im = im.resize((max_w, int(im.height * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=82, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        asset_map[key] = f"data:image/jpeg;base64,{b64}"

# 2. Extract V3 seed JSON via Node
seed_json_raw = subprocess.check_output(
    ["node", "-e", "const {createSeedDatabase}=require('./data/seed'); console.log(JSON.stringify(createSeedDatabase()));"],
    cwd=ROOT
).decode("utf-8")

seed_obj = json.loads(seed_json_raw)

def replace_img_paths(obj):
    if isinstance(obj, dict):
        return {k: replace_img_paths(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [replace_img_paths(x) for x in obj]
    if isinstance(obj, str) and obj in asset_map:
        return asset_map[obj]
    return obj

seed_obj = replace_img_paths(seed_obj)
seed_inline_json = json.dumps(seed_obj, ensure_ascii=False)

def read_text_with_assets(path):
    with open(path, "r", encoding="utf-8") as f:
        txt = f.read()
    for k, v in asset_map.items():
        txt = txt.replace(f'"{k}"', f'"{v}"').replace(f"'{k}'", f"'{v}'")
    return txt

css_txt = read_text_with_assets(os.path.join(PUBLIC, "styles.css"))
qr_js = read_text_with_assets(os.path.join(PUBLIC, "qr-helper.js"))
print_js = read_text_with_assets(os.path.join(PUBLIC, "print-templates.js"))
admin_js = read_text_with_assets(os.path.join(PUBLIC, "admin-panel.js"))
app_js = read_text_with_assets(os.path.join(PUBLIC, "app.js"))

# 3. Embedded Full Backend Router for V3 Standalone File
shim_js = """
(function() {
  const SEED_DB = """ + seed_inline_json + """;
  const STORAGE_KEY = "UPBMS_DEMO_DB_V3_SEC_2";

  function cloneSeed() {
    return JSON.parse(JSON.stringify(SEED_DB));
  }

  function loadLocalDb() {
    try {
      const saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.settings && parsed.settings.navItems && Array.isArray(parsed.accessLogs)) return parsed;
      }
    } catch (e) {}
    return cloneSeed();
  }

  let db = loadLocalDb();

  function saveLocalDb() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    } catch (e) {}
  }

  function sanitizeMemberPublic(m) {
    const copy = Object.assign({}, m);
    copy.hasPassword = Boolean(copy.password);
    delete copy.password;
    return copy;
  }

  function formatIstTs() {
    try {
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Kolkata",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      }).format(new Date()) + " IST";
    } catch (e) {
      return new Date().toISOString().replace("T", " ").slice(0, 19);
    }
  }

  function nextAuditCode() {
    db.accessLogs = db.accessLogs || [];
    const nums = db.accessLogs.map(l => parseInt(String(l.auditCode||"").replace(/\\D+/g,"").slice(-4),10)||1000);
    return "SEC-2026-" + ((nums.length ? Math.max(...nums) : 1000) + 1);
  }

  function resolveInitAuth(init) {
    const hdrs = (init && init.headers) || {};
    const getH = (k) => hdrs[k] || hdrs[k.toLowerCase()] || "";
    const adminPin = String(getH("X-Admin-Pin")).trim();
    if (adminPin && adminPin === String(db.settings.adminPin || "1234")) {
      return { isAdmin: true, canAccessSigned: true, member: null };
    }
    const memId = String(getH("X-Member-Id")).trim();
    let memPass = "";
    try { memPass = decodeURIComponent(String(getH("X-Member-Pass"))).trim(); } catch(e) {}
    if (memId && memPass) {
      const found = db.members.find(m => m.id === memId);
      if (found && String(found.password || "123456") === memPass) {
        return { isAdmin: false, canAccessSigned: found.status === "active", member: found };
      }
    }
    return { isAdmin: false, canAccessSigned: false, member: null };
  }

  function appendLocalLog(entry) {
    db.accessLogs = db.accessLogs || [];
    const item = Object.assign({
      id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2,5),
      auditCode: nextAuditCode(),
      timestamp: formatIstTs(),
      clientInfo: "Standalone Browser Session"
    }, entry);
    db.accessLogs.unshift(item);
    saveLocalDb();
    return item;
  }

  function sanitizeUploadItem(item, canAccessSigned) {
    if (canAccessSigned || !item.requiresMemberLogin) return Object.assign({}, item, { isLockedForVisitor: false });
    return Object.assign({}, item, { fileUrl: "", isLockedForVisitor: true });
  }

  function computeStats() {
    const activeMembers = db.members.filter((m) => m.status === "active");
    const coreMembers = activeMembers.filter((m) => m.isCoreMember);
    const pendingMembers = db.members.filter((m) => m.status === "pending");
    const districtsCovered = new Set(activeMembers.map((m) => m.district).filter(Boolean)).size;
    const verifiedPayments = db.payments.filter((p) => p.status === "verified");
    const totalCollection = verifiedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const pendingPayments = db.payments.filter((p) => p.status === "pending").length;
    const resolvedGrievances = db.grievances.filter((g) => g.status === "resolved").length;
    const openGrievances = db.grievances.filter((g) => g.status !== "resolved").length;
    return {
      totalActiveMembers: activeMembers.length,
      totalCoreMembers: coreMembers.length,
      pendingMembersCount: pendingMembers.length,
      districtsCovered: Math.max(districtsCovered, 12),
      totalCollection,
      pendingPaymentsCount: pendingPayments,
      resolvedGrievances,
      openGrievances,
      totalGrievances: db.grievances.length,
      totalExternalPortals: db.externalLinks.filter((l) => l.active !== false).length,
      totalDocuments: db.documents.length,
      totalCirculars: (db.circulars || []).length,
      totalCertificates: (db.certificates || []).length,
      totalAccessLogs: (db.accessLogs || []).length
    };
  }

  function nextMemberCode(isCore) {
    if (isCore) {
      const nums = db.members.filter(m => String(m.memberCode||"").startsWith("UPBMS-CORE-")).map(m => parseInt(m.memberCode.replace("UPBMS-CORE-",""),10)||0);
      return "UPBMS-CORE-" + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
    }
    const nums = db.members.filter(m => String(m.memberCode||"").startsWith("UPBMS-2026-")).map(m => parseInt(m.memberCode.replace("UPBMS-2026-",""),10)||100);
    return "UPBMS-2026-" + String((nums.length ? Math.max(...nums) : 100) + 1).padStart(4, "0");
  }

  function nextReceiptNo() {
    const nums = db.payments.map(p => parseInt(String(p.receiptNo||"").replace(/\\D+/g,"").slice(-4),10)||1000);
    return "UPBMS-RCP-2026-" + ((nums.length ? Math.max(...nums) : 1000) + 1);
  }

  function nextTicketNo() {
    const nums = db.grievances.map(g => parseInt(String(g.ticketNo||"").replace("GRV-2026-",""),10)||100);
    return "GRV-2026-" + ((nums.length ? Math.max(...nums) : 100) + 1);
  }

  function jsonResp(status, obj) {
    const str = JSON.stringify(obj);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(obj),
      text: () => Promise.resolve(str)
    });
  }

  function textResp(status, str) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(str),
      json: () => Promise.resolve({})
    });
  }

  const origFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = async function(input, init) {
    const urlStr = typeof input === "string" ? input : input.url;
    if (!urlStr.startsWith("/api/")) {
      return origFetch ? origFetch(input, init) : jsonResp(404, { ok: false });
    }

    const method = ((init && init.method) || "GET").toUpperCase();
    const pathname = decodeURIComponent(urlStr.split("?")[0]);
    const body = (init && init.body) ? JSON.parse(init.body) : {};
    const auth = resolveInitAuth(init);

    if (pathname === "/api/bootstrap" && method === "GET") {
      const publicSettings = JSON.parse(JSON.stringify(db.settings));
      delete publicSettings.adminPin;
      if (!auth.canAccessSigned) {
        publicSettings.sealImageUrl = "";
        publicSettings.signatories = (publicSettings.signatories || []).map(s => Object.assign({}, s, { signatureUrl: "", combinedStampSigUrl: "" }));
      }
      return jsonResp(200, {
        ok: true,
        signedAssetsUnlocked: auth.canAccessSigned,
        settings: publicSettings,
        slides: [...db.slides].sort((a,b)=>(a.order||99)-(b.order||99)),
        certificates: (db.certificates || []).map(c => sanitizeUploadItem(c, auth.canAccessSigned)),
        demands: [...db.demands].sort((a,b)=>(a.number||99)-(b.number||99)),
        members: [...db.members].map(sanitizeMemberPublic).sort((a,b)=>(a.displayOrder||999)-(b.displayOrder||999)),
        circulars: (db.circulars || []).map(c => sanitizeUploadItem(c, auth.canAccessSigned)),
        externalLinks: [...db.externalLinks].sort((a,b)=>(a.order||99)-(b.order||99)),
        documents: [...db.documents],
        payments: [...db.payments],
        grievances: [...db.grievances],
        news: [...db.news],
        accessLogs: auth.isAdmin ? [...(db.accessLogs || [])] : [],
        meta: db.meta,
        stats: computeStats()
      });
    }

    if (pathname === "/api/admin/login" && method === "POST") {
      if (String(body.pin||"").trim() === String(db.settings.adminPin || "1234")) {
        return jsonResp(200, { ok: true });
      }
      return jsonResp(401, { ok: false, error: "गलत एडमिन पिन! डेमो पिन 1234 है। / Incorrect PIN (Demo: 1234)" });
    }

    if (pathname === "/api/member/login" && method === "POST") {
      const q = String(body.query || "").trim().toLowerCase();
      const pwd = String(body.password || "").trim();
      const found = db.members.find(m =>
        String(m.memberCode||"").toLowerCase() === q ||
        String(m.mobile||"").toLowerCase() === q
      );
      if (!found) return jsonResp(404, { ok: false, error: "सदस्य आईडी या मोबाइल नंबर नहीं मिला। / Member not found." });
      if (pwd !== String(found.password || "123456")) {
        return jsonResp(401, { ok: false, error: "गलत पासवर्ड! एडमिन पैनल से रीसेट किया जा सकता है। / Incorrect password!" });
      }
      const receipts = db.payments.filter(p => p.memberId === found.id || p.memberCode === found.memberCode || p.mobile === found.mobile);
      appendLocalLog({
        actorType: "member",
        memberId: found.id,
        memberCode: found.memberCode,
        memberNameHi: found.nameHi,
        memberNameEn: found.nameEn,
        designationHi: found.designationHi,
        designationEn: found.designationEn,
        mobile: found.mobile,
        district: found.district,
        actionType: "member_login",
        actionLabelHi: "सदस्य पोर्टल लॉगिन किया (सुरक्षित सत्र प्रारंभ)",
        actionLabelEn: "Logged into Member Portal (Secure Session Started)",
        targetTitleHi: "सदस्य लॉगिन सत्यापन",
        targetTitleEn: "Member Login Authentication",
        signatoriesUsedHi: found.status === "active" ? "हस्ताक्षर/मुहर एक्सेस अनलॉक" : "लंबित सदस्यता",
        signatoriesUsedEn: found.status === "active" ? "Signed Assets Access Unlocked" : "Pending Membership"
      });
      return jsonResp(200, { ok: true, member: sanitizeMemberPublic(found), receipts });
    }

    if (pathname === "/api/access-logs" && method === "POST") {
      if (!auth.canAccessSigned) return jsonResp(403, { ok: false });
      const m = auth.member;
      const logItem = appendLocalLog({
        actorType: auth.isAdmin ? "admin" : "member",
        memberId: m ? m.id : (body.memberId || ""),
        memberCode: m ? m.memberCode : "ADMIN",
        memberNameHi: m ? m.nameHi : "प्रांतीय एडमिन (नियंत्रण कक्ष)",
        memberNameEn: m ? m.nameEn : "State Admin (Control Panel)",
        designationHi: m ? m.designationHi : "प्रशासक",
        designationEn: m ? m.designationEn : "Administrator",
        mobile: m ? m.mobile : "",
        district: m ? m.district : "लखनऊ मुख्यालय (HQ)",
        actionType: body.actionType || "view_signed",
        actionLabelHi: body.actionLabelHi || "",
        actionLabelEn: body.actionLabelEn || "",
        targetTitleHi: body.targetTitleHi || "",
        targetTitleEn: body.targetTitleEn || "",
        signatoriesUsedHi: body.signatoriesUsedHi || "",
        signatoriesUsedEn: body.signatoriesUsedEn || ""
      });
      return jsonResp(201, { ok: true, logItem });
    }

    if (pathname === "/api/access-logs" && method === "DELETE") {
      db.accessLogs = [];
      saveLocalDb();
      return jsonResp(200, { ok: true });
    }

    if (pathname.startsWith("/api/access-logs/") && method === "DELETE") {
      const id = pathname.replace("/api/access-logs/", "").trim();
      db.accessLogs = (db.accessLogs || []).filter(l => l.id !== id);
      saveLocalDb();
      return jsonResp(200, { ok: true });
    }

    if (pathname.startsWith("/api/members/") && pathname.endsWith("/reset-password") && method === "POST") {
      const id = pathname.replace("/api/members/", "").replace("/reset-password", "").trim();
      const idx = db.members.findIndex(m => m.id === id);
      if (idx === -1) return jsonResp(404, { ok: false });
      db.members[idx].password = String(body.newPassword || "123456").trim();
      saveLocalDb();
      return jsonResp(200, { ok: true });
    }

    if (pathname === "/api/settings" && method === "PUT") {
      const prev = db.settings;
      const currentPin = prev.adminPin || "1234";
      const mergedBg = body.templateBackgrounds
        ? {
            letter: Object.assign({}, prev.templateBackgrounds?.letter || {}, body.templateBackgrounds.letter || {}),
            idcard: Object.assign({}, prev.templateBackgrounds?.idcard || {}, body.templateBackgrounds.idcard || {}),
            receipt: Object.assign({}, prev.templateBackgrounds?.receipt || {}, body.templateBackgrounds.receipt || {})
          }
        : prev.templateBackgrounds;

      db.settings = Object.assign({}, prev, body, {
        socialLinks: Object.assign({}, prev.socialLinks || {}, body.socialLinks || {}),
        headerButtons: Object.assign({}, prev.headerButtons || {}, body.headerButtons || {}),
        sectionTexts: Object.assign({}, prev.sectionTexts || {}, body.sectionTexts || {}),
        aboutVisionMission: Object.assign({}, prev.aboutVisionMission || {}, body.aboutVisionMission || {}),
        termsAndConditions: Object.assign({}, prev.termsAndConditions || {}, body.termsAndConditions || {}),
        letterTemplateText: Object.assign({}, prev.letterTemplateText || {}, body.letterTemplateText || {}),
        campaignBlock: Object.assign({}, prev.campaignBlock || {}, body.campaignBlock || {}),
        templateBackgrounds: mergedBg,
        adminPin: body.newAdminPin ? String(body.newAdminPin).trim() : currentPin
      });
      delete db.settings.newAdminPin;
      saveLocalDb();
      return jsonResp(200, { ok: true, settings: db.settings });
    }

    if (pathname === "/api/meta" && method === "PUT") {
      db.meta = Object.assign({}, db.meta, body);
      saveLocalDb();
      return jsonResp(200, { ok: true, meta: db.meta });
    }

    if (pathname === "/api/upload" && method === "POST") {
      return jsonResp(200, { ok: true, url: body.dataUrl });
    }

    if (pathname.startsWith("/api/verify/") && method === "GET") {
      const q = pathname.replace("/api/verify/", "").trim().toLowerCase();
      const found = db.members.find(m =>
        String(m.memberCode||"").toLowerCase() === q ||
        String(m.mobile||"").toLowerCase() === q ||
        String(m.koCode||"").toLowerCase() === q
      );
      if (!found) return jsonResp(404, { ok: false, error: "रिकॉर्ड नहीं मिला। / Record not found." });
      const receipts = db.payments.filter(p => p.memberId === found.id || p.memberCode === found.memberCode || p.mobile === found.mobile);
      return jsonResp(200, { ok: true, member: sanitizeMemberPublic(found), receipts });
    }

    if (pathname === "/api/members" && method === "POST") {
      const isCore = Boolean(body.isCoreMember);
      const status = body.fromAdmin ? (body.status || "active") : (body.instantDemoVerify ? "active" : "pending");
      const today = new Date().toISOString().slice(0, 10);
      const vd = new Date(); vd.setFullYear(vd.getFullYear() + 1);
      const newMember = {
        id: "mem-" + Date.now(),
        memberCode: body.memberCode || nextMemberCode(isCore),
        nameHi: body.nameHi || body.nameEn || "नवीन सदस्य",
        nameEn: body.nameEn || body.nameHi || "New Member",
        fatherName: body.fatherName || "",
        fatherNameEn: body.fatherNameEn || body.fatherName || "",
        isCoreMember: isCore,
        memberCategory: isCore ? "Core Committee" : (body.memberCategory || "General Member"),
        designationHi: body.designationHi || (isCore ? "प्रदेश पदाधिकारी" : "सक्रिय बैंक मित्र सदस्य"),
        designationEn: body.designationEn || "Active Bank Mitra Member",
        displayOrder: Number(body.displayOrder) || (isCore ? 5 : 100),
        district: body.district || "कानपुर नगर (Kanpur Nagar)",
        block: body.block || "",
        blockEn: body.blockEn || body.block || "",
        bankName: body.bankName || "State Bank of India (SBI)",
        bcCompany: body.bcCompany || "CSC e-Governance Services India Ltd.",
        koCode: body.koCode || "",
        mobile: String(body.mobile || ""),
        whatsapp: String(body.whatsapp || body.mobile || ""),
        bloodGroup: body.bloodGroup || "O+",
        photoUrl: body.photoUrl || "",
        messageHi: body.messageHi || "",
        messageEn: body.messageEn || "",
        password: String(body.password || "123456").trim(),
        signatoryId: body.signatoryId || db.settings.defaultSignatoryId || "sig-gs",
        letterSignatoryIds: Array.isArray(body.letterSignatoryIds) && body.letterSignatoryIds.length
          ? body.letterSignatoryIds
          : (db.settings.defaultSignatoryIds || [body.signatoryId || db.settings.defaultSignatoryId || "sig-gs"]),
        status,
        joinedDate: body.joinedDate || today,
        validUntil: body.validUntil || vd.toISOString().slice(0, 10),
        feePaid: Number(body.feePaid) || 0
      };
      db.members.push(newMember);
      let createdPayment = null;
      if (Number(body.feePaid) > 0) {
        createdPayment = {
          id: "pay-" + Date.now(),
          receiptNo: nextReceiptNo(),
          memberId: newMember.id,
          memberCode: newMember.memberCode,
          payerName: newMember.nameHi,
          payerNameEn: newMember.nameEn,
          mobile: newMember.mobile,
          district: newMember.district,
          paymentCategory: "membership",
          purposeHi: "वार्षिक सदस्यता पंजीकरण शुल्क",
          purposeEn: "Annual Membership Registration Fee",
          purpose: "वार्षिक सदस्यता पंजीकरण शुल्क",
          amount: Number(body.feePaid),
          mode: "UPI",
          utrNumber: body.utrNumber || ("DEMO" + String(Date.now()).slice(-8)),
          status: status === "active" ? "verified" : "pending",
          date: today,
          signatoryIds: newMember.letterSignatoryIds || db.settings.defaultSignatoryIds || ["sig-gs"]
        };
        db.payments.unshift(createdPayment);
      }
      saveLocalDb();
      return jsonResp(201, { ok: true, member: sanitizeMemberPublic(newMember), payment: createdPayment });
    }

    if (pathname.startsWith("/api/members/") && (method === "PUT" || method === "DELETE")) {
      const id = pathname.replace("/api/members/", "").trim();
      const idx = db.members.findIndex(m => m.id === id);
      if (idx === -1) return jsonResp(404, { ok: false });
      if (method === "DELETE") {
        db.members.splice(idx, 1);
        saveLocalDb();
        return jsonResp(200, { ok: true });
      }
      const prev = db.members[idx];
      const nextIsCore = body.isCoreMember !== undefined ? Boolean(body.isCoreMember) : prev.isCoreMember;
      let memberCode = body.memberCode || prev.memberCode;
      if (!prev.isCoreMember && nextIsCore && String(memberCode).startsWith("UPBMS-2026-")) {
        memberCode = nextMemberCode(true);
      }
      db.members[idx] = Object.assign({}, prev, body, {
        password: body.password ? String(body.password).trim() : (prev.password || "123456"),
        isCoreMember: nextIsCore,
        memberCode
      });
      if (Array.isArray(body.letterSignatoryIds) && body.letterSignatoryIds.length) {
        db.payments.forEach(p => {
          if (p.memberId === db.members[idx].id || p.memberCode === db.members[idx].memberCode || p.memberCode === prev.memberCode) {
            p.signatoryIds = body.letterSignatoryIds;
          }
        });
      }
      if (prev.status !== "active" && db.members[idx].status === "active") {
        db.payments.forEach(p => {
          if (p.memberId === id && p.status === "pending") p.status = "verified";
        });
      }
      saveLocalDb();
      return jsonResp(200, { ok: true, member: sanitizeMemberPublic(db.members[idx]) });
    }

    const colls = {
      "/api/slides": ["slides", "slide"],
      "/api/certificates": ["certificates", "cert"],
      "/api/demands": ["demands", "dem"],
      "/api/external-links": ["externalLinks", "ext"],
      "/api/circulars": ["circulars", "cir"],
      "/api/documents": ["documents", "doc"],
      "/api/news": ["news", "news"]
    };
    for (const [route, [key, pref]] of Object.entries(colls)) {
      if (!db[key]) db[key] = [];
      if (pathname === route && method === "POST") {
        const item = Object.assign({ id: pref + "-" + Date.now() }, body);
        if (key === "circulars" || key === "news" || key === "certificates") db[key].unshift(item);
        else db[key].push(item);
        saveLocalDb();
        return jsonResp(201, { ok: true, item });
      }
      if (pathname.startsWith(route + "/") && (method === "PUT" || method === "DELETE")) {
        const id = pathname.slice(route.length + 1);
        const idx = db[key].findIndex(x => x.id === id);
        if (idx === -1) return jsonResp(404, { ok: false });
        if (method === "DELETE") db[key].splice(idx, 1);
        else db[key][idx] = Object.assign({}, db[key][idx], body, { id });
        saveLocalDb();
        return jsonResp(200, { ok: true });
      }
    }

    if (pathname === "/api/payments" && method === "POST") {
      const item = {
        id: "pay-" + Date.now(),
        receiptNo: nextReceiptNo(),
        memberId: body.memberId || "",
        memberCode: body.memberCode || "DONOR",
        payerName: body.payerName || "सहयोगकर्ता",
        payerNameEn: body.payerNameEn || body.payerName || "Contributor",
        mobile: body.mobile || "",
        district: body.district || "",
        paymentCategory: body.paymentCategory || "donation",
        purposeHi: body.purposeHi || body.purpose || "बैंक मित्र संघर्ष कोष सहयोग राशि",
        purposeEn: body.purposeEn || "Bank Mitra Welfare Fund Contribution",
        purpose: body.purpose || "बैंक मित्र संघर्ष कोष सहयोग राशि",
        amount: Number(body.amount) || 0,
        mode: body.mode || "UPI",
        utrNumber: body.utrNumber || ("DEMO" + String(Date.now()).slice(-8)),
        status: body.status || (body.instantDemoVerify ? "verified" : "pending"),
        date: new Date().toISOString().slice(0, 10),
        signatoryIds: db.settings.defaultSignatoryIds || ["sig-gs"]
      };
      db.payments.unshift(item);
      saveLocalDb();
      return jsonResp(201, { ok: true, payment: item });
    }

    if (pathname.startsWith("/api/payments/") && (method === "PUT" || method === "DELETE")) {
      const id = pathname.replace("/api/payments/", "");
      const idx = db.payments.findIndex(p => p.id === id);
      if (idx === -1) return jsonResp(404, { ok: false });
      if (method === "DELETE") db.payments.splice(idx, 1);
      else db.payments[idx] = Object.assign({}, db.payments[idx], body, { id });
      saveLocalDb();
      return jsonResp(200, { ok: true });
    }

    if (pathname.startsWith("/api/grievances/track/") && method === "GET") {
      const q = pathname.replace("/api/grievances/track/", "").trim().toLowerCase();
      const matches = db.grievances.filter(g => String(g.ticketNo||"").toLowerCase() === q || String(g.mobile||"").toLowerCase() === q);
      return jsonResp(200, { ok: true, grievances: matches });
    }

    if (pathname === "/api/grievances" && method === "POST") {
      const ticket = Object.assign({
        id: "grv-" + Date.now(),
        ticketNo: nextTicketNo(),
        status: "pending",
        adminRemark: "शिकायत सफलतापूर्वक पंजीकृत हो गई है। प्रांतीय शिकायत निवारण प्रकोष्ठ द्वारा शीघ्र कार्यवाही की जाएगी।",
        adminRemarkEn: "Your grievance has been registered. The State Grievance Cell will take prompt action.",
        createdAt: new Date().toISOString().slice(0, 10)
      }, body);
      db.grievances.unshift(ticket);
      saveLocalDb();
      return jsonResp(201, { ok: true, grievance: ticket });
    }

    if (pathname.startsWith("/api/grievances/") && (method === "PUT" || method === "DELETE")) {
      const id = pathname.replace("/api/grievances/", "");
      const idx = db.grievances.findIndex(g => g.id === id);
      if (idx === -1) return jsonResp(404, { ok: false });
      if (method === "DELETE") db.grievances.splice(idx, 1);
      else db.grievances[idx] = Object.assign({}, db.grievances[idx], body, { id });
      saveLocalDb();
      return jsonResp(200, { ok: true });
    }

    if (pathname === "/api/export/members.csv" && method === "GET") {
      const rows = [["Member ID","Name (Hi)","Name (En)","Designation","District","Bank","KO Code","Mobile","Status"],
        ...db.members.map(m => [m.memberCode,m.nameHi,m.nameEn,m.designationHi,m.district,m.bankName,m.koCode,m.mobile,m.status])];
      const csv = "\\uFEFF" + rows.map(r => r.map(c => '"' + String(c??"").replace(/"/g,'""') + '"').join(",")).join("\\r\\n");
      return textResp(200, csv);
    }

    if (pathname === "/api/export/payments.csv" && method === "GET") {
      const rows = [["Receipt No","Date","Name","District","Mobile","Amount","Status"],
        ...db.payments.map(p => [p.receiptNo,p.date,p.payerName,p.district,p.mobile,p.amount,p.status])];
      const csv = "\\uFEFF" + rows.map(r => r.map(c => '"' + String(c??"").replace(/"/g,'""') + '"').join(",")).join("\\r\\n");
      return textResp(200, csv);
    }

    if (pathname === "/api/export/access-logs.csv" && method === "GET") {
      const rows = [["Audit Code","Date & Time","Member ID","Name","Mobile","District","Action","Document","Signatories Used"],
        ...(db.accessLogs || []).map(l => [l.auditCode,l.timestamp,l.memberCode,l.memberNameHi,l.mobile,l.district,l.actionLabelHi,l.targetTitleHi,l.signatoriesUsedHi])];
      const csv = "\\uFEFF" + rows.map(r => r.map(c => '"' + String(c??"").replace(/"/g,'""') + '"').join(",")).join("\\r\\n");
      return textResp(200, csv);
    }

    if (pathname === "/api/admin/backup" && method === "GET") {
      return textResp(200, JSON.stringify(db, null, 2));
    }

    if (pathname === "/api/admin/reset" && method === "POST") {
      db = cloneSeed();
      saveLocalDb();
      return jsonResp(200, { ok: true });
    }

    return jsonResp(404, { ok: false });
  };
})();
"""

crest_uri = asset_map["/images/upbms-crest.svg"]

html_out = f"""<!DOCTYPE html>
<html lang="hi" data-theme="navy_saffron">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>उत्तर प्रदेश बैंक मित्र संघ (UPBMS) — V3 Complete Pro</title>
  <link rel="icon" href="{crest_uri}" />
  <style>
{css_txt}
  </style>
</head>
<body>
  <div id="appRoot">
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:#051537;color:#ffd166;font-family:sans-serif">
      <img src="{crest_uri}" style="width:84px;height:84px" alt="UPBMS" />
      <div style="font-size:1.2rem;font-weight:800">उत्तर प्रदेश बैंक मित्र संघ (UPBMS) पोर्टल लोड हो रहा है...</div>
    </div>
  </div>
  <div id="modalRoot"></div>
  <div id="toastRoot" class="toast-container"></div>

  <script>
{shim_js}
  </script>
  <script>
{qr_js}
  </script>
  <script>
{print_js}
  </script>
  <script>
{admin_js}
  </script>
  <script>
{app_js}
  </script>
</body>
</html>
"""

with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_out)

print("Generated V3:", OUT_HTML, "Size KB:", round(os.path.getsize(OUT_HTML) / 1024, 1))
