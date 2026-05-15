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
import { PropertyForm } from './property-form';
import { createPropertyAction } from '@/server-actions/properties/create';
import type { PropertyActionState } from '@/server-actions/properties/create';

interface PropertyCreateDialogProps {
  trigger: React.ReactNode;
  onCreated?: (id: string) => void;
}

export function PropertyCreateDialog({ trigger, onCreated }: PropertyCreateDialogProps) {
  const [open, setOpen] = React.useState(false);

  async function handleSubmit(formData: FormData): Promise<PropertyActionState> {
    const result = await createPropertyAction(null, formData);
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
          <DialogTitle>New property</DialogTitle>
          <DialogDescription>Enter the new property&apos;s details below.</DialogDescription>
        </DialogHeader>
        <PropertyForm mode="create" variant="inline" onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  );
}
