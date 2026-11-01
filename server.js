const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { createSeedDatabase } = require("./data/seed");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "database.json");

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.settings && parsed.settings.navItems && Array.isArray(parsed.accessLogs)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed reading database.json, falling back to V3 seed:", err.message);
  }
  const seeded = createSeedDatabase();
  saveDb(seeded);
  return seeded;
}

function saveDb(db) {
  db.meta = db.meta || {};
  db.meta.lastUpdated = new Date().toISOString();
  const tmpPath = DB_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmpPath, DB_PATH);
}

let db = loadDb();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8"
};

const CORS_HEADERS = "Content-Type, Authorization, X-Admin-Pin, X-Member-Id, X-Member-Pass";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Payload too large (Max 20MB)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function formatIstTimestamp() {
  try {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());
    return `${parts} IST`;
  } catch (e) {
    return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  }
}

function generateNextAuditCode() {
  db.accessLogs = db.accessLogs || [];
  const nums = db.accessLogs.map((l) => parseInt(String(l.auditCode || "").replace(/\D+/g, "").slice(-4), 10) || 1000);
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `SEC-2026-${next}`;
}

function resolveRequestAuth(req) {
  const adminPinHdr = String(req.headers["x-admin-pin"] || "").trim();
  if (adminPinHdr && adminPinHdr === String(db.settings.adminPin || "1234")) {
    return { isAdmin: true, isMember: false, canAccessSigned: true, actorType: "admin", member: null };
  }
  const memIdHdr = String(req.headers["x-member-id"] || "").trim();
  let memPassHdr = "";
  try {
    memPassHdr = decodeURIComponent(String(req.headers["x-member-pass"] || "")).trim();
  } catch (e) {
    memPassHdr = String(req.headers["x-member-pass"] || "").trim();
  }
  if (memIdHdr && memPassHdr) {
    const found = db.members.find((m) => m.id === memIdHdr);
    if (found && String(found.password || "123456") === memPassHdr) {
      return {
        isAdmin: false,
        isMember: true,
        canAccessSigned: found.status === "active",
        actorType: "member",
        member: found
      };
    }
  }
  return { isAdmin: false, isMember: false, canAccessSigned: false, actorType: "visitor", member: null };
}

function appendAccessLogEntry(req, entry) {
  db.accessLogs = db.accessLogs || [];
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const ua = String(req.headers["user-agent"] || "").slice(0, 65);
  const logItem = {
    id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    auditCode: generateNextAuditCode(),
    timestamp: formatIstTimestamp(),
    actorType: entry.actorType || "member",
    memberId: entry.memberId || "",
    memberCode: entry.memberCode || "ADMIN",
    memberNameHi: entry.memberNameHi || "प्रांतीय एडमिन पैनल",
    memberNameEn: entry.memberNameEn || "State Admin Panel",
    designationHi: entry.designationHi || "",
    designationEn: entry.designationEn || "",
    mobile: entry.mobile || "",
    district: entry.district || "",
    actionType: entry.actionType || "view_signed",
    actionLabelHi: entry.actionLabelHi || "हस्ताक्षर/मुहर युक्त प्रपत्र देखा",
    actionLabelEn: entry.actionLabelEn || "Accessed Signed & Stamped Document",
    targetTitleHi: entry.targetTitleHi || "",
    targetTitleEn: entry.targetTitleEn || "",
    signatoriesUsedHi: entry.signatoriesUsedHi || "",
    signatoriesUsedEn: entry.signatoriesUsedEn || "",
    clientInfo: [ip, ua].filter(Boolean).join(" • ") || "Web Session"
  };
  db.accessLogs.unshift(logItem);
  if (db.accessLogs.length > 500) {
    db.accessLogs = db.accessLogs.slice(0, 500);
  }
  saveDb(db);
  return logItem;
}

