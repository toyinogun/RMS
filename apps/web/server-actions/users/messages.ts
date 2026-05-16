/**
 * Shared user-facing strings for the users-management flow.
 *
 * Lives outside `create.ts` because Next's `'use server'` modules may only
 * export async functions; exporting a const string from a server-action file
 * is a Turbopack build error.
 */

// ─── createUserAction messages ────────────────────────────────────────────────

export const M6_CREATE_UNAUTHENTICATED_MESSAGE = 'You must be signed in to create users.';
export const M6_CREATE_FORBIDDEN_MESSAGE = 'Only owners can create users.';
export const M6_CREATE_INVALID_INPUT_MESSAGE = 'Please fix the highlighted fields.';
export const M6_CREATE_EMAIL_TAKEN_MESSAGE = 'That email is already in use.';
export const M6_CREATE_BAD_ROLE_MESSAGE = 'The selected role is not allowed.';
