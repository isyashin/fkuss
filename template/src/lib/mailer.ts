import nodemailer from "nodemailer";
import { getSiteSettings } from "./site";
import { getSmtpConfig, normalizeGuestCabinet } from "./guest-cabinet";

/** SMTP берём из настроек «Личный кабинет гостя»; при пустых полях — env сайта. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const { url, from } = getSmtpConfig(normalizeGuestCabinet(await getSiteSettings()));
  if (!url) throw new Error("SMTP не настроен");
  await nodemailer.createTransport(url).sendMail({ from, to, subject, text });
}