function generateNextMemberCode(isCore) {
  if (isCore) {
    const coreNums = db.members
      .filter((m) => m.memberCode && m.memberCode.startsWith("UPBMS-CORE-"))
      .map((m) => parseInt(m.memberCode.replace("UPBMS-CORE-", ""), 10) || 0);
    const next = (coreNums.length ? Math.max(...coreNums) : 0) + 1;
    return `UPBMS-CORE-${String(next).padStart(3, "0")}`;
  } else {
    const genNums = db.members
      .filter((m) => m.memberCode && m.memberCode.startsWith("UPBMS-2026-"))
      .map((m) => parseInt(m.memberCode.replace("UPBMS-2026-", ""), 10) || 100);
    const next = (genNums.length ? Math.max(...genNums) : 100) + 1;
    return `UPBMS-2026-${String(next).padStart(4, "0")}`;
  }
}

function generateNextReceiptNo() {
  const nums = db.payments
    .map((p) => parseInt(String(p.receiptNo || "").replace(/\D+/g, "").slice(-4), 10) || 1000);
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `UPBMS-RCP-2026-${next}`;
}

function generateNextTicketNo() {
  const nums = db.grievances
    .map((g) => parseInt(String(g.ticketNo || "").replace("GRV-2026-", ""), 10) || 100);
  const next = (nums.length ? Math.max(...nums) : 100) + 1;
  return `GRV-2026-${next}`;
}

