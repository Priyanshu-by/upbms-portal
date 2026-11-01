# उत्तर प्रदेश बैंक मित्र संघ (UPBMS) — Full-Stack Web Portal
## Developer Handover & Production Deployment Guide

यह पैकेज **उत्तर प्रदेश बैंक मित्र संघ (UPBMS)** के संपूर्ण वेब पोर्टल और ज़ीरो-कोड एडमिन कंट्रोल पैनल (CMS) का पूरा वर्किंग सोर्स कोड है। इसे इस तरह मॉड्यूलर बनाया गया है कि डेवलपर बिना दोबारा कोडिंग किए इसे सीधे चला सके, कस्टमाइज़ कर सके और प्रोडक्शन सर्वर पर लाइव (Deploy) कर सके।

---

## 1. Quick Start (लोकल कंप्यूटर या सर्वर पर तुरंत चलाएँ)

**आवश्यकता (Prerequisite):** Node.js `v18+` (इसमें किसी बाहरी भारी पैकेज की बाध्यता नहीं है — यह सीधे शुद्ध Node.js पर चलता है)।

```bash
cd upbms-portal
node server.js
```

सर्वर चालू होते ही ब्राउज़र में खोलें:
- **Live Portal URL:** `http://localhost:3000`
- **Default Demo Admin PIN:** `1234` (फुटर में `⚙️ एडमिन पैनल` बटन से)
- **Default Demo Member Login:** सदस्य ID `UPBMS-CORE-001` या `UPBMS-2026-0101` (या मोबाइल `9450011223`) | पासवर्ड: `123456`

*(नोट: इस ZIP में `UPBMS_Complete_Pro_V3.html` भी शामिल है जिसे बिना सर्वर चलाए सीधे ब्राउज़र में डबल-क्लिक करके विजुअल रेफरेंस के रूप में देखा जा सकता है।)*

---

## 2. Folder & File Structure (कौन-सी फाइल किस काम की है)

```text
upbms-portal/
├── package.json                  # Node.js start scripts (node server.js)
├── server.js                     # मुख्य बैकएंड सर्वर, सभी REST API, सुरक्षा गेट व CSV एक्सपोर्ट
├── build_standalone_v3.py        # ऑफलाइन सिंगल-फाइल डेमो HTML जनरेटर स्क्रिप्ट (वैकल्पिक)
├── data/
│   ├── seed.js                   # प्रारंभिक डेटा स्ट्रक्चर (75 जिले, बैंक, BC कंपनियाँ, डिफ़ॉल्ट सेटिंग्स)
│   └── database.json             # रनटाइम JSON डेटाबेस (सर्वर चलने पर स्वतः बनता व अपडेट होता है)
└── public/                       # फ्रंटएंड फाइलें (SPA)
    ├── index.html                # मुख्य HTML शेल व मेटा टैग्स
    ├── styles.css                # संपूर्ण रिस्पॉन्सिव ऑटो-फिट CSS + नेवी/केसरिया थीम + @media print नियम
    ├── qr-helper.js              # डायनामिक SVG QR कोड व UPI QR जनरेटर
    ├── print-templates.js        # CR80 PVC ID Card (54mm × 85.6mm) व A4 (210mm × 297mm) लेटर/रसीद/ज्ञापन रेंडरर
    ├── app.js                    # मुख्य वेबसाइट लॉजिक, द्विभाषी (हिंदी ⇄ English) इंजन, सदस्य लॉगिन व पब्लिक पेज
    ├── admin-panel.js            # संपूर्ण एडमिन CMS (14 टैब्स — मेन्यू नाम से लेकर हस्ताक्षर व सुरक्षा लॉग तक)
    ├── images/                   # लोगो, क्रेस्ट, सैंपल फोटो, हस्ताक्षर व SVG ग्राफिक्स
    └── uploads/                  # एडमिन/सदस्य द्वारा अपलोड की गई फाइलें (फोटो, हस्ताक्षर, मुहर, PDF परिपत्र)
```

---

## 3. Core Architecture & Business Rules (महत्वपूर्ण नियम जिन्हें बनाए रखना अनिवार्य है)

