import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { MEDITATIONS } from './meditations.data.js';

@Controller('meditations')
export class MeditationsController {
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
}
