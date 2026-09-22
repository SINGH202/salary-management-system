import { ApiError } from '@/lib/api-client';

function uniqueTargetLabel(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const target = (details as { target?: unknown }).target;
  if (Array.isArray(target)) {
    return target.map(String).join(', ');
  }
  if (typeof target === 'string') return target;
  return null;
}

/** Human-readable message for hire / raise / terminate failures. */
export function formatApiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  const target = uniqueTargetLabel(err.details)?.toLowerCase() ?? '';
  const raw = err.message.toLowerCase();

  if (err.code === 'CONFLICT' || err.status === 409) {
    if (target.includes('workemail') || raw.includes('workemail')) {
      return 'That work email is already in use. Choose a different email.';
    }
    if (target.includes('employeecode') || raw.includes('employeecode')) {
      return 'That employee code is already in use. Choose a different code.';
    }
    if (raw.includes('unique') || target) {
      return 'This employee conflicts with an existing record (email or code must be unique).';
    }
    return err.message || 'This action conflicts with the current employee state.';
  }

  if (err.code === 'VALIDATION_ERROR' || err.status === 400) {
    return err.message || 'Some fields are invalid. Check the form and try again.';
  }

  if (err.code === 'INTERNAL_ERROR' || err.status >= 500) {
    return 'The server could not complete this request. If you are hiring, try a unique email and employee code.';
  }

  return err.message || fallback;
}
