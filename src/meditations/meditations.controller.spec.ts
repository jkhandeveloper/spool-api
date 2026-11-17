import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MeditationsController } from './meditations.controller.js';
import { MEDITATIONS } from './meditations.data.js';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function wav(durationSeconds = 0.5): ArrayBuffer {
  const sampleRate = 24_000;
  const dataSize = Math.round(durationSeconds * sampleRate * 2);
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataSize, 40);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MeditationsController audio', () => {
  it('returns timed WAV segments and reuses the generated result', async () => {
    const meditation = MEDITATIONS.find((item) => item.id === 'box-breathing')!;
    const fetchMock = vi.fn(
      (_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(wav(), { status: 200 })),
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

    expect(first).toBe(second);
    expect(first.segments).toHaveLength(meditation.steps.length);
    expect(first.segments[0]).toMatchObject({
      at: meditation.steps[0].at,
      durationSeconds: 0.5,
      mimeType: 'audio/wav',
    });
    expect(first.segments[0].audioBase64).toBeTruthy();
    expect(first.silence.mimeType).toBe('audio/wav');
    expect(first.silence.fiveSecondBase64).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(meditation.steps.length);

    const [, requestInit] = fetchMock.mock.calls[0]!;
    const request = JSON.parse(String(requestInit?.body)) as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({
      model: 'test-model',
      voice: 'coral',
      response_format: 'wav',
    });
  });

  it('reports a clear error when OpenAI audio is not configured', async () => {
    const controller = new MeditationsController(configWith({}));
    await expect(controller.audio('box-breathing')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
