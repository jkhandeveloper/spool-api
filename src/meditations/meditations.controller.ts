import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MEDITATIONS } from './meditations.data.js';

const AUDIO_MIME_TYPE = 'audio/wav';
const SILENCE_SAMPLE_RATE = 24_000;

interface MeditationAudioSegment {
  at: number;
  durationSeconds: number;
  mimeType: typeof AUDIO_MIME_TYPE;
  audioBase64: string;
}

interface MeditationAudioResponse {
  segments: MeditationAudioSegment[];
  silence: {
    mimeType: typeof AUDIO_MIME_TYPE;
    fiveSecondBase64: string;
    oneSecondBase64: string;
    quarterSecondBase64: string;
  };
}

function createSilentWav(durationSeconds: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = Math.round(
    durationSeconds * SILENCE_SAMPLE_RATE * channels * bytesPerSample,
  );
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(SILENCE_SAMPLE_RATE, 24);
  wav.writeUInt32LE(SILENCE_SAMPLE_RATE * channels * bytesPerSample, 28);
  wav.writeUInt16LE(channels * bytesPerSample, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  return wav;
}

function wavDurationSeconds(wav: Buffer): number {
  if (
    wav.length < 44 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('OpenAI returned invalid WAV audio.');
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (
      chunkId === 'fmt ' &&
      chunkSize >= 16 &&
      chunkStart + 16 <= wav.length
    ) {
      byteRate = wav.readUInt32LE(chunkStart + 8);
    } else if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, wav.length - chunkStart);
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!byteRate || !dataSize)
    throw new Error('OpenAI returned incomplete WAV audio.');
  return dataSize / byteRate;
}

@Controller('meditations')
export class MeditationsController {
  private readonly audioCache = new Map<
    string,
    Promise<MeditationAudioResponse>
  >();

  constructor(private readonly config: ConfigService) {}

  @Get()
  list() {
    return MEDITATIONS;
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const meditation = MEDITATIONS.find((m) => m.id === id);
    if (!meditation) throw new NotFoundException('Meditation not found');
    return meditation;
  }

  @Post(':id/audio')
  async audio(@Param('id') id: string) {
    const meditation = MEDITATIONS.find((m) => m.id === id);
    if (!meditation) throw new NotFoundException('Meditation not found');

    const apiKey = this.config.get<string>('audio.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Guided audio is not configured on this Spool server.',
      );
    }

    const model = this.config.get<string>('audio.model') ?? 'gpt-4o-mini-tts';
    const voice = this.config.get<string>('audio.voice') ?? 'coral';
    const cacheKey = `${meditation.id}:${model}:${voice}`;
    const cached = this.audioCache.get(cacheKey);
    if (cached) return cached;

    const pending = (async (): Promise<MeditationAudioResponse> => {
      const segments = await Promise.all(
        meditation.steps.map(async (step): Promise<MeditationAudioSegment> => {
          const response = await fetch(
            'https://api.openai.com/v1/audio/speech',
            {
              method: 'POST',
              signal: AbortSignal.timeout(60_000),
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                voice,
                input: step.text.replace(/…/g, '...'),
                instructions:
                  'Read only the provided meditation cue. Speak slowly, warmly, and calmly. Do not add an introduction or closing.',
                response_format: 'wav',
              }),
            },
          );

          if (!response.ok) {
            throw new ServiceUnavailableException(
              'OpenAI could not generate guided audio.',
            );
          }

          const bytes = Buffer.from(await response.arrayBuffer());
          return {
            at: step.at,
            durationSeconds: wavDurationSeconds(bytes),
            mimeType: AUDIO_MIME_TYPE,
            audioBase64: bytes.toString('base64'),
          };
        }),
      );

      return {
        segments,
        silence: {
          mimeType: AUDIO_MIME_TYPE,
          fiveSecondBase64: createSilentWav(5).toString('base64'),
          oneSecondBase64: createSilentWav(1).toString('base64'),
          quarterSecondBase64: createSilentWav(0.25).toString('base64'),
        },
      };
    })();

    this.audioCache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      if (this.audioCache.get(cacheKey) === pending)
        this.audioCache.delete(cacheKey);
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'OpenAI could not generate guided audio.',
      );
    }
  }
}
