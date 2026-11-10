import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../backend/src/config/environment";
import { synthesizeWithGnani, transcribeWithGnani } from "../../backend/src/services/ai/gnaniProvider";

describe("gnaniProvider", () => {
  const originalKey = env.gnaniApiKey;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    env.gnaniApiKey = originalKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends X-API-Key-ID and multipart audio_file to Gnani STT /stt/v3", async () => {
    env.gnaniApiKey = "gnani_test_key_123";
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          success: true,
          transcript: "Kal main market gaya tha",
          detected_language_code: "hi-IN",
          model: "prisma-v3.0",
          processing_time: 0.42,
          end_to_end_latency: 0.5,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await transcribeWithGnani({
      audioBuffer: Buffer.from("fake-audio-bytes"),
      filename: "clip.webm",
      mimeType: "audio/webm",
      languageCode: "indic-auto",
    });

    expect(result.transcript).toBe("Kal main market gaya tha");
    expect(result.detectedLanguageCode).toBe("hi-IN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/stt/v3");
    expect((init.headers as Record<string, string>)["X-API-Key-ID"]).toBe("gnani_test_key_123");
  });

  it("calls Gnani TTS /api/v1/tts/inference and returns audio WAV buffer", async () => {
    env.gnaniApiKey = "gnani_test_key_123";
    const wavBytes = Buffer.from("RIFF_WAV_DATA");
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(wavBytes, { status: 200, headers: { "Content-Type": "audio/wav" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tts = await synthesizeWithGnani({
      text: "Bahut badhiya! Keep going.",
      voice: "Shivani",
      language: "English",
    });

    expect(tts.contentType).toBe("audio/wav");
    expect(tts.audioBuffer.toString()).toBe("RIFF_WAV_DATA");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/tts/inference");
    expect((init.headers as Record<string, string>)["X-API-Key-ID"]).toBe("gnani_test_key_123");
  });
});
