/** Уведомления владельцам сайтов о балансе (email / Telegram). */
import { getPrisma } from "./db";

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.PLATFORM_TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return response.ok;
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (process.env.SMTP_URL) {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: process.env.SMTP_FROM ?? "noreply@platform", to, subject, text });
  } else {
    console.log(`[notify:email] → ${to}: ${text}`);
  }
}

export async function notifyLowBalance(slug: string, daysLeft: number, balanceKopecks: number): Promise<void> {
  const prisma = getPrisma();
  const owners = await prisma.ownerAccount.findMany({ where: { siteId: slug } });
  const text = `Сайт «${slug}»: на балансе осталось ${(balanceKopecks / 100).toFixed(2)} ₽ — хватит примерно на ${daysLeft} дн. Пополните баланс в кабинете платформы.`;

  for (const owner of owners) {
    if (owner.notifyChannel === "telegram" && owner.notifyTelegramChatId) {
      const sent = await sendTelegram(owner.notifyTelegramChatId, text).catch(() => false);
      if (sent) continue;
      // Telegram недоступен — дублируем письмом, чтобы уведомление не потерялось.
    }
    await sendEmail(owner.email, `Баланс сайта ${slug}: осталось ${daysLeft} дн.`, text);
  }
}
