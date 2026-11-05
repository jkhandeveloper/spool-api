import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { JournalEntry } from './journal-entry.entity.js';
import type {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
} from './journal.dto.js';
import { assignDefined } from '../common/assign-defined.js';

export function deriveTitle(body: string): string {
  const firstLine =
    body
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? 'Untitled';
  return firstLine.length > 60
    ? `${firstLine.slice(0, 57).trimEnd()}...`
    : firstLine;
}

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly entries: Repository<JournalEntry>,
  ) {}

  async list(userId: string, limit = 50, offset = 0) {
    const [items, total] = await this.entries.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async get(userId: string, id: string): Promise<JournalEntry> {
    const entry = await this.entries.findOne({ where: { id, userId } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  create(userId: string, dto: CreateJournalEntryDto): Promise<JournalEntry> {
    return this.entries.save(
      this.entries.create({
        userId,
        title: dto.title || deriveTitle(dto.body),
        body: dto.body,
        includeInPrompts: dto.includeInPrompts ?? true,
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateJournalEntryDto,
  ): Promise<JournalEntry> {
    const entry = await this.get(userId, id);
    assignDefined(entry, dto);
    return this.entries.save(entry);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entry = await this.get(userId, id);
    await this.entries.remove(entry);
  }

  /** Notes written since `since` that the user has allowed as session prompts. */
  promptCandidates(userId: string, since: Date): Promise<JournalEntry[]> {
    return this.entries.find({
      where: {
        userId,
        includeInPrompts: true,
        createdAt: MoreThanOrEqual(since),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  countSince(userId: string, since: Date): Promise<number> {
    return this.entries.count({
      where: { userId, createdAt: MoreThanOrEqual(since) },
    });
  }
}
