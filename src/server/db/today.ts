import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import {
  deleteInterview,
  followUpCandidates,
  insertInterview,
  interviewWithApplication,
  interviewsForApplication,
  markFollowedUp,
  recentActivity,
  upcomingInterviews,
} from "@/server/db/today-store";
import { followUpsDue } from "@/lib/today";
import type { CreateInterviewInput } from "@/lib/schemas/interview";

// The app's entry points for Today and interviews: the current mode's
// database and the current user. Ids from forms or URLs only ever reach
// your own rows. See docs/today.md.

async function scope() {
  return { db: getDb(await getMode()), userId: await requireUserId() };
}

const DAY = 24 * 60 * 60 * 1000;

// Everything Today shows, read together.
export async function loadToday(now = new Date()) {
  const { db, userId } = await scope();
  return {
    interviews: upcomingInterviews(db, userId, now),
    followUps: followUpsDue(followUpCandidates(db, userId), now),
    activity: recentActivity(db, userId, new Date(now.getTime() - 7 * DAY)),
  };
}

// The sidebar's Today badge: follow-ups due, plus interviews in the next
// day. Cheap enough for every page (two small queries).
export async function countToday(now = new Date()): Promise<number> {
  const { db, userId } = await scope();
  const soon = upcomingInterviews(db, userId, now).filter((interview) => interview.at.getTime() - now.getTime() < DAY).length;
  return followUpsDue(followUpCandidates(db, userId), now).length + soon;
}

export async function listInterviews(applicationId: number) {
  const { db, userId } = await scope();
  return interviewsForApplication(db, userId, applicationId);
}

export async function getInterview(id: number) {
  const { db, userId } = await scope();
  return interviewWithApplication(db, userId, id);
}

export async function addInterview(input: CreateInterviewInput) {
  const { db, userId } = await scope();
  return insertInterview(db, userId, input);
}

export async function removeInterview(id: number) {
  const { db, userId } = await scope();
  return deleteInterview(db, userId, id);
}

export async function followedUp(applicationId: number, now = new Date()) {
  const { db, userId } = await scope();
  return markFollowedUp(db, userId, applicationId, now);
}