function escapeCsvCell(val) {
  const s = String(val ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

function sanitizeMemberPublic(m) {
  const copy = { ...m };
  copy.hasPassword = Boolean(copy.password);
  delete copy.password;
  return copy;
}

function sanitizeUploadedItemForVisitor(item, canAccessSigned) {
  if (canAccessSigned || !item.requiresMemberLogin) {
    return { ...item, isLockedForVisitor: false };
  }
  return {
    ...item,
    fileUrl: "",
    isLockedForVisitor: true
  };
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": CORS_HEADERS
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const auth = resolveRequestAuth(req);

    // 1. Bootstrap full portal state (Strips ALL officer signature & seal URLs for unauthenticated visitors!)
    if (pathname === "/api/bootstrap" && req.method === "GET") {
      const publicSettings = { ...db.settings };
      delete publicSettings.adminPin;

      if (!auth.canAccessSigned) {
        publicSettings.sealImageUrl = "";
        publicSettings.signatories = (publicSettings.signatories || []).map((s) => ({
          ...s,
          signatureUrl: "",
          combinedStampSigUrl: ""
        }));
      }

      db.circulars = db.circulars || [];
      db.certificates = db.certificates || [];
      db.accessLogs = db.accessLogs || [];

      return sendJson(res, 200, {
        ok: true,
        signedAssetsUnlocked: auth.canAccessSigned,
        settings: publicSettings,
        slides: [...db.slides].sort((a, b) => (a.order || 99) - (b.order || 99)),
        certificates: db.certificates.map((c) => sanitizeUploadedItemForVisitor(c, auth.canAccessSigned)),
        demands: [...db.demands].sort((a, b) => (a.number || 99) - (b.number || 99)),
        members: [...db.members].map(sanitizeMemberPublic).sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)),
        circulars: [...db.circulars]
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
          .map((c) => sanitizeUploadedItemForVisitor(c, auth.canAccessSigned)),
        externalLinks: [...db.externalLinks].sort((a, b) => (a.order || 99) - (b.order || 99)),
        documents: [...db.documents],
        payments: [...db.payments].sort((a, b) => String(b.date).localeCompare(String(a.date))),
        grievances: [...db.grievances].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        news: [...db.news].sort((a, b) => String(b.date).localeCompare(String(a.date))),
        accessLogs: auth.isAdmin ? [...db.accessLogs] : [],
        meta: db.meta,
        stats: computeStats()
      });
    }

    // 2. Admin Authentication
    if (pathname === "/api/admin/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const pin = String(body.pin || "").trim();
      if (pin === String(db.settings.adminPin || "1234")) {
        return sendJson(res, 200, { ok: true, message: "Admin login successful" });
      }
      return sendJson(res, 401, { ok: false, error: "गलत एडमिन पिन! डेमो पिन 1234 है। / Incorrect Admin PIN (Demo: 1234)" });
    }

    // 2b. Member Login & Automatic Audit Trail Entry
    if (pathname === "/api/member/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const q = String(body.query || "").trim().toLowerCase();
      const pwd = String(body.password || "").trim();
      const found = db.members.find(
        (m) =>
          String(m.memberCode || "").toLowerCase() === q ||
          String(m.mobile || "").toLowerCase() === q
      );
      if (!found) {
        return sendJson(res, 404, { ok: false, error: "सदस्य आईडी या मोबाइल नंबर नहीं मिला। / Member ID or Mobile not found." });
      }
      const expectedPwd = String(found.password || "123456");
      if (pwd !== expectedPwd) {
        return sendJson(res, 401, { ok: false, error: "गलत पासवर्ड! यदि भूल गए हैं तो एडमिन से रीसेट कराएं। / Incorrect password!" });
      }
      const receipts = db.payments.filter(
        (p) => p.memberId === found.id || p.memberCode === found.memberCode || p.mobile === found.mobile
      );

      appendAccessLogEntry(req, {
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
        signatoriesUsedHi: found.status === "active" ? "हस्ताक्षर/मुहर एक्सेस अनलॉक" : "लंबित सदस्यता (हस्ताक्षर लॉक)",
        signatoriesUsedEn: found.status === "active" ? "Signed Assets Access Unlocked" : "Pending Membership (Signatures Locked)"
      });

      return sendJson(res, 200, { ok: true, member: sanitizeMemberPublic(found), receipts });
    }

    // 2c. Record Signature / Seal Usage Audit Log
    if (pathname === "/api/access-logs" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!auth.canAccessSigned) {
        return sendJson(res, 403, { ok: false, error: "Member or Admin login required" });
      }
      const actorMember = auth.member;
      const logItem = appendAccessLogEntry(req, {
        actorType: auth.isAdmin ? "admin" : "member",
        memberId: actorMember ? actorMember.id : (body.memberId || ""),
        memberCode: actorMember ? actorMember.memberCode : "ADMIN",
        memberNameHi: actorMember ? actorMember.nameHi : "प्रांतीय एडमिन (नियंत्रण कक्ष)",
        memberNameEn: actorMember ? actorMember.nameEn : "State Admin (Control Panel)",
        designationHi: actorMember ? actorMember.designationHi : "प्रशासक",
        designationEn: actorMember ? actorMember.designationEn : "Administrator",
        mobile: actorMember ? actorMember.mobile : (db.settings.helpline || ""),
        district: actorMember ? actorMember.district : "लखनऊ मुख्यालय (HQ)",
        actionType: body.actionType || "view_signed",
        actionLabelHi: body.actionLabelHi || "हस्ताक्षर एवं मुहर युक्त दस्तावेज़ का उपयोग किया",
        actionLabelEn: body.actionLabelEn || "Used Signed & Stamped Document",
        targetTitleHi: body.targetTitleHi || "",
        targetTitleEn: body.targetTitleEn || "",
        signatoriesUsedHi: body.signatoriesUsedHi || "",
        signatoriesUsedEn: body.signatoriesUsedEn || ""
      });
      return sendJson(res, 201, { ok: true, logItem });
    }

    if (pathname === "/api/access-logs" && req.method === "DELETE") {
      if (!auth.isAdmin) return sendJson(res, 403, { ok: false, error: "Admin login required" });
      db.accessLogs = [];
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname.startsWith("/api/access-logs/") && req.method === "DELETE") {
      if (!auth.isAdmin) return sendJson(res, 403, { ok: false, error: "Admin login required" });
      const id = pathname.replace("/api/access-logs/", "").trim();
      db.accessLogs = (db.accessLogs || []).filter((l) => l.id !== id);
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname.startsWith("/api/members/") && pathname.endsWith("/reset-password") && req.method === "POST") {
      const id = pathname.replace("/api/members/", "").replace("/reset-password", "").trim();
      const idx = db.members.findIndex((m) => m.id === id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: "Member not found" });
      const body = await readJsonBody(req);
      const newPassword = String(body.newPassword || "").trim();
      if (newPassword.length < 4) {
        return sendJson(res, 400, { ok: false, error: "पासवर्ड कम से कम 4 अक्षरों का होना चाहिए। / Minimum 4 characters required." });
      }
      db.members[idx].password = newPassword;
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    // 3. Update Site Settings (Deep merge nested objects)
    if (pathname === "/api/settings" && req.method === "PUT") {
      const body = await readJsonBody(req);
      const currentPin = db.settings.adminPin || "1234";
      const prev = db.settings;

      const mergedBg = body.templateBackgrounds
        ? {
            letter: { ...(prev.templateBackgrounds?.letter || {}), ...(body.templateBackgrounds.letter || {}) },
            idcard: { ...(prev.templateBackgrounds?.idcard || {}), ...(body.templateBackgrounds.idcard || {}) },
            receipt: { ...(prev.templateBackgrounds?.receipt || {}), ...(body.templateBackgrounds.receipt || {}) }
          }
        : prev.templateBackgrounds;

      db.settings = {
        ...prev,
        ...body,
        socialLinks: { ...(prev.socialLinks || {}), ...(body.socialLinks || {}) },
        headerButtons: { ...(prev.headerButtons || {}), ...(body.headerButtons || {}) },
        sectionTexts: { ...(prev.sectionTexts || {}), ...(body.sectionTexts || {}) },
        aboutVisionMission: { ...(prev.aboutVisionMission || {}), ...(body.aboutVisionMission || {}) },
        termsAndConditions: { ...(prev.termsAndConditions || {}), ...(body.termsAndConditions || {}) },
        letterTemplateText: { ...(prev.letterTemplateText || {}), ...(body.letterTemplateText || {}) },
        campaignBlock: { ...(prev.campaignBlock || {}), ...(body.campaignBlock || {}) },
        templateBackgrounds: mergedBg,
        adminPin: body.newAdminPin ? String(body.newAdminPin).trim() : currentPin
      };
      delete db.settings.newAdminPin;
      saveDb(db);
      const safeSettings = { ...db.settings };
      delete safeSettings.adminPin;
      return sendJson(res, 200, { ok: true, settings: safeSettings });
    }

    // 3b. Update Master Lists (Districts, Banks, BC Companies)
    if (pathname === "/api/meta" && req.method === "PUT") {
      const body = await readJsonBody(req);
      db.meta = {
        ...db.meta,
        ...(Array.isArray(body.districts) ? { districts: body.districts } : {}),
        ...(Array.isArray(body.banks) ? { banks: body.banks } : {}),
        ...(Array.isArray(body.bcCompanies) ? { bcCompanies: body.bcCompanies } : {})
      };
      saveDb(db);
      return sendJson(res, 200, { ok: true, meta: db.meta });
    }

    // 4. File Upload
    if (pathname === "/api/upload" && req.method === "POST") {
      const body = await readJsonBody(req);
      const { filename, dataUrl } = body;
      if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        return sendJson(res, 400, { ok: false, error: "Valid file dataUrl required" });
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return sendJson(res, 400, { ok: false, error: "Malformed base64 dataUrl" });
      }
      const mime = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, "base64");
      const extFromName = path.extname(filename || "").toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".pdf"];
      let ext = allowedExts.includes(extFromName) ? extFromName : ".png";
      if (mime.includes("pdf")) ext = ".pdf";
      else if (mime.includes("jpeg") || mime.includes("jpg")) ext = ".jpg";
      else if (mime.includes("svg")) ext = ".svg";
      else if (mime.includes("webp")) ext = ".webp";

      const safeBase = path
        .basename(filename || "upload", path.extname(filename || ""))
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 40);
      const finalName = `${Date.now()}-${safeBase}${ext}`;
      const fullPath = path.join(UPLOADS_DIR, finalName);
      fs.writeFileSync(fullPath, buffer);
      return sendJson(res, 200, { ok: true, url: `/uploads/${finalName}`, size: buffer.length });
    }

    // 5. Public Member Status Verification (Returns UNSIGNED public summary only!)
    if (pathname.startsWith("/api/verify/") && req.method === "GET") {
      const q = pathname.replace("/api/verify/", "").trim().toLowerCase();
      const found = db.members.find(
        (m) =>
          String(m.memberCode || "").toLowerCase() === q ||
          String(m.mobile || "").toLowerCase() === q ||
          String(m.koCode || "").toLowerCase() === q
      );
      if (!found) {
        return sendJson(res, 404, { ok: false, error: "इस सदस्य संख्या / मोबाइल से कोई रिकॉर्ड नहीं मिला। / Record not found." });
      }
      const receipts = db.payments.filter(
        (p) => p.memberId === found.id || p.memberCode === found.memberCode || p.mobile === found.mobile
      );
      return sendJson(res, 200, { ok: true, member: sanitizeMemberPublic(found), receipts });
    }

    // 6. Members & Core Members CRUD
    if (pathname === "/api/members" && req.method === "POST") {
      const body = await readJsonBody(req);
      const isCore = Boolean(body.isCoreMember);
      const status = body.fromAdmin ? (body.status || "active") : (body.instantDemoVerify ? "active" : "pending");
      const today = new Date().toISOString().slice(0, 10);
      const validDate = new Date();
      validDate.setFullYear(validDate.getFullYear() + 1);
      const validUntil = body.validUntil || validDate.toISOString().slice(0, 10);

      const newMember = {
        id: "mem-" + Date.now(),
        memberCode: body.memberCode || generateNextMemberCode(isCore),
        nameHi: body.nameHi || body.nameEn || "नवीन सदस्य",
        nameEn: body.nameEn || body.nameHi || "New Member",
        fatherName: body.fatherName || "",
        fatherNameEn: body.fatherNameEn || body.fatherName || "",
        isCoreMember: isCore,
        memberCategory: isCore
          ? "Core Committee (प्रदेश मुख्य कार्यकारिणी)"
          : (body.memberCategory || "General Member (सक्रिय सदस्य)"),
        designationHi: body.designationHi || (isCore ? "प्रदेश पदाधिकारी" : "सक्रिय बैंक मित्र सदस्य"),
        designationEn: body.designationEn || (isCore ? "State Executive Member" : "Active Bank Mitra Member"),
        displayOrder: Number(body.displayOrder) || (isCore ? db.members.filter((m) => m.isCoreMember).length + 1 : 100),
        district: body.district || "कानपुर नगर (Kanpur Nagar)",
        block: body.block || "",
        blockEn: body.blockEn || body.block || "",
        bankName: body.bankName || "State Bank of India (SBI)",
        bcCompany: body.bcCompany || "CSC e-Governance Services India Ltd.",
        koCode: body.koCode || "",
        mobile: String(body.mobile || "").trim(),
        whatsapp: String(body.whatsapp || body.mobile || "").trim(),
        email: body.email || "",
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
        validUntil,
        feePaid: Number(body.feePaid) || 0
      };

      db.members.push(newMember);

      let createdPayment = null;
      if (Number(body.feePaid) > 0) {
        createdPayment = {
          id: "pay-" + Date.now(),
          receiptNo: generateNextReceiptNo(),
          paymentCategory: "membership",
          memberId: newMember.id,
          memberCode: newMember.memberCode,
          payerName: newMember.nameHi,
          payerNameEn: newMember.nameEn,
          mobile: newMember.mobile,
          district: newMember.district,
          purposeHi: isCore ? "प्रदेश मुख्य कार्यकारिणी सदस्यता शुल्क" : "वार्षिक सदस्यता पंजीकरण शुल्क",
          purposeEn: isCore ? "State Core Committee Membership Fee" : "Annual Membership Registration Fee",
          purpose: isCore ? "प्रदेश मुख्य कार्यकारिणी सदस्यता शुल्क" : "वार्षिक सदस्यता पंजीकरण शुल्क",
          amount: Number(body.feePaid),
          mode: body.paymentMode || "UPI",
          utrNumber: body.utrNumber || ("DEMO" + String(Date.now()).slice(-8)),
          signatoryIds: newMember.letterSignatoryIds || db.settings.defaultSignatoryIds || [db.settings.defaultSignatoryId || "sig-gs"],
          status: status === "active" ? "verified" : "pending",
          date: today
        };
        db.payments.unshift(createdPayment);
      }

      saveDb(db);
      return sendJson(res, 201, { ok: true, member: sanitizeMemberPublic(newMember), payment: createdPayment });
    }

    if (pathname.startsWith("/api/members/") && (req.method === "PUT" || req.method === "DELETE")) {
      const id = pathname.replace("/api/members/", "").trim();
      const idx = db.members.findIndex((m) => m.id === id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: "Member not found" });

      if (req.method === "DELETE") {
        db.members.splice(idx, 1);
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      const body = await readJsonBody(req);
      const prev = db.members[idx];
      const nextIsCore = body.isCoreMember !== undefined ? Boolean(body.isCoreMember) : prev.isCoreMember;

      let memberCode = body.memberCode || prev.memberCode;
      if (!prev.isCoreMember && nextIsCore && memberCode.startsWith("UPBMS-2026-")) {
        memberCode = generateNextMemberCode(true);
      }

      const updated = {
        ...prev,
        ...body,
        password: body.password ? String(body.password).trim() : (prev.password || "123456"),
        isCoreMember: nextIsCore,
        memberCode,
        displayOrder: body.displayOrder !== undefined ? Number(body.displayOrder) : prev.displayOrder
      };
      db.members[idx] = updated;

      if (prev.status !== "active" && updated.status === "active") {
        db.payments.forEach((p) => {
          if ((p.memberId === updated.id || p.memberCode === prev.memberCode) && p.status === "pending") {
            p.status = "verified";
            p.memberCode = updated.memberCode;
          }
        });
      }

      if (Array.isArray(body.letterSignatoryIds) && body.letterSignatoryIds.length) {
        db.payments.forEach((p) => {
          if (p.memberId === updated.id || p.memberCode === updated.memberCode || p.memberCode === prev.memberCode) {
            p.signatoryIds = body.letterSignatoryIds;
          }
        });
      }

      saveDb(db);
      return sendJson(res, 200, { ok: true, member: sanitizeMemberPublic(updated) });
    }

    // 7. Generic Collections: Slides, Certificates, Demands, Circulars, ExternalLinks, Documents, News
    db.circulars = db.circulars || [];
    db.certificates = db.certificates || [];
    const collectionsMap = {
      "/api/slides": { key: "slides", prefix: "slide" },
      "/api/certificates": { key: "certificates", prefix: "cert" },
      "/api/demands": { key: "demands", prefix: "dem" },
      "/api/circulars": { key: "circulars", prefix: "cir" },
      "/api/external-links": { key: "externalLinks", prefix: "ext" },
      "/api/documents": { key: "documents", prefix: "doc" },
      "/api/news": { key: "news", prefix: "news" }
    };

    for (const [baseRoute, cfg] of Object.entries(collectionsMap)) {
      if (pathname === baseRoute && req.method === "POST") {
        const body = await readJsonBody(req);
        const item = { id: `${cfg.prefix}-${Date.now()}`, ...body };
        if (cfg.key === "circulars" || cfg.key === "news" || cfg.key === "certificates") {
          db[cfg.key].unshift(item);
        } else {
          db[cfg.key].push(item);
        }
        saveDb(db);
        return sendJson(res, 201, { ok: true, item });
      }
      if (pathname.startsWith(baseRoute + "/") && (req.method === "PUT" || req.method === "DELETE")) {
        const id = pathname.slice(baseRoute.length + 1).trim();
        const idx = db[cfg.key].findIndex((x) => x.id === id);
        if (idx === -1) return sendJson(res, 404, { ok: false, error: "Item not found" });
        if (req.method === "DELETE") {
          db[cfg.key].splice(idx, 1);
          saveDb(db);
          return sendJson(res, 200, { ok: true });
        }
        const body = await readJsonBody(req);
        db[cfg.key][idx] = { ...db[cfg.key][idx], ...body, id };
        saveDb(db);
        return sendJson(res, 200, { ok: true, item: db[cfg.key][idx] });
      }
    }

    // 8. Payments & Donations CRUD
    if (pathname === "/api/payments" && req.method === "POST") {
      const body = await readJsonBody(req);
      const item = {
        id: "pay-" + Date.now(),
        receiptNo: generateNextReceiptNo(),
        paymentCategory: body.paymentCategory || "donation",
        memberId: body.memberId || "",
        memberCode: body.memberCode || "DONOR",
        payerName: body.payerName || "सहयोगकर्ता",
        payerNameEn: body.payerNameEn || body.payerName || "Contributor",
        mobile: body.mobile || "",
        district: body.district || "",
        purposeHi: body.purposeHi || body.purpose || "बैंक मित्र संघर्ष एवं कल्याण कोष सहयोग राशि",
        purposeEn: body.purposeEn || "Bank Mitra Struggle & Welfare Fund Contribution",
        purpose: body.purpose || "बैंक मित्र संघर्ष एवं कल्याण कोष सहयोग राशि",
        amount: Number(body.amount) || 0,
        mode: body.mode || "UPI",
        utrNumber: body.utrNumber || ("DEMO" + String(Date.now()).slice(-8)),
        signatoryIds: body.signatoryIds || db.settings.defaultSignatoryIds || [db.settings.defaultSignatoryId || "sig-gs"],
        status: body.status || (body.instantDemoVerify ? "verified" : "pending"),
        date: body.date || new Date().toISOString().slice(0, 10)
      };
      db.payments.unshift(item);
      saveDb(db);
      return sendJson(res, 201, { ok: true, payment: item });
    }

    if (pathname.startsWith("/api/payments/") && (req.method === "PUT" || req.method === "DELETE")) {
      const id = pathname.replace("/api/payments/", "").trim();
      const idx = db.payments.findIndex((p) => p.id === id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: "Payment not found" });
      if (req.method === "DELETE") {
        db.payments.splice(idx, 1);
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }
      const body = await readJsonBody(req);
      db.payments[idx] = { ...db.payments[idx], ...body, id };
      saveDb(db);
      return sendJson(res, 200, { ok: true, payment: db.payments[idx] });
    }

    // 9. Grievances CRUD + Track
    if (pathname.startsWith("/api/grievances/track/") && req.method === "GET") {
      const q = pathname.replace("/api/grievances/track/", "").trim().toLowerCase();
      const matches = db.grievances.filter(
        (g) =>
          String(g.ticketNo || "").toLowerCase() === q ||
          String(g.mobile || "").toLowerCase() === q ||
          String(g.koCode || "").toLowerCase() === q
      );
      return sendJson(res, 200, { ok: true, grievances: matches });
    }

    if (pathname === "/api/grievances" && req.method === "POST") {
      const body = await readJsonBody(req);
      const ticket = {
        id: "grv-" + Date.now(),
        ticketNo: generateNextTicketNo(),
        applicantName: body.applicantName || "",
        applicantNameEn: body.applicantNameEn || body.applicantName || "",
        memberCode: body.memberCode || "",
        mobile: body.mobile || "",
        district: body.district || "",
        bankName: body.bankName || "",
        bcCompany: body.bcCompany || "",
        koCode: body.koCode || "",
        issueType: body.issueType || "अन्य समस्या",
        issueTypeEn: body.issueTypeEn || body.issueType || "Other Issue",
        subject: body.subject || "",
        subjectEn: body.subjectEn || body.subject || "",
        description: body.description || "",
        descriptionEn: body.descriptionEn || body.description || "",
        status: "pending",
        adminRemark: "शिकायत सफलतापूर्वक पंजीकृत हो गई है। प्रांतीय शिकायत निवारण प्रकोष्ठ द्वारा शीघ्र कार्यवाही की जाएगी।",
        adminRemarkEn: "Your grievance has been registered. The State Grievance Redressal Cell will take prompt action.",
        createdAt: new Date().toISOString().slice(0, 10)
      };
      db.grievances.unshift(ticket);
      saveDb(db);
      return sendJson(res, 201, { ok: true, grievance: ticket });
    }

    if (pathname.startsWith("/api/grievances/") && (req.method === "PUT" || req.method === "DELETE")) {
      const id = pathname.replace("/api/grievances/", "").trim();
      const idx = db.grievances.findIndex((g) => g.id === id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: "Grievance not found" });
      if (req.method === "DELETE") {
        db.grievances.splice(idx, 1);
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }
      const body = await readJsonBody(req);
      db.grievances[idx] = { ...db.grievances[idx], ...body, id };
      saveDb(db);
      return sendJson(res, 200, { ok: true, grievance: db.grievances[idx] });
    }

    // 10. CSV Exports & Full Backup
    if (pathname === "/api/export/members.csv" && req.method === "GET") {
      const headers = [
        "Member ID", "Type", "Name (Hindi)", "Name (English)", "Designation (Hi)", "Designation (En)",
        "District", "Block", "Bank Name", "BC Company", "KO/CSP Code",
        "Mobile", "Blood Group", "Status", "Joined Date", "Valid Until", "Fee Paid"
      ];
      const rows = db.members.map((m) => [
        m.memberCode, m.isCoreMember ? "CORE MEMBER" : m.memberCategory,
        m.nameHi, m.nameEn, m.designationHi, m.designationEn,
        m.district, m.block, m.bankName, m.bcCompany, m.koCode,
        m.mobile, m.bloodGroup, m.status, m.joinedDate, m.validUntil, m.feePaid
      ]);
      const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="UPBMS_Members_List.csv"'
      });
      res.end(csv);
      return;
    }

    if (pathname === "/api/export/payments.csv" && req.method === "GET") {
      const headers = [
        "Receipt No", "Date", "Category", "Payer Name", "Member ID", "District",
        "Mobile", "Purpose", "Amount (INR)", "Mode", "UTR Number", "Status"
      ];
      const rows = db.payments.map((p) => [
        p.receiptNo, p.date, p.paymentCategory || "membership", p.payerName, p.memberCode, p.district,
        p.mobile, p.purposeHi || p.purpose, p.amount, p.mode, p.utrNumber, p.status
      ]);
      const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="UPBMS_Payments_Ledger.csv"'
      });
      res.end(csv);
      return;
    }

    if (pathname === "/api/export/access-logs.csv" && req.method === "GET") {
      const headers = [
        "Audit Code", "Date & Time (IST)", "Actor Type", "Member ID", "Member Name (Hi)", "Member Name (En)",
        "Designation", "Mobile", "District", "Action", "Document / Target", "Signatories & Seal Used", "Session Info"
      ];
      const rows = (db.accessLogs || []).map((l) => [
        l.auditCode, l.timestamp, l.actorType, l.memberCode, l.memberNameHi, l.memberNameEn,
        l.designationHi, l.mobile, l.district, l.actionLabelHi, l.targetTitleHi, l.signatoriesUsedHi, l.clientInfo
      ]);
      const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="UPBMS_Signature_Usage_Audit_Logs.csv"'
      });
      res.end(csv);
      return;
    }

    if (pathname === "/api/admin/backup" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="UPBMS_Full_Backup.json"'
      });
      res.end(JSON.stringify(db, null, 2));
      return;
    }

    if (pathname === "/api/admin/restore" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body || !body.settings || !Array.isArray(body.members)) {
        return sendJson(res, 400, { ok: false, error: "Invalid backup JSON format" });
      }
      db = body;
      db.accessLogs = db.accessLogs || [];
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/reset" && req.method === "POST") {
      db = createSeedDatabase();
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    // Static Files
    let relPath = pathname === "/" ? "/index.html" : pathname;
    const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(PUBLIC_DIR, safePath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const fileBuffer = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(fileBuffer);
  } catch (err) {
    console.error("Server error:", err);
    sendJson(res, 500, { ok: false, error: err.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`UPBMS Full-Stack Portal running at http://${HOST}:${PORT}`);
});
