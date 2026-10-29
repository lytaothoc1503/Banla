#!/usr/bin/env python3
"""Generate crawlable static room pages and the room.html?id alias from rooms.json."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "rooms.json").read_text(encoding="utf-8"))
ORIGIN = "https://lytaothoc1503.github.io/Banla"
HOTEL = f"{ORIGIN}/khach-san/banla-boutique-hotel/"

OCC = {
    "elite": 3,
    "signature": 3,
    "highland": 3,
    "connecting": 6,
    "twin": 3,
    "suite": 3,
    "balcony": 3,
}


def esc(value):
    return html.escape(value, quote=True)


def meta_for(room):
    text = (
        f"{room['name']} ({room['area']}, {room['capacity']}) tại Banla Boutique Hotel, "
        f"47 Nguyễn Đình Chiểu, Đà Lạt. {room['description']}"
    )
    if len(text) <= 155:
        return text
    cut = text[:152].rsplit(" ", 1)[0]
    return cut + "…"


def title_for(room):
    return f"{room['name']} Đà Lạt – Banla Boutique Hotel"


def schema(room, url):
    area = int("".join(ch for ch in room["area"] if ch.isascii() and ch.isdigit()) or "0")
    return {
        "@context": "https://schema.org",
        "@type": "HotelRoom",
        "name": room["name"],
        "description": room["description"],
        "url": url,
        "image": f"{ORIGIN}/{room['image']}",
        "floorSize": {
            "@type": "QuantitativeValue",
            "value": area,
            "unitCode": "MTK",
        },
        "occupancy": {
            "@type": "QuantitativeValue",
            "maxValue": OCC[room["id"]],
            "unitText": "người",
        },
        "containedInPlace": {
            "@type": "Hotel",
            "name": "Banla Boutique Hotel",
            "url": HOTEL,
        },
    }


def picture(room, prefix, eager=False):
    webp = room["image"].replace(".jpg", ".webp")
    loading = "eager" if eager else "lazy"
    priority = ' fetchpriority="high"' if eager else ""
    alt = f"Banla Boutique Hotel – {room['name']} tại Đà Lạt"
    return f"""<picture>
              <source srcset="{prefix}{webp}" type="image/webp">
              <img src="{prefix}{room['image']}" width="1500" height="2000" alt="{esc(alt)}" decoding="async" loading="{loading}"{priority}>
            </picture>"""


def crumbs(room, prefix, current):
    items = [
        ("Trang chủ", f"{prefix}index.html"),
        ("Khách sạn", f"{prefix}khach-san/"),
        ("Đà Lạt", f"{prefix}khach-san/da-lat/"),
        ("Banla Boutique Hotel", f"{prefix}khach-san/banla-boutique-hotel/"),
    ]
    lis = []
    for name, href in items:
        lis.append(f'<li><a href="{href}">{esc(name)}</a></li>')
    lis.append(f'<li aria-current="page">{esc(current)}</li>')
    return "<nav class=\"breadcrumb\" aria-label=\"Breadcrumb\"><ol>" + "".join(lis) + "</ol></nav>"


def head(title, description, canonical, prefix, extra=""):
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta name="author" content="Banla">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{canonical}">
  <link rel="alternate" hreflang="vi" href="{canonical}">
  <link rel="alternate" hreflang="x-default" href="{canonical}">
  <meta name="theme-color" content="#0d1b33">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:image" content="{ORIGIN}/images/elite.jpg">
  <meta property="og:image:width" content="1500">
  <meta property="og:image:height" content="2000">
  <meta property="og:url" content="{canonical}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:site_name" content="Banla">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <meta name="twitter:image" content="{ORIGIN}/images/elite.jpg">
  {extra}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{prefix}styles.css">
</head>"""


def header(prefix):
    return f"""  <a class="skip-link" href="#main">Đến nội dung</a>
  <header class="header" id="header">
    <nav class="nav" aria-label="Chính">
      <a href="{prefix}index.html" class="logo">BANLA</a>
      <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navLinks">
        <span></span><span></span><span></span>
      </button>
      <ul class="nav-links" id="navLinks">
        <li><a href="{prefix}khach-san/">Khách sạn</a></li>
        <li><a href="{prefix}listing.html">Hạng phòng</a></li>
        <li><a href="{prefix}khach-san/da-lat/">Đà Lạt</a></li>
        <li><a href="{prefix}blog/">Cẩm nang</a></li>
        <li><a href="{prefix}ve-chung-toi/">Về chúng tôi</a></li>
        <li><a href="{prefix}lien-he/" class="btn-nav">Đặt phòng</a></li>
      </ul>
    </nav>
  </header>"""