1. **100% द्विभाषी (हिंदी ⇄ English):** पूरी वेबसाइट शुद्ध हिंदी और English दोनों में काम करती है।
2. **हस्ताक्षर एवं मुहर सुरक्षा नियम (Strict Signature & Seal Security Gate):**
   - बिना मेंबर लॉगिन किए किसी भी सामान्य विज़िटर को **पदाधिकारियों के हस्ताक्षर या आधिकारिक संघ मुहर** कहीं भी नहीं दिखती (`/api/bootstrap` बिना लॉगिन के `sealImageUrl`, `signatureUrl`, `combinedStampSigUrl` हटा देता है)।
   - **पहचान पत्र (ID Card), नियुक्ति पत्र (Appointment Letter), शुल्क/सहयोग रसीद (Receipt) और हस्ताक्षरित संघ दस्तावेज़/ज्ञापन** केवल **Member Login** (सक्रिय सदस्य) के बाद ही खुलते व प्रिंट होते हैं।
   - सामान्य विज़िटर को केवल बिना हस्ताक्षर/मुहर वाला पब्लिक वेरिफिकेशन और सादा टेक्स्ट दिखता है।
3. **हस्ताक्षरकर्ता चयन केवल एडमिन में (Admin-Only Signatory Assignment):**
   - मेंबर लॉगिन में सदस्य को हस्ताक्षरकर्ता चुनने का विकल्प **कभी नहीं दिखता**।
   - केवल **Admin** ही सदस्य को जोड़ते/संशोधित (`Edit/Modify`) करते समय या ज्ञापन/रसीद संशोधित करते समय यह तय करता है कि किस पदाधिकारी (एक या एक से अधिक) के हस्ताक्षर लगेंगे, और वे **अलग मुहर + साइन (`separate`)** दिखेंगे या **मुहर + साइन एक साथ (`combined`)**।
4. **गोपनीय उपयोग ट्रैकिंग (Silent Admin-Only Usage Audit Log):**
   - जब भी कोई सदस्य लॉगिन करता है या हस्ताक्षर/मुहर युक्त कार्ड, लेटर, रसीद या ज्ञापन देखता/प्रिंट करता है, तो बैकएंड में चुपचाप उसका पूरा लॉग (`SEC-2026-XXXX`, नाम, ID, जिला, मोबाइल, समय, प्रपत्र व हस्ताक्षर विवरण) दर्ज होता है।
   - यह ट्रैकिंग डेटा **सदस्य को कहीं नहीं दिखता** — केवल एडमिन पैनल (`🛡️ हस्ताक्षर/मुहर उपयोग लॉग`) में दिखता है और CSV में डाउनलोड हो सकता है।
5. **सटीक प्रिंट आकार (Exact Print Dimensions):**
   - **PVC ID Card:** मानक CR80 आकार (`54mm × 85.6mm` फ्रंट और बैक)।
   - **Appointment Letter / Association Document / Receipt:** मानक `A4 (210mm × 297mm)`।
   - **Circulars (परिपत्र) व Certificates:** जैसे अपलोड किए गए हों वैसे ही (`Exact-as-uploaded` Image/PDF) बिना अलग से संघ हस्ताक्षर जोड़े दिखते हैं।
6. **वर्जित शब्द/संदर्भ:** इस संगठन में `BC Sakhi / बीसी सखी` से संबंधित कोई भी शब्द या संदर्भ शामिल नहीं किया जाना है।

---

## 4. Key REST API Endpoints (`server.js`)

