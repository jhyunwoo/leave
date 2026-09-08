ALTER TABLE leaves ADD COLUMN return_time TEXT NOT NULL DEFAULT '21:00';
ALTER TABLE leave_segments ADD COLUMN regular_overnight_cycle_start TEXT;

-- 기존 정기외박은 겹치는 주기 중 가장 이른 주기에 영구 귀속한다.
WITH RECURSIVE
  numbers(n) AS (
    SELECT 1
    UNION ALL SELECT n + 1 FROM numbers WHERE n < 500
  ),
  starts AS (
    SELECT
      c.user_id,
      n,
      CASE
        WHEN c.interval_months IS NOT NULL THEN
          date(
            c.start_date,
            'start of month',
            printf('+%d months', n * c.interval_months),
            printf(
              '+%d days',
              min(
                CAST(strftime('%d', c.start_date) AS INTEGER),
                CAST(strftime('%d', date(c.start_date, 'start of month', printf('+%d months', n * c.interval_months + 1), '-1 day')) AS INTEGER)
              ) - 1
            )
          )
        ELSE date(c.start_date, printf('+%d days', n * c.interval_days))
      END AS cycle_start
    FROM regular_overnight_configs c
    CROSS JOIN numbers
    WHERE c.enabled = 1
      AND c.start_date IS NOT NULL
      AND c.days_per_grant IS NOT NULL
      AND (c.interval_days IS NOT NULL OR c.interval_months IS NOT NULL)
  ),
  cycles AS (
    SELECT
      user_id,
      cycle_start,
      date(LEAD(cycle_start) OVER (PARTITION BY user_id ORDER BY n), '-1 day') AS cycle_end
    FROM starts
  )
UPDATE leave_segments
SET regular_overnight_cycle_start = (
  SELECT cycles.cycle_start
  FROM leaves
  JOIN cycles ON cycles.user_id = leaves.user_id
  JOIN users ON users.id = leaves.user_id
  WHERE leaves.id = leave_segments.leave_id
    AND cycles.cycle_start <= leave_segments.end_date
    AND cycles.cycle_end >= leave_segments.start_date
    AND cycles.cycle_start <= users.discharge_at
  ORDER BY cycles.cycle_start
  LIMIT 1
)
WHERE category = 'overnight'
  AND overnight_kind = 'regular';
