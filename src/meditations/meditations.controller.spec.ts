import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  MeditationsController,
  mixMeditationAudio,
} from './meditations.controller.js';
import { MEDITATIONS, dayPeriod } from './meditations.data.js';

const SAMPLE_RATE = 24_000;

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** Raw 24 kHz 16-bit mono PCM, as OpenAI returns for `response_format: 'pcm'`. */
function pcm(durationSeconds = 0.5, amplitude = 1000): Buffer {
  const samples = Math.round(durationSeconds * SAMPLE_RATE);
  const bytes = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(amplitude, i * 2);
  return bytes;
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mixMeditationAudio', () => {
  it('places cues at their written times in one continuous WAV', () => {
    const mixed = mixMeditationAudio(
      {
        durationSeconds: 10,
        steps: [
          { at: 0, text: 'a' },
          { at: 4, text: 'b' },
        ],
      },
      [pcm(1), pcm(1)],
    );

    expect(mixed.durationSeconds).toBe(10);
    expect(mixed.cues).toEqual([
      { at: 0, durationSeconds: 1 },
      { at: 4, durationSeconds: 1 },
    ]);
    expect(mixed.wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(mixed.wav.readUInt32LE(40)).toBe(10 * SAMPLE_RATE * 2);
    expect(mixed.wav.length).toBe(44 + 10 * SAMPLE_RATE * 2);
    // Voice in the middle of a cue, silence between cues.
    expect(mixed.wav.readInt16LE(44 + Math.round(0.5 * SAMPLE_RATE) * 2)).toBe(
      1000,
    );
    expect(mixed.wav.readInt16LE(44 + 2 * SAMPLE_RATE * 2)).toBe(0);
    expect(mixed.wav.readInt16LE(44 + Math.round(4.5 * SAMPLE_RATE) * 2)).toBe(
      1000,
    );
  });

  it('pushes a cue back instead of overlapping a long previous cue', () => {
    const mixed = mixMeditationAudio(
      {
        durationSeconds: 5,
        steps: [
          { at: 0, text: 'a' },
          { at: 2, text: 'b' },
        ],
      },
      [pcm(3), pcm(3)],
    );

    expect(mixed.cues[1].at).toBeCloseTo(3.75);
    // The track grows to fit the last cue plus a quiet tail.
    expect(mixed.durationSeconds).toBeCloseTo(3.75 + 3 + 1.5);
  });
});

describe('meditation catalogue', () => {
  it('switches the part of the day at 04:00, 12:00 and 18:00', () => {
    const periods = Array.from({ length: 24 }, (_, hour) => dayPeriod(hour));
    expect(periods.slice(0, 4)).toEqual(Array(4).fill('night'));
    expect(periods.slice(4, 12)).toEqual(Array(8).fill('morning'));
    expect(periods.slice(12, 18)).toEqual(Array(6).fill('afternoon'));
    expect(periods.slice(18)).toEqual(Array(6).fill('night'));
  });

  it('has one all-day meditation for each part of the day', () => {
    const allDay = MEDITATIONS.filter((m) => m.allDay).map((m) => m.timeOfDay);
    expect(allDay.sort()).toEqual(['afternoon', 'morning', 'night']);
  });

  it('keeps every meditation three minutes long with closely paced cues', () => {
    expect(new Set(MEDITATIONS.map((m) => m.id)).size).toBe(MEDITATIONS.length);
    for (const m of MEDITATIONS) {
      expect(m.durationSeconds).toBe(180);
      m.steps.forEach((step, i) => {
        const next = m.steps[i + 1]?.at ?? m.durationSeconds;
        expect(next - step.at).toBeLessThanOrEqual(15);
      });
    }
  });
});

describe('MeditationsController audio', () => {
  it('generates one continuous track once and serves it as a file', async () => {
    const meditation = MEDITATIONS.find((item) => item.id === 'box-breathing')!;
    const fetchMock = vi.fn(
      (_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(toArrayBuffer(pcm()), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new MeditationsController(
      configWith({
        'audio.apiKey': 'test-key',
        'audio.model': 'test-model',
        'audio.voice': 'coral',
      }),
    );

    const first = await controller.audio(meditation.id);
    const second = await controller.audio(meditation.id);
    const file = await controller.audioFile(meditation.id);

    expect(first).toBe(second);
    expect(first.mimeType).toBe('audio/wav');
    expect(first.version).toMatch(/^[0-9a-f]{16}$/);
    expect(first.durationSeconds).toBe(meditation.durationSeconds);
    expect(first.cues).toHaveLength(meditation.steps.length);
    expect(first.cues[0]).toEqual({
      at: meditation.steps[0].at,
      durationSeconds: 0.5,
    });
    expect(file.getHeaders()).toMatchObject({
      type: 'audio/wav',
      length: 44 + meditation.durationSeconds * SAMPLE_RATE * 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(meditation.steps.length);

    const [, requestInit] = fetchMock.mock.calls[0]!;
    const body = requestInit?.body;
    if (typeof body !== 'string')
      throw new TypeError('Expected a JSON request body');
    const request = JSON.parse(body) as Record<string, unknown>;
    expect(request).toMatchObject({
      model: 'test-model',
      voice: 'coral',
      response_format: 'pcm',
    });
  });

  it('reports a clear error when OpenAI audio is not configured', async () => {
    const controller = new MeditationsController(configWith({}));
    await expect(controller.audio('box-breathing')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
