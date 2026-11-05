import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, MoreThan, Repository } from 'typeorm';
import { Appointment } from './appointment.entity.js';
import type {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './appointments.dto.js';

const MAX_RANGE_DAYS = 400;

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appts: Repository<Appointment>,
  ) {}

  list(userId: string, from?: Date, to?: Date): Promise<Appointment[]> {
    const start = from ?? new Date(Date.now() - 31 * 86_400_000);
    const end = to ?? new Date(start.getTime() + 92 * 86_400_000);
    if (end <= start)
      throw new BadRequestException('"to" must be after "from"');
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new BadRequestException(
        `Date range can be at most ${MAX_RANGE_DAYS} days`,
      );
    }
    return this.appts.find({
      where: { userId, cancelledAt: IsNull(), startsAt: Between(start, end) },
      order: { startsAt: 'ASC' },
    });
  }

  /** The next appointment that hasn't finished yet. */
  next(userId: string): Promise<Appointment | null> {
    return this.appts
      .findOne({
        where: {
          userId,
          cancelledAt: IsNull(),
          // Include ones already under way (started within the last 8 hours).
          startsAt: MoreThan(new Date(Date.now() - 8 * 3_600_000)),
        },
        order: { startsAt: 'ASC' },
      })
      .then((a) => {
        if (!a) return null;
        const ends = a.startsAt.getTime() + a.durationMinutes * 60_000;
        return ends > Date.now() ? a : this.upcomingAfter(userId, a.startsAt);
      });
  }

  async get(userId: string, id: string): Promise<Appointment> {
    const appt = await this.appts.findOneBy({ id, userId });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  create(userId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    return this.appts.save(Object.assign(this.appts.create({ userId }), dto));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    const appt = await this.get(userId, id);
    if (appt.cancelledAt)
      throw new BadRequestException('This appointment was cancelled');
    Object.assign(appt, dto);
    return this.appts.save(appt);
  }

  async cancel(userId: string, id: string): Promise<void> {
    const appt = await this.get(userId, id);
    appt.cancelledAt ??= new Date();
    await this.appts.save(appt);
  }

  private upcomingAfter(userId: string, after: Date) {
    return this.appts.findOne({
      where: { userId, cancelledAt: IsNull(), startsAt: MoreThan(after) },
      order: { startsAt: 'ASC' },
    });
  }
}