def footer(prefix):
    return f"""  <footer class="footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          <div class="logo-footer">BANLA</div>
          <p>Ngoài lạnh. Trong ấm.</p>
        </div>
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


def jumps(prefix, current_id=None):
    links = []
    for room in DATA["rooms"]:
        href = f"{prefix}phong/{room['id']}.html"
        label = esc(room["name"])
        if room["id"] == current_id:
            links.append(f'<a href="{href}" aria-current="page">{label}</a>')
        else:
            links.append(f'<a href="{href}">{label}</a>')
    return '<nav class="room-jump" aria-label="Hạng phòng">' + "".join(links) + "</nav>"


def article(room, prefix, hidden=False, level="h1"):
    url = f"{ORIGIN}/phong/{room['id']}.html"
    desc = meta_for(room)
    title = title_for(room)
    hidden_attr = " hidden" if hidden else ""
    return f"""    <article class="room-block" data-id="{room['id']}" data-title="{esc(title)}" data-description="{esc(desc)}"{hidden_attr}>
      {crumbs(room, prefix, room['name'])}
      <div class="room-detail-hero">
        {picture(room, prefix, eager=not hidden)}
      </div>
      <div class="room-detail-info">
        <{level}>{esc(room['name'])}</{level}>
        <div class="room-meta">
          <span>{esc(room['area'])}</span>
          <span>{esc(room['capacity'])}</span>
          <span>{esc(room['tag'])}</span>
        </div>
        <p>{esc(room['description'])}</p>
        <p>Giá theo đêm chưa được khách sạn công bố. Gửi yêu cầu đặt phòng để Banla xác nhận tình trạng và giá.</p>
        <a class="btn btn-primary" href="{prefix}khach-san/banla-boutique-hotel/#dat-phong">Đặt phòng này</a>
        <p class="compat-link">Đường dẫn tương thích: <a href="{prefix}room.html?id={room['id']}">room.html?id={room['id']}</a></p>
      </div>
    </article>"""


def write_static():
    out_dir = ROOT / "phong"
    out_dir.mkdir(exist_ok=True)
    for room in DATA["rooms"]:
        url = f"{ORIGIN}/phong/{room['id']}.html"
        title = title_for(room)
        desc = meta_for(room)
        ld = json.dumps(schema(room, url), ensure_ascii=False, indent=2)
        crumbs_ld = json.dumps({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": f"{ORIGIN}/"},
                {"@type": "ListItem", "position": 2, "name": "Khách sạn", "item": f"{ORIGIN}/khach-san/"},
                {"@type": "ListItem", "position": 3, "name": "Đà Lạt", "item": f"{ORIGIN}/khach-san/da-lat/"},
                {"@type": "ListItem", "position": 4, "name": "Banla Boutique Hotel", "item": HOTEL},
                {"@type": "ListItem", "position": 5, "name": room["name"]},
            ],
        }, ensure_ascii=False)
        extra = (
            f'<script type="application/ld+json">{ld}</script>\n'
            f'  <script type="application/ld+json">{crumbs_ld}</script>'
        )
        # head() already sets og:image to elite; override by placing room image meta after — duplicate og:image.
        # Build head without the generic image by passing extra that browsers use the first... 
        # We'll set the right image in head() via replacement below.
        doc = f"""{head(title, desc, url, "../", extra)}
