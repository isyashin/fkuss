/** Уведомления владельцам сайтов о балансе (email / Telegram). */
import { getPrisma } from "./db";

export async function notifyLowBalance(slug: string, daysLeft: number, balanceKopecks: number): Promise<void> {
  const prisma = getPrisma();
  const owners = await prisma.ownerAccount.findMany({ where: { siteId: slug } });
  const text = `Сайт «${slug}»: на балансе осталось ${(balanceKopecks / 100).toFixed(2)} ₽ — хватит примерно на ${daysLeft} дн. Пополните баланс в кабинете платформы.`;

  for (const owner of owners) {
    if (process.env.SMTP_URL) {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport(process.env.SMTP_URL);
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@platform",
        to: owner.email,
        subject: `Баланс сайта ${slug}: осталось ${daysLeft} дн.`,
        text,
      });
    } else {
      console.log(`[notify] → ${owner.email}: ${text}`);
    }
  }
}
