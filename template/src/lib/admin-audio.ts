"use client";

import type { PublicAdminSound } from "./admin-sound";

let audioContext: AudioContext | null = null;

export function hasRecentAdminEvent(events: { createdAt: string }[], now = Date.now()): boolean {
  return events.some((event) => now - new Date(event.createdAt).getTime() < 5 * 60 * 1000);
}

/**
 * Беззвучная разблокировка аудио по первому жесту пользователя:
 * создаём/пробуждаем AudioContext, не издавая звука. Возвращает true,
 * если контекст в состоянии running (программные воспроизведения разрешены).
 */
export async function primeAdminAudio(): Promise<boolean> {
  try {
    audioContext ??= new AudioContext();
    await audioContext.resume();
    return audioContext.state === "running";
  } catch {
    return false;
  }
}
export async function playAdminSound(sound: PublicAdminSound): Promise<void> {
  if (sound.selected === "custom") {
    if (!sound.customUrl) throw new Error("Свой звук не загружен");
    const audio = new Audio(sound.customUrl);
    audio.volume = 1;
    await audio.play();
    return;
  }
  if (sound.selected === "site") {
    // Встроенный сигнал «Заказ с сайта» (поставляется с шаблоном).
    const audio = new Audio("/audio/order-site.mp3");
    audio.volume = 1;
    await audio.play();
    return;
  }

  audioContext ??= new AudioContext();
  await audioContext.resume();
  const notes = sound.selected === "standard1" ? [660, 880] : [523, 659, 784];
  const start = audioContext.currentTime;
  notes.forEach((frequency, index) => {
    const oscillator = audioContext!.createOscillator();
    const volume = audioContext!.createGain();
    const at = start + index * 0.19;
    oscillator.type = sound.selected === "standard1" ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    // Громкий сигнал: 0.5 от полной шкалы
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(0.5, at + 0.018);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
    oscillator.connect(volume).connect(audioContext!.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.18);
  });
}
