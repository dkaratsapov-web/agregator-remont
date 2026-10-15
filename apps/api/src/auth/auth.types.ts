import type { User } from '@prisma/client';
import type { Request } from 'express';

export interface AuthContext {
  user: User;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };
