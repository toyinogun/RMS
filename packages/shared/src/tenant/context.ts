export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF';

export type TenantContext = {
  tenantId: string;
  user: {
    id: string;
    authUserId: string;
    role: UserRole;
    email: string;
    mustChangePassword: boolean;
  };
};
