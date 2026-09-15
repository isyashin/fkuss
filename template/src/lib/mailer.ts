import nodemailer from "nodemailer";

/** SMTP общего проекта: SMTP_URL= smtps://user:pass@host:465 или host/port/user/pass */
function getTransport() {
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL не настроен");
  return nodemailer.createTransport(url);
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const from = process.env.SMTP_FROM ?? "noreply@example.ru";
  await getTransport().sendMail({ from, to, subject, text });
}
