import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { RegisterDto } from './dto/register.dto';

const dto: RegisterDto = {
  email: 'ivan@example.ru',
  password: 'correct-horse-battery',
  name: 'Иван',
  role: 'CUSTOMER',
};

function serviceWith(tx: { user: { create: jest.Mock }; session: { create: jest.Mock } }) {
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  return { service: new AuthService(prisma), prisma };
}

describe('AuthService.register', () => {
  it('creates the user and the session inside one transaction', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', ...dto, createdAt: new Date() }) },
      session: { create: jest.fn().mockResolvedValue({}) },
    };
    const { service, prisma } = serviceWith(tx);
    const result = await service.register(dto);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.session.create).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe('u1');
  });

  it('propagates a session write failure so the transaction rolls the user back', async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'u1', ...dto, createdAt: new Date() }) },
      session: { create: jest.fn().mockRejectedValue(new Error('session write failed')) },
    };
    const { service } = serviceWith(tx);
    await expect(service.register(dto)).rejects.toThrow('session write failed');
  });

  it('maps a unique violation to 409', async () => {
    const tx = {
      user: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
      },
      session: { create: jest.fn() },
    };
    const { service } = serviceWith(tx);
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
  });
});
