<?php

// Tắt hoàn toàn việc hiển thị các cảnh báo hệ thống (Deprecated/Warning) ra màn hình để tránh làm hỏng JSON
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

function convertDate($value) {
    if (empty($value)) return $value;
    $date = DateTime::createFromFormat('Y-m-d', trim($value));
    return $date ? $date->format('d-m-Y') : $value;
}

// 1. Lấy mã số thuế từ URL gửi lên
$mst = isset($_GET['mst']) ? trim($_GET['mst']) : '';

if (empty($mst)) {
    echo json_encode(["success" => false, "message" => "Thiếu mã số thuế"], JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. Cấu hình cURL gọi trang nguồn masothue.com
$url = "https://masothue.com/" . urlencode($mst);

$mstArg = escapeshellarg($mst);

$nodePath = "node"; // hoặc đường dẫn đầy đủ tới node.exe nếu cần

$command =
    $nodePath . " " .
    escapeshellarg(__DIR__ . "/crawl.js") .
    " " . $mstArg;

$html = shell_exec($command);

if (empty($html)) {
    echo json_encode([
        "success" => false,
        "message" => "Không lấy được dữ liệu từ Puppeteer"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($html)) {
    echo json_encode(["success" => false, "message" => "Không tải được dữ liệu từ trang nguồn"], JSON_UNESCAPED_UNICODE);
    exit;
}

// 3. CHIẾN THUẬT QUÉT XPATH CHUẨN XÁC THEO CÁC MỐC CHỮ MỚI
$tenCongTy = "Chưa cập nhật";
$nguoiDaiDien = "Chưa cập nhật";
$diaChi = "Chưa cập nhật";
$soDienThoai = "Chưa cập nhật";
$tenGiaoDich = "Chưa cập nhật";
$coQuanThue = "Chưa cập nhật";
$trangThai = "Chưa cập nhật";
$tenVietTat = "Chưa cập nhật";
$ngayHoatDong = "Chưa cập nhật";
$nganhNgheChinh = "Chưa cập nhật";

// Khởi tạo DOM Document đọc mã UTF-8 sạch lỗi font
$dom = new DOMDocument();
@$dom->loadHTML('<?xml encoding="UTF-8">' . $html);
$xpath = new DOMXPath($dom);

// 1. Lấy tên công ty từ bảng thông tin
$tenCongTyNode = $xpath->query(
    "//table[contains(@class,'table-taxinfo')]//th//span"
);

if ($tenCongTyNode->length > 0) {
    $tenCongTy = trim($tenCongTyNode->item(0)->textContent);
}

// 2. Dùng XPath bốc "Người đại diện"
// $nguoiDaiDienNode = $xpath->query("//td[contains(text(), 'Người đại diện') or contains(text(), 'Đại diện')]/following-sibling::td[1]");
// if ($nguoiDaiDienNode->length > 0) {
//     $nguoiDaiDien = trim($nguoiDaiDienNode->item(0)->nodeValue);
// }

//-----------------
// $nguoiDaiDienNode = $xpath->query(
//     "//td[contains(text(),'Người đại diện')]
//     /following-sibling::td[1]/span[1]/a[1]"
// );

// if ($nguoiDaiDienNode->length > 0) {
//     $td = $nguoiDaiDienNode->item(0);

//     $nguoiDaiDien = trim($td->textContent);

//     // Thêm xuống dòng trước mỗi công ty trong danh sách
//     $nguoiDaiDien = preg_replace(
//         '/(CÔNG TY|VĂN PHÒNG)/u',
//         "\n$1",
//         $nguoiDaiDien
//     );

//     $nguoiDaiDien = preg_replace(
//         '/\s+/',
//         ' ',
//         $nguoiDaiDien
//     );
// }

// xún dòng ---------------
$nguoiDaiDienNode = $xpath->query(
    "//td[contains(text(),'Người đại diện')]/following-sibling::td[1]"
);

if ($nguoiDaiDienNode->length > 0) {
    $td = $nguoiDaiDienNode->item(0);

    // Lấy tên người đại diện
    $tenNode = $xpath->query(".//span[@itemprop='name']/a", $td);

    $tenNguoi = "";
    if ($tenNode->length > 0) {
        $tenNguoi = trim($tenNode->item(0)->textContent);
    }

    // Lấy danh sách công ty
    $liNodes = $xpath->query(".//ul/li", $td);

    $dsCongTy = [];

    foreach ($liNodes as $li) {
        $dsCongTy[] = trim($li->textContent);
    }

    // Ghép chuỗi
    $nguoiDaiDien = $tenNguoi;

    if (!empty($dsCongTy)) {
        $nguoiDaiDien .= "\nNgoài ra, {$tenNguoi} còn đại diện các doanh nghiệp, đơn vị:\n";
        $nguoiDaiDien .= implode("\n", $dsCongTy);
    }
}

$nguoiDaiDien = $tenNguoi; // Chỉ tên

// $nguoiDaiDienFull = $tenNguoi;

if (!empty($dsCongTy)) {
    // $nguoiDaiDienFull .= "\nNgoài ra, {$tenNguoi} còn đại diện các doanh nghiệp, đơn vị:\n";
    $nguoiDaiDienFull .= implode("\n", $dsCongTy);
}

// 3. Dùng XPath bốc "Địa chỉ trụ sở"
// tương đối
// $diaChiNode = $xpath->query("//td[contains(text(), 'Địa chỉ') or contains(text(), 'Trụ sở')]/following-sibling::td[1]");
// if ($diaChiNode->length > 0) {
//     $rawDiaChi = $diaChiNode->item(0)->nodeValue;
//     if (str_contains($rawDiaChi, '- Căn cứ')) {
//         $diaChi = trim(explode('- Căn cứ', $rawDiaChi)[0]);
//     } else {
//         $diaChi = trim($rawDiaChi);
//     }
// }

// tuyệt đối
$diaChiNode = $xpath->query("
    //td[normalize-space()='Địa chỉ']
    /following-sibling::td[1]
");

if ($diaChiNode->length > 0) {
    $diaChi = trim($diaChiNode->item(0)->textContent);
}

// 4. Dùng XPath bốc "Tên giao dịch" (Tên tiếng Anh)
$tenGiaoDichNode = $xpath->query("//td[contains(text(), 'Tên quốc tế')]/following-sibling::td[1]");
if ($tenGiaoDichNode->length > 0) {
    $tenGiaoDich = trim($tenGiaoDichNode->item(0)->nodeValue);
}

$tenVietTatNode = $xpath->query("//td[contains(text(), 'Tên viết tắt')]/following-sibling::td[1]");
if ($tenVietTatNode->length > 0) {
    $tenVietTat = trim($tenVietTatNode->item(0)->nodeValue);
}

// 5. Dùng XPath bốc "Cơ quan thuế quản lý"
$coQuanThueNode = $xpath->query("//td[contains(text(), 'Quản lý bởi')]/following-sibling::td[1]");
if ($coQuanThueNode->length > 0) {
    $coQuanThue = trim($coQuanThueNode->item(0)->nodeValue);
}

// 6. Dùng XPath bốc "Trạng thái hoạt động"
$trangThaiNode = $xpath->query("//td[contains(text(), 'Tình trạng')]/following-sibling::td[1]");
if ($trangThaiNode->length > 0) {
    $trangThai = trim($trangThaiNode->item(0)->nodeValue);
}

// 7. Dùng XPath bốc "Điện thoại" (nếu có)
$soDienThoaiNode = $xpath->query(
    "//td[contains(text(),'Điện thoại')]
      /following-sibling::td[1]
      //span[@id='tel-full']"
);

if ($soDienThoaiNode->length > 0) {
    $soDienThoai = trim($soDienThoaiNode->item(0)->textContent);
}

// $ngayHoatDong = null;
$ngayHoatDongNode = $xpath->query("//td[contains(text(), 'Ngày hoạt động')]/following-sibling::td[1]");
if ($ngayHoatDongNode->length > 0) {
    $ngayHoatDong = trim($ngayHoatDongNode->item(0)->nodeValue);
    $ngayHoatDong = convertDate($ngayHoatDong);

    // Debug tạm thời
    // error_log("RAW: " . json_encode($ngayHoatDong));
    // $converted = convertDate($ngayHoatDong);
    // error_log("CONVERTED: " . json_encode($converted));

    // $ngayHoatDong = $converted;
    
}

$nganhNgheChinhNode = $xpath->query("//td[contains(text(), 'Ngành nghề chính')]/following-sibling::td[1]/a[1]");
if ($nganhNgheChinhNode->length > 0) {
    $nganhNgheChinh = trim($nganhNgheChinhNode->item(0)->nodeValue);
}

// $nodes = $xpath->query("//td[contains(., 'Ngành nghề chính')]/following-sibling::td[1]/a[1]");
// $nganhNgheChinh = $nodes->length > 0 ? trim($nodes->item(0)->textContent) : null;


// Hàm dọn dẹp các ký tự khoảng trắng hoặc định dạng dư thừa ở đầu/cuối chuỗi
function clean_output($str) {
    $str = html_entity_decode($str, ENT_QUOTES, 'UTF-8');
    $str = str_replace(['\"', '\\'], ['', ''], $str);
    return trim($str, " :-,");
}

$tenCongTy = clean_output($tenCongTy);
$nguoiDaiDien = clean_output($nguoiDaiDien);
$diaChi = clean_output($diaChi);
$tenGiaoDich = clean_output($tenGiaoDich);
$coQuanThue = clean_output($coQuanThue);
$soDienThoai = clean_output($soDienThoai);
$trangThai = clean_output($trangThai);
$tenVietTat = clean_output($tenVietTat);
$ngayHoatDong = clean_output($ngayHoatDong);
$nganhNgheChinh = clean_output($nganhNgheChinh);


// 4. Trả kết quả JSON đầy đủ các trường mới về cho Frontend
echo json_encode([
    "success" => true, 
    "ten_cong_ty" => !empty($tenCongTy) ? $tenCongTy : "Chưa cập nhật",
    "nguoi_dai_dien" => !empty($nguoiDaiDien) ? $nguoiDaiDien : "Chưa cập nhật",
    "nguoi_dai_dien_full" => !empty($nguoiDaiDienFull) ? $nguoiDaiDienFull : "Chưa cập nhật",
    "dia_chi" => !empty($diaChi) ? $diaChi : "Chưa cập nhật",
    "so_dien_thoai" => !empty($soDienThoai) ? $soDienThoai : "Chưa cập nhật",
    "ngay_hoat_dong" => !empty($ngayHoatDong) ? $ngayHoatDong : "Chưa cập nhật",
    "ten_giao_dich" => !empty($tenGiaoDich) ? $tenGiaoDich : "Chưa cập nhật",
    "ten_viet_tat" => !empty($tenVietTat) ? $tenVietTat : "Chưa cập nhật",
    "co_quan_thue" => !empty($coQuanThue) ? $coQuanThue : "Chưa cập nhật",
    "trang_thai" => !empty($trangThai) ? $trangThai : "Chưa cập nhật",
    "nganh_nghe_chinh" => !empty($nganhNgheChinh) ? $nganhNgheChinh : "Chưa cập nhật"
], JSON_UNESCAPED_UNICODE);
exit;

?>