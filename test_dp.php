
<?php
// FILE NÀY CHỈ DÙNG ĐỂ KIỂM TRA - XÓA SAU KHI DÙNG XONG
header("Content-Type: text/plain; charset=UTF-8");

$db_host = "sql201.infinityfree.com";
$db_name = "if0_42180426_company_info";
$db_user = "if0_42180426";
$db_pass = "pmeXrP1H2feFw"; // <-- sửa thành password thật giống trong api.php

echo "Đang thử kết nối...\n";

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✅ KẾT NỐI THÀNH CÔNG!\n\n";

    // Thử insert thử 1 dòng test
    try {
        $stmt = $pdo->prepare("
            INSERT INTO mst_cache (mst, ten_cong_ty, nguoi_dai_dien, dia_chi, ten_giao_dich, co_quan_thue, trang_thai, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE ten_cong_ty = VALUES(ten_cong_ty), updated_at = NOW()
        ");
        $stmt->execute(["TEST123", "Công ty test", "Người test", "Địa chỉ test", "Test Co", "Cơ quan test", "Đang hoạt động"]);
        echo "✅ INSERT THÀNH CÔNG VÀO BẢNG mst_cache!\n\n";

        $check = $pdo->query("SELECT * FROM mst_cache WHERE mst = 'TEST123'")->fetch(PDO::FETCH_ASSOC);
        echo "Dữ liệu vừa lưu:\n";
        print_r($check);

        // Xóa dòng test đi
        $pdo->exec("DELETE FROM mst_cache WHERE mst = 'TEST123'");
        echo "\n(Đã xóa dòng test)\n";

    } catch (Exception $e) {
        echo "❌ LỖI KHI INSERT: " . $e->getMessage() . "\n";
    }

} catch (Exception $e) {
    echo "❌ LỖI KẾT NỐI: " . $e->getMessage() . "\n";
}