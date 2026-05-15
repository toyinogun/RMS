'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cancelPlanAction } from '@/server-actions/plans/cancel';
import { Button } from '@/components/ui/button';

interface PlanCancelButtonProps {
  id: string;
}

export function PlanCancelButton({ id }: PlanCancelButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      'Cancel this DRAFT plan? This action cannot be undone.',
    );
    if (!confirmed) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append('id', id);
      const result = await cancelPlanAction(null, fd);
      if (result.ok) {
        toast.success('Plan cancelled.');
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
      type="button"
    >
      {isPending ? 'Cancelling…' : 'Cancel plan'}
    </Button>
  );
}
