'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = {
  email: string;
  tempPassword: string;
};

export function TempPasswordPanel({ email, tempPassword }: Props) {
  const handleCopyPassword = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(tempPassword);
        toast.success('Password copied.');
      } catch {
        toast.error('Failed to copy password.');
      }
    } else {
      toast.error('Copy unavailable. Select the password and press Cmd/Ctrl+C.');
    }
  };

  return (
    <div
      aria-live="polite"
      className="border border-green-600 bg-green-50 p-6 rounded-lg space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">User created</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Share these credentials with {email}. The password will not be shown again.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Email</label>
          <p className="text-sm text-foreground">{email}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Password</label>
          <p className="font-mono text-base text-foreground select-all">{tempPassword}</p>
          <p className="text-xs text-red-700 font-medium">
            This password will not be shown again. Copy it now.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleCopyPassword}>
          Copy password
        </Button>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs text-muted-foreground">
          On first sign-in, the user will be prompted to choose a new password.
        </p>
      </div>
    </div>
  );
}
