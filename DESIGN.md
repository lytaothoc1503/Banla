---
version: alpha
name: Banla-highland-mist
description: "Highland mist + ember — sương Đà Lạt lạnh ngoài, hơi ấm bàn là bên trong. Cool fog canvas, warm ember accent, boutique calm."
colors:
  fog: "#eef2f3"
  mist: "#dfe6e8"
  mist-deep: "#c5d0d4"
  paper: "#f4f7f8"
  ink: "#1a2428"
  ink-soft: "#3d4a50"
  muted: "#5c6b72"
  ember: "#b8612e"
  ember-deep: "#8f4520"
  brass: "#c4894a"
  pine: "#2a3f38"
  pine-soft: "#3d5a4f"
  white: "#ffffff"
  line: "rgba(26, 36, 40, 0.1)"
typography:
  display:
    fontFamily: "Fraunces"
    fontWeight: 450
    letterSpacing: "0.02em"
    role: "Brand mark, hero headline, section titles"
  body:
    fontFamily: "Figtree"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
    role: "UI, nav, body copy, forms"
  brand-mark:
    fontFamily: "Fraunces"
    fontSize: "clamp(2.8rem, 8vw, 5.5rem)"
    fontWeight: 500
    letterSpacing: "0.28em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
spacing:
  section-y: "96px"
  container: "1120px"
  gutter: "24px"
motion:
  ease: "cubic-bezier(0.22, 1, 0.36, 1)"
  hero-duration: "900ms"
  reveal-duration: "700ms"
  library: "Anime.js v4 (vendor/anime.umd.min.js)"
---

# Banla Boutique Hotel — Design System

## Overview

Banla là boutique hotel Đà Lạt. Visual system **Highland mist + ember**: nền sương lạnh (fog/mist) và điểm ấm ember/brass như chiếc bàn là — “Ngoài lạnh. Trong ấm.”

Không dùng cream `#f6f0e8` + terracotta + Inter/Playfair (cụm AI mặc định). Không dark charcoal + đỏ kiểu Anime.js marketing site — chỉ mượn **thư viện motion**, không mượn skin.

## 2 tử huyệt (khóa trước mọi thứ)

Hai quyết định này lan ra toàn bộ UI. Sai từ đầu = đập CSS, HTML, component, marketing asset.

### 1. Colors

| Token | Hex / value | Vai trò |
|-------|-------------|---------|
| `fog` | `#eef2f3` | Canvas trang |
| `mist` / `mist-deep` | `#dfe6e8` / `#c5d0d4` | Section xen kẽ, surface |
| `ink` | `#1a2428` | Chữ chính |
| `muted` | `#5c6b72` | Chữ phụ |
| `ember` / `ember-deep` | `#b8612e` / `#8f4520` | CTA, accent duy nhất |
| `brass` | `#c4894a` | Highlight ấm nhẹ |
| `pine` | `#2a3f38` | The Roof / khối tối |

**Do:** Ember chỉ cho CTA và điểm nhấn. Fog/mist cho nền. Pine cho The Roof.
**Don't:** Thêm purple gradient, cream terracotta stack, glow nhiều lớp, hoặc accent thứ hai cạnh tranh ember.

### 2. Typography

| Role | Family | Ghi chú |
|------|--------|---------|
| Display / brand | **Fraunces** | BANLA, H1, H2 |
| Body / UI | **Figtree** | Nav, đoạn văn, form |

**Do:** Brand `BANLA` là tín hiệu hero-level (letter-spacing rộng), không chỉ chữ nav.
**Don't:** Inter, Roboto, Arial, Playfair Display, system-ui làm face chính.

Nguồn sự thật CSS: biến `:root` trong [`styles.css`](styles.css) phải khớp token trên.

## Layout & hero

- Hero full-bleed ảnh phòng; không card, không badge nổi trên media.
- Viewport đầu: brand + một headline + một câu + một nhóm CTA + ảnh nền.
- Mỗi section một việc, một headline, thường một câu phụ.

## Motion (Anime.js)

Áp dụng thêm Anime.js v4 (local vendor) — không CDN bắt buộc:

1. Hero entrance (stagger brand → headline → sub → CTA)
2. Scroll reveal cho `.reveal`
3. Hero media drift nhẹ

Tôn trọng `prefers-reduced-motion: reduce` (bỏ animation, hiện trạng thái cuối).

## Components

- Primary button: nền `ember`, chữ trắng, radius `md`.
- Ghost trên hero: viền trắng mờ.
- Form: nền paper/mist, border `line`, không card shadow dày.
- The Roof: nền `pine`, chữ sáng.

## Sync checklist

Khi đổi màu/font: sửa `DESIGN.md` → `:root` trong `styles.css` → `theme-color` / font links trong HTML → kiểm tra room page.