<body>
{header("../")}
  <main id="main" class="room-detail">
    <a class="back-link" href="../listing.html">← Tất cả hạng phòng</a>
    {jumps("../", room['id'])}
{article(room, "../", hidden=False)}
  </main>
{footer("../")}
</body>
</html>
"""
        doc = doc.replace(
            f'<meta property="og:image" content="{ORIGIN}/images/elite.jpg">',
            f'<meta property="og:image" content="{ORIGIN}/{room["image"]}">',
            1,
        )
        doc = doc.replace(
            f'<meta name="twitter:image" content="{ORIGIN}/images/elite.jpg">',
            f'<meta name="twitter:image" content="{ORIGIN}/{room["image"]}">',
            1,
        )
        path = out_dir / f"{room['id']}.html"
        path.write_text(doc, encoding="utf-8")
        print(f"{path.name}: title {len(title)} meta {len(desc)}")


def write_alias():
    blocks = "\n".join(article(room, "", hidden=True, level="h2") for room in DATA["rooms"])
    canonical = f"{ORIGIN}/room.html"
    title = "Chi tiết phòng — Banla Boutique Hotel"
    desc = "Xem hạng phòng tại Banla Boutique Hotel Đà Lạt: diện tích, sức chứa và mô tả từng phòng. Đặt phòng trực tiếp."
    doc = f"""{head(title, desc, canonical, "")}
<body>
{header("")}
  <main id="main" class="room-detail">
    <a class="back-link" href="listing.html">← Tất cả hạng phòng</a>
    <h1 id="chooser-title">Hạng phòng Banla Boutique Hotel</h1>
    <p id="chooser-lead">Chọn một hạng phòng để xem mô tả. Mỗi phòng cũng có trang tĩnh riêng cho công cụ tìm kiếm.</p>
    {jumps("")}
    <p id="room-missing" class="placeholder-note" hidden>Không tìm thấy hạng phòng này. Chọn một phòng bên dưới.</p>
{blocks}
  </main>
  <noscript><style>.room-block{{display:block !important}}</style></noscript>
{footer("")}
  <script>
    (function () {{
      var id = new URLSearchParams(location.search).get('id');
      var blocks = document.querySelectorAll('.room-block');
      if (!id) return;
      var room = null;
      blocks.forEach(function (block) {{
        if (block.getAttribute('data-id') === id) room = block;
      }});
      var chooserTitle = document.getElementById('chooser-title');
      var chooserLead = document.getElementById('chooser-lead');
      if (!room) {{
        var missing = document.getElementById('room-missing');
        if (missing) missing.hidden = false;
        return;
      }}
      blocks.forEach(function (block) {{ block.hidden = true; }});
      room.hidden = false;
      if (chooserTitle) chooserTitle.hidden = true;
      if (chooserLead) chooserLead.hidden = true;
      var pageTitle = room.getAttribute('data-title');
      var pageDesc = room.getAttribute('data-description');
      document.title = pageTitle;
      var canon = '{ORIGIN}/phong/' + id + '.html';
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.href = canon;
      document.querySelectorAll('link[rel="alternate"]').forEach(function (link) {{ link.href = canon; }});
      var desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', pageDesc);
      ['og:title', 'twitter:title'].forEach(function (key) {{
        var node = document.querySelector(key.indexOf('twitter') === 0 ? 'meta[name="' + key + '"]' : 'meta[property="' + key + '"]');
        if (node) node.setAttribute('content', pageTitle);
      }});
      document.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"]').forEach(function (node) {{
        node.setAttribute('content', pageDesc);
      }});
      document.querySelectorAll('meta[property="og:url"]').forEach(function (node) {{ node.setAttribute('content', canon); }});
      var img = room.querySelector('img');
      if (img) {{
        var absolute = '{ORIGIN}/' + img.getAttribute('src');
        document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(function (node) {{
          node.setAttribute('content', absolute);
        }});
      }}
      var area = (room.querySelector('.room-meta span') || {{}}).textContent || '';
      var digits = parseInt(String(area).replace(/\\D/g, ''), 10) || undefined;
      var data = {{
        '@context': 'https://schema.org',
        '@type': 'HotelRoom',
        name: room.querySelector('.room-detail-info h2, .room-detail-info h1').textContent,
        description: room.querySelector('.room-detail-info p').textContent,
        url: canon,
        image: img ? '{ORIGIN}/' + img.getAttribute('src') : undefined,
        floorSize: digits ? {{ '@type': 'QuantitativeValue', value: digits, unitCode: 'MTK' }} : undefined,
        containedInPlace: {{ '@type': 'Hotel', name: 'Banla Boutique Hotel', url: '{HOTEL}' }}
      }};
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    }})();
  </script>
</body>
</html>
"""
    (ROOT / "room.html").write_text(doc, encoding="utf-8")
    print("room.html written")


if __name__ == "__main__":
    write_static()
    write_alias()
