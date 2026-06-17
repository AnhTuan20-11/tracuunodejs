const puppeteer = require("puppeteer");

const mst = process.argv[2];

(async () => {
  if (!mst) {
    console.error("Thiếu MST");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    );

    // Mở trang chủ
    await page.goto("https://masothue.com", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // Chờ ô tìm kiếm xuất hiện
    await page.waitForSelector("#search", {
      timeout: 10000
    });

    // Xóa nội dung cũ
    await page.click("#search", { clickCount: 3 });

    // Nhập MST
    await page.type("#search", mst, { delay: 80 });

    // Nhấn Enter
    await page.keyboard.press("Enter");

    // Chờ chuyển trang
    await new Promise(r => setTimeout(r, 5000));

    console.error("URL:", page.url());
    console.error("TITLE:", await page.title());

    // Kiểm tra MST trên trang
    const taxCode = await page.evaluate(() => {
      const rows = document.querySelectorAll("tr");

      for (const row of rows) {
        const cells = row.querySelectorAll("td");

        if (cells.length >= 2) {
          const label = cells[0].innerText.trim();

          if (label.includes("Mã số thuế")) {
            return cells[1].innerText.trim();
          }
        }
      }

      return null;
    });

    console.error("MST yêu cầu:", mst);
    console.error("MST trang:", taxCode);

    if (taxCode !== mst) {
      throw new Error(`Sai MST: ${taxCode}`);
    }

    // Xuất HTML để api.php xử lý XPath
    const html = await page.content();
    console.log(html);

  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();