'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { toast } from 'sonner';
import type { UserListRow } from '@solutio/db';
import {
  deactivateUserAction,
  type DeactivateUserState,
} from '@/server-actions/users/deactivate';
import {
  reactivateUserAction,
  type ReactivateUserState,
} from '@/server-actions/users/reactivate';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type UserRowActionsProps = {
  row: UserListRow;
  isSelf: boolean;
  isLastActiveOwner: boolean;
};

export function UserRowActions({ row, isSelf, isLastActiveOwner }: UserRowActionsProps) {
  if (isSelf) return null;

  if (row.deactivatedAt === null) {
    return (
      <DeactivateAction
        row={row}
        isLastActiveOwner={isLastActiveOwner}
      />
    );
  }

  return <ReactivateAction row={row} />;
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

type DeactivateActionProps = {
  row: UserListRow;
  isLastActiveOwner: boolean;
};

function DeactivateAction({ row, isLastActiveOwner }: DeactivateActionProps) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<DeactivateUserState | undefined, FormData>(
    deactivateUserAction,
    undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success('User deactivated.');
      setOpen(false);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  if (isLastActiveOwner) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled
        title="Cannot deactivate the last owner."
      >
        Deactivate
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Deactivate
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {row.name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          They will be signed out immediately and cannot sign back in until you re-activate.
        </p>
        <form action={formAction}>
          <input type="hidden" name="userId" value={row.id} />
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive">
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reactivate ───────────────────────────────────────────────────────────────

type ReactivateActionProps = {
  row: UserListRow;
};

function ReactivateAction({ row }: ReactivateActionProps) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<ReactivateUserState | undefined, FormData>(
    reactivateUserAction,
    undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success('User re-activated.');
      setOpen(false);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Re-activate
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-activate {row.name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          They will be able to sign back in immediately.
        </p>
        <form action={formAction}>
          <input type="hidden" name="userId" value={row.id} />
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
