/** Уведомления о заказах/бронях в каналы ресторана. Этап 4 наполняет реализации. */
import { getPrisma } from "./db";
import { getSiteSettings } from "./site";

export async function notifyNewOrder(orderId: string): Promise<void> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  const settings = await getSiteSettings();
  const lines = order.items
    .map((i) => `• ${i.name} × ${i.quantity} — ${i.total} ₽`)
    .join("\n");
  const text = [
    `🆕 Заказ №${order.number} — ${order.type === "delivery" ? "Доставка" : "Самовывоз"}`,
    "",
    lines,
    "",
    `Позиции: ${order.itemsTotal} ₽`,
    `Доставка: ${order.deliveryPrice} ₽`,
    order.bonusSpent > 0 ? `Бонусы: −${order.bonusSpent} ₽` : null,
    `Итого: ${order.total} ₽`,
    `Оплата: ${order.paymentMethod === "online" ? "онлайн" : "при получении"}`,
    "",
    `Гость: ${order.customerName}, ${order.customerPhone}`,
    order.addressText ? `Адрес: ${order.addressText}` : null,
    order.comment ? `Комментарий: ${order.comment}` : null,
    order.desiredTime ? `Время: ${order.desiredTime}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const jobs: Promise<void>[] = [];
  if (settings.channels.telegram.enabled) jobs.push(sendTelegram(settings.channels.telegram.chatId, text));
  if (settings.channels.max.enabled) jobs.push(sendMax(settings.channels.max.chatId, text));
  if (settings.channels.email.enabled) jobs.push(sendEmail(settings.channels.email.address, `Заказ №${order.number}`, text));
  await Promise.allSettled(jobs);
}

export async function notifyNewBooking(reservationId: string): Promise<void> {
  const prisma = getPrisma();
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return;

  const settings = await getSiteSettings();
  const text = [
    `📅 Бронь — ${reservation.date} в ${reservation.time}`,
    `Гостей: ${reservation.guests}`,
    `Гость: ${reservation.customerName}, ${reservation.customerPhone}`,
    reservation.comment ? `Пожелания: ${reservation.comment}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const jobs: Promise<void>[] = [];
  if (settings.channels.telegram.enabled) jobs.push(sendTelegram(settings.channels.telegram.chatId, text));
  if (settings.channels.max.enabled) jobs.push(sendMax(settings.channels.max.chatId, text));
  if (settings.channels.email.enabled) jobs.push(sendEmail(settings.channels.email.address, `Бронь ${reservation.date} ${reservation.time}`, text));
  await Promise.allSettled(jobs);
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function sendMax(chatId: string, text: string): Promise<void> {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://platform-api.max.ru/messages?chat_id=${chatId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ text }),
  });
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!to) return;
  const { sendMail } = await import("./mailer");
  await sendMail(to, subject, text);
}
