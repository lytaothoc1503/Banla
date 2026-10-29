#!/usr/bin/env python3
"""Write secondary Banla pages. Titles must stay ≤60 and descriptions ≤155."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://lytaothoc1503.github.io/Banla"
ROOMS = json.loads((ROOT / "rooms.json").read_text(encoding="utf-8"))["rooms"]

NAV = [
    ("hotels", "Khách sạn", "khach-san/"),
    ("listing", "Hạng phòng", "listing.html"),
    ("dalat", "Đà Lạt", "khach-san/da-lat/"),
    ("blog", "Cẩm nang", "blog/"),
    ("about", "Về chúng tôi", "ve-chung-toi/"),
]


def check(title, description):
    if len(title) > 60:
        raise SystemExit(f"TITLE {len(title)}: {title}")
    if len(description) > 155:
        raise SystemExit(f"META {len(description)}: {description}")


def chrome(prefix, current):
    items = []
    for key, label, href in NAV:
        mark = ' aria-current="page"' if key == current else ""
        items.append(f'<li><a href="{prefix}{href}"{mark}>{label}</a></li>')
    items.append(f'<li><a href="{prefix}lien-he/" class="btn-nav">Đặt phòng</a></li>')
    nav = "".join(items)
    header = f"""  <a class="skip-link" href="#main">Đến nội dung</a>
  <header class="header" id="header">
    <nav class="nav" aria-label="Chính">
      <a href="{prefix}index.html" class="logo">BANLA</a>
      <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>
      <ul class="nav-links" id="navLinks">{nav}</ul>
    </nav>
  </header>"""
    footer = f"""  <footer class="footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand"><div class="logo-footer">BANLA</div><p>Ngoài lạnh. Trong ấm.</p></div>
        <div class="footer-links">
          <a href="{prefix}khach-san/">Khách sạn</a>
          <a href="{prefix}listing.html">Hạng phòng</a>
          <a href="{prefix}blog/">Cẩm nang</a>
          <a href="{prefix}ve-chung-toi/">Về chúng tôi</a>
          <a href="{prefix}lien-he/">Liên hệ</a>
          <a href="{prefix}faq/">FAQ</a>
          <a href="{prefix}chinh-sach/">Chính sách</a>
          <a href="{prefix}dieu-khoan/">Điều khoản</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Banla Boutique Hotel Đà Lạt. All rights reserved.</p>
        <p>47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt · 02633.633.777</p>
      </div>
    </div>
  </footer>
  <script src="{prefix}script.js"></script>"""
    return header, footer


FORM = """<form class="booking-form" id="bookingForm">
            <h3>Yêu cầu đặt phòng</h3>
            <div class="form-row">
              <input type="text" name="name" placeholder="Họ và tên" required>
              <input type="tel" name="phone" placeholder="Số điện thoại" required>
            </div>
            <input type="email" name="email" placeholder="Email" required>
            <div class="form-row">
              <input type="date" name="checkin" aria-label="Ngày nhận phòng">
              <input type="date" name="checkout" aria-label="Ngày trả phòng">
            </div>
            <select name="room" aria-label="Loại phòng">
              <option value="">Chọn loại phòng (không bắt buộc)</option>
              <option>Attic Room</option>
              <option>Deluxe với Ban công</option>
              <option>King Room Hướng Núi</option>
              <option>Suite Hướng Núi</option>
              <option>Chưa chắc, cần tư vấn</option>
            </select>
            <input type="number" name="guests" min="1" max="20" placeholder="Số khách" aria-label="Số khách">
            <textarea name="note" placeholder="Ghi chú (số người, yêu cầu đặc biệt...)" rows="3"></textarea>
            <button type="submit" class="btn btn-primary">Gửi yêu cầu</button>
            <p class="form-note">Chúng tôi sẽ liên hệ xác nhận trong thời gian sớm nhất.</p>
          </form>"""


def write_page(rel, title, description, canonical, body, prefix, current, og_type="website", extra=""):
    check(title, description)
    title_html = html.escape(title, quote=True)
    description_html = html.escape(description, quote=True)
    header, footer = chrome(prefix, current)
    document = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title_html}</title>
  <meta name="description" content="{description_html}">
  <meta name="author" content="Banla">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{canonical}">
  <link rel="alternate" hreflang="vi" href="{canonical}">
  <link rel="alternate" hreflang="x-default" href="{canonical}">
  <meta name="theme-color" content="#0d1b33">
  <meta property="og:title" content="{title_html}">
  <meta property="og:description" content="{description_html}">
  <meta property="og:image" content="{ORIGIN}/images/elite.jpg">
  <meta property="og:image:width" content="1500">
  <meta property="og:image:height" content="2000">
  <meta property="og:url" content="{canonical}">
  <meta property="og:type" content="{og_type}">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:site_name" content="Banla">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title_html}">
  <meta name="twitter:description" content="{description_html}">
  <meta name="twitter:image" content="{ORIGIN}/images/elite.jpg">
  {extra}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{prefix}styles.css">
</head>
<body>
{header}
{body}
{footer}
</body>
</html>
"""
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(document, encoding="utf-8")
    print(f"OK {rel} title={len(title)} meta={len(description)}")


def hero(prefix, crumbs, h1, lead):
    ol = []
    for i, (name, href) in enumerate(crumbs):
        if href:
            ol.append(f'<li><a href="{href}">{name}</a></li>')
        else:
            ol.append(f'<li aria-current="page">{name}</li>')
    return f"""<section class="page-hero"><div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumb"><ol>{''.join(ol)}</ol></nav>
      <h1>{h1}</h1>
      <p>{lead}</p>
    </div></section>"""


def room_cards(prefix):
    cards = []
    for room in ROOMS:
        cards.append(f"""<article class="room-card">
          <a href="{prefix}phong/{room['id']}.html"><img src="{prefix}{room['image'].replace('.jpg', '.webp')}" width="1500" height="2000" alt="Banla Boutique Hotel – {room['name']} tại Đà Lạt" loading="lazy" decoding="async"></a>
          <div class="room-card-body">
            <p class="card-kicker">{room['tag']}</p>
            <h3>{room['name']}</h3>
            <p>{room['description']}</p>
            <p class="card-meta">{room['area']} · {room['capacity']}</p>
            <p class="card-price">Giá: liên hệ — chưa công bố</p>
            <div class="card-actions"><a class="btn btn-primary" href="{prefix}phong/{room['id']}.html">Xem {room['name']}</a></div>
          </div>
        </article>""")
    return '<div class="card-grid">' + "".join(cards) + "</div>"


