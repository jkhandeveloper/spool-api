import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { JournalService } from '../journal/journal.service.js';
import { GoalsService } from '../goals/goals.service.js';
import {
  SUMMARY_PROVIDER,
  SummaryError,
  clampSummary,
  type SummaryProvider,
} from '../summaries/summary.types.js';
import {
  TherapySession,
  type SessionStatus,
} from './therapy-session.entity.js';
import type {
  CreateSessionDto,
  SubmitTranscriptDto,
  UpdateSessionDto,
} from './sessions.dto.js';
import { assignDefined } from '../common/assign-defined.js';

/** A session stuck in "processing" this long (e.g. server restarted) is marked failed. */
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const PROMPT_WINDOW_DAYS = 14;
const MIN_TRANSCRIPT_WORDS = 5;

@Injectable()
export class SessionsService implements OnApplicationShutdown {
  private readonly logger = new Logger(SessionsService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @InjectRepository(TherapySession)
    private readonly sessions: Repository<TherapySession>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(SUMMARY_PROVIDER) private readonly summarizer: SummaryProvider,
    private readonly journal: JournalService,
    private readonly goals: GoalsService,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled(this.inFlight);
  }

  listSaved(userId: string) {
    return this.sessions.find({
      where: { userId, status: 'saved' },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** Unfinished sessions (failed or awaiting review) so the app can offer to resume them. */
  listPending(userId: string) {
    return this.sessions.find({
      where: {
        userId,
        status: In<SessionStatus>(['processing', 'draft', 'failed']),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /** Journal notes written since the last saved session, offered as discussion prompts. */
  async promptCandidates(userId: string) {
    const last = await this.sessions.findOne({
      where: { userId, status: 'saved' },
      order: { createdAt: 'DESC' },
    });
    const floor = new Date(Date.now() - PROMPT_WINDOW_DAYS * 86_400_000);
    const since = last && last.createdAt > floor ? last.createdAt : floor;
    const entries = await this.journal.promptCandidates(userId, since);
    return entries.map((e) => ({
      entryId: e.id,
      prompt: e.title,
      excerpt:
        e.body.length > 140 ? `${e.body.slice(0, 137).trimEnd()}...` : e.body,
      createdAt: e.createdAt,
    }));
  }

  async create(userId: string, dto: CreateSessionDto): Promise<TherapySession> {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (user.journalOnly) {
      throw new ForbiddenException(
        'Session recording is turned off. You can turn it on in Settings.',
      );
    }
    return this.sessions.save(
      this.sessions.create({
        userId,
        status: 'recording',
        consentConfirmedAt: new Date(),
        prompts: dto.prompts ?? [],
      }),
    );
  }

  async get(userId: string, id: string): Promise<TherapySession> {
    const session = await this.sessions.findOneBy({ id, userId });
    if (!session) throw new NotFoundException('Session not found');

    const stuck =
      session.status === 'processing' &&
      session.processingStartedAt &&
      Date.now() - session.processingStartedAt.getTime() >
        PROCESSING_TIMEOUT_MS;
    if (stuck) {
      session.status = 'failed';
      session.canRetry = true;
      session.failureReason =
        'Creating your summary took too long. Please try again.';
      await this.sessions.save(session);
    }
    return session;
  }

  /** Ends recording: stores the transcript and starts summarizing in the background. */
  async submitTranscript(
    userId: string,
    id: string,
    dto: SubmitTranscriptDto,
  ): Promise<TherapySession> {
    const session = await this.get(userId, id);
    if (session.status !== 'recording') {
      throw new ConflictException('This session has already ended');
    }
    session.durationSeconds = dto.durationSeconds;

    if (
      dto.transcript.split(/\s+/).filter(Boolean).length < MIN_TRANSCRIPT_WORDS
    ) {
      session.status = 'failed';
      session.canRetry = false;
      session.failureReason =
        "We didn't hear enough to create a summary. Check the microphone and try a new session.";
      return this.sessions.save(session);
    }

    await this.sessions.update(session.id, { transcript: dto.transcript });
    return this.startProcessing(session);
  }

  async retry(userId: string, id: string): Promise<TherapySession> {
    const session = await this.get(userId, id);
    if (session.status !== 'failed' || !session.canRetry) {
      throw new ConflictException('This session cannot be retried');
    }
    return this.startProcessing(session);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSessionDto,
  ): Promise<TherapySession> {
    const session = await this.get(userId, id);
    if (session.status !== 'draft' && session.status !== 'saved') {
      throw new ConflictException('Only a summary can be edited');
    }
    assignDefined(session, dto);
    return this.sessions.save(session);
  }

  /** Accepts the reviewed draft: makes its goals active and, if kept, adds it to history. */
  async save(userId: string, id: string, keep: boolean) {
    const session = await this.get(userId, id);
    if (session.status !== 'draft')
      throw new ConflictException('Only a draft summary can be saved');

    return this.sessions.manager.transaction(async (tx) => {
      await this.goals.replaceActive(tx, userId, keep ? session.id : null, {
        daily: session.dailyGoal,
        weekly: session.weeklyGoal,
      });
      if (!keep) {
        await tx.delete(TherapySession, session.id);
        return { session: null };
      }
      session.status = 'saved';
      session.savedAt = new Date();
      return { session: await tx.save(session) };
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const session = await this.get(userId, id);
    if (session.status === 'processing') {
      throw new ConflictException('Please wait until the summary is ready');
    }
    await this.sessions.delete(session.id);
  }

  private async startProcessing(
    session: TherapySession,
  ): Promise<TherapySession> {
    session.status = 'processing';
    session.failureReason = null;
    session.canRetry = false;
    session.processingStartedAt = new Date();
    await this.sessions.save(session);

    const job = this.summarize(session.id).finally(() =>
      this.inFlight.delete(job),
    );
    this.inFlight.add(job);
    return session;
  }

  private async summarize(id: string): Promise<void> {
    const row = await this.sessions.findOne({
      where: { id },
      select: { id: true, prompts: true, transcript: true },
    });
    if (!row?.transcript) {
      await this.sessions.update(id, {
        status: 'failed',
        canRetry: false,
        failureReason:
          'The recording is no longer available. Please start a new session.',
      });
      return;
    }

    try {
      const summary = clampSummary(
        await this.summarizer.summarize({
          transcript: row.transcript,
          prompts: row.prompts,
        }),
      );
      // The transcript is erased as soon as the draft exists, as the consent script promises.
      await this.sessions.update(id, {
        ...summary,
        status: 'draft',
        transcript: null,
        failureReason: null,
        canRetry: false,
      });
    } catch (error) {
      const known = error instanceof SummaryError;
      if (!known)
        this.logger.error(`Summarizing session ${id} failed`, error as Error);
      const retryable = known ? error.retryable : true;
      await this.sessions
        .update(id, {
          status: 'failed',
          canRetry: retryable,
          failureReason: known
            ? error.message
            : 'Something went wrong creating your summary.',
          // Nothing more can be done with a transcript we can't summarize, so drop it.
          ...(retryable ? {} : { transcript: null }),
        })
        .catch((e: unknown) =>
          this.logger.error(`Could not record failure for ${id}`, e as Error),
        );
    }
  }
}
