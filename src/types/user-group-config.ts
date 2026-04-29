export type UserGroupConfigKind = "standard" | "test_key" | "portal";

export interface UserGroupConfig {
  id: number;
  groupName: string;
  kind: UserGroupConfigKind;
  temporaryKeysEnabled: boolean;
  portalManaged: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUserGroupConfigInput {
  groupName: string;
  kind?: UserGroupConfigKind;
  temporaryKeysEnabled?: boolean;
  portalManaged?: boolean;
  description?: string | null;
}
