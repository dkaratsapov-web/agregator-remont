import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id с параметрами из OWASP Password Storage Cheat Sheet (m=19 MiB, t=2, p=1).
 * Algorithm.Argon2id = 2 (const enum в типах пакета, поэтому значение задано явно).
 */
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Повреждённый или чужой формат хеша: считаем неверным паролем, а не ошибкой 500.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Хеш-заглушка для входа с несуществующим email: проверка пароля выполняется всегда,
 * чтобы время ответа не выдавало, зарегистрирован ли адрес.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalization');
  return dummyHash;
}
