import type { UpsertUserGroupConfigInput } from "@/fork/portal/types/user-group-config";

export const DEFAULT_TEST_KEY_GROUP = "test-key";
export const DEFAULT_PORTAL_GROUP = "portal";

export const BUILTIN_USER_GROUP_CONFIGS: UpsertUserGroupConfigInput[] = [
  {
    groupName: DEFAULT_TEST_KEY_GROUP,
    kind: "test_key",
    temporaryKeysEnabled: true,
    portalManaged: false,
    description: "测试 key 分组",
  },
  {
    groupName: DEFAULT_PORTAL_GROUP,
    kind: "portal",
    temporaryKeysEnabled: true,
    portalManaged: true,
    description: "门户网站客户分组",
  },
];

function cleanGroupName(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function buildDefaultUserGroupConfigs(options?: {
  portalGroup?: string;
  testKeyGroup?: string;
}): UpsertUserGroupConfigInput[] {
  const portalGroup = cleanGroupName(options?.portalGroup, DEFAULT_PORTAL_GROUP);
  const testKeyGroup = cleanGroupName(options?.testKeyGroup, DEFAULT_TEST_KEY_GROUP);
  const configs = new Map<string, UpsertUserGroupConfigInput>();

  for (const config of BUILTIN_USER_GROUP_CONFIGS) {
    configs.set(config.groupName, config);
  }

  configs.set(testKeyGroup, {
    groupName: testKeyGroup,
    kind: "test_key",
    temporaryKeysEnabled: true,
    portalManaged: false,
    description:
      testKeyGroup === DEFAULT_TEST_KEY_GROUP ? "测试 key 分组" : "环境变量配置的测试 key 分组",
  });
  configs.set(portalGroup, {
    groupName: portalGroup,
    kind: "portal",
    temporaryKeysEnabled: true,
    portalManaged: true,
    description:
      portalGroup === DEFAULT_PORTAL_GROUP ? "门户网站客户分组" : "环境变量配置的门户客户分组",
  });

  return Array.from(configs.values());
}
