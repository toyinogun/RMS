'use client';

import { useState, useTransition } from 'react';
import { setPropertyStatusAction } from '@/server-actions/properties/set-status';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type Props = {
  id: string;
  currentStatus: 'AVAILABLE' | 'RESERVED' | 'SOLD';
  canChange: boolean;
};

export function PropertyStatusControl({ id, currentStatus, canChange }: Props) {
  const [status, setStatus] = useState<'AVAILABLE' | 'RESERVED'>(
    currentStatus === 'SOLD' ? 'AVAILABLE' : currentStatus,
  );
  const [isPending, startTransition] = useTransition();

  if (currentStatus === 'SOLD') {
    return (
      <div className="space-y-1">
        <Badge variant="outline">SOLD</Badge>
        <p className="text-xs text-slate-500">Set automatically when a plan goes ACTIVE.</p>
      </div>
    );
  }

  if (!canChange) {
    return (
      <div className="space-y-1">
        <Badge variant={currentStatus === 'AVAILABLE' ? 'default' : 'secondary'}>
          {currentStatus}
        </Badge>
        <p className="text-xs text-slate-500">
          Status changes are blocked while a plan references this property.
        </p>
      </div>
    );
  }

  function handleSave() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append('id', id);
      fd.append('status', status);
      const result = await setPropertyStatusAction(null, fd);
      if (result.ok) {
        toast.success('Status updated');
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={status}
        onValueChange={(v) => setStatus(v as 'AVAILABLE' | 'RESERVED')}
        disabled={isPending}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AVAILABLE">AVAILABLE</SelectItem>
          <SelectItem value="RESERVED">RESERVED</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={handleSave} disabled={isPending || status === currentStatus}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
