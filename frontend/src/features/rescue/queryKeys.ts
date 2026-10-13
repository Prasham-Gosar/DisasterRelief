export const rescueKeys = {
  all: ['rescue'] as const,
  myTask: () => [...rescueKeys.all, 'myTask'] as const,
};
