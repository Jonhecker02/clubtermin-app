export const queryKeys = {
  profile: ["profile"] as const,
  profiles: ["profiles"] as const,
  groups: ["groups"] as const,
  termine: ["termine"] as const,
  registrations: (terminId: string) => ["registrations", terminId] as const,
  myRegistrations: ["registrations", "mine"] as const,
  registrationCounts: ["registrations", "counts"] as const,
  allocations: (terminId: string) => ["allocations", terminId] as const,
  messages: (groupId: string) => ["messages", groupId] as const,
  announcements: ["announcements"] as const,
};
