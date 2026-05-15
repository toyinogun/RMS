'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { softDeleteCustomerAction } from '@/server-actions/customers/soft-delete';
import { Button } from '@/components/ui/button';

interface CustomerDeleteButtonProps {
  id: string;
}

export function CustomerDeleteButton({ id }: CustomerDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      'Are you sure you want to delete this customer? This action cannot be undone.',
    );
    if (!confirmed) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append('id', id);
      const result = await softDeleteCustomerAction(null, fd);
      if (result.ok) {
        toast.success('Customer deleted.');
        router.push('/customers');
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
      {isPending ? 'Deleting…' : 'Delete customer'}
    </Button>
  );
}
