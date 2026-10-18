import {
  flattenJobQuestions,
  visibleJobQuestionIds,
  type JobAnswer,
  type JobCategory,
  type JobDetails,
  type JobQuestion,
} from '@agregator/shared';
import { PrismaClient } from '@prisma/client';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

let counter = 0;

/** Регистрирует пользователя через API и возвращает его токен и id. */
export async function signUp(
  app: NestExpressApplication,
  role: 'CUSTOMER' | 'CONTRACTOR',
): Promise<{ token: string; id: string; auth: { Authorization: string } }> {
  counter += 1;
  const res = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({
      email: `user-${Date.now()}-${counter}@example.ru`,
      password: 'correct-horse-battery',
      name: `Пользователь ${counter}`,
      role,
    })
    .expect(201);
  return {
    token: res.body.token,
    id: res.body.user.id,
    auth: { Authorization: `Bearer ${res.body.token}` },
  };
}

/**
 * Администратор для тестов: обычная регистрация, затем роль меняется прямо в базе (как при
 * назначении миграцией по известному userId, docs/SECURITY.md, раздел 10).
 */
export async function signUpAdmin(
  app: NestExpressApplication,
  prisma: PrismaClient,
): Promise<{ token: string; id: string; auth: { Authorization: string } }> {
  const user = await signUp(app, 'CUSTOMER');
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  return user;
}

/**
 * Минимальные ответы анкеты категории: на каждый видимый обязательный вопрос первый вариант,
 * минимальное число, «нет» или короткий текст. Повторяется, пока ответы раскрывают новые
 * обязательные вопросы.
 */
export function requiredAnswers(category: JobCategory): JobDetails {
  const answers: JobDetails = {};
  for (let changed = true; changed;) {
    changed = false;
    const visible = visibleJobQuestionIds(category, answers);
    for (const { question } of flattenJobQuestions(category)) {
      if (!question.required || !visible.has(question.id) || question.id in answers) continue;
      answers[question.id] = sampleAnswer(question);
      changed = true;
    }
  }
  return answers;
}

function sampleAnswer(question: JobQuestion): JobAnswer {
  switch (question.type) {
    case 'single':
      return question.options[0].value;
    case 'multi':
      return [question.options[0].value];
    case 'number':
      return question.min;
    case 'boolean':
      return false;
    case 'text':
      return 'Ответ для теста';
  }
}