def build():
    p = "../"
    write_page(
        "khach-san/index.html",
        "Khách sạn giá tốt – Đặt phòng ngay | Banla",
        "Xem điểm đến và khách sạn đang có trên Banla. Đà Lạt đã có Banla Boutique Hotel. Nha Trang và TP.HCM là trang gợi ý, chưa có giá đã xác minh.",
        f"{ORIGIN}/khach-san/",
        f"""<main id="main">{hero(p, [("Trang chủ", p+"index.html"), ("Khách sạn", None)], "Khách sạn giá tốt khắp Việt Nam", "Banla tập hợp trang điểm đến và hạng phòng. Chỉ Banla Boutique Hotel tại Đà Lạt là cơ sở đã xác minh trong dữ liệu trang. Giá niêm yết chưa được công bố.")}
        <section class="section"><div class="container prose">
          <h2>Điểm đến đang mở</h2>
          <ul>
            <li><a href="da-lat/">Khách sạn Đà Lạt</a> — có Banla Boutique Hotel, 47 Nguyễn Đình Chiểu.</li>
            <li><a href="nha-trang/">Khách sạn Nha Trang</a> — trang gợi ý, chưa có khách sạn đối tác.</li>
            <li><a href="ho-chi-minh/">Khách sạn TP. Hồ Chí Minh</a> — trang gợi ý, chưa có khách sạn đối tác.</li>
          </ul>
          <h2>Khách sạn đã xác minh</h2>
          <p><a href="banla-boutique-hotel/">Banla Boutique Hotel</a> tại Đà Lạt. Xem <a href="{p}listing.html">bảy hạng phòng</a> hoặc <a href="{p}blog/kinh-nghiem-du-lich-da-lat-theo-mua/">kinh nghiệm du lịch Đà Lạt theo mùa</a>.</p>
          <form class="search-card" action="{p}listing.html" method="get" style="margin-top:24px">
            <label>Tìm hạng phòng<input type="search" name="q" placeholder="Élite, ban công, gia đình"></label>
            <button class="btn btn-primary" type="submit">Tìm trên danh sách phòng</button>
          </form>
        </div></section></main>""",
        p, "hotels")

    # Đà Lạt
    dalat_faq = [
        ("Giá khách sạn tại Đà Lạt khoảng bao nhiêu?", "Từ [giá từ] đến [giá đến]/đêm tùy hạng sao và mùa — số liệu chưa được xác minh, cần cập nhật từ dữ liệu web."),
        ("Khu vực nào ở Đà Lạt thuận tiện nhất?", "Trung tâm quanh Hồ Xuân Hương và chợ Đà Lạt, vì có thể đi bộ ra chợ đêm, quán ăn và nhiều điểm tham quan chính."),
        ("Có thể hủy phòng miễn phí không?", "Tùy chính sách từng khách sạn, điều kiện hủy được hiển thị rõ khi đặt (xem /chinh-sach)."),
        ("Đặt phòng Đà Lạt có cần thanh toán trước?", "[theo chính sách thực tế – cập nhật từ dữ liệu web]"),
    ]
    faq_html = "".join(f"<h3>{q}</h3><p>{a}</p>" for q, a in dalat_faq)
    faq_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in dalat_faq],
    }, ensure_ascii=False)
    item_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Khách sạn tại Đà Lạt",
        "itemListElement": [{"@type": "ListItem", "position": 1, "url": f"{ORIGIN}/khach-san/banla-boutique-hotel/"}],
    }, ensure_ascii=False)
    pp = "../../"
    dalat_body = f"""<main id="main">{hero(pp, [("Trang chủ", pp+"index.html"), ("Khách sạn", pp+"khach-san/"), ("Đà Lạt", None)], "Khách sạn Đà Lạt – Đặt phòng giá tốt tại phố núi ngàn hoa", "Săn mây, dạo Hồ Xuân Hương hay nghỉ dưỡng giữa rừng thông? Banla tổng hợp khách sạn, resort và homestay Đà Lạt (số lượng toàn thành phố chưa được xác minh), giá từ [giá từ – cập nhật từ dữ liệu web]/đêm. Lọc theo khu vực, tiện nghi và đặt phòng chỉ trong vài bước.")}
    <section class="section"><div class="container">
      <article class="hotel-card hotel-feature">
        <a href="../banla-boutique-hotel/"><img src="{pp}images/elite.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Élite Room tại Đà Lạt" decoding="async"></a>
        <div class="hotel-card-body">
          <p class="card-kicker">Đã xác minh</p>
          <h2>Khách sạn phổ biến tại Đà Lạt</h2>
          <h3>Banla Boutique Hotel</h3>
          <p>47 Nguyễn Đình Chiểu, Phường 9, gần Hồ Xuân Hương, Vườn Hoa và chợ Đà Lạt. The Roof mở café 8:00–16:00 và bar 16:00–00:00.</p>
          <p class="card-price">Giá: liên hệ — chưa công bố</p>
          <div class="card-actions"><a class="btn btn-primary" href="../banla-boutique-hotel/">Xem Banla Boutique Hotel</a><a class="btn btn-secondary" href="{pp}listing.html">Hạng phòng</a></div>
        </div>
      </article>
      <div class="prose">
        <h2>Nên ở khu vực nào tại Đà Lạt?</h2>
        <p id="khu-trung-tam"><strong>Trung tâm (Hồ Xuân Hương, chợ Đà Lạt, Quảng trường Lâm Viên):</strong> đi bộ ra chợ đêm, quán ăn, điểm check-in. Phù hợp khách lần đầu, gia đình có trẻ nhỏ, nhóm bạn. <a href="?khu-vuc=trung-tam">Xem gợi ý trung tâm</a>. Banla Boutique Hotel nằm ở Phường 9, gần khu vực này.</p>
        <p id="khu-ven-trung-tam"><strong>Ven trung tâm (Hùng Vương, Yersin, Trần Hưng Đạo, gần ga Đà Lạt – đồi Robin):</strong> yên tĩnh hơn, tiện đi cáp treo, Thiền viện Trúc Lâm. Phù hợp chuyến 3–4 ngày. <a href="?khu-vuc=ven-trung-tam">Xem gợi ý ven trung tâm</a>.</p>
        <p id="khu-ho-tuyen-lam"><strong>Hồ Tuyền Lâm (khoảng 7 km, hướng đèo Prenn):</strong> resort giữa rừng thông, cạnh hồ. Phù hợp nghỉ dưỡng, cặp đôi, khách có xe riêng. <a href="?khu-vuc=ho-tuyen-lam">Xem gợi ý Hồ Tuyền Lâm</a>.</p>
        <p id="khu-cau-dat"><strong>Cầu Đất – Trại Mát / Tà Nung:</strong> farmstay, homestay đồi, săn mây. Phù hợp khách quen Đà Lạt, có xe. <a href="?khu-vuc=cau-dat">Xem gợi ý Cầu Đất</a>.</p>
        <p class="placeholder-note">Các liên kết khu vực chỉ đánh dấu mục trên trang. Canonical vẫn là /khach-san/da-lat/. Chưa có danh sách khách sạn riêng cho từng khu ngoài Banla.</p>
        <h2>Khách sạn Đà Lạt theo nhu cầu</h2>
        <ul>
          <li>Khách sạn giá rẻ Đà Lạt gần chợ — dưới [mức giá – cập nhật từ dữ liệu web].</li>
          <li>Khách sạn Đà Lạt cho gia đình — phòng rộng, gần Hồ Xuân Hương. Xem <a href="{pp}phong/connecting.html">Connecting Room tại Banla</a>.</li>
          <li>Khách sạn boutique Đà Lạt — kiến trúc ấm, view phố núi: <a href="../banla-boutique-hotel/">Banla Boutique Hotel</a>.</li>
          <li>Resort Đà Lạt ven Hồ Tuyền Lâm — không gian riêng tư. <span class="placeholder-note">Chưa có resort đối tác đã xác minh.</span></li>
        </ul>
        <h2>Kinh nghiệm đặt khách sạn tại Đà Lạt</h2>
        <ul>
          <li>Mùa đẹp nhất là mùa khô, tháng 11 đến tháng 4 (đẹp nhất tháng 12–3: trời trong, se lạnh, mai anh đào nở tháng 1–2). Đây cũng là mùa đông khách, kèm Tết và lễ hội hoa — nên đặt sớm.</li>
          <li>Mùa mưa tháng 5–10 thường mưa chiều; hợp nghỉ dưỡng ở Hồ Tuyền Lâm, giá phòng dễ chịu hơn.</li>
          <li>Đêm Đà Lạt lạnh quanh năm (độ cao khoảng 1.500 m): ưu tiên phòng có nước nóng ổn định, chăn ấm.</li>
          <li>Chọn phòng hủy miễn phí khi lịch trình chưa chắc chắn (xem <a href="{pp}chinh-sach/">chính sách hủy phòng</a>); cuối tuần thường cao giá hơn ngày thường.</li>
        </ul>
        <p>Đọc thêm: <a href="{pp}blog/kinh-nghiem-du-lich-da-lat-theo-mua/">Kinh nghiệm du lịch Đà Lạt theo mùa</a>.</p>
        <h2>Câu hỏi thường gặp về khách sạn Đà Lạt</h2>
        {faq_html}
        <h2>Sẵn sàng cho chuyến đi Đà Lạt?</h2>
        <p>Chọn ngày và đặt phòng ngay — xác nhận nhanh, hỗ trợ qua hotline 02633.633.777.</p>
        <p><a class="btn btn-primary" href="../banla-boutique-hotel/#dat-phong">Đặt Banla Boutique Hotel</a></p>
        <p>Điểm đến lân cận: <a href="../nha-trang/">Nha Trang</a> (đèo Khánh Lê khoảng 135 km), <a href="../ho-chi-minh/">TP. Hồ Chí Minh</a> (bay đến sân bay Liên Khương, cách trung tâm Đà Lạt khoảng 30 km). Xem thêm <a href="{pp}faq/">câu hỏi thường gặp</a>.</p>
      </div>
    </div></section></main>"""
    write_page(
        "khach-san/da-lat/index.html",
        "Khách sạn Đà Lạt giá tốt – Đặt phòng gần Hồ Xuân Hương",
        "Đặt khách sạn Đà Lạt trung tâm, ven Hồ Tuyền Lâm hay homestay đồi thông. So sánh giá, xem ảnh thật, chọn phòng hủy miễn phí và xác nhận nhanh.",
        f"{ORIGIN}/khach-san/da-lat/",
        dalat_body,
        pp, "dalat",
        extra=f'<script type="application/ld+json">{faq_ld}</script><script type="application/ld+json">{item_ld}</script>')

    nha = """<main id="main">""" + hero(pp, [("Trang chủ", pp+"index.html"), ("Khách sạn", pp+"khach-san/"), ("Nha Trang", None)], "Khách sạn Nha Trang", "Trang gợi ý cho chuyến biển. Banla chưa có khách sạn đối tác đã xác minh tại Nha Trang, và chưa công bố giá.") + """
    <section class="section"><div class="container prose">
      <p class="placeholder-note">Nội dung minh họa một phần — không có bảng giá hay danh sách khách sạn đã kiểm chứng.</p>
      <p>Nha Trang là thành phố biển Khánh Hòa, nổi với đường Trần Phú, Hòn Chồng, tháp Po Nagar và các đảo trong vịnh. Từ Đà Lạt có thể đi đường bộ qua đèo Khánh Lê, quãng khoảng 135 km, cảnh núi nhưng dễ mưa và cua gấp. Nhiều khách kết hợp vài đêm phố núi rồi xuống biển, hoặc ngược lại.</p>
      <p>Nên ở gần Trần Phú nếu muốn đi bộ ra biển và quán ăn. Khu phía bắc, về phía Đồng Đế và sân golf, yên hơn và hợp khách có xe. Mùa nắng dễ tắm biển thường rơi vào đầu năm đến giữa hè; những tháng cuối năm biển động hơn. Đây là kinh nghiệm lịch phổ biến, không phải cam kết thời tiết.</p>
      <h2>Nên ở khu vực nào tại Nha Trang?</h2>
      <p><strong>Trung tâm Trần Phú:</strong> tiện biển đêm và chợ đêm. Phù hợp khách lần đầu.</p>
      <p><strong>Bắc Nha Trang:</strong> khu nghỉ rộng hơn, cần xe hoặc taxi. Phù hợp gia đình muốn bãi biển thoáng.</p>
      <p><strong>Ven vịnh / đảo:</strong> hợp khách đặt tour trong ngày. Không thay cho chỗ ở nếu bạn chưa có xe ra bến.</p>
      <h2>Khách sạn Nha Trang theo nhu cầu</h2>
      <ul>
        <li>Khách sạn giá rẻ gần biển — dưới [mức giá – cập nhật từ dữ liệu web].</li>
        <li>Khách sạn gia đình — phòng nối, gần bãi tắm. Chưa có căn hộ đối tác trên Banla.</li>
        <li>Resort có hồ bơi — <span class="placeholder-note">chưa có resort đã xác minh</span>.</li>
      </ul>
      <h2>Kinh nghiệm đặt khách sạn tại Nha Trang</h2>
      <p>Cuối tuần và lễ biển thường kín phòng view biển. Nếu lịch chưa chốt, đọc <a href="../../chinh-sach/">chính sách hủy</a> trước khi chuyển tiền. Banla chưa hiển thị giá Nha Trang vì chưa có nguồn đã đối chiếu.</p>
      <p>Đang ở phố núi? Xem <a href="../da-lat/">khách sạn Đà Lạt</a> và <a href="../banla-boutique-hotel/">Banla Boutique Hotel</a>. Đọc <a href="../../blog/meo-dat-phong-khach-san-gia-tot/">mẹo đặt phòng khách sạn giá tốt</a>.</p>
      <p><a class="btn btn-primary" href="../../lien-he/">Nhờ Banla gợi ý lịch trình</a></p>
    </div></section></main>"""
    write_page("khach-san/nha-trang/index.html", "Khách sạn Nha Trang giá tốt – Đặt ngay | Banla",
               "Gợi ý khu vực ở Nha Trang và cách nối chuyến với Đà Lạt. Banla chưa niêm yết giá khách sạn Nha Trang — xem ghi chú trên trang.",
               f"{ORIGIN}/khach-san/nha-trang/", nha, pp, "hotels")

    hcm = """<main id="main">""" + hero(pp, [("Trang chủ", pp+"index.html"), ("Khách sạn", pp+"khach-san/"), ("TP. Hồ Chí Minh", None)], "Khách sạn TP. Hồ Chí Minh", "Trang gợi ý đô thị. Banla chưa có khách sạn đối tác đã xác minh tại TP. Hồ Chí Minh và chưa công bố giá.") + """
    <section class="section"><div class="container prose">
      <p class="placeholder-note">Nội dung minh họa một phần — không có danh sách khách sạn hay giá đã kiểm chứng.</p>
      <p>TP. Hồ Chí Minh là cửa ngõ bay phổ biến trước khi lên Đà Lạt. Sân bay Tân Sơn Nhất nằm trong thành phố; chặng Đà Lạt hạ cánh ở Liên Khương, cách trung tâm Đà Lạt khoảng 30 km. Nếu chỉ quá cảnh một đêm, Quận 1 và quanh Bến Thành giúp đi bộ ra phố đi bộ Nguyễn Huệ, chợ và ga metro đang mở rộng.</p>
      <p>Quận 3 và Tân Định hợp khách muốn quán ăn địa phương mà vẫn gần trung tâm. Phú Nhuận và Bình Thạnh tiện nếu lịch xoay quanh sân bay hoặc Thảo Cầm Viên. Thảo Điền yên hơn, hợp khách ở dài, nhưng taxi giờ cao điểm chậm.</p>
      <h2>Nên ở khu vực nào tại TP. Hồ Chí Minh?</h2>
      <p><strong>Quận 1:</strong> đi bộ, nhà hàng, phù hợp khách lần đầu và lịch trình ngắn.</p>
      <p><strong>Quận 3 – Tân Định:</strong> cân bằng giá và quán ăn. Phù hợp gia đình ở 2–3 đêm.</p>
      <p><strong>Gần Tân Sơn Nhất:</strong> hợp chuyến bay sớm. Không lý tưởng để đi bộ trung tâm.</p>
      <h2>Khách sạn TP. Hồ Chí Minh theo nhu cầu</h2>
      <ul>
        <li>Khách sạn giá rẻ gần Bến Thành — dưới [mức giá – cập nhật từ dữ liệu web].</li>
        <li>Khách sạn gia đình — phòng rộng. Chưa có đối tác trên Banla.</li>
        <li>Khách sạn trung tâm cho khách nối chuyến Đà Lạt — xem tiếp <a href="../da-lat/">khách sạn Đà Lạt</a>.</li>
      </ul>
      <h2>Kinh nghiệm đặt khách sạn tại TP. Hồ Chí Minh</h2>
      <p>Đêm giao thừa, hội nghị và cuối tuần Quận 1 tăng giá. Đọc <a href="../../chinh-sach/">chính sách hủy phòng</a> nếu giờ bay chưa chắc. Khi đã lên phố núi, <a href="../banla-boutique-hotel/">Banla Boutique Hotel</a> là cơ sở Banla đang mở đặt phòng.</p>
      <p>Đọc <a href="../../faq/">câu hỏi thường gặp</a> và <a href="../../blog/meo-dat-phong-khach-san-gia-tot/">mẹo đặt phòng khách sạn giá tốt</a>.</p>
    </div></section></main>"""
    write_page("khach-san/ho-chi-minh/index.html", "Khách sạn TP.HCM giá tốt – Đặt ngay | Banla",
               "Gợi ý khu vực lưu trú tại TP. Hồ Chí Minh và cách bay tiếp Đà Lạt. Chưa có giá khách sạn đã xác minh trên Banla.",
               f"{ORIGIN}/khach-san/ho-chi-minh/", hcm, pp, "hotels")

    hotel_ld = {
        "@context": "https://schema.org",
        "@type": "Hotel",
        "name": "Banla Boutique Hotel",
        "alternateName": "Banla Đà Lạt",
        "description": "Banla Boutique Hotel Đà Lạt — nơi chiếc bàn là nhỏ bé ủi phẳng cái se lạnh của phố núi. Boutique hotel ấm áp, tinh tế với The Roof và các phòng gác mái nghệ thuật.",
        "url": f"{ORIGIN}/khach-san/banla-boutique-hotel/",
        "image": [f"{ORIGIN}/images/elite.jpg", f"{ORIGIN}/images/signature.jpg", f"{ORIGIN}/images/highland.jpg"],
        "telephone": "+842633633777",
        "email": "hello@banlaboutique.com",
        "priceRange": "$$$",
        "currenciesAccepted": "VND",
        "paymentAccepted": "Cash, Credit Card, Bank Transfer",
        "starRating": {"@type": "Rating", "ratingValue": "4.5", "bestRating": "5"},
        "address": {"@type": "PostalAddress", "streetAddress": "47 Nguyễn Đình Chiểu", "addressLocality": "Đà Lạt", "addressRegion": "Lâm Đồng", "postalCode": "670000", "addressCountry": "VN"},
        "geo": {"@type": "GeoCoordinates", "latitude": "11.9404", "longitude": "108.4583"},
        "hasMap": "https://maps.google.com/?q=47+Nguyễn+Đình+Chiểu,+Đà+Lạt",
        "amenityFeature": [
            {"@type": "LocationFeatureSpecification", "name": "The Roof (café 8:00–16:00, bar 16:00–00:00)", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Phòng gác mái", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Bữa sáng", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "WiFi miễn phí", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Ban công", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Bồn tắm", "value": True},
        ],
        "checkinTime": "14:00",
        "checkoutTime": "12:00",
        "numberOfRooms": 7,
        "petsAllowed": False,
        "smokingAllowed": False,
    }
    crumbs_ld = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": f"{ORIGIN}/"},
        {"@type": "ListItem", "position": 2, "name": "Khách sạn", "item": f"{ORIGIN}/khach-san/"},
        {"@type": "ListItem", "position": 3, "name": "Đà Lạt", "item": f"{ORIGIN}/khach-san/da-lat/"},
        {"@type": "ListItem", "position": 4, "name": "Banla Boutique Hotel"},
    ]}, ensure_ascii=False)
    hotel_body = f"""<main id="main">{hero(pp, [("Trang chủ", pp+"index.html"), ("Khách sạn", "../"), ("Đà Lạt", "../da-lat/"), ("Banla Boutique Hotel", None)], "Banla Boutique Hotel", "Ngoài lạnh. Trong ấm. Boutique hotel tại 47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt.")}
    <section class="section" id="gioi-thieu"><div class="container prose">
      <h2>Giới thiệu Banla Boutique Hotel</h2>
      <p>Banla bắt đầu từ hình ảnh chiếc bàn là đồng xưa. Ngoài trời se lạnh, trong lòng muốn được ủi cho phẳng, cho ấm, cho mềm mại.</p>
      <p>Chúng tôi xây dựng Banla với tinh thần ấy: một boutique hotel nhỏ, nơi mọi chi tiết đều được chăm chút — từ vật liệu tường, ánh sáng ban công, cho đến mùi hương trong thang máy.</p>
      <p>Mỗi phòng là một câu chuyện riêng, không phòng nào giống phòng nào. Không phải để phô diễn, mà để bạn cảm thấy được quan tâm theo cách riêng của mình.</p>
      <p class="highlight">Banla không muốn chỉ là nơi nghỉ. Banla muốn là một phần ký ức của bạn về Đà Lạt.</p>
      <h2>Điểm nổi bật</h2>
      <ul>
        <li>19–22 phòng độc bản được giới thiệu trên trang câu chuyện.</li>
        <li>Điểm Booking 9.2; điểm nhân viên 9.6.</li>
        <li>Gần Hồ Xuân Hương, Vườn Hoa, chợ Đà Lạt. Sân bay Liên Khương khoảng 30 km.</li>
      </ul>
      <h3>Những khoảnh khắc của Banla</h3>
      <div class="gallery-grid">
        <button type="button" class="gallery-item"><img src="{pp}images/elite.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Élite Room tại Đà Lạt" loading="lazy" decoding="async"></button>
        <button type="button" class="gallery-item"><img src="{pp}images/signature.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Banla Signature tại Đà Lạt" loading="lazy" decoding="async"></button>
        <button type="button" class="gallery-item"><img src="{pp}images/highland.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Highland Room tại Đà Lạt" loading="lazy" decoding="async"></button>
        <button type="button" class="gallery-item"><img src="{pp}images/connecting.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Connecting Room tại Đà Lạt" loading="lazy" decoding="async"></button>
        <button type="button" class="gallery-item"><img src="{pp}images/suite.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Original Suite tại Đà Lạt" loading="lazy" decoding="async"></button>
        <button type="button" class="gallery-item"><img src="{pp}images/balcony.webp" width="1500" height="2000" alt="Banla Boutique Hotel – Deluxe Balcony tại Đà Lạt" loading="lazy" decoding="async"></button>
      </div>
    </div></section>
    <section class="section section-alt" id="tien-nghi"><div class="container">
      <div class="section-header"><h2>Tiện nghi</h2></div>
      <div class="features-grid">
        <article class="feature"><h3>Mùi hương</h3><p>Mỗi không gian có một mùi riêng — gỗ trầm, hoa, sương sớm. Bạn có thể chọn dầu gội theo sở thích.</p></article>
        <article class="feature"><h3>Bữa sáng</h3><p>Phở, bánh mì xíu mại, món Á – Âu, buffet. Nhiều khách quay lại vì bữa sáng ở đây.</p></article>
        <article class="feature"><h3>Nhân viên</h3><p>Thân thiện, tự nhiên, không kiểu dịch vụ cứng nhắc. Điểm staff 9.6 trên Booking.</p></article>
        <article class="feature"><h3>Chi tiết</h3><p>Từ vật liệu tường, ánh sáng ban công đến chăn nệm — mọi thứ đều được chăm chút tỉ mỉ.</p></article>
      </div>
      <div class="roof-grid" id="roof" style="margin-top:40px">
        <div>
          <h3>The Roof by Banla</h3>
          <p>The Roof nằm trên tầng thượng của Banla — nơi buổi sáng có cà phê và bánh, buổi tối có cocktail, rượu và những câu chuyện dài.</p>
          <div class="hours-box"><div class="hour-item"><strong>Café</strong><span>8:00 – 16:00</span></div><div class="hour-item"><strong>Cocktail &amp; Wine Bar</strong><span>16:00 – 00:00</span></div></div>
          <p>Khách lưu trú tại Banla được giảm giá khi thưởng thức đồ uống tại The Roof. Mức giảm chưa được ghi số trên trang.</p>
        </div>
        <div class="roof-visual"><img src="{pp}images/highland.webp" width="1500" height="2000" alt="Banla Boutique Hotel – The Roof tại Đà Lạt" loading="lazy" decoding="async"></div>
      </div>
    </div></section>
    <section class="section" id="hang-phong"><div class="container">
      <div class="section-header"><h2>Hạng phòng &amp; giá</h2><p class="section-lead">Từ những căn gác mái nhỏ xinh như thư phòng nghệ sĩ, đến những phòng ban công nhìn ra phố, đến các hạng phòng hướng núi… tất cả đều mang chung một tinh thần: ấm, sạch, tinh tế và có “hồn”.</p></div>
      <p class="placeholder-note">Giá theo đêm chưa được khách sạn công bố. Không điền số giả.</p>
      {room_cards(pp)}
      <p class="inline-links"><a href="{pp}listing.html">Lọc hạng phòng</a><a href="{pp}room.html?id=elite">Mở Élite qua room.html?id=</a></p>
    </div></section>
    <section class="section section-alt" id="vi-tri"><div class="container prose">
      <h2>Vị trí</h2>
      <p>47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt — gần trung tâm, dễ đi bộ hoặc di chuyển đến Hồ Xuân Hương, Vườn Hoa, các quán ăn địa phương, nhưng vẫn giữ được cảm giác yên tĩnh hơn những con phố quá đông.</p>
      <p>Chúng tôi có thể gợi ý những quán ăn ngon gần nhà, đường đi đẹp nhất vào sáng sớm, hoặc chỗ ngắm sương mù. Chỉ cần nói với chúng tôi.</p>
      <p>Check-in 14:00 · Check-out 12:00. Không thú cưng. Không hút thuốc.</p>
      <p><a href="https://maps.google.com/?q=47+Nguyễn+Đình+Chiểu,+Đà+Lạt" rel="noopener">Mở bản đồ</a></p>
    </div></section>
    <section class="section" id="reviews"><div class="container">
      <div class="section-header"><h2>Lời khách kể</h2></div>
      <div class="reviews-grid">
        <blockquote class="review"><p>“You cannot find this vibe in any other hotel in Dalat except at Banla.”</p><cite>— Huy Nguyễn</cite></blockquote>
        <blockquote class="review"><p>“Phòng ở Bànla siêu ấm như cái tên luôn… Design và vibe ở Bàn Là rất hợp mình, nhân viên cũng rất thân thiện.”</p><cite>— Phan, Việt Nam</cite></blockquote>
        <blockquote class="review"><p>“The overall design. The bar especially. The staff were very kind.”</p><cite>— Jefferson, United States</cite></blockquote>
        <blockquote class="review"><p>“Beautiful hotel with great staff! The decor is very Instagrammable and the hotel smells amazing.”</p><cite>— Panida, Thailand</cite></blockquote>
      </div>
    </div></section>
    <section class="section section-alt" id="dat-phong"><div class="container">
      <div class="section-header"><h2>Đặt phòng Banla Boutique Hotel</h2><p class="section-lead">Xem <a href="{pp}chinh-sach/">chính sách hủy</a> và <a href="{pp}faq/">FAQ</a> trước khi gửi. Đọc <a href="{pp}blog/kinh-nghiem-du-lich-da-lat-theo-mua/">kinh nghiệm du lịch Đà Lạt theo mùa</a>.</p></div>
      <div class="contact-grid">
        <div class="contact-info">
          <p><strong>Địa chỉ</strong><br>47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt</p>
          <p><strong>Điện thoại</strong><br><a href="tel:02633633777">02633.633.777</a></p>
          <p><strong>Email</strong><br><a href="mailto:sales@banlaboutiquehotel.com">sales@banlaboutiquehotel.com</a></p>
          <p><strong>Instagram</strong><br><a href="https://instagram.com/banla.boutiquehotel" target="_blank" rel="noopener">@banla.boutiquehotel</a></p>
          <p><strong>TikTok</strong><br><a href="https://www.tiktok.com/@banlaboutiquehotel" target="_blank" rel="noopener">@banlaboutiquehotel</a></p>
          <p>Điểm đến khác trên Banla: <a href="../nha-trang/">Nha Trang</a>, <a href="../ho-chi-minh/">TP. Hồ Chí Minh</a>. Hai trang đó chưa có khách sạn đã xác minh.</p>
        </div>
        {FORM}
      </div>
    </div></section></main>
    <div class="lightbox" id="lightbox"><button class="lightbox-close" type="button" aria-label="Đóng">&times;</button><button class="lightbox-prev" type="button" aria-label="Trước">‹</button><button class="lightbox-next" type="button" aria-label="Sau">›</button><div class="lightbox-content"><img src="" alt="Ảnh phòng Banla Boutique Hotel tại Đà Lạt"><p class="lightbox-caption"></p></div></div>"""
    write_page(
        "khach-san/banla-boutique-hotel/index.html",
        "Banla Boutique Hotel Đà Lạt – Giá tốt | Banla",
        "Đặt phòng Banla Boutique Hotel tại 47 Nguyễn Đình Chiểu, Đà Lạt, giá liên hệ/đêm. Xem hạng phòng, tiện nghi, vị trí. Đặt ngay, xác nhận nhanh!",
        f"{ORIGIN}/khach-san/banla-boutique-hotel/",
        hotel_body, pp, "hotels",
        extra=f'<script type="application/ld+json">{json.dumps(hotel_ld, ensure_ascii=False)}</script><script type="application/ld+json">{crumbs_ld}</script>')

    about = """<main id="main">""" + hero(p, [("Trang chủ", p+"index.html"), ("Về chúng tôi", None)], "Về Banla", "Banla là tên khách sạn boutique tại Đà Lạt và cũng là tên trang đặt phòng bạn đang xem.") + """
    <section class="section"><div class="container prose">
      <h2>Câu chuyện</h2>
      <p>Banla bắt đầu từ hình ảnh chiếc bàn là đồng xưa. Ngoài trời se lạnh, trong lòng muốn được ủi cho phẳng, cho ấm, cho mềm mại. Khách sạn ở 47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt, với The Roof và các phòng gác mái.</p>
      <p>Trang này mở rộng từ website khách sạn thành nơi xem điểm đến, hạng phòng, cẩm nang và gửi yêu cầu đặt. Slogan vẫn là: Ngoài lạnh. Trong ấm.</p>
      <h2>Sứ mệnh</h2>
      <p>Giúp khách hiểu đúng chỗ mình sắp ở: ảnh phòng thật, mô tả đúng dữ liệu, và nói rõ phần nào chưa được xác minh — đặc biệt là giá và chính sách hủy.</p>
      <h2>Cam kết</h2>
      <ul>
        <li>Không bịa giá đêm khi khách sạn chưa công bố.</li>
        <li>Giữ nguyên các dữ liệu chưa khớp cho đến khi có xác nhận: email hiển thị và email trong dữ liệu cấu trúc, số phòng trên câu chuyện và trong schema, danh sách phòng trong form, hạng sao chỉ nằm trong schema.</li>
        <li>Hotline công bố: 02633.633.777. Email hiển thị: sales@banlaboutiquehotel.com.</li>
      </ul>
      <h2>Đội ngũ</h2>
      <p class="placeholder-note">Thông tin nhân sự chưa được công bố — mục đội ngũ là chỗ dành sẵn, chưa có tên người thật.</p>
      <p>Xem <a href="../khach-san/">khách sạn</a>, <a href="../lien-he/">liên hệ</a> hoặc <a href="../dieu-khoan/#doi-tac">điều khoản dành cho đối tác</a>.</p>
    </div></section></main>"""
    write_page("ve-chung-toi/index.html", "Về Banla – Nền tảng đặt phòng khách sạn",
               "Tìm hiểu Banla: sứ mệnh, đội ngũ và cam kết giá tốt, hỗ trợ tận tâm cho mọi chuyến đi. Khám phá ngay!",
               f"{ORIGIN}/ve-chung-toi/", about, p, "about")

    contact = """<main id="main">""" + hero(p, [("Trang chủ", p+"index.html"), ("Liên hệ", None)], "Liên hệ Banla", "Gọi, gửi email hoặc để lại yêu cầu. Banla phản hồi để xác nhận phòng, chưa thu tiền trên trang này.") + f"""
    <section class="section"><div class="container">
      <div class="contact-grid">
        <div class="prose">
          <h2>Thông tin liên hệ</h2>
          <p><strong>Địa chỉ</strong><br>47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt, Lâm Đồng</p>
          <p><strong>Điện thoại</strong><br><a href="tel:02633633777">02633.633.777</a></p>
          <p><strong>Email</strong><br><a href="mailto:sales@banlaboutiquehotel.com">sales@banlaboutiquehotel.com</a></p>
          <p><strong>Instagram</strong><br><a href="https://instagram.com/banla.boutiquehotel" target="_blank" rel="noopener">@banla.boutiquehotel</a></p>
          <p><strong>TikTok</strong><br><a href="https://www.tiktok.com/@banlaboutiquehotel" target="_blank" rel="noopener">@banlaboutiquehotel</a></p>
          <p>The Roof: Café 8:00–16:00 · Bar 16:00–00:00.</p>
          <p>Xem <a href="../faq/">câu hỏi thường gặp</a> và <a href="../chinh-sach/">chính sách hủy</a>.</p>
        </div>
        <div>
          <h2>Gửi yêu cầu tư vấn</h2>
          {FORM}
        </div>
      </div>
      <div class="prose" style="margin-top:48px">
        <h2>Hợp tác đối tác</h2>
        <p>Khách sạn muốn có mặt trên Banla: viết vào form, ghi rõ tên cơ sở và thành phố. Điều kiện tham gia nằm ở <a href="../dieu-khoan/#doi-tac">điều khoản dành cho đối tác</a>. Chưa có hợp đồng mẫu được đăng.</p>
      </div>
    </div></section></main>"""
    write_page("lien-he/index.html", "Liên hệ & hỗ trợ đặt phòng | Banla",
               "Cần hỗ trợ đặt phòng? Gọi 02633.633.777, email sales@banlaboutiquehotel.com hoặc gửi form. Banla phản hồi để xác nhận.",
               f"{ORIGIN}/lien-he/", contact, p, "")

    blog = """<main id="main">""" + hero(p, [("Trang chủ", p+"index.html"), ("Cẩm nang", None)], "Cẩm nang du lịch", "Kinh nghiệm đi Đà Lạt và cách gửi yêu cầu đặt phòng khi giá chưa được niêm yết.") + f"""
    <section class="section"><div class="container">
      <h2>Bài viết mới</h2>
      <div class="post-grid">
        <article class="post-card">
          <a href="kinh-nghiem-du-lich-da-lat-theo-mua/"><img src="{p}images/balcony.webp" width="1500" height="2000" alt="Ban công nhìn phố Đà Lạt tại Banla Boutique Hotel" loading="lazy" decoding="async"></a>
          <div class="post-copy"><h3>Kinh nghiệm du lịch Đà Lạt theo mùa</h3><p>Tháng nào trời trong, tháng nào nên đặt sớm.</p><a href="kinh-nghiem-du-lich-da-lat-theo-mua/">Đọc kinh nghiệm du lịch Đà Lạt theo mùa</a></div>
        </article>
        <article class="post-card">
          <a href="meo-dat-phong-khach-san-gia-tot/"><img src="{p}images/suite.webp" width="1500" height="2000" alt="Original Suite tại Banla Boutique Hotel, Đà Lạt" loading="lazy" decoding="async"></a>
          <div class="post-copy"><h3>Mẹo đặt phòng khách sạn giá tốt</h3><p>Ngày thường, cuối tuần và những gì cần hỏi trước khi cọc.</p><a href="meo-dat-phong-khach-san-gia-tot/">Đọc mẹo đặt phòng khách sạn giá tốt</a></div>
        </article>
      </div>
      <h2>Theo điểm đến</h2>
      <ul>
        <li><a href="{p}khach-san/da-lat/">Khách sạn Đà Lạt</a></li>
        <li><a href="{p}khach-san/nha-trang/">Khách sạn Nha Trang</a></li>
        <li><a href="{p}khach-san/ho-chi-minh/">Khách sạn TP. Hồ Chí Minh</a></li>
      </ul>
    </div></section></main>"""
    write_page("blog/index.html", "Cẩm nang du lịch & kinh nghiệm đặt phòng | Banla",
               "Kinh nghiệm du lịch, gợi ý điểm đến và mẹo đặt khách sạn giá tốt từ Banla. Đọc ngay để lên kế hoạch!",
               f"{ORIGIN}/blog/", blog, p, "blog")

    post1 = f"""<main id="main">{hero(pp, [("Trang chủ", pp+"index.html"), ("Cẩm nang", pp+"blog/"), ("Đà Lạt theo mùa", None)], "Kinh nghiệm du lịch Đà Lạt theo mùa", "Lịch khí hậu phố núi và lúc nào nên giữ phòng sớm hơn — không gắn với một bảng giá cụ thể.")}
    <article class="section"><div class="container prose">
      <p>Đà Lạt nằm khoảng 1.500 m nên đêm mát quanh năm. Kinh nghiệm du lịch Đà Lạt theo mùa giúp bạn chọn áo và thời điểm gửi yêu cầu phòng, đặc biệt nếu muốn ở <a href="{pp}khach-san/banla-boutique-hotel/">Banla Boutique Hotel</a> gần trung tâm.</p>
      <h2>Mùa khô, tháng 11 đến tháng 4</h2>
      <p>Trời thường trong, se lạnh, đẹp nhất khoảng tháng 12 đến tháng 3. Mai anh đào nở khoảng tháng 1–2. Đây cũng là mùa đông khách, Tết và lễ hội hoa. Phòng trung tâm, gồm các hạng gác mái của Banla, nên hỏi sớm hơn ngày thường.</p>
      <h2>Mùa mưa, tháng 5 đến tháng 10</h2>
      <p>Mưa thường về chiều. Buổi sáng vẫn đi được Hồ Xuân Hương, chợ và các quán quanh Phường 9. Hồ Tuyền Lâm hợp nếu bạn có xe và muốn ở giữa thông. Giá dễ chịu hơn mùa lễ, nhưng Banla chưa công bố bảng giá theo tháng trên trang này.</p>
      <h2>Đêm lạnh và đồ trong phòng</h2>
      <p>Ưu tiên nước nóng ổn định và chăn ấm. Élite Room và các phòng trần gỗ của Banla được mô tả là ấm; hãy nói rõ số người khi gửi form để khách sạn kiểm tra giường phụ.</p>
      <h2>Gợi ý khách sạn tại Đà Lạt</h2>
      <p>Xem <a href="{pp}listing.html">hạng phòng Banla Boutique Hotel</a> và <a href="{pp}khach-san/da-lat/">trang khách sạn Đà Lạt</a>. Nếu lịch chưa chốt, đọc <a href="{pp}chinh-sach/">chính sách hủy phòng</a>. Bài liên quan: <a href="../meo-dat-phong-khach-san-gia-tot/">mẹo đặt phòng khách sạn giá tốt</a>.</p>
    </div></article></main>"""
    post1_ld = json.dumps({
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": "Kinh nghiệm du lịch Đà Lạt theo mùa",
        "description": "Kinh nghiệm du lịch Đà Lạt theo mùa: tháng 11–4 trời trong, tháng 5–10 mưa chiều. Xem chi tiết và đặt phòng giá tốt!",
        "image": f"{ORIGIN}/images/balcony.jpg",
        "datePublished": "2026-10-29", "dateModified": "2026-10-29", "inLanguage": "vi",
        "author": {"@type": "Organization", "name": "Banla"},
        "publisher": {"@id": f"{ORIGIN}/#org"},
        "mainEntityOfPage": f"{ORIGIN}/blog/kinh-nghiem-du-lich-da-lat-theo-mua/",
    }, ensure_ascii=False)
    write_page("blog/kinh-nghiem-du-lich-da-lat-theo-mua/index.html",
               "Du lịch Đà Lạt theo mùa: lịch đẹp và mẹo | Banla",
               "Kinh nghiệm du lịch Đà Lạt theo mùa: tháng 11–4 trời trong, tháng 5–10 mưa chiều. Xem chi tiết và đặt phòng giá tốt!",
               f"{ORIGIN}/blog/kinh-nghiem-du-lich-da-lat-theo-mua/", post1, pp, "blog", og_type="article",
               extra=f'<script type="application/ld+json">{post1_ld}</script>')

    post2 = f"""<main id="main">{hero(pp, [("Trang chủ", pp+"index.html"), ("Cẩm nang", pp+"blog/"), ("Mẹo đặt phòng", None)], "Mẹo đặt phòng khách sạn giá tốt", "Cách hỏi phòng khi trang chưa niêm yết giá, và những câu nên hỏi trước khi chuyển khoản.")}
    <article class="section"><div class="container prose">
      <p>Mẹo đặt phòng khách sạn giá tốt bắt đầu bằng việc biết mình đang xem giá thật hay giá minh họa. Trên Banla, giá đêm của Banla Boutique Hotel chưa được công bố. Bạn gửi yêu cầu, khách sạn trả giá theo ngày.</p>
      <h2>Hỏi ngày thường trước cuối tuần</h2>
      <p>Ở Đà Lạt, đêm thứ Sáu và thứ Bảy thường kín hơn. Nếu đi được thứ Hai đến thứ Năm, nói rõ ngày trong form. So hai phương án trong cùng một yêu cầu để Banla báo một lần.</p>
      <h2>Đọc điều kiện hủy trước khi cọc</h2>
      <p>Banla chưa đăng mức phí hủy. Đừng chuyển tiền cho đến khi email hoặc điện thoại nói rõ được hoàn hay không. Chi tiết chỗ đang trống nằm ở <a href="{pp}chinh-sach/">chính sách đặt phòng, hủy và bảo mật</a>.</p>
      <h2>Chọn đúng sức chứa</h2>
      <p>Connecting Room dành cho gia đình đông hơn Élite Room hay Deluxe Balcony. Xem <a href="{pp}listing.html">danh sách hạng phòng</a> rồi mới chọn dòng trong form. Danh sách trong form vẫn giữ các tên cũ của khách sạn, chưa đổi theo mã phòng mới.</p>
      <h2>Gợi ý khách sạn tại Đà Lạt</h2>
      <p>Cơ sở đang nhận yêu cầu là <a href="{pp}khach-san/banla-boutique-hotel/">Banla Boutique Hotel</a>. Xem thêm <a href="{pp}khach-san/da-lat/">khách sạn Đà Lạt</a>. Bài liên quan: <a href="../kinh-nghiem-du-lich-da-lat-theo-mua/">kinh nghiệm du lịch Đà Lạt theo mùa</a>.</p>
    </div></article></main>"""
    post2_ld = json.dumps({
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": "Mẹo đặt phòng khách sạn giá tốt",
        "description": "Mẹo đặt phòng khách sạn giá tốt: so ngày thường với cuối tuần, hỏi điều kiện hủy và đối chiếu hạng phòng trước khi cọc.",
        "image": f"{ORIGIN}/images/suite.jpg",
        "datePublished": "2026-10-29", "dateModified": "2026-10-29", "inLanguage": "vi",
        "author": {"@type": "Organization", "name": "Banla"},
        "publisher": {"@id": f"{ORIGIN}/#org"},
        "mainEntityOfPage": f"{ORIGIN}/blog/meo-dat-phong-khach-san-gia-tot/",
    }, ensure_ascii=False)
    write_page("blog/meo-dat-phong-khach-san-gia-tot/index.html",
               "Mẹo đặt phòng khách sạn giá tốt | Banla",
               "Mẹo đặt phòng khách sạn giá tốt: so ngày thường với cuối tuần, hỏi điều kiện hủy và đối chiếu hạng phòng trước khi cọc.",
               f"{ORIGIN}/blog/meo-dat-phong-khach-san-gia-tot/", post2, pp, "blog", og_type="article",
               extra=f'<script type="application/ld+json">{post2_ld}</script>')

    policy = """<main id="main">""" + hero(p, [("Trang chủ", p+"index.html"), ("Chính sách", None)], "Chính sách của Banla", "Những gì trang này đang làm khi bạn gửi yêu cầu, và những quy định Banla chưa công bố.") + """
    <section class="section"><div class="container prose">
      <h2>Đặt phòng</h2>
      <p>Form là yêu cầu, chưa phải xác nhận giữ phòng. Banla liên hệ qua số điện thoại hoặc email bạn để lại. Check-in 14:00, check-out 12:00 tại 47 Nguyễn Đình Chiểu, Đà Lạt.</p>
      <p>Trên bản GitHub Pages, máy chủ đặt phòng không chạy. Trang sẽ báo bạn gọi 02633.633.777 hoặc email sales@banlaboutiquehotel.com.</p>
      <h2>Thanh toán</h2>
      <p>Dữ liệu khách sạn ghi nhận tiền mặt, thẻ và chuyển khoản, đơn vị VND. Trang không thu tiền trực tuyến. Số tiền và thời điểm thanh toán do Banla xác nhận riêng — chưa có biểu phí trên website.</p>
      <h2>Hủy và hoàn tiền</h2>
      <p class="placeholder-note">Chính sách hủy chi tiết chưa được khách sạn công bố. Không có mức phí hủy, mốc giờ hay số đêm miễn phí nào để ghi tại đây.</p>
      <p>Trước khi chuyển khoản, hãy hỏi Banla điều kiện hủy cho đúng ngày bạn đặt. Khi có văn bản chính thức, mục này và các câu FAQ sẽ được sửa cùng nhau.</p>
      <h2>Bảo mật</h2>
      <p>Form hỏi họ tên, điện thoại, email, ngày ở, loại phòng, số khách và ghi chú. Bản có máy chủ lưu yêu cầu vào tệp nội bộ, không đăng công khai. Bản tĩnh trên GitHub Pages không gửi dữ liệu đi nếu không có API.</p>
      <p class="placeholder-note">Chưa có chính sách cookie hay thời hạn lưu trữ được pháp chế duyệt. Đừng xem đoạn này là văn bản pháp lý hoàn chỉnh.</p>
      <p>Đọc thêm <a href="../dieu-khoan/">điều khoản sử dụng</a>, <a href="../faq/">câu hỏi thường gặp</a> hoặc <a href="../lien-he/">liên hệ</a>.</p>
    </div></section></main>"""
    write_page("chinh-sach/index.html", "Chính sách đặt phòng, hủy & bảo mật | Banla",
               "Chính sách đặt phòng, thanh toán, hủy/hoàn tiền và bảo mật thông tin tại Banla. Xem chi tiết trước khi đặt.",
               f"{ORIGIN}/chinh-sach/", policy, p, "")

    terms = """<main id="main">""" + hero(p, [("Trang chủ", p+"index.html"), ("Điều khoản", None)], "Điều khoản sử dụng", "Quy tắc dùng trang Banla. Mục đối tác nằm ở cuối trang.") + """
    <section class="section"><div class="container prose">
      <h2>Dùng trang và gửi yêu cầu</h2>
      <p>Nội dung phòng, địa chỉ, giờ The Roof và số điện thoại là thông tin Banla đang công bố. Giá, phí hủy và khách sạn minh họa được gắn nhãn riêng. Bạn không dùng các thẻ minh họa để quảng cáo một mức giảm giá có thật.</p>
      <p>Gửi form nghĩa là bạn muốn Banla gọi lại. Không tạo tài khoản trên trang này.</p>
      <h2>Nội dung và ảnh</h2>
      <p>Ảnh phòng thuộc Banla Boutique Hotel. Không gắn ảnh đó cho một khách sạn khác.</p>
      <h2 id="doi-tac">Điều khoản dành cho đối tác</h2>
      <p class="placeholder-note">Chưa có hợp đồng đối tác được đăng. Đoạn dưới là khung chờ, không phải điều khoản đã ký.</p>
      <p>Khách sạn muốn xuất hiện cần gửi tên pháp lý, địa chỉ, hạng phòng và ảnh mình có quyền dùng qua <a href="../lien-he/">trang liên hệ</a>. Banla không nhận bảng giá chưa rõ nguồn. Khi có bản điều khoản đối tác chính thức, mục này sẽ được thay toàn bộ.</p>
      <p>Xem <a href="../chinh-sach/">chính sách</a>.</p>
    </div></section></main>"""
    write_page("dieu-khoan/index.html", "Điều khoản sử dụng & đối tác | Banla",
               "Điều khoản sử dụng dịch vụ và quy định dành cho khách sạn đối tác của Banla. Đọc kỹ trước khi sử dụng.",
               f"{ORIGIN}/dieu-khoan/", terms, p, "")

    groups = [
        ("Đặt phòng", [
            ("Banla nhận phòng và trả phòng lúc mấy giờ?", "Check-in 14:00, check-out 12:00 tại 47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt."),
            ("Làm sao gửi yêu cầu đặt phòng?", "Điền form trên trang liên hệ hoặc trang Banla Boutique Hotel, hoặc gọi 02633.633.777."),
            ("Gửi form có nghĩa là đã giữ được phòng không?", "Chưa. Đây là yêu cầu. Banla xác nhận lại tình trạng phòng và giá."),
        ]),
        ("Thanh toán", [
            ("Thanh toán bằng hình thức nào?", "Dữ liệu khách sạn ghi tiền mặt, thẻ và chuyển khoản, bằng VND. Trang này không thu tiền trực tuyến."),
            ("Đặt phòng Đà Lạt có cần thanh toán trước?", "Chưa có quy định thanh toán trước được công bố. Banla sẽ nói rõ khi xác nhận yêu cầu."),
        ]),
        ("Hủy và đổi", [
            ("Có thể hủy phòng miễn phí không?", "Chính sách hủy chưa được công bố. Hãy hỏi Banla trước khi chuyển tiền và xem trang chính sách."),
            ("Đổi ngày ở được không?", "Chưa có quy định đổi ngày được công bố. Gọi 02633.633.777 để hỏi theo đúng đặt phòng của bạn."),
        ]),
        ("Tài khoản và câu hỏi khác", [
            ("Đặt phòng có cần tạo tài khoản không?", "Không. Bạn gửi form hoặc gọi điện, không cần đăng ký."),
            ("Khách sạn có nhận thú cưng hoặc cho hút thuốc không?", "Không nhận thú cưng và không cho hút thuốc."),
            ("The Roof mở cửa khi nào?", "Café 8:00–16:00, cocktail và wine bar 16:00–00:00. Khách lưu trú được giảm giá đồ uống; mức giảm chưa ghi số."),
        ]),
    ]
    faq_blocks = []
    entities = []
    for heading, pairs in groups:
        chunk = f"<h2>{heading}</h2>"
        for q, a in pairs:
            chunk += f"<article class=\"faq-item\"><h3>{q}</h3><p>{a}</p></article>"
            entities.append({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}})
        faq_blocks.append(chunk)
    faq_json = json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": entities}, ensure_ascii=False)
    faq_body = """<main id="main">""" + hero(p, [("Trang chủ", p+"index.html"), ("FAQ", None)], "Câu hỏi thường gặp", "Câu trả lời ngắn về đặt phòng, thanh toán và hủy. Phần chưa có văn bản chính thức được nói thẳng.") + f"""
    <section class="section"><div class="container prose faq-list">
      {''.join(faq_blocks)}
      <p>Chưa thấy câu trả lời? <a href="../lien-he/">Liên hệ Banla</a>, xem <a href="../chinh-sach/">chính sách</a> hoặc <a href="../khach-san/">danh sách khách sạn</a>.</p>
    </div></section></main>"""
    write_page("faq/index.html", "Câu hỏi thường gặp khi đặt phòng | Banla",
               "Giải đáp về đặt phòng, thanh toán, hủy/đổi và hoàn tiền tại Banla. Chưa thấy câu trả lời? Liên hệ ngay!",
               f"{ORIGIN}/faq/", faq_body, p, "",
               extra=f'<script type="application/ld+json">{faq_json}</script>')

    words = []
    for rel in ["khach-san/da-lat/index.html", "khach-san/nha-trang/index.html", "khach-san/ho-chi-minh/index.html"]:
        text = (ROOT / rel).read_text(encoding="utf-8")
        # rough visible word count
        import re
        plain = re.sub(r"<[^>]+>", " ", text)
        n = len(plain.split())
        words.append((rel, n))
        if n < 150:
            raise SystemExit(f"short copy {rel} {n}")
    print("words", words)


if __name__ == "__main__":
    build()
