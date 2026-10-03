import { makeSyncId } from "@/src/lib/localStore";
import { writeDocWithQueue } from "@/src/lib/offlineSync";

export const trackSiteVisit = async (page: string, userId?: string) => {
  if (!userId) {
    return;
  }

  const eventId = makeSyncId("analytics-event");
  await writeDocWithQueue({
    userId,
    path: ["analyticsEvents", eventId],
    data: {
      userId,
      eventType: "site_visit",
      page,
      xp: 0,
      details: {},
      createdAt: new Date().toISOString(),
    },
    merge: true,
  });
};

export const trackUserEvent = async (
  userId: string,
  eventType: string,
  xp: number,
  details: Record<string, unknown> = {}
) => {
  const eventId = makeSyncId("analytics-event");
  await writeDocWithQueue({
    userId,
    path: ["analyticsEvents", eventId],
    data: {
      userId,
      eventType,
      xp: Math.max(0, xp),
      details,
      createdAt: new Date().toISOString(),
    },
    merge: true,
  });
};
