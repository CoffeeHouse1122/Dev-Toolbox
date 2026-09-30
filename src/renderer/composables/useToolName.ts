import { inject } from "vue";
import { defaultGroups, navigationGroupsKey } from "../navigation";

const defaultNames = new Map(defaultGroups.flatMap(group => group.tools.map(tool => [tool.id, tool.label] as const)));

// Read the same reactive configuration as the sidebar, including user-defined names.
export function useToolName() {
  const groups = inject(navigationGroupsKey);
  return (toolId: string) => groups?.value.flatMap(group => group.tools).find(tool => tool.id === toolId)?.label
    ?? defaultNames.get(toolId)
    ?? toolId;
}
