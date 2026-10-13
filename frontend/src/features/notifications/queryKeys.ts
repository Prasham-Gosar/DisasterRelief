export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: object) => [...notificationKeys.lists(), params] as const,
};
