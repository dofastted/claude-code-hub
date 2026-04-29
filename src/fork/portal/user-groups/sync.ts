import "server-only";

import { PROVIDER_GROUP } from "@/lib/constants/provider.constants";
import { parseProviderGroups } from "@/lib/utils/provider-group";
import { findKeyList } from "@/repository/key";
import { updateUser } from "@/repository/user";

export async function syncUserProviderGroupFromKeysForSystem(userId: number): Promise<void> {
  const userKeys = await findKeyList(userId);
  const allGroups = new Set<string>();

  for (const key of userKeys) {
    const keyGroups = parseProviderGroups(key.providerGroup || PROVIDER_GROUP.DEFAULT);
    for (const group of keyGroups) {
      allGroups.add(group);
    }
  }

  const providerGroup =
    allGroups.size > 0 ? Array.from(allGroups).sort().join(",") : PROVIDER_GROUP.DEFAULT;
  await updateUser(userId, { providerGroup });
}
