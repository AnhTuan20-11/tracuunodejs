const Database = require("better-sqlite3");

const db = new Database("cache.db");

db.exec(`
CREATE TABLE IF NOT EXISTS mst_cache (
    mst TEXT PRIMARY KEY,
    ten_cong_ty TEXT,
    nguoi_dai_dien TEXT,
    nguoi_dai_dien_full TEXT,
    dia_chi TEXT,
    so_dien_thoai TEXT,
    ngay_hoat_dong TEXT,
    ten_giao_dich TEXT,
    ten_viet_tat TEXT,
    co_quan_thue TEXT,
    trang_thai TEXT,
    nganh_nghe_chinh TEXT,
    loai_hinh_dn TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

module.exports = db;