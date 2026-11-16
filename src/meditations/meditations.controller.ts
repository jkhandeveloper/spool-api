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

@Controller('meditations')
export class MeditationsController {
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

    const script = meditation.steps
      .map((step) => step.text.replace(/…/g, '...'))
      .join(' ... ');
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.get<string>('audio.model') ?? 'gpt-4o-mini-tts',
        voice: this.config.get<string>('audio.voice') ?? 'coral',
        input: script,
        instructions:
          'Speak slowly, warmly, and calmly, with a short pause between each instruction.',
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('OpenAI could not generate guided audio.');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return { mimeType: 'audio/mpeg', audioBase64: bytes.toString('base64') };
  }
}
