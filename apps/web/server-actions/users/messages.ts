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

// ─── deactivateUserAction messages ────────────────────────────────────────────

export const M6_DEACTIVATE_UNAUTHENTICATED_MESSAGE = 'You must be signed in to deactivate users.';
export const M6_DEACTIVATE_FORBIDDEN_MESSAGE = 'Only owners can deactivate users.';
export const M6_DEACTIVATE_INVALID_INPUT_MESSAGE = 'A valid user id is required.';
export const M6_DEACTIVATE_NOT_FOUND_MESSAGE = 'User not found.';
export const M6_DEACTIVATE_CANNOT_DEACTIVATE_SELF_MESSAGE = 'You cannot deactivate your own account.';
export const M6_DEACTIVATE_CANNOT_DEACTIVATE_LAST_OWNER_MESSAGE =
  'Cannot deactivate the last owner of this tenant.';
export const M6_DEACTIVATE_ALREADY_DEACTIVATED_MESSAGE = 'That user is already deactivated.';
export const M6_DEACTIVATE_TRY_AGAIN_MESSAGE =
  'A temporary conflict occurred — please try again in a moment.';

// ─── reactivateUserAction messages ────────────────────────────────────────────

export const M6_REACTIVATE_UNAUTHENTICATED_MESSAGE =
  'You must be signed in to reactivate users.';
export const M6_REACTIVATE_FORBIDDEN_MESSAGE = 'Only owners can reactivate users.';
export const M6_REACTIVATE_INVALID_INPUT_MESSAGE = 'A valid user id is required.';
export const M6_REACTIVATE_NOT_FOUND_MESSAGE = 'User not found.';
export const M6_REACTIVATE_NOT_DEACTIVATED_MESSAGE = 'That user is not currently deactivated.';
