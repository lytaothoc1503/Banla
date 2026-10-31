#!/usr/bin/env node
/**
 * Cross-Review Script for Google Antigravity (Node.js version)
 * Tự động trích xuất git diff và gửi song song tới xAI Grok và OpenAI Codex/GPT-4o
 * để thực hiện thẩm định và phản biện chéo mã nguồn.
 * Chạy bằng Node.js tiêu chuẩn (v18+), không cần cài thư viện ngoài.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadEnv() {
  let curr = process.cwd();
  while (curr) {
    const envPath = path.join(curr, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (e) {
        // ignore
      }
      break;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
}

loadEnv();

const XAI_API_KEY = (process.env.XAI_API_KEY || '').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();

function getGitDiff() {
  try {
    let diff = execSync('git diff HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (!diff) {
      diff = execSync('git diff --cached', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    }
    if (!diff) {
      const status = execSync('git status --short', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (status) {
        return `[Git Status - Các file mới/thay đổi]:\n${status}\n(Ghi chú: Hãy 'git add' các file mới để lấy diff chi tiết nhất).`;
      }
      return 'Không có thay đổi mã nguồn nào trong thư mục git.';
    }
    if (diff.length > 25000) {
      diff = diff.slice(0, 25000) + '\n\n...[DIFF ĐÃ ĐƯỢC CẮT BỚT DO QUÁ DÀI]...';
    }
    return diff;
  } catch (err) {
    return `[Lỗi lấy Git diff]: ${err.message}`;
  }
}

async function callGrok(diffContent) {
  if (!XAI_API_KEY) {
    return '⚠️ Bỏ qua Grok: Chưa cấu hình XAI_API_KEY trong file .env hoặc biến môi trường.';
  }

  const sysPrompt = 
    'Bạn là chuyên gia thẩm định bảo mật và phản biện hệ thống độc lập. ' +
    'Hãy phân tích kỹ đoạn git diff sau đây. Hãy đưa ra nhận xét ngắn gọn, sắc bén gồm:\n' +
    '1. Nguy cơ bảo mật tiềm ẩn (XSS, CSRF, Injection, rò rỉ dữ liệu, thiếu xác thực).\n' +
    '2. Các trường hợp biên (edge cases) có thể gây crash hoặc nghẽn hiệu năng.\n' +
    '3. Đánh giá tính hợp lý của kiến trúc và logic nghiệp vụ.\n' +
    'Trình bày theo dạng danh sách gạch đầu dòng rõ ràng, hành động cụ thể.';

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-CrossReviewer/1.0'
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `Vui lòng phản biện đoạn git diff sau:\n\n\`\`\`diff\n${diffContent}\n\`\`\`` }
        ],
        temperature: 0.2
      })
    });
    if (!res.ok) {
      const err = await res.text();
      return `⚠️ Lỗi HTTP từ xAI Grok (${res.status}): ${err}`;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'Không có phản hồi từ Grok.';
  } catch (err) {
    return `⚠️ Lỗi kết nối Grok: ${err.message}`;
  }
}

async function callCodex(diffContent) {
  if (!OPENAI_API_KEY) {
    return '⚠️ Bỏ qua Codex: Chưa cấu hình OPENAI_API_KEY trong file .env hoặc biến môi trường.';
  }

  const sysPrompt =
    'Bạn là chuyên gia QA, Clean Code và kiểm chuẩn phần mềm. ' +
    'Hãy phân tích đoạn git diff sau đây và đưa ra nhận xét gồm:\n' +
    '1. Chuẩn cú pháp, Type Safety và quy ước đặt tên (naming conventions).\n' +
    '2. Tối ưu hóa code (Clean Code, DRY, loại bỏ code thừa/lặp lại).\n' +
    '3. Các kịch bản kiểm thử (Unit / Integration Tests) bắt buộc phải bổ sung.\n' +
    'Trình bày súc tích, chỉ rõ vị trí và cách sửa cụ thể.';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-CrossReviewer/1.0'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `Vui lòng rà soát mã nguồn git diff sau:\n\n\`\`\`diff\n${diffContent}\n\`\`\`` }
        ],
        temperature: 0.2
      })
    });
    if (!res.ok) {
      const err = await res.text();
      return `⚠️ Lỗi HTTP từ OpenAI (${res.status}): ${err}`;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'Không có phản hồi từ OpenAI.';
  } catch (err) {
    return `⚠️ Lỗi kết nối OpenAI: ${err.message}`;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 [ANTIGRAVITY CROSS-REVIEWER]: BẮT ĐẦU THẨM ĐỊNH MÃ NGUỒN');
  console.log('='.repeat(60) + '\n');

  const diff = getGitDiff();
  if (diff === 'Không có thay đổi mã nguồn nào trong thư mục git.') {
    console.log(diff);
    return;
  }

  console.log(`Đã trích xuất git diff (${diff.length} ký tự). Đang gửi yêu cầu song song...\n`);

  const [grokReview, codexReview] = await Promise.all([
    callGrok(diff),
    callCodex(diff)
  ]);

  console.log('------------------------------------------------------------');
  console.log('🛡️  [XAI GROK]: PHẢN BIỆN BẢO MẬT & LOGIC HỆ THỐNG');
  console.log('------------------------------------------------------------');
  console.log(grokReview);
  console.log('\n');

  console.log('------------------------------------------------------------');
  console.log('⚡  [OPENAI CODEX / GPT-4O]: CLEAN CODE, CÚ PHÁP & TESTS');
  console.log('------------------------------------------------------------');
  console.log(codexReview);
  console.log('\n');

  console.log('='.repeat(60));
  console.log('✅ HOÀN THÀNH QUY TRÌNH CROSS-REVIEW');
  console.log('='.repeat(60));
}

main().catch(console.error);

