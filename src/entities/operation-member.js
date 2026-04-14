/** @file Entity: operation_members — V2_SCHEMA_DESIGN.md §1.4 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  userId:       { type: 'uuid',        required: false, sbColumn: 'user_id' },
  displayName:  { type: 'text',        required: true,  sbColumn: 'display_name' },
  email:        { type: 'text',        required: true,  sbColumn: 'email' },
  phone:        { type: 'text',        required: false, sbColumn: 'phone' },
  role:         { type: 'text',        required: false, sbColumn: 'role' },
  inviteToken:  { type: 'uuid',        required: false, sbColumn: 'invite_token' },
  invitedAt:    { type: 'timestamptz', required: false, sbColumn: 'invited_at' },
  acceptedAt:   { type: 'timestamptz', required: false, sbColumn: 'accepted_at' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_ROLES = ['owner', 'admin', 'team_member'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    userId: data.userId ?? null,
    displayName: data.displayName ?? '',
    email: data.email ?? '',
    phone: data.phone ?? null,
    role: data.role ?? 'team_member',
    inviteToken: data.inviteToken ?? null,
    invitedAt: data.invitedAt ?? null,
    acceptedAt: data.acceptedAt ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.displayName || typeof record.displayName !== 'string' || record.displayName.trim() === '') {
    errors.push('displayName is required');
  }
  if (!record.email || typeof record.email !== 'string' || record.email.trim() === '') {
    errors.push('email is required');
  }
  if (record.role && !VALID_ROLES.includes(record.role)) {
    errors.push(`role must be one of: ${VALID_ROLES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    user_id: record.userId,
    display_name: record.displayName,
    email: record.email,
    phone: record.phone,
    role: record.role,
    invite_token: record.inviteToken,
    invited_at: record.invitedAt,
    accepted_at: record.acceptedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    inviteToken: row.invite_token,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
