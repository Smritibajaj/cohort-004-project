import { eq, asc, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonComments,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { getCourseById } from "~/services/courseService";
import { isUserEnrolled } from "~/services/enrollmentService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getUserById } from "~/services/userService";

// ─── Comment Service ───
// Flat, plain-text discussion on lessons. Anyone who can view a lesson can
// read its comments; enrolled students, the course instructor and admins can
// post. Authors, the course instructor and admins can delete (hard delete).
// Uses positional parameters (project convention).

export const MAX_COMMENT_LENGTH = 2000;

export function canModerateComments(userId: number, courseId: number) {
  const user = getUserById(userId);
  if (!user) return false;
  if (user.role === UserRole.Admin) return true;

  const course = getCourseById(courseId);
  return course?.instructorId === userId;
}

export function canPostComment(userId: number, courseId: number) {
  return (
    canModerateComments(userId, courseId) || isUserEnrolled(userId, courseId)
  );
}

function getCourseIdForLesson(lessonId: number) {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;
  return getModuleById(lesson.moduleId)?.courseId ?? null;
}

export function createComment(userId: number, lessonId: number, body: string) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }

  const courseId = getCourseIdForLesson(lessonId);
  if (courseId === null) {
    throw new Error("Lesson not found");
  }

  if (!canPostComment(userId, courseId)) {
    throw new Error("You must be enrolled to comment on this lesson");
  }

  return db
    .insert(lessonComments)
    .values({ userId, lessonId, body: trimmed })
    .returning()
    .get();
}

export function getCommentsForLesson(lessonId: number) {
  return db
    .select({
      id: lessonComments.id,
      body: lessonComments.body,
      createdAt: lessonComments.createdAt,
      userId: lessonComments.userId,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.lessonId, lessonId))
    .orderBy(asc(lessonComments.createdAt), asc(lessonComments.id))
    .all();
}

export function deleteComment(userId: number, commentId: number) {
  const comment = db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
  if (!comment) {
    throw new Error("Comment not found");
  }

  const courseId = getCourseIdForLesson(comment.lessonId);
  const isAuthor = comment.userId === userId;
  const isModerator =
    courseId !== null && canModerateComments(userId, courseId);
  if (!isAuthor && !isModerator) {
    throw new Error("You cannot delete this comment");
  }

  db.delete(lessonComments).where(eq(lessonComments.id, commentId)).run();
}

export function getCommentCountsForCourse(courseId: number) {
  const rows = db
    .select({
      lessonId: lessonComments.lessonId,
      count: sql<number>`count(*)`,
    })
    .from(lessonComments)
    .innerJoin(lessons, eq(lessonComments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .groupBy(lessonComments.lessonId)
    .all();

  return new Map(rows.map((row) => [row.lessonId, row.count]));
}
