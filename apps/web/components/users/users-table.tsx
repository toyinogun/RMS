import type { UserListRow } from '@solutio/db';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserRowActions } from './user-row-actions';

type UsersTableProps = {
  rows: UserListRow[];
  currentUserId: string;
  lastActiveOwnerId: string | null;
};

export function UsersTable({ rows, currentUserId, lastActiveOwnerId }: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{row.role}</TableCell>
            <TableCell>
              {row.deactivatedAt === null ? (
                <Badge>Active</Badge>
              ) : (
                <Badge variant="destructive">Deactivated</Badge>
              )}
            </TableCell>
            <TableCell>{row.createdAt.toLocaleDateString()}</TableCell>
            <TableCell>
              <UserRowActions
                row={row}
                isSelf={row.id === currentUserId}
                isLastActiveOwner={row.id === lastActiveOwnerId}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
