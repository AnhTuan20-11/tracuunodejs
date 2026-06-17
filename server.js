const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");

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
        dia_chi: getByLabel("Địa chỉ"),
        so_dien_thoai: soDienThoai,
        ngay_hoat_dong: getByLabel("Ngày hoạt động"),
        ten_giao_dich: getByLabel("Tên quốc tế"),
        ten_viet_tat: getByLabel("Tên viết tắt"),
        co_quan_thue: getByLabel("Quản lý bởi"),
        trang_thai: getByLabel("Tình trạng"),
        nganh_nghe_chinh: getByLabel("Ngành nghề chính"),
      };
    });

    await page.close();

    // Chuyển định dạng ngày
    result.ngay_hoat_dong = convertDate(result.ngay_hoat_dong);

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("Lỗi:", err.message);
    return res.json({ success: false, message: "Lỗi server: " + err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});