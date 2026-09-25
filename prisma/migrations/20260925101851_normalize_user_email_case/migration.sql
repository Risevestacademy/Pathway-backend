UPDATE "User" AS u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND (
    SELECT count(*)
    FROM "User" AS other
    WHERE lower(other."email") = lower(u."email")
  ) = 1;
