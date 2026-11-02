// handlers/message.js — runs on each `message` update in Telegram Cloud.
import { api } from 'sdk';

export default async function (message, ctx) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = (message.text || '').trim();

  // Handle /start command
  if (text === '/start' || text.startsWith('/start ')) {
    const firstName = message.from?.first_name || 'Quý khách';
    const welcomeText = 
      `👋 Xin chào ${firstName}!\n\n` +
      `🏨 Chào mừng bạn đến với **DFT2 Bot** - Trợ lý thông minh hỗ trợ dịch vụ & Đặt phòng tại Banla Boutique Hotel.\n\n` +
      `📌 **Các tính năng hỗ trợ:**\n` +
      `• /start - Khởi động và xem thông tin giới thiệu\n` +
      `• /hotel - Thông tin khách sạn & vị trí Banla\n` +
      `• /support - Liên hệ bộ phận Lễ tân & Chăm sóc khách hàng\n` +
      `• /help - Danh sách câu lệnh trợ giúp\n\n` +
      `Hãy gửi tin nhắn bất kỳ để trò chuyện cùng trợ lý!`;

    await api.sendMessage({
      chat_id: chatId,
      text: welcomeText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🌐 Xem Website Banla', url: 'https://banla.vn' },
            { text: '📞 Hotline 24/7', callback_data: 'contact_hotline' }
          ]
        ]
      }
    });
    return;
  }

  // Handle /hotel command
  if (text === '/hotel') {
    const hotelInfo =
      `🌿 **Banla Boutique Hotel**\n` +
      `📍 Vị trí đắc địa tại trung tâm nghỉ dưỡng với không gian tinh tế, tối giản và tiện nghi đẳng cấp.\n\n` +
      `✨ **Tiện ích nổi bật:**\n` +
      `• Hệ thống Smart-lock PIN check-in/out tự động 24/7\n` +
      `• Thanh toán tự động chuẩn VietQR\n` +
      `• Không gian ban công thoáng đãng, thiết kế Eco-Boutique\n` +
      `• Wi-Fi tốc độ cao, hỗ trợ làm việc & nghỉ dưỡng`;

    await api.sendMessage({
      chat_id: chatId,
      text: hotelInfo,
      parse_mode: 'Markdown'
    });
    return;
  }

  // Handle /support command
  if (text === '/support') {
    const supportInfo =
      `☎️ **Bộ phận Hỗ trợ Banla:**\n` +
      `• Hotline lễ tân: 090 123 4567\n` +
      `• Email: concact@banlaboutiquedalat.com\n` +
      `• Hỗ trợ Smart-lock & Check-in: 24/7`;

    await api.sendMessage({
      chat_id: chatId,
      text: supportInfo,
      parse_mode: 'Markdown'
    });
    return;
  }

  // Handle /help command
  if (text === '/help') {
    await api.sendMessage({
      chat_id: chatId,
      text: `📋 **Hướng dẫn sử dụng DFT2 Bot:**\n` +
            `- Gõ /start để xem menu chính\n` +
            `- Gõ /hotel để khám phá thông tin phòng & dịch vụ\n` +
            `- Gõ /support để liên hệ đội ngũ chăm sóc khách hàng`,
      parse_mode: 'Markdown'
    });
    return;
  }

  // Default response / Echo fallback
  await api.sendMessage({
    chat_id: chatId,
    text: `🤖 **DFT2 Bot** đã nhận tin nhắn của bạn: "${text}"\n\nGõ /help để xem các lệnh hỗ trợ hoặc liên hệ /support khi cần trợ giúp.`,
    parse_mode: 'Markdown'
  });
}
