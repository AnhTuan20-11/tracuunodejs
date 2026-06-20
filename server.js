const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (index.html, style.css, ...)
app.use(express.static(path.join(__dirname)));

// ========================
// HÀM TIỆN ÍCH
// ========================

function convertDate(value) {
  if (!value) return value;
  value = value.trim();
  // Định dạng YYYY-MM-DD → DD-MM-YYYY
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return value;
}

function cleanOutput(str) {
  if (!str) return str;
  str = str.replace(/\s+/g, " ").trim();
  return str.replace(/^[\s:\-,]+|[\s:\-,]+$/g, "");
}

function getTextByLabel(rows, labelText) {
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim();
      if (label.includes(labelText)) {
        return cells[1].textContent.trim();
      }
    }
  }
  return "Chưa cập nhật";
}

// ========================
// API ENDPOINT
// ========================

app.get("/api", async (req, res) => {
  const mst = (req.query.mst || "").trim();
  const cached = db.prepare(`
SELECT *
FROM mst_cache
WHERE mst = ?
AND datetime(updated_at) > datetime('now', '-30 day')
`).get(mst);

if (cached) {
  console.log("📦 CACHE HIT:", mst);

  return res.json({
    success: true,
    from_cache: true,
    ...cached
  });
}

console.log("🌐 API FETCH:", mst);

  if (!mst) {
    return res.json({ success: false, message: "Thiếu mã số thuế" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--disable-blink-features=AutomationControlled",
      ],
      executablePath: process.env.CHROME_PATH || undefined,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    );

    // Ẩn dấu hiệu automation
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    page.on("console", msg => console.log("BROWSER:", msg.text()));

    // Mở trang tra cứu
    await page.goto("https://masothue.com", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await page.waitForSelector("#search", { timeout: 10000 });
    await page.click("#search", { clickCount: 3 });
    await page.type("#search", mst, { delay: 80 });
    await page.keyboard.press("Enter");

    await new Promise((r) => setTimeout(r, 5000));

    // Kiểm tra MST đúng trang chưa
    const taxCode = await page.evaluate(() => {
      const rows = document.querySelectorAll("tr");
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 2 && cells[0].innerText.includes("Mã số thuế")) {
          return cells[1].innerText.trim();
        }
      }
      return null;
    });

    if (taxCode !== mst) {
      await page.close();
      return res.json({
        success: false,
        message: "Không tìm thấy công ty với MST này",
      });
    }

    // Lấy dữ liệu trực tiếp trong Puppeteer (không cần parse HTML như PHP)
    const result = await page.evaluate(() => {
      const DEFAULT = "Chưa cập nhật";

      function getByLabel(labelText) {
        const rows = document.querySelectorAll("tr");
        for (const row of rows) {
          const cells = row.querySelectorAll("td");
          if (
            cells.length >= 2 &&
            cells[0].textContent.trim().includes(labelText)
          ) {
            return cells[1].textContent.trim() || DEFAULT;
          }
        }
        return DEFAULT;
        console.log("Kết quả:", result); // ← thấy trong terminal
      }

      // Tên công ty
      const tenNode = document.querySelector(
        "table.table-taxinfo th span"
      );
      const tenCongTy = tenNode ? tenNode.textContent.trim() : DEFAULT;

      // Người đại diện
      let nguoiDaiDien = DEFAULT;
      let nguoiDaiDienFull = DEFAULT;
      const daiDienRows = document.querySelectorAll("tr");
      for (const row of daiDienRows) {
        const cells = row.querySelectorAll("td");
        if (
          cells.length >= 2 &&
          cells[0].textContent.trim().includes("Người đại diện")
        ) {
          const tenA = cells[1].querySelector("span[itemprop='name'] a");
          nguoiDaiDien = tenA ? tenA.textContent.trim() : DEFAULT;

          const liItems = cells[1].querySelectorAll("ul li");
          if (liItems.length > 0) {
            const dsCongTy = Array.from(liItems).map((li) =>
              li.textContent.trim()
            );
            nguoiDaiDienFull = dsCongTy.join("\n");
          }
          break;
        }
      }

      // Số điện thoại (có span#tel-full)
      let soDienThoai = DEFAULT;
      const telSpan = document.querySelector("span#tel-full");
      if (telSpan) soDienThoai = telSpan.textContent.trim();

      return {
        ten_cong_ty: tenCongTy,
        nguoi_dai_dien: nguoiDaiDien,
        nguoi_dai_dien_full: nguoiDaiDienFull,

        //Địa chỉ thuế
        dia_chi: getByLabel("Địa chỉ"),
        
        // địa chỉ
        // dia_chi: (() => {
        //   const rows = document.querySelectorAll("tr");
        //   for (const row of rows) {
        //     const cells = row.querySelectorAll("td");
        //     if (cells.length >= 2 && cells[0].textContent.trim().replace(/\s+/g, " ") === "Địa chỉ") {
        //       return cells[1].textContent.trim() || DEFAULT;
        //     }
        //   }
        //   return DEFAULT;
        // })(),
        so_dien_thoai: soDienThoai,
        ngay_hoat_dong: getByLabel("Ngày hoạt động"),
        ten_giao_dich: getByLabel("Tên quốc tế"),
        ten_viet_tat: getByLabel("Tên viết tắt"),
        co_quan_thue: getByLabel("Quản lý bởi"),
        trang_thai: getByLabel("Tình trạng"),
        nganh_nghe_chinh: (() => {
          const rows = document.querySelectorAll("tr");
          for (const row of rows) {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 2 && cells[0].textContent.trim().includes("Ngành nghề chính")) {
              const a = cells[1].querySelector("a");
              return a ? a.textContent.trim() : cells[1].textContent.trim() || DEFAULT;
            }
          }
          return DEFAULT;
        })(),
        loai_hinh_dn: getByLabel("Loại hình DN"),
      };
    });

    await page.close();

    // Chuyển định dạng ngày
    result.ngay_hoat_dong = convertDate(result.ngay_hoat_dong);

// Lưu cache
db.prepare(`
INSERT OR REPLACE INTO mst_cache (
    mst,
    ten_cong_ty,
    nguoi_dai_dien,
    nguoi_dai_dien_full,
    dia_chi,
    so_dien_thoai,
    ngay_hoat_dong,
    ten_giao_dich,
    ten_viet_tat,
    co_quan_thue,
    trang_thai,
    nganh_nghe_chinh,
    loai_hinh_dn,
    updated_at
)
VALUES (
    ?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')
)
`).run(
    mst,
    result.ten_cong_ty,
    result.nguoi_dai_dien,
    result.nguoi_dai_dien_full,
    result.dia_chi,
    result.so_dien_thoai,
    result.ngay_hoat_dong,
    result.ten_giao_dich,
    result.ten_viet_tat,
    result.co_quan_thue,
    result.trang_thai,
    result.nganh_nghe_chinh,
    result.loai_hinh_dn
);

return res.json({
  success: true,
  from_cache: false,
  ...result
});
  } catch (err) {
    console.error("Lỗi:", err.message);
    return res.json({ success: false, message: "Lỗi server: " + err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ========================
// VIEW ENDPOINT - Trả về HTML
// ==============================================================================

// function renderHTML(data, mst) {
//   const NA = `<span style="color:#aaa;font-style:italic">Chưa cập nhật</span>`;

//   function val(v) {
//     return (!v || v === "Chưa cập nhật") ? NA : `<strong>${v}</strong>`;
//   }

//   function statusBadge(v) {
//     if (!v || v === "Chưa cập nhật") return NA;
//     const active = v.toLowerCase().includes("đang hoạt động");
//     const color = active ? "#16a34a" : "#dc2626";
//     const bg = active ? "#dcfce7" : "#fee2e2";
//     return `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:999px;font-size:13px;font-weight:600">${v}</span>`;
//   }

//   if (!data.success) {
//     return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Lỗi tra cứu</title>
//     <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb}
//     .box{background:#fff;border:1px solid #fca5a5;border-radius:12px;padding:2rem 3rem;text-align:center}
//     h2{color:#dc2626;margin:0 0 8px}p{color:#666;margin:0}</style></head>
//     <body><div class="box"><h2>❌ Không tìm thấy</h2><p>${data.message}</p>
//     <p style="margin-top:12px"><a href="/view?mst=${mst}" style="color:#2563eb">← Thử lại</a></p></div></body></html>`;
//   }

//   const rows = [
//     ["🏢 Tên công ty", val(data.ten_cong_ty)],
//     ["🌐 Tên quốc tế", val(data.ten_giao_dich)],
//     ["🔤 Tên viết tắt", val(data.ten_viet_tat)],
//     ["👤 Người đại diện", val(data.nguoi_dai_dien)],
//     ["📞 Số điện thoại", val(data.so_dien_thoai)],
//     ["📅 Ngày hoạt động", val(data.ngay_hoat_dong)],
//     ["✅ Tình trạng", statusBadge(data.trang_thai)],
//     ["🏦 Cơ quan thuế", val(data.co_quan_thue)],
//     ["📍 Địa chỉ", val(data.dia_chi)],
//     ["🏭 Ngành nghề chính", val(data.nganh_nghe_chinh)],
//     ["🏷️ Loại hình DN", val(data.loai_hinh_dn)],
//     ["👥 Đại diện (chi tiết)", (!data.nguoi_dai_dien_full || data.nguoi_dai_dien_full === "Chưa cập nhật")
//       ? NA
//       : `<pre style="margin:0;font-family:inherit;white-space:pre-wrap">${data.nguoi_dai_dien_full}</pre>`],
//   ];

//   const tableRows = rows.map(([label, value]) => `
//     <tr>
//       <td style="padding:10px 14px;color:#6b7280;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f3f4f6">${label}</td>
//       <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6">${value}</td>
//     </tr>`).join("");

//   const json = JSON.stringify({ success: true, ...data }, null, 2);

//   return `<!DOCTYPE html>
// <html lang="vi">
// <head>
//   <meta charset="UTF-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1">
//   <title>MST: ${mst}</title>
//   <style>
//     * { box-sizing: border-box; margin: 0; padding: 0; }
//     body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #111; min-height: 100vh; padding: 2rem 1rem; }
//     .container { max-width: 760px; margin: 0 auto; }
//     .header { background: #fff; border-radius: 12px 12px 0 0; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; }
//     .mst-badge { background: #eff6ff; color: #1d4ed8; font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 999px; }
//     h1 { font-size: 18px; font-weight: 600; color: #111; flex: 1; }
//     .card { background: #fff; border-radius: 0 0 12px 12px; overflow: hidden; }
//     table { width: 100%; border-collapse: collapse; }
//     td { font-size: 14px; line-height: 1.6; }
//     td:first-child { width: 200px; font-size: 13px; }
//     .json-toggle { margin-top: 1.25rem; text-align: right; }
//     .json-toggle button { background: none; border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; color: #374151; }
//     .json-toggle button:hover { background: #f9fafb; }
//     .json-box { display: none; margin-top: 0.75rem; background: #1e1e2e; color: #cdd6f4; border-radius: 10px; padding: 1.25rem; font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; overflow-x: auto; }
//     .back { display: inline-block; margin-bottom: 1rem; font-size: 13px; color: #2563eb; text-decoration: none; }
//     .back:hover { text-decoration: underline; }
//     @media(max-width:500px){ td:first-child { width: 120px; } }
//   </style>
// </head>
// <body>
//   <div class="container">
//     <a class="back" href="/view">← Tra cứu MST khác</a>
//     <div class="header">
//       <h1>${data.ten_cong_ty || "Thông tin doanh nghiệp"}</h1>
//       <span class="mst-badge">MST: ${mst}</span>
//     </div>
//     <div class="card">
//       <table>${tableRows}</table>
//     </div>
//     <pre class="json-box" id="jsonBox">${json}</pre>
//   </div>
//   <script>
//     function toggleJson() {
//       const box = document.getElementById('jsonBox');
//       const btn = document.querySelector('.json-toggle button');
//       const show = box.style.display !== 'block';
//       box.style.display = show ? 'block' : 'none';
//       btn.textContent = show ? '✖ Ẩn JSON' : '📋 Xem JSON gốc';
//     }
//   </script>
// </body>
// </html>`;
// }

// ========================
// HTML GỐC - Xem raw HTML từ masothue.com
// ========================

app.get("/html", async (req, res) => {
  const mst = (req.query.mst || "").trim();
  if (!mst) return res.send("Thiếu mã số thuế. Dùng: /html?mst=0100109106");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote","--disable-blink-features=AutomationControlled"],
      executablePath: process.env.CHROME_PATH || undefined,
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36");
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    await page.goto("https://masothue.com", { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("#search", { timeout: 10000 });
    await page.click("#search", { clickCount: 3 });
    await page.type("#search", mst, { delay: 80 });
    await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 5000));

    const html = await page.content();
    await page.close();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.send("Lỗi: " + err.message);
  } finally {
    if (browser) await browser.close();
  }
});

// Form tra cứu ===========================================================
// app.get("/view", (req, res) => {
//   const mst = (req.query.mst || "").trim();
//   if (!mst) {
//     return res.send(`<!DOCTYPE html>
// <html lang="vi"><head><meta charset="UTF-8"><title>Tra cứu MST</title>
// <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh}
// .box{background:#fff;border-radius:16px;padding:2.5rem;width:100%;max-width:440px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
// h1{font-size:20px;font-weight:600;margin-bottom:1.5rem;color:#111}
// input{width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;outline:none;margin-bottom:12px}
// input:focus{border-color:#2563eb;box-shadow:0 0 0 3px #eff6ff}
// button{width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
// button:hover{background:#1d4ed8}</style></head>
// <body><div class="box">
//   <h1>🔍 Tra cứu mã số thuế</h1>
//   <form action="/view" method="get">
//     <input name="mst" placeholder="Nhập mã số thuế..." autofocus />
//     <button type="submit">Tra cứu</button>
//   </form>
// </div></body></html>`);
//   }

//   // Gọi nội bộ đến /api rồi render HTML
//   const http = require("http");
//   const options = {
//     hostname: "localhost",
//     port: process.env.PORT || 3000,
//     path: `/api?mst=${encodeURIComponent(mst)}`,
//     method: "GET",
//   };

//   const apiReq = http.request(options, (apiRes) => {
//     let body = "";
//     apiRes.on("data", chunk => body += chunk);
//     apiRes.on("end", () => {
//       try {
//         const data = JSON.parse(body);
//         res.send(renderHTML(data, mst));
//       } catch {
//         res.send(renderHTML({ success: false, message: "Lỗi parse dữ liệu" }, mst));
//       }
//     });
//   });
//   apiReq.on("error", () => res.send(renderHTML({ success: false, message: "Không gọi được API nội bộ" }, mst)));
//   apiReq.end();
// });

app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});