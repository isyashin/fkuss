import { describe, expect, it } from "vitest";
import { detectAdminAudio, parseAdminSound, soundAfterRemovingCustom } from "@/lib/admin-sound";

describe("admin notification sound", () => {
  it("accepts only small MP3, WAV or Ogg audio with matching signatures", () => {
    expect(detectAdminAudio(Buffer.from("ID3\x04\x00\x00"), "audio/mpeg", 6)?.extension).toBe("mp3");
    expect(detectAdminAudio(Buffer.from("RIFF....WAVE"), "audio/wav", 12)?.extension).toBe("wav");
    expect(detectAdminAudio(Buffer.from("OggS...."), "audio/ogg", 8)?.extension).toBe("ogg");
    expect(detectAdminAudio(Buffer.from("<script>"), "audio/mpeg", 8)).toBeNull();
    expect(detectAdminAudio(Buffer.from("ID3\x04\x00\x00"), "audio/mpeg", 3 * 1024 * 1024)).toBeNull();
  });

  it("defaults to first built-in sound after deleting custom audio", () => {
    expect(parseAdminSound(null).selected).toBe("standard1");
    expect(soundAfterRemovingCustom()).toEqual({ selected: "standard1", customName: "", customPath: "" });
  });
});
