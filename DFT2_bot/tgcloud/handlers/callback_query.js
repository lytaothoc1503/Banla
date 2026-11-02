// handlers/callback_query.js — runs on each `callback_query` update in Telegram Cloud.
import { api } from 'sdk';

export default async function (callbackQuery, ctx) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message?.chat?.id;

  if (data === 'contact_hotline') {
    await api.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Hotline hỗ trợ: 090 123 4567 (Hoạt động 24/7)',
      show_alert: true
    });
    return;
  }

  await api.answerCallbackQuery({
    callback_query_id: callbackQuery.id,
    text: 'Đã nhận yêu cầu!'
  });
}

