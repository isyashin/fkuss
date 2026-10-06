import { describe, expect, it } from "vitest";
import { detectAdminAudio, parseAdminSound, parseSoundRepeats, soundAfterRemovingCustom } from "@/lib/admin-sound";

describe("admin notification sound", () => {
  it("accepts only small MP3, WAV or Ogg audio with matching signatures", () => {
    expect(detectAdminAudio(Buffer.from("ID3\x04\x00\x00"), "audio/mpeg", 6)?.extension).toBe("mp3");
    expect(detectAdminAudio(Buffer.from("RIFF....WAVE"), "audio/wav", 12)?.extension).toBe("wav");
    expect(detectAdminAudio(Buffer.from("OggS...."), "audio/ogg", 8)?.extension).toBe("ogg");
    expect(detectAdminAudio(Buffer.from("<script>"), "audio/mpeg", 8)).toBeNull();
    expect(detectAdminAudio(Buffer.from("ID3\x04\x00\x00"), "audio/mpeg", 3 * 1024 * 1024)).toBeNull();
  });

  it("defaults to first built-in sound after deleting custom audio, keeps repeats", () => {
    expect(parseAdminSound(null).selected).toBe("standard1");
    expect(soundAfterRemovingCustom({ selected: "custom", customName: "a.mp3", customPath: "audio/admin-0123456789abcdef0123456789abcdef.mp3", repeats: 3 }))
      .toEqual({ selected: "standard1", customName: "", customPath: "", repeats: 3 });
  });

  it("clamps sound repeats to 1..20 with default 10", () => {
    expect(parseSoundRepeats(undefined)).toBe(10);
    expect(parseSoundRepeats("мусор")).toBe(10);
    expect(parseSoundRepeats(0)).toBe(10);
    expect(parseSoundRepeats(1)).toBe(1);
    expect(parseSoundRepeats(3.6)).toBe(4);
    expect(parseSoundRepeats(20)).toBe(20);
    expect(parseSoundRepeats(99)).toBe(20);
    // встроенный сигнал «Заказ с сайта» — выбор и парсинг
    expect(parseAdminSound({ selected: "site" }).selected).toBe("site");
    expect(parseAdminSound({ selected: "несуществует" }).selected).toBe("standard1");
    // parseAdminSound протаскивает repeats и дефолтит старые записи
    expect(parseAdminSound({ selected: "standard2" }).repeats).toBe(10);
    expect(parseAdminSound({ selected: "standard2", repeats: 5 }).repeats).toBe(5);
    expect(parseAdminSound({ selected: "standard2", repeats: 100 }).repeats).toBe(20);
  });
});
