'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import { softDeletePropertyAction } from '@/server-actions/properties/soft-delete';
import { Button } from '@/components/ui/button';

interface PropertyDeleteButtonProps {
  id: string;
}

export function PropertyDeleteButton({ id }: PropertyDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      'Are you sure you want to delete this property? This action cannot be undone.',
    );
    if (!confirmed) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append('id', id);
      const result = await softDeletePropertyAction(null, fd);
      if (result.ok) {
        toast.success('Property deleted.');
        router.push('/properties' as Route);
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
      {isPending ? 'Deleting…' : 'Delete property'}
    </Button>
  );
}
