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
  rateCourse,
  getUserRatingForCourse,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";
import { enrollUser } from "./enrollmentService";

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function createCourse(slug: string) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "Another course",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("rateCourse", () => {
    it("lets an enrolled student rate a course", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      const rating = rateCourse(base.user.id, base.course.id, 4);

      expect(rating.rating).toBe(4);
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBe(4);
    });

    it("updates the existing rating instead of adding a second one", () => {
      enrollUser(base.user.id, base.course.id, false, false);

      rateCourse(base.user.id, base.course.id, 2);
      rateCourse(base.user.id, base.course.id, 5);

      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBe(5);
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 5,
        count: 1,
      });
    });

    it("rejects a user who is not enrolled", () => {
      expect(() => rateCourse(base.user.id, base.course.id, 4)).toThrowError(
        "Only enrolled students can rate this course"
      );
    });

    it("rejects the course instructor", () => {
      expect(() =>
        rateCourse(base.instructor.id, base.course.id, 5)
      ).toThrowError("Instructors cannot rate their own course");
    });

    it("rejects a non-existent course", () => {
      expect(() => rateCourse(base.user.id, 9999, 3)).toThrowError(
        "Course not found"
      );
    });

    it.each([0, 6, 2.5])("rejects an invalid rating of %s", (value) => {
      enrollUser(base.user.id, base.course.id, false, false);

      expect(() =>
        rateCourse(base.user.id, base.course.id, value)
      ).toThrowError("Rating must be a whole number from 1 to 5");
    });
  });

  describe("getUserRatingForCourse", () => {
    it("returns null when the user has not rated", () => {
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBeNull();
    });
  });

  describe("getCourseRatingSummary", () => {
    it("returns a null average and zero count with no ratings", () => {
      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages ratings across users, rounded to one decimal", () => {
      const second = createStudent("second@example.com");
      const third = createStudent("third@example.com");
      for (const user of [base.user, second, third]) {
        enrollUser(user.id, base.course.id, false, false);
      }

      rateCourse(base.user.id, base.course.id, 5);
      rateCourse(second.id, base.course.id, 4);
      rateCourse(third.id, base.course.id, 4);

      expect(getCourseRatingSummary(base.course.id)).toEqual({
        average: 4.3,
        count: 3,
      });
    });
  });

  describe("getRatingSummariesForCourses", () => {
    it("returns an empty map for no course ids", () => {
      expect(getRatingSummariesForCourses([]).size).toBe(0);
    });

    it("returns per-course summaries and omits unrated courses", () => {
      const rated = createCourse("rated-course");
      const unrated = createCourse("unrated-course");
      const second = createStudent("second@example.com");
      for (const user of [base.user, second]) {
        enrollUser(user.id, base.course.id, false, false);
        enrollUser(user.id, rated.id, false, false);
      }

      rateCourse(base.user.id, base.course.id, 3);
      rateCourse(second.id, base.course.id, 4);
      rateCourse(base.user.id, rated.id, 1);

      const summaries = getRatingSummariesForCourses([
        base.course.id,
        rated.id,
        unrated.id,
      ]);

      expect(summaries.get(base.course.id)).toEqual({ average: 3.5, count: 2 });
      expect(summaries.get(rated.id)).toEqual({ average: 1, count: 1 });
      expect(summaries.has(unrated.id)).toBe(false);
    });
  });
});
