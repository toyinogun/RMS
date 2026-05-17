import { z } from 'zod';

export const userCreateSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['STAFF', 'ADMIN']),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userIdSchema = z.object({
  userId: z.string().uuid(),
});
export type UserIdInput = z.infer<typeof userIdSchema>;
