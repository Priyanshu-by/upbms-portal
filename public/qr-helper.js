// QR Matrix SVG Generator & Smart Image Compression Upload Helper for UPBMS

window.UPBMSHelpers = (function () {
  // Deterministic crisp SVG QR-style matrix for Member Verification & UPI QR display
  function generateQrSvg(text, size = 96, darkColor = "#0b2559") {
    const str = String(text || "UPBMS");
    const modules = 21;
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    function isFinder(r, c) {
      const inTL = r < 7 && c < 7;
      const inTR = r < 7 && c >= modules - 7;
      const inBL = r >= modules - 7 && c < 7;
      if (!inTL && !inTR && !inBL) return null;
      const lr = r < 7 ? r : r - (modules - 7);
      const lc = c < 7 ? c : c - (modules - 7);
      if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
      if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
      return false;
    }

    let rects = "";
    let seed = hash >>> 0;
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        // Quiet separator around finders
        if (
          (r === 7 && (c < 8 || c >= modules - 8)) ||
          (c === 7 && (r < 8 || r >= modules - 8)) ||
          (r === modules - 8 && c < 8) ||
          (c === modules - 8 && r < 8)
        ) {
          continue;
        }
        const f = isFinder(r, c);
        let on = false;
        if (f !== null) {
          on = f;
        } else {
          seed = (Math.imul(seed, 1664525) + 1013904223 + r * 31 + c * 17) >>> 0;
          on = (seed & 3) === 0 || (seed & 7) === 3;
        }
        if (on) {
          rects += `<rect x="${c + 1}" y="${r + 1}" width="1" height="1" fill="${darkColor}"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules + 2} ${modules + 2}" width="${size}" height="${size}" style="background:#fff;border-radius:6px;border:1px solid #cbd5e1;display:block">
      <rect width="${modules + 2}" height="${modules + 2}" fill="#ffffff"/>
      ${rects}
    </svg>`;
  }

  // Smart client-side image compression + server upload (solves heavy phone camera photo issue!)
  async function uploadFileInput(file, maxDim = 1000) {
    if (!file) throw new Error("कोई फाइल चयनित नहीं है");

    // If PDF or SVG, upload directly without canvas resize
    if (file.type === "application/pdf" || file.type === "image/svg+xml") {
      const dataUrl = await readFileAsDataUrl(file);
      return postUpload(file.name, dataUrl);
    }

    // If image, resize smoothly so large mobile selfies upload fast & fit cleanly
    if (file.type.startsWith("image/")) {
      const rawDataUrl = await readFileAsDataUrl(file);
      const compressedDataUrl = await resizeImageDataUrl(rawDataUrl, maxDim);
      return postUpload(file.name, compressedDataUrl);
    }

    const fallbackUrl = await readFileAsDataUrl(file);
    return postUpload(file.name, fallbackUrl);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("फाइल पढ़ने में त्रुटि"));
      reader.readAsDataURL(file);
    });
  }

  function resizeImageDataUrl(dataUrl, maxDim) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(dataUrl);
          return;
        }
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const outMime = dataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
        resolve(outMime === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function postUpload(filename, dataUrl) {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, dataUrl })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Upload failed");
    return json.url;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initialsAvatarSvg(name, bg = "#0b2559", fg = "#ffd166") {
    const clean = String(name || "BM").trim();
    const parts = clean.replace(/^(श्री|श्रीमती|स्व\.|Shri|Smt\.)\s*/i, "").split(/\s+/);
    const init = ((parts[0] || "B")[0] + ((parts[1] || "")[0] || "")).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/><text x="60" y="72" text-anchor="middle" fill="${fg}" font-family="sans-serif" font-size="42" font-weight="800">${escapeHtml(init)}</text></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  return {
    generateQrSvg,
    uploadFileInput,
    escapeHtml,
    initialsAvatarSvg
  };
})();
