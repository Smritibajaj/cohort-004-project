import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  MAX_COMMENT_LENGTH,
  canPostComment,
  canModerateComments,
  createComment,
  deleteComment,
  getCommentsForLesson,
  getCommentCountsForCourse,
} from "./commentService";
import { enrollUser } from "./enrollmentService";
import { createModule } from "./moduleService";
import { createLesson, deleteLesson } from "./lessonService";

let lessonId: number;

function createUser(email: string, role: schema.UserRole) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role })
    .returning()
    .get();
}

describe("commentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    const mod = createModule(base.course.id, "Module 1", 1);
    lessonId = createLesson(mod.id, "Lesson 1", null, null, 1, null).id;
  });

  describe("canPostComment", () => {
    it("allows enrolled students", () => {
      enrollUser(base.user.id, base.course.id, false, false);
      expect(canPostComment(base.user.id, base.course.id)).toBe(true);
    });

    it("rejects students who are not enrolled", () => {
      expect(canPostComment(base.user.id, base.course.id)).toBe(false);
    });

    it("allows the course instructor without enrollment", () => {
      expect(canPostComment(base.instructor.id, base.course.id)).toBe(true);
    });

    it("rejects an instructor of a different course", () => {
      const other = createUser("other@example.com", schema.UserRole.Instructor);
      expect(canPostComment(other.id, base.course.id)).toBe(false);
    });

    it("allows admins", () => {
      const admin = createUser("admin@example.com", schema.UserRole.Admin);
      expect(canPostComment(admin.id, base.course.id)).toBe(true);
    });
  });

  describe("canModerateComments", () => {
    it("allows the course instructor and admins, not students", () => {
      const admin = createUser("admin@example.com", schema.UserRole.Admin);
      enrollUser(base.user.id, base.course.id, false, false);

      expect(canModerateComments(base.instructor.id, base.course.id)).toBe(
        true
      );
      expect(canModerateComments(admin.id, base.course.id)).toBe(true);
      expect(canModerateComments(base.user.id, base.course.id)).toBe(false);
    });
  });

  describe("createComment", () => {
    it("creates a trimmed comment for an enrolled student", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      const comment = createComment(base.user.id, lessonId, "  Great lesson!  ");

      expect(comment.body).toBe("Great lesson!");
      expect(comment.userId).toBe(base.user.id);
      expect(comment.lessonId).toBe(lessonId);
    });

    it("lets the course instructor comment", () => {
      const comment = createComment(base.instructor.id, lessonId, "Thanks!");
      expect(comment.userId).toBe(base.instructor.id);
    });

    it("rejects users who cannot post", () => {
      expect(() => createComment(base.user.id, lessonId, "Hi")).toThrowError(
        "You must be enrolled to comment on this lesson"
      );
    });

    it("rejects empty or whitespace-only comments", () => {
      enrollUser(base.user.id, base.course.id, false, false);
      expect(() => createComment(base.user.id, lessonId, "   ")).toThrowError(
        "Comment cannot be empty"
      );
    });

    it("rejects comments over the length limit", () => {
      enrollUser(base.user.id, base.course.id, false, false);
      const tooLong = "a".repeat(MAX_COMMENT_LENGTH + 1);
      expect(() => createComment(base.user.id, lessonId, tooLong)).toThrowError(
        `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
      );
    });

    it("rejects a missing lesson", () => {
      expect(() => createComment(base.user.id, 9999, "Hi")).toThrowError(
        "Lesson not found"
      );
    });
  });

  describe("getCommentsForLesson", () => {
    it("returns comments oldest first with author details", () => {
      enrollUser(base.user.id, base.course.id, false, false);
      createComment(base.user.id, lessonId, "First");
      createComment(base.instructor.id, lessonId, "Second");

      const comments = getCommentsForLesson(lessonId);

      expect(comments.map((c) => c.body)).toEqual(["First", "Second"]);
      expect(comments[0].authorName).toBe("Test User");
      expect(comments[1].authorName).toBe("Test Instructor");
      expect(comments[0]).toHaveProperty("authorAvatarUrl");
    });

    it("returns an empty list when there are no comments", () => {
      expect(getCommentsForLesson(lessonId)).toEqual([]);
    });
  });

  describe("deleteComment", () => {
    let commentId: number;

    beforeEach(() => {
      enrollUser(base.user.id, base.course.id, false, false);
      commentId = createComment(base.user.id, lessonId, "Delete me").id;
    });

    it("lets the author delete their own comment", () => {
      deleteComment(base.user.id, commentId);
      expect(getCommentsForLesson(lessonId)).toEqual([]);
    });

    it("lets the course instructor delete any comment", () => {
      deleteComment(base.instructor.id, commentId);
      expect(getCommentsForLesson(lessonId)).toEqual([]);
    });

    it("lets an admin delete any comment", () => {
      const admin = createUser("admin@example.com", schema.UserRole.Admin);
      deleteComment(admin.id, commentId);
      expect(getCommentsForLesson(lessonId)).toEqual([]);
    });

    it("rejects other students", () => {
      const other = createUser("other@example.com", schema.UserRole.Student);
      enrollUser(other.id, base.course.id, false, false);

      expect(() => deleteComment(other.id, commentId)).toThrowError(
        "You cannot delete this comment"
      );
      expect(getCommentsForLesson(lessonId)).toHaveLength(1);
    });

    it("rejects a missing comment", () => {
      expect(() => deleteComment(base.user.id, 9999)).toThrowError(
        "Comment not found"
      );
    });
  });

  describe("getCommentCountsForCourse", () => {
    it("counts comments per lesson in the course", () => {
      enrollUser(base.user.id, base.course.id, false, false);
      const mod = createModule(base.course.id, "Module 2", 2);
      const lesson2 = createLesson(mod.id, "Lesson 2", null, null, 1, null);
      createComment(base.user.id, lessonId, "One");
      createComment(base.user.id, lessonId, "Two");
      createComment(base.user.id, lesson2.id, "Three");

      const counts = getCommentCountsForCourse(base.course.id);

      expect(counts.get(lessonId)).toBe(2);
      expect(counts.get(lesson2.id)).toBe(1);
    });

    it("ignores comments from other courses", () => {
      expect(getCommentCountsForCourse(base.course.id).size).toBe(0);
    });
  });

  describe("deleting a lesson", () => {
    it("removes its comments", () => {
      createComment(base.instructor.id, lessonId, "Soon gone");

      deleteLesson(lessonId);

      expect(getCommentsForLesson(lessonId)).toEqual([]);
    });
  });
});