| Method | Endpoint | विवरण (Description) |
|---|---|---|
| `GET` | `/api/bootstrap` | पोर्टल का पूरा स्टेट लाता है (विज़िटर के लिए साइन/मुहर हटाकर; `accessLogs` केवल एडमिन हेडर पर भेजता है) |
| `POST` | `/api/admin/login` | एडमिन पिन सत्यापन |
| `POST` | `/api/member/login` | सदस्य ID/मोबाइल + पासवर्ड लॉगिन व साइलेंट लॉगिन ऑडिट एंट्री |
| `POST` | `/api/access-logs` | हस्ताक्षर/मुहर युक्त प्रपत्र देखने/प्रिंट करने का साइलेंट ऑडिट लॉग दर्ज करता है |
| `DELETE` | `/api/access-logs/:id` / `/api/access-logs` | केवल एडमिन हेतु लॉग प्रविष्टि हटाना |
| `GET` | `/api/verify/:query` | सार्वजनिक सदस्यता स्थिति सत्यापन (बिना हस्ताक्षर/मुहर) |
| `PUT` | `/api/settings` | संगठन सेटिंग्स, मेन्यू, थीम, हस्ताक्षरकर्ता, मुहर, टेम्पलेट बैकग्राउंड व नियम-शर्तें अपडेट |
| `POST/PUT/DELETE` | `/api/members`, `/api/members/:id` | सदस्य पंजीकरण, अनुमोदन, विवरण/हस्ताक्षरकर्ता संशोधन (`signatoryId`, `letterSignatoryIds`) व पासवर्ड रीसेट |
| `POST/PUT/DELETE` | `/api/slides`, `/api/certificates`, `/api/circulars`, `/api/documents`, `/api/demands`, `/api/external-links`, `/api/news` | सभी कंटेंट मॉड्यूल CRUD |
| `POST/PUT/DELETE` | `/api/payments`, `/api/grievances` | शुल्क/सहयोग रसीदें व शिकायत निवारण टिकट |
| `POST` | `/api/upload` | बेस64 फाइल अपलोड (`JPG/PNG/WEBP/SVG/PDF` -> `/public/uploads/`) |
| `GET` | `/api/export/members.csv`, `/payments.csv`, `/access-logs.csv` | एडमिन हेतु एक्सेल/CSV रिपोर्ट डाउनलोड |

**Auth Headers:**
- Admin requests: `X-Admin-Pin`
- Member requests: `X-Member-Id`, `X-Member-Pass`

---

## 5. Production Go-Live Checklist for Developer (लाइव करने से पहले डेवलपर के कार्य)

जब डेवलपर इसे असली डोमेन (जैसे `https://upbms.in`) पर लाइव करे, तो ये कार्य पूरे करे:

1. **Remove Demo Shortcuts:**
   - `public/app.js` में सदस्यता और सहयोग फॉर्म से `instantDemoVerify` ("⚡ डेमो हेतु तुरंत सक्रिय करें") चेकबॉक्स हटाएँ ताकि प्रत्येक नया पंजीकरण `pending` रहे और एडमिन द्वारा भुगतान सत्यापित करने पर ही `active` हो।
   - `server.js` से `/api/reset-demo` रूट हटा दें और लॉगिन मॉडल से डेमो पासवर्ड हिंट हटा दें।
2. **Backend Security Hardening:**
   - `server.js` में सभी `POST/PUT/DELETE` एडमिन रूट्स (जैसे `/api/settings`, `/api/upload`, कलेक्शन डिलीट/अपडेट) पर `if (!auth.isAdmin) return sendJson(res, 403, ...)` अनिवार्य करें।
   - एडमिन पिन और मेंबर पासवर्ड को `bcrypt` / `crypto.scrypt` से हैश (Hash) करें तथा लॉगिन API पर बेसिक IP Rate-Limiting लगाएँ।
   - बेहतर सुरक्षा हेतु लॉगिन पर `HttpOnly` JWT/Session टोकन का उपयोग करें।
3. **Domain QR Verification Link:**
   - `public/print-templates.js` में QR कोड पेलोड को असली डोमेन URL (जैसे `https://upbms.in/#verify?code=${member.memberCode}`) से जोड़ दें ताकि मोबाइल स्कैनर सीधे लाइव वेरिफिकेशन पेज खोले।
4. **Database & Backup (Scale के अनुसार):**
   - 5,000 सदस्यों तक वर्तमान एटॉमिक `database.json` तेज़ काम करता है (बस रोज़ाना क्रॉन बैकअप लगा दें)।
   - यदि पूरे प्रदेश में 25,000–1,00,000+ सदस्य जोड़ने हों, तो `loadDb/saveDb` लेयर को **PostgreSQL या SQLite** से जोड़ दें और `/public/uploads` का डेली बैकअप सेट करें।
5. **Server Deployment (Linux VPS अनुशंसित):**
   - Ubuntu VPS (Node.js 20 LTS) पर `pm2 start server.js --name upbms-portal` चलाएँ।
   - आगे **Nginx Reverse Proxy** (`client_max_body_size 25M;`) और **Certbot Let's Encrypt Free SSL (`https://`)** कॉन्फ़िगर करें।
