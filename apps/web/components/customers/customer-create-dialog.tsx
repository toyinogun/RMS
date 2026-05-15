'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CustomerForm } from './customer-form';
import { createCustomerAction } from '@/server-actions/customers/create';
import type { CustomerActionState } from '@/server-actions/customers/create';

interface CustomerCreateDialogProps {
  trigger: React.ReactNode;
  onCreated?: (id: string) => void;
}

export function CustomerCreateDialog({ trigger, onCreated }: CustomerCreateDialogProps) {
  const [open, setOpen] = React.useState(false);

  async function handleSubmit(formData: FormData): Promise<CustomerActionState> {
    const result = await createCustomerAction(null, formData);
    if (result.ok) {
      setOpen(false);
      onCreated?.(result.data.id);
    }
    return result;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>Enter the new customer&apos;s details below.</DialogDescription>
        </DialogHeader>
        <CustomerForm mode="create" variant="inline" onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  );
}
