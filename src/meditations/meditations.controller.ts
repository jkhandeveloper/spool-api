import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { MEDITATIONS, type Meditation } from './meditations.data.js';

const AUDIO_MIME_TYPE = 'audio/wav';
/** OpenAI `pcm` output: raw 24 kHz, 16-bit signed little-endian, mono. */
const SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;
/** Minimum pause between two spoken cues when one runs past the next cue's time. */
const MIN_CUE_GAP_SECONDS = 0.75;
/** Quiet tail after the last cue so the voice never ends abruptly. */
const END_PADDING_SECONDS = 1.5;
/** Short fade on each cue edge to avoid clicks where speech meets silence. */
const FADE_SECONDS = 0.01;

export interface MeditationAudioCue {
  /** Second in the mixed track where this cue's voice starts. */
  at: number;
  durationSeconds: number;
}

/** Metadata for the single continuous guided track served by `GET :id/audio`. */
export interface MeditationAudioInfo {
  /** Changes whenever the text, model or voice changes, so clients can cache the file by it. */
  version: string;
  mimeType: typeof AUDIO_MIME_TYPE;
  durationSeconds: number;
  cues: MeditationAudioCue[];
}

interface GeneratedAudio {
  info: MeditationAudioInfo;
  wav: Buffer;
}

function wavHeader(dataSize: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

/**
 * Mixes the spoken cues into one continuous WAV: each cue starts at its written
 * time (or just after the previous cue if that one ran long) and the gaps are
 * silence. Playing a single file avoids the gaps and rebuffering that a
 * playlist of many short clips causes on Android and iOS.
 */
export function mixMeditationAudio(
  meditation: Pick<Meditation, 'durationSeconds' | 'steps'>,
  speech: Buffer[],
): { wav: Buffer; cues: MeditationAudioCue[]; durationSeconds: number } {
  const fadeSamples = Math.round(FADE_SECONDS * SAMPLE_RATE);
  const gapSamples = Math.round(MIN_CUE_GAP_SECONDS * SAMPLE_RATE);
  const placements: { start: number; samples: number }[] = [];
  let cursor = 0;

  meditation.steps.forEach((step, index) => {
    const samples = Math.floor(speech[index].length / BYTES_PER_SAMPLE);
    const wanted = Math.round(step.at * SAMPLE_RATE);
    const start = index === 0 ? wanted : Math.max(wanted, cursor + gapSamples);
    placements.push({ start, samples });
    cursor = start + samples;
  });

  const totalSamples = Math.max(
    Math.round(meditation.durationSeconds * SAMPLE_RATE),
    cursor + Math.round(END_PADDING_SECONDS * SAMPLE_RATE),
  );
  const dataSize = totalSamples * BYTES_PER_SAMPLE;
  const wav = Buffer.alloc(44 + dataSize); // zero-filled = silence
  wavHeader(dataSize).copy(wav, 0);

  placements.forEach(({ start, samples }, index) => {
    const source = speech[index];
    const fade = Math.min(fadeSamples, Math.floor(samples / 2));
    for (let i = 0; i < samples; i++) {
      let value = source.readInt16LE(i * BYTES_PER_SAMPLE);
      if (i < fade) value = Math.round((value * i) / fade);
      else if (i >= samples - fade)
        value = Math.round((value * (samples - 1 - i)) / fade);
      wav.writeInt16LE(value, 44 + (start + i) * BYTES_PER_SAMPLE);
    }
  });

  return {
    wav,
    durationSeconds: totalSamples / SAMPLE_RATE,
    cues: placements.map(({ start, samples }) => ({
      at: start / SAMPLE_RATE,
      durationSeconds: samples / SAMPLE_RATE,
    })),
  };
}

@Controller('meditations')
export class MeditationsController {
  private readonly audioCache = new Map<string, Promise<GeneratedAudio>>();

  constructor(private readonly config: ConfigService) {}

  @Get()
  list() {
    return MEDITATIONS;
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.find(id);
  }

  /** Generates (once) the continuous guided track and returns its timing metadata. */
  @Post(':id/audio')
  async audio(@Param('id') id: string): Promise<MeditationAudioInfo> {
    return (await this.generate(this.find(id))).info;
  }

  /** The continuous guided track as a single WAV file. */
  @Get(':id/audio')
  @Header('Content-Type', AUDIO_MIME_TYPE)
  @Header('Cache-Control', 'private, max-age=86400')
  async audioFile(@Param('id') id: string): Promise<StreamableFile> {
    const { wav } = await this.generate(this.find(id));
    return new StreamableFile(wav, {
      type: AUDIO_MIME_TYPE,
      length: wav.length,
    });
  }

  private find(id: string): Meditation {
    const meditation = MEDITATIONS.find((m) => m.id === id);
    if (!meditation) throw new NotFoundException('Meditation not found');
    return meditation;
  }

  private async generate(meditation: Meditation): Promise<GeneratedAudio> {
    const apiKey = this.config.get<string>('audio.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Guided audio is not configured on this Spool server.',
      );
    }

    const model = this.config.get<string>('audio.model') ?? 'gpt-4o-mini-tts';
    const voice = this.config.get<string>('audio.voice') ?? 'coral';
    const version = createHash('sha256')
      .update(JSON.stringify([model, voice, meditation.steps]))
      .digest('hex')
      .slice(0, 16);
    const cacheKey = `${meditation.id}:${version}`;
    const cached = this.audioCache.get(cacheKey);
    if (cached) return cached;

    const pending = (async (): Promise<GeneratedAudio> => {
      const speech = await Promise.all(
        meditation.steps.map((step) =>
          this.speak(apiKey, model, voice, step.text),
        ),
      );
      const { wav, cues, durationSeconds } = mixMeditationAudio(
        meditation,
        speech,
      );
      return {
        wav,
        info: { version, mimeType: AUDIO_MIME_TYPE, durationSeconds, cues },
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

  private async speak(
    apiKey: string,
    model: string,
    voice: string,
    text: string,
  ): Promise<Buffer> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: text.replace(/…/g, '...'),
        instructions:
          'Read only the provided meditation cue. Speak slowly, warmly, and calmly. Do not add an introduction or closing.',
        response_format: 'pcm',
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'OpenAI could not generate guided audio.',
      );
    }

    const pcm = Buffer.from(await response.arrayBuffer());
    if (pcm.length < BYTES_PER_SAMPLE)
      throw new ServiceUnavailableException('OpenAI returned empty audio.');
    return pcm;
  }
}
